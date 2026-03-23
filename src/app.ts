import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import postgres from "@fastify/postgres";
import redis from "@fastify/redis";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { z } from "zod";

import { EVENTS_LIVE_CHANNEL } from "./constants/realtime";
import {
  CONSUMER_GROUP,
  EVENTS_DLQ_STREAM,
  EVENTS_STREAM,
} from "./constants/streams";
import { batchIngestionSchema } from "./schemas/batch-ingestion";
import { ingestionEventSchema } from "./schemas/ingestion-events";
import {
  broadcastToWebSocketClients,
  registerWebSocketClient,
} from "./realtime/ws-hub";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const logLevel = (process.env.LOG_LEVEL ?? "info") as
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

const METRICS_CACHE_MAX_AGE_SEC = 10;

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  definition: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  channel_hint: z.string().max(200).optional(),
});

function toBigIntString(value: unknown): bigint {
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

function errorRatePercent(errors: bigint, total: bigint): number {
  if (total === 0n) {
    return 0;
  }
  const pct = (Number(errors) / Number(total)) * 100;
  return Math.round(pct * 100) / 100;
}

async function enqueueEnvelope(
  app: FastifyInstance,
  envelope: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    payload: unknown;
    received_at: string;
  },
): Promise<void> {
  await app.redis.xadd(
    EVENTS_STREAM,
    "*",
    "envelope",
    JSON.stringify(envelope),
  );
}

export async function buildServer(options?: { silent?: boolean }) {
  const app = Fastify({
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
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "EventPulse API",
        description:
          "NovaMart case study — ingestion, metrics, query, anomalies (PDF v2.0)",
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

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  await app.register(postgres, {
    connectionString,
    max: 10,
  });

  await app.register(redis, {
    url: redisUrl,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  await app.register(websocket);

  let redisSubscriber: Redis | null = null;

  app.addHook("onReady", async () => {
    redisSubscriber = app.redis.duplicate();
    await redisSubscriber.subscribe(EVENTS_LIVE_CHANNEL);
    redisSubscriber.on("message", (_channel, message) => {
      broadcastToWebSocketClients(message);
    });
    app.log.info({ channel: EVENTS_LIVE_CHANNEL }, "ws_redis_subscriber_ready");
  });

  app.addHook("onClose", async () => {
    if (redisSubscriber !== null) {
      try {
        await redisSubscriber.unsubscribe(EVENTS_LIVE_CHANNEL);
      } catch {
        /* ignore */
      }
      redisSubscriber.disconnect();
      redisSubscriber = null;
    }
  });

  app.get("/ws/events", { websocket: true }, (socket, req) => {
    registerWebSocketClient(socket);
    socket.on("error", (err) => {
      req.log.error({ err }, "ws_client_error");
    });
  });

  app.get("/", async (_request, reply) => {
    return reply.send({
      service: "eventpulse-ingestion-api",
      openapi: "/docs",
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

  app.get(
    "/api/v1/events/health",
    {
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
    },
    async (request, reply) => {
      const t0 = Date.now();
      let db_ok = false;
      let db_latency_ms = 0;
      try {
        await app.pg.query("SELECT 1");
        db_ok = true;
        db_latency_ms = Date.now() - t0;
      } catch (err) {
        request.log.error({ err }, "health_db_failed");
      }

      const stream_length = await app.redis.xlen(EVENTS_STREAM);
      let pending_messages = 0;
      try {
        const pend = (await app.redis.xpending(
          EVENTS_STREAM,
          CONSUMER_GROUP,
        )) as [string, string, string, unknown[]] | null;
        if (pend !== null && pend[0] !== undefined) {
          pending_messages = Number.parseInt(String(pend[0]), 10) || 0;
        }
      } catch {
        /* group may not exist yet */
      }

      let dlq_length = 0;
      try {
        dlq_length = await app.redis.xlen(EVENTS_DLQ_STREAM);
      } catch {
        dlq_length = 0;
      }

      return reply.send({
        ok: db_ok,
        redis: true,
        stream: EVENTS_STREAM,
        stream_length,
        consumer_group: CONSUMER_GROUP,
        pending_messages,
        dlq_stream: EVENTS_DLQ_STREAM,
        dlq_length,
        db_latency_ms,
        checked_at: new Date().toISOString(),
      });
    },
  );

  app.get("/api/v1/metrics", async (request, reply) => {
    void reply.header(
      "Cache-Control",
      `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`,
    );

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);

    try {
      const [distResult, allTimeResult] = await Promise.all([
        app.pg.query<{
          event_type: string;
          count: string | number | bigint;
        }>(
          `
            SELECT event_type, COUNT(*)::bigint AS count
            FROM events
            WHERE occurred_at >= NOW() - INTERVAL '1 hour'
            GROUP BY event_type
            ORDER BY count DESC
          `,
        ),
        app.pg.query<{
          total: string | number | bigint;
          errors: string | number | bigint;
        }>(
          `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE event_type = 'error')::bigint AS errors
            FROM events
          `,
        ),
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
        refreshed_at: windowEnd.toISOString(),
        suggested_poll_interval_seconds: METRICS_CACHE_MAX_AGE_SEC,
        window: {
          label: "last_1_hour",
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
    } catch (err) {
      request.log.error({ err }, "metrics_query_failed");
      return reply.status(503).send({ error: "metrics_unavailable" });
    }
  });

  app.get("/api/v1/metrics/throughput", async (request, reply) => {
    void reply.header(
      "Cache-Control",
      `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`,
    );
    const q = request.query as { windowMinutes?: string; bucketMinutes?: string };
    const windowMin = Math.min(
      24 * 60,
      Math.max(15, Number.parseInt(q.windowMinutes ?? "60", 10) || 60),
    );
    const bucketMin = Math.min(60, Math.max(1, Number.parseInt(q.bucketMinutes ?? "5", 10) || 5));

    try {
      const rows = await app.pg.query<{
        bucket_start: Date;
        event_type: string;
        c: string;
      }>(
        `
          SELECT
            to_timestamp(
              floor(EXTRACT(EPOCH FROM occurred_at) / ($2::float * 60.0))
              * ($2::float * 60.0)
            ) AT TIME ZONE 'UTC' AS bucket_start,
            event_type,
            COUNT(*)::text AS c
          FROM events
          WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 minute')
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
        [windowMin, bucketMin],
      );

      const bucketMap = new Map<
        string,
        { bucket_start: string; counts: Record<string, number> }
      >();

      for (const row of rows.rows) {
        const iso =
          row.bucket_start instanceof Date
            ? row.bucket_start.toISOString()
            : String(row.bucket_start);
        let b = bucketMap.get(iso);
        if (!b) {
          b = { bucket_start: iso, counts: {} };
          bucketMap.set(iso, b);
        }
        b.counts[row.event_type] = Number(row.c);
      }

      return reply.send({
        window_minutes: windowMin,
        bucket_minutes: bucketMin,
        buckets: [...bucketMap.values()],
      });
    } catch (err) {
      request.log.error({ err }, "throughput_series_failed");
      return reply.status(503).send({ error: "throughput_unavailable" });
    }
  });

  app.get("/api/v1/anomalies", async (request, reply) => {
    const raw = (request.query as { limit?: string }).limit;
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : 10;
    const limit = Number.isFinite(parsed)
      ? Math.min(100, Math.max(1, parsed))
      : 10;

    try {
      const result = await app.pg.query<{
        id: string;
        event_type: string;
        severity: string;
        detected_at: Date;
        description: string;
      }>(
        `
          SELECT id, event_type, severity, detected_at, description
          FROM anomalies
          ORDER BY detected_at DESC
          LIMIT $1
        `,
        [limit],
      );

      return reply.send({
        items: result.rows.map((row) => ({
          id: row.id,
          event_type: row.event_type,
          severity: row.severity,
          detected_at:
            row.detected_at instanceof Date
              ? row.detected_at.toISOString()
              : String(row.detected_at),
          description: row.description,
        })),
      });
    } catch (err) {
      request.log.error({ err }, "anomalies_query_failed");
      return reply.status(503).send({ error: "anomalies_unavailable" });
    }
  });

  app.get("/api/v1/events", async (request, reply) => {
    const q = request.query as {
      event_type?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(q.limit ?? "50", 10) || 50),
    );
    const offset = Math.max(0, Number.parseInt(q.offset ?? "0", 10) || 0);

    const params: unknown[] = [];
    let p = 1;
    const where: string[] = ["1=1"];
    if (q.event_type !== undefined && q.event_type.length > 0) {
      where.push(`event_type = $${p}`);
      params.push(q.event_type);
      p += 1;
    }
    if (q.from !== undefined && q.from.length > 0) {
      where.push(`occurred_at >= $${p}::timestamptz`);
      params.push(q.from);
      p += 1;
    }
    if (q.to !== undefined && q.to.length > 0) {
      where.push(`occurred_at < $${p}::timestamptz`);
      params.push(q.to);
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
      const result = await app.pg.query<{
        id: string;
        event_type: string;
        occurred_at: Date;
        payload: unknown;
      }>(sql, params);

      return reply.send({
        items: result.rows.map((row) => ({
          id: row.id,
          event_type: row.event_type,
          occurred_at:
            row.occurred_at instanceof Date
              ? row.occurred_at.toISOString()
              : String(row.occurred_at),
          payload: row.payload,
        })),
        limit,
        offset,
      });
    } catch (err) {
      request.log.error({ err }, "events_query_failed");
      return reply.status(503).send({ error: "events_unavailable" });
    }
  });

  app.get<{ Params: { id: string } }>("/api/v1/events/:id", async (request, reply) => {
    const id = request.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return reply.status(400).send({ error: "invalid_event_id" });
    }
    try {
      const result = await app.pg.query<{
        id: string;
        event_type: string;
        occurred_at: Date;
        payload: unknown;
      }>(
        `
          SELECT id::text AS id, event_type, occurred_at, payload
          FROM events
          WHERE id = $1::uuid
          ORDER BY occurred_at DESC
          LIMIT 1
        `,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return reply.status(404).send({ error: "event_not_found" });
      }
      return reply.send({
        id: row.id,
        event_type: row.event_type,
        occurred_at:
          row.occurred_at instanceof Date
            ? row.occurred_at.toISOString()
            : String(row.occurred_at),
        payload: row.payload,
      });
    } catch (err) {
      request.log.error({ err }, "event_by_id_failed");
      return reply.status(503).send({ error: "events_unavailable" });
    }
  });

  app.get("/api/v1/rules", async (request, reply) => {
    try {
      const result = await app.pg.query<{
        id: string;
        name: string;
        definition: unknown;
        enabled: boolean;
        channel_hint: string | null;
        created_at: Date;
      }>(
        `
          SELECT id, name, definition, enabled, channel_hint, created_at
          FROM alert_rules
          ORDER BY created_at DESC
          LIMIT 200
        `,
      );
      return reply.send({
        items: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          definition: r.definition,
          enabled: r.enabled,
          channel_hint: r.channel_hint,
          created_at:
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : String(r.created_at),
        })),
      });
    } catch (err) {
      request.log.error({ err }, "rules_list_failed");
      return reply.status(503).send({ error: "rules_unavailable" });
    }
  });

  app.post("/api/v1/rules", async (request, reply) => {
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "validation_failed",
        details: z.treeifyError(parsed.error),
      });
    }
    const b = parsed.data;
    try {
      const ins = await app.pg.query<{ id: string }>(
        `
          INSERT INTO alert_rules (name, definition, enabled, channel_hint)
          VALUES ($1, $2::jsonb, COALESCE($3, true), $4)
          RETURNING id::text AS id
        `,
        [
          b.name,
          JSON.stringify(b.definition ?? {}),
          b.enabled ?? true,
          b.channel_hint ?? null,
        ],
      );
      const id = ins.rows[0]?.id;
      return reply.status(201).send({ id, status: "created" });
    } catch (err) {
      request.log.error({ err }, "rules_create_failed");
      return reply.status(503).send({ error: "rules_unavailable" });
    }
  });

  app.post("/api/v1/events", async (request, reply) => {
    const parsed = ingestionEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(422).send({
        error: "validation_failed",
        details: z.treeifyError(parsed.error),
      });
    }

    const body = parsed.data;
    const eventId = body.event_id ?? randomUUID();

    const envelope = {
      event_id: eventId,
      event_type: body.event_type,
      occurred_at: body.occurred_at,
      payload: body.payload,
      received_at: new Date().toISOString(),
    };

    try {
      await enqueueEnvelope(app, envelope);
    } catch (err) {
      request.log.error({ err }, "redis_xadd_failed");
      return reply.status(503).send({ error: "stream_unavailable" });
    }

    request.log.info(
      { event_id: eventId, event_type: body.event_type },
      "event_accepted",
    );

    return reply.status(202).send({
      status: "accepted",
      event_id: eventId,
    });
  });

  app.post("/api/v1/events/batch", async (request, reply) => {
    const parsed = batchIngestionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "validation_failed",
        details: z.treeifyError(parsed.error),
      });
    }

    const event_ids: string[] = [];
    try {
      for (const ev of parsed.data.events) {
        const eventId = ev.event_id ?? randomUUID();
        event_ids.push(eventId);
        const envelope = {
          event_id: eventId,
          event_type: ev.event_type,
          occurred_at: ev.occurred_at,
          payload: ev.payload,
          received_at: new Date().toISOString(),
        };
        await enqueueEnvelope(app, envelope);
      }
    } catch (err) {
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

async function start(): Promise<void> {
  const app = await buildServer();

  try {
    await app.pg.query("SELECT 1");
  } catch (err) {
    app.log.error({ err }, "postgres_connect_check_failed");
    process.exit(1);
  }

  try {
    await app.redis.ping();
  } catch (err) {
    app.log.error({ err }, "redis_connect_check_failed");
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info({ port, host }, "ingestion_api_listening");
  } catch (err) {
    app.log.error({ err }, "listen_failed");
    process.exit(1);
  }
}

void start();
