"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const node_crypto_1 = require("node:crypto");
const cors_1 = __importDefault(require("@fastify/cors"));
const postgres_1 = __importDefault(require("@fastify/postgres"));
const redis_1 = __importDefault(require("@fastify/redis"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const fastify_1 = __importDefault(require("fastify"));
const zod_1 = require("zod");
const realtime_1 = require("./constants/realtime");
const streams_1 = require("./constants/streams");
const batch_ingestion_1 = require("./schemas/batch-ingestion");
const ingestion_events_1 = require("./schemas/ingestion-events");
const ws_hub_1 = require("./realtime/ws-hub");
const connectionString = process.env.DATABASE_URL ??
    "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const logLevel = (process.env.LOG_LEVEL ?? "info");
const METRICS_CACHE_MAX_AGE_SEC = 10;
/** Tekrarlayan query anahtarları diziye dönüşebilir; tek stringe indirger. */
function singleQueryParam(v) {
    if (v === undefined) {
        return undefined;
    }
    if (Array.isArray(v)) {
        const first = v[0];
        return typeof first === "string" ? first : undefined;
    }
    return v;
}
/** OpenAPI UI + JSON; keep in sync with swagger-ui `routePrefix`. */
const SWAGGER_ROUTE_PREFIX = "/docs";
const createRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    definition: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    enabled: zod_1.z.boolean().optional(),
    channel_hint: zod_1.z.string().max(200).optional(),
});
function toBigIntString(value) {
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return BigInt(Math.trunc(value));
    }
    if (typeof value === "string" && value.length > 0) {
        return BigInt(value);
    }
    return 0n;
}
function errorRatePercent(errors, total) {
    if (total === 0n) {
        return 0;
    }
    const pct = (Number(errors) / Number(total)) * 100;
    return Math.round(pct * 100) / 100;
}
function parseIsoOr(raw, fallback) {
    if (raw === undefined || raw.length === 0) {
        return fallback;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? fallback : d;
}
/**
 * Tüm kova aralıklarını doldurur (0 sayım). Anahtarlar SQL ile aynı: epoch saniye (bigint),
 * float/Date yuvarlama kayması yüzünden gerçek sayımlar kaybolmasın.
 */
function denseThroughputBuckets(sparse, windowStartSec, windowEndSec, bucketWidthSec, eventTypeFilter) {
    const firstBucket = Math.floor(windowStartSec / bucketWidthSec) * bucketWidthSec;
    const lastBucket = Math.floor(windowEndSec / bucketWidthSec) * bucketWidthSec;
    const allTypes = new Set();
    if (eventTypeFilter !== null && eventTypeFilter.length > 0) {
        allTypes.add(eventTypeFilter);
    }
    else {
        for (const b of sparse.values()) {
            for (const k of Object.keys(b.counts)) {
                allTypes.add(k);
            }
        }
    }
    for (let t = firstBucket; t <= lastBucket; t += bucketWidthSec) {
        if (!sparse.has(t)) {
            sparse.set(t, { counts: {} });
        }
    }
    const out = [];
    for (let t = firstBucket; t <= lastBucket; t += bucketWidthSec) {
        const b = sparse.get(t);
        if (b === undefined) {
            continue;
        }
        const counts = { ...b.counts };
        for (const typ of allTypes) {
            if (counts[typ] === undefined) {
                counts[typ] = 0;
            }
        }
        out.push({
            bucket_start: new Date(t * 1000).toISOString(),
            counts,
        });
    }
    return out;
}
async function enqueueEnvelope(app, envelope) {
    await app.redis.xadd(streams_1.EVENTS_STREAM, "*", "envelope", JSON.stringify(envelope));
}
async function buildServer(options) {
    const app = (0, fastify_1.default)({
        logger: options?.silent
            ? false
            : {
                level: logLevel,
                redact: {
                    paths: ["req.headers.authorization", "req.headers.cookie"],
                    remove: true,
                },
            },
        disableRequestLogging: false,
        requestIdHeader: "x-request-id",
        genReqId: () => (0, node_crypto_1.randomUUID)(),
    });
    await app.register(cors_1.default, { origin: true });
    await app.register(swagger_1.default, {
        openapi: {
            openapi: "3.1.0",
            info: {
                title: "EventPulse API",
                description: "NovaMart case study — ingestion, metrics, query, anomalies (PDF v2.0)",
                version: "1.0.0",
            },
            tags: [
                { name: "ingestion", description: "Event acceptance" },
                { name: "metrics", description: "Aggregates & throughput series" },
                { name: "query", description: "Event & anomaly reads" },
                { name: "rules", description: "Alert rules (stub CRUD)" },
                { name: "health", description: "Pipeline observability" },
            ],
        },
    });
    await app.register(swagger_ui_1.default, {
        routePrefix: SWAGGER_ROUTE_PREFIX,
        uiConfig: {
            docExpansion: "list",
            deepLinking: true,
            urls: [
                {
                    url: `${SWAGGER_ROUTE_PREFIX}/json`,
                    name: "Developer by Muhammet Keskin",
                },
            ],
        },
    });
    await app.register(postgres_1.default, {
        connectionString,
        max: 10,
    });
    await app.register(redis_1.default, {
        url: redisUrl,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
    });
    await app.register(websocket_1.default);
    let redisSubscriber = null;
    app.addHook("onReady", async () => {
        redisSubscriber = app.redis.duplicate();
        await redisSubscriber.subscribe(realtime_1.EVENTS_LIVE_CHANNEL);
        redisSubscriber.on("message", (_channel, message) => {
            (0, ws_hub_1.broadcastToWebSocketClients)(message);
        });
        app.log.info({ channel: realtime_1.EVENTS_LIVE_CHANNEL }, "ws_redis_subscriber_ready");
    });
    app.addHook("onClose", async () => {
        if (redisSubscriber !== null) {
            try {
                await redisSubscriber.unsubscribe(realtime_1.EVENTS_LIVE_CHANNEL);
            }
            catch {
                /* ignore */
            }
            redisSubscriber.disconnect();
            redisSubscriber = null;
        }
    });
    app.get("/ws/events", { websocket: true }, (socket, req) => {
        (0, ws_hub_1.registerWebSocketClient)(socket);
        socket.on("error", (err) => {
            req.log.error({ err }, "ws_client_error");
        });
    });
    app.get("/", {
        schema: {
            tags: ["default"],
            summary: "Service index and endpoint map",
            response: { 200: { type: "object", additionalProperties: true } },
        },
    }, async (_request, reply) => {
        return reply.send({
            service: "eventpulse-ingestion-api",
            openapi: SWAGGER_ROUTE_PREFIX,
            endpoints: {
                ingest_single: { method: "POST", path: "/api/v1/events" },
                ingest_batch: { method: "POST", path: "/api/v1/events/batch" },
                pipeline_health: { method: "GET", path: "/api/v1/events/health" },
                metrics: { method: "GET", path: "/api/v1/metrics" },
                metrics_throughput: {
                    method: "GET",
                    path: "/api/v1/metrics/throughput",
                },
                events_query: { method: "GET", path: "/api/v1/events" },
                event_by_id: { method: "GET", path: "/api/v1/events/:id" },
                anomalies: { method: "GET", path: "/api/v1/anomalies" },
                rules: { method: "GET,POST", path: "/api/v1/rules" },
                events_stream: {
                    protocol: "WebSocket",
                    path: "/ws/events",
                },
            },
        });
    });
    app.get("/api/v1/events/health", {
        schema: {
            tags: ["health"],
            summary: "Pipeline health (queue depth, DB latency)",
            response: {
                200: {
                    type: "object",
                    additionalProperties: true,
                },
            },
        },
    }, async (request, reply) => {
        const t0 = Date.now();
        let db_ok = false;
        let db_latency_ms = 0;
        try {
            await app.pg.query("SELECT 1");
            db_ok = true;
            db_latency_ms = Date.now() - t0;
        }
        catch (err) {
            request.log.error({ err }, "health_db_failed");
        }
        const stream_length = await app.redis.xlen(streams_1.EVENTS_STREAM);
        let pending_messages = 0;
        try {
            const pend = (await app.redis.xpending(streams_1.EVENTS_STREAM, streams_1.CONSUMER_GROUP));
            if (pend !== null && pend[0] !== undefined) {
                pending_messages = Number.parseInt(String(pend[0]), 10) || 0;
            }
        }
        catch {
            /* group may not exist yet */
        }
        let dlq_length = 0;
        try {
            dlq_length = await app.redis.xlen(streams_1.EVENTS_DLQ_STREAM);
        }
        catch {
            dlq_length = 0;
        }
        return reply.send({
            ok: db_ok,
            redis: true,
            stream: streams_1.EVENTS_STREAM,
            stream_length,
            consumer_group: streams_1.CONSUMER_GROUP,
            pending_messages,
            dlq_stream: streams_1.EVENTS_DLQ_STREAM,
            dlq_length,
            db_latency_ms,
            checked_at: new Date().toISOString(),
        });
    });
    app.get("/api/v1/metrics", {
        schema: {
            tags: ["metrics"],
            summary: "Aggregated metrics; optional from/to (ISO-8601), event_type filter",
            querystring: {
                type: "object",
                properties: {
                    from: { type: "string", description: "ISO-8601 window start" },
                    to: { type: "string", description: "ISO-8601 window end" },
                    event_type: { type: "string" },
                },
            },
            response: {
                200: { type: "object", additionalProperties: true },
                400: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        void reply.header("Cache-Control", `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`);
        const q = request.query;
        const fromQ = singleQueryParam(q.from);
        const toQ = singleQueryParam(q.to);
        const now = new Date();
        const hasCustom = (fromQ !== undefined && fromQ.length > 0) ||
            (toQ !== undefined && toQ.length > 0);
        let windowEnd = parseIsoOr(toQ, now);
        let windowStart = hasCustom
            ? parseIsoOr(fromQ, new Date(windowEnd.getTime() - 60 * 60 * 1000))
            : new Date(windowEnd.getTime() - 60 * 60 * 1000);
        if (!hasCustom) {
            windowEnd = now;
            windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);
        }
        if (windowStart >= windowEnd) {
            return reply.status(400).send({ error: "invalid_time_range" });
        }
        const etRaw = singleQueryParam(q.event_type);
        const eventTypeFilter = etRaw !== undefined && etRaw.length > 0 ? etRaw : null;
        try {
            const distParams = [windowStart, windowEnd, eventTypeFilter];
            const distSql = `
            SELECT event_type, COUNT(*)::bigint AS count
            FROM events
            WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
              AND ($3::text IS NULL OR event_type = $3)
            GROUP BY event_type
            ORDER BY count DESC
          `;
            const allParams = [];
            let allSql;
            if (hasCustom) {
                allParams.push(windowStart, windowEnd, eventTypeFilter);
                allSql = `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE event_type = 'error')::bigint AS errors
            FROM events
            WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
              AND ($3::text IS NULL OR event_type = $3)
          `;
            }
            else {
                allParams.push(eventTypeFilter);
                allSql = `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE event_type = 'error')::bigint AS errors
            FROM events
            WHERE ($1::text IS NULL OR event_type = $1)
          `;
            }
            const [distResult, allTimeResult] = await Promise.all([
                app.pg.query(distSql, distParams),
                app.pg.query(allSql, allParams),
            ]);
            const byEventType = distResult.rows.map((row) => ({
                event_type: row.event_type,
                count: Number(toBigIntString(row.count)),
            }));
            let lastHourTotal = 0n;
            let lastHourErrors = 0n;
            for (const row of distResult.rows) {
                const c = toBigIntString(row.count);
                lastHourTotal += c;
                if (row.event_type === "error") {
                    lastHourErrors += c;
                }
            }
            const allRow = allTimeResult.rows[0];
            const allTotal = allRow ? toBigIntString(allRow.total) : 0n;
            const allErrors = allRow ? toBigIntString(allRow.errors) : 0n;
            request.log.debug({ lastHourTotal: String(lastHourTotal) }, "metrics_served");
            return reply.send({
                refreshed_at: now.toISOString(),
                suggested_poll_interval_seconds: METRICS_CACHE_MAX_AGE_SEC,
                window: {
                    label: hasCustom ? "custom" : "last_1_hour",
                    start: windowStart.toISOString(),
                    end: windowEnd.toISOString(),
                },
                last_hour: {
                    by_event_type: byEventType,
                    total_events: Number(lastHourTotal),
                    error_events: Number(lastHourErrors),
                    error_rate_percent: errorRatePercent(lastHourErrors, lastHourTotal),
                },
                all_time: {
                    total_events: Number(allTotal),
                    error_events: Number(allErrors),
                    error_rate_percent: errorRatePercent(allErrors, allTotal),
                },
            });
        }
        catch (err) {
            request.log.error({ err }, "metrics_query_failed");
            return reply.status(503).send({ error: "metrics_unavailable" });
        }
    });
    app.get("/api/v1/metrics/throughput", {
        schema: {
            tags: ["metrics"],
            summary: "Throughput buckets by event_type",
            querystring: {
                type: "object",
                properties: {
                    from: { type: "string", description: "ISO-8601 (metrics ile aynı pencere)" },
                    to: { type: "string", description: "ISO-8601" },
                    windowMinutes: { type: "string" },
                    bucketMinutes: { type: "string" },
                    event_type: { type: "string" },
                },
            },
            response: {
                200: { type: "object", additionalProperties: true },
                400: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        void reply.header("Cache-Control", `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`);
        const q = request.query;
        const windowMin = Math.min(24 * 60, Math.max(15, Number.parseInt(singleQueryParam(q.windowMinutes) ?? "60", 10) || 60));
        const bucketMin = Math.min(60, Math.max(1, Number.parseInt(singleQueryParam(q.bucketMinutes) ?? "5", 10) || 5));
        const etRaw = singleQueryParam(q.event_type);
        const et = etRaw !== undefined && etRaw.length > 0 ? etRaw : null;
        const bucketWidthSec = bucketMin * 60;
        const now = new Date();
        const fromQ = singleQueryParam(q.from);
        const toQ = singleQueryParam(q.to);
        const hasBounds = fromQ !== undefined &&
            fromQ.length > 0 &&
            toQ !== undefined &&
            toQ.length > 0;
        let windowEnd = parseIsoOr(toQ, now);
        let windowStart = hasBounds
            ? parseIsoOr(fromQ, new Date(windowEnd.getTime() - windowMin * 60_000))
            : new Date(windowEnd.getTime() - windowMin * 60_000);
        if (!hasBounds) {
            windowEnd = now;
            windowStart = new Date(windowEnd.getTime() - windowMin * 60_000);
        }
        if (windowStart >= windowEnd) {
            return reply.status(400).send({ error: "invalid_time_range" });
        }
        const windowStartSec = Math.floor(windowStart.getTime() / 1000);
        const windowEndSec = Math.floor(windowEnd.getTime() / 1000);
        try {
            const rows = hasBounds
                ? await app.pg.query(`
          SELECT
            ((floor(EXTRACT(EPOCH FROM occurred_at))::bigint / $4::bigint) * $4::bigint)::text AS bucket_epoch,
            event_type,
            COUNT(*)::text AS c
          FROM events
          WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
            AND ($3::text IS NULL OR event_type = $3)
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `, [windowStart, windowEnd, et, bucketWidthSec])
                : await app.pg.query(`
          SELECT
            ((floor(EXTRACT(EPOCH FROM occurred_at))::bigint / $3::bigint) * $3::bigint)::text AS bucket_epoch,
            event_type,
            COUNT(*)::text AS c
          FROM events
          WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 minute')
            AND ($2::text IS NULL OR event_type = $2)
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `, [windowMin, et, bucketWidthSec]);
            const bucketMap = new Map();
            for (const row of rows.rows) {
                const aligned = Number.parseInt(row.bucket_epoch, 10);
                if (!Number.isFinite(aligned)) {
                    continue;
                }
                let b = bucketMap.get(aligned);
                if (!b) {
                    b = { counts: {} };
                    bucketMap.set(aligned, b);
                }
                b.counts[row.event_type] = Number(row.c);
            }
            const buckets = denseThroughputBuckets(bucketMap, windowStartSec, windowEndSec, bucketWidthSec, et);
            const windowMinutesReported = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / 60_000));
            return reply.send({
                window_minutes: windowMinutesReported,
                bucket_minutes: bucketMin,
                event_type_filter: et,
                buckets,
            });
        }
        catch (err) {
            request.log.error({ err }, "throughput_series_failed");
            return reply.status(503).send({ error: "throughput_unavailable" });
        }
    });
    app.get("/api/v1/anomalies", {
        schema: {
            tags: ["query"],
            summary: "List detected anomalies",
            querystring: {
                type: "object",
                properties: {
                    limit: { type: "string" },
                    from: { type: "string" },
                    to: { type: "string" },
                    severity: { type: "string" },
                    event_type: { type: "string" },
                },
            },
            response: {
                200: { type: "object", additionalProperties: true },
                400: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const aq = request.query;
        const raw = singleQueryParam(aq.limit);
        const parsed = raw !== undefined ? Number.parseInt(raw, 10) : 10;
        const limit = Number.isFinite(parsed)
            ? Math.min(500, Math.max(1, parsed))
            : 10;
        const params = [];
        const where = ["1=1"];
        let p = 1;
        const fromA = singleQueryParam(aq.from);
        const toA = singleQueryParam(aq.to);
        const sevA = singleQueryParam(aq.severity);
        const etA = singleQueryParam(aq.event_type);
        if (fromA !== undefined && fromA.length > 0) {
            const fromD = new Date(fromA);
            if (Number.isNaN(fromD.getTime())) {
                return reply.status(400).send({ error: "invalid_from" });
            }
            where.push(`detected_at >= $${p}::timestamptz`);
            params.push(fromD.toISOString());
            p += 1;
        }
        if (toA !== undefined && toA.length > 0) {
            const toD = new Date(toA);
            if (Number.isNaN(toD.getTime())) {
                return reply.status(400).send({ error: "invalid_to" });
            }
            where.push(`detected_at < $${p}::timestamptz`);
            params.push(toD.toISOString());
            p += 1;
        }
        if (sevA !== undefined && sevA.length > 0) {
            where.push(`severity = $${p}`);
            params.push(sevA);
            p += 1;
        }
        if (etA !== undefined && etA.length > 0) {
            where.push(`event_type = $${p}`);
            params.push(etA);
            p += 1;
        }
        params.push(limit);
        try {
            const result = await app.pg.query(`
          SELECT id, event_type, severity, detected_at, description
          FROM anomalies
          WHERE ${where.join(" AND ")}
          ORDER BY detected_at DESC
          LIMIT $${p}
        `, params);
            return reply.send({
                items: result.rows.map((row) => ({
                    id: row.id,
                    event_type: row.event_type,
                    severity: row.severity,
                    detected_at: row.detected_at instanceof Date
                        ? row.detected_at.toISOString()
                        : String(row.detected_at),
                    description: row.description,
                })),
            });
        }
        catch (err) {
            request.log.error({ err }, "anomalies_query_failed");
            return reply.status(503).send({ error: "anomalies_unavailable" });
        }
    });
    app.get("/api/v1/events", {
        schema: {
            tags: ["query"],
            summary: "Query events with filters and pagination",
            querystring: {
                type: "object",
                properties: {
                    event_type: { type: "string" },
                    from: { type: "string" },
                    to: { type: "string" },
                    limit: { type: "string" },
                    offset: { type: "string" },
                },
            },
            response: {
                200: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const q = request.query;
        const limit = Math.min(100, Math.max(1, Number.parseInt(singleQueryParam(q.limit) ?? "50", 10) || 50));
        const offset = Math.max(0, Number.parseInt(singleQueryParam(q.offset) ?? "0", 10) || 0);
        const params = [];
        let p = 1;
        const where = ["1=1"];
        const etEv = singleQueryParam(q.event_type);
        const fromEv = singleQueryParam(q.from);
        const toEv = singleQueryParam(q.to);
        if (etEv !== undefined && etEv.length > 0) {
            where.push(`event_type = $${p}`);
            params.push(etEv);
            p += 1;
        }
        if (fromEv !== undefined && fromEv.length > 0) {
            where.push(`occurred_at >= $${p}::timestamptz`);
            params.push(fromEv);
            p += 1;
        }
        if (toEv !== undefined && toEv.length > 0) {
            where.push(`occurred_at < $${p}::timestamptz`);
            params.push(toEv);
            p += 1;
        }
        params.push(limit, offset);
        try {
            const sql = `
        SELECT id::text AS id, event_type,
               occurred_at,
               payload
        FROM events
        WHERE ${where.join(" AND ")}
        ORDER BY occurred_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `;
            const result = await app.pg.query(sql, params);
            return reply.send({
                items: result.rows.map((row) => ({
                    id: row.id,
                    event_type: row.event_type,
                    occurred_at: row.occurred_at instanceof Date
                        ? row.occurred_at.toISOString()
                        : String(row.occurred_at),
                    payload: row.payload,
                })),
                limit,
                offset,
            });
        }
        catch (err) {
            request.log.error({ err }, "events_query_failed");
            return reply.status(503).send({ error: "events_unavailable" });
        }
    });
    app.get("/api/v1/events/:id", {
        schema: {
            tags: ["query"],
            summary: "Get one event by UUID (latest occurrence row)",
            params: {
                type: "object",
                properties: { id: { type: "string", format: "uuid" } },
                required: ["id"],
            },
            response: {
                200: { type: "object", additionalProperties: true },
                400: { type: "object", additionalProperties: true },
                404: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const id = request.params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
            return reply.status(400).send({ error: "invalid_event_id" });
        }
        try {
            const result = await app.pg.query(`
          SELECT id::text AS id, event_type, occurred_at, payload
          FROM events
          WHERE id = $1::uuid
          ORDER BY occurred_at DESC
          LIMIT 1
        `, [id]);
            const row = result.rows[0];
            if (!row) {
                return reply.status(404).send({ error: "event_not_found" });
            }
            return reply.send({
                id: row.id,
                event_type: row.event_type,
                occurred_at: row.occurred_at instanceof Date
                    ? row.occurred_at.toISOString()
                    : String(row.occurred_at),
                payload: row.payload,
            });
        }
        catch (err) {
            request.log.error({ err }, "event_by_id_failed");
            return reply.status(503).send({ error: "events_unavailable" });
        }
    });
    app.get("/api/v1/rules", {
        schema: {
            tags: ["rules"],
            summary: "List alert rules (stub)",
            response: {
                200: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await app.pg.query(`
          SELECT id, name, definition, enabled, channel_hint, created_at
          FROM alert_rules
          ORDER BY created_at DESC
          LIMIT 200
        `);
            return reply.send({
                items: result.rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    definition: r.definition,
                    enabled: r.enabled,
                    channel_hint: r.channel_hint,
                    created_at: r.created_at instanceof Date
                        ? r.created_at.toISOString()
                        : String(r.created_at),
                })),
            });
        }
        catch (err) {
            request.log.error({ err }, "rules_list_failed");
            return reply.status(503).send({ error: "rules_unavailable" });
        }
    });
    app.post("/api/v1/rules", {
        schema: {
            tags: ["rules"],
            summary: "Create alert rule (stub)",
            body: { type: "object", additionalProperties: true },
            response: {
                201: { type: "object", additionalProperties: true },
                422: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const parsed = createRuleSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({
                error: "validation_failed",
                details: zod_1.z.treeifyError(parsed.error),
            });
        }
        const b = parsed.data;
        try {
            const ins = await app.pg.query(`
          INSERT INTO alert_rules (name, definition, enabled, channel_hint)
          VALUES ($1, $2::jsonb, COALESCE($3, true), $4)
          RETURNING id::text AS id
        `, [
                b.name,
                JSON.stringify(b.definition ?? {}),
                b.enabled ?? true,
                b.channel_hint ?? null,
            ]);
            const id = ins.rows[0]?.id;
            return reply.status(201).send({ id, status: "created" });
        }
        catch (err) {
            request.log.error({ err }, "rules_create_failed");
            return reply.status(503).send({ error: "rules_unavailable" });
        }
    });
    app.post("/api/v1/events", {
        schema: {
            tags: ["ingestion"],
            summary: "Ingest single event (202 + Redis stream)",
            body: { type: "object", additionalProperties: true },
            response: {
                202: { type: "object", additionalProperties: true },
                422: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const parsed = ingestion_events_1.ingestionEventSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({
                error: "validation_failed",
                details: zod_1.z.treeifyError(parsed.error),
            });
        }
        const body = parsed.data;
        const eventId = body.event_id ?? (0, node_crypto_1.randomUUID)();
        const envelope = {
            event_id: eventId,
            event_type: body.event_type,
            occurred_at: body.occurred_at,
            source: body.source,
            metadata: body.metadata,
            payload: body.payload,
            received_at: new Date().toISOString(),
        };
        try {
            await enqueueEnvelope(app, envelope);
        }
        catch (err) {
            request.log.error({ err }, "redis_xadd_failed");
            return reply.status(503).send({ error: "stream_unavailable" });
        }
        request.log.info({ event_id: eventId, event_type: body.event_type }, "event_accepted");
        return reply.status(202).send({
            status: "accepted",
            event_id: eventId,
        });
    });
    app.post("/api/v1/events/batch", {
        schema: {
            tags: ["ingestion"],
            summary: "Ingest up to 500 events",
            body: { type: "object", additionalProperties: true },
            response: {
                202: { type: "object", additionalProperties: true },
                422: { type: "object", additionalProperties: true },
                503: { type: "object", additionalProperties: true },
            },
        },
    }, async (request, reply) => {
        const parsed = batch_ingestion_1.batchIngestionSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({
                error: "validation_failed",
                details: zod_1.z.treeifyError(parsed.error),
            });
        }
        const event_ids = [];
        try {
            for (const ev of parsed.data.events) {
                const eventId = ev.event_id ?? (0, node_crypto_1.randomUUID)();
                event_ids.push(eventId);
                const envelope = {
                    event_id: eventId,
                    event_type: ev.event_type,
                    occurred_at: ev.occurred_at,
                    source: ev.source,
                    metadata: ev.metadata,
                    payload: ev.payload,
                    received_at: new Date().toISOString(),
                };
                await enqueueEnvelope(app, envelope);
            }
        }
        catch (err) {
            request.log.error({ err }, "redis_batch_xadd_failed");
            return reply.status(503).send({ error: "stream_unavailable" });
        }
        request.log.info({ count: event_ids.length }, "batch_accepted");
        return reply.status(202).send({
            status: "accepted",
            count: event_ids.length,
            event_ids,
        });
    });
    app.setErrorHandler((err, request, reply) => {
        request.log.error({ err }, "Unhandled error");
        if (!reply.sent) {
            void reply.status(500).send({ error: "internal_server_error" });
        }
    });
    return app;
}
async function start() {
    const app = await buildServer();
    try {
        await app.pg.query("SELECT 1");
    }
    catch (err) {
        app.log.error({ err }, "postgres_connect_check_failed");
        process.exit(1);
    }
    try {
        await app.redis.ping();
    }
    catch (err) {
        app.log.error({ err }, "redis_connect_check_failed");
        process.exit(1);
    }
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? "0.0.0.0";
    try {
        await app.listen({ port, host });
        app.log.info({ port, host }, "ingestion_api_listening");
    }
    catch (err) {
        app.log.error({ err }, "listen_failed");
        process.exit(1);
    }
}
void start();
//# sourceMappingURL=app.js.map