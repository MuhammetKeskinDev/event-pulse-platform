import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import postgres from "@fastify/postgres";
import redis from "@fastify/redis";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import type Redis from "ioredis";
import { z } from "zod";

import { EVENTS_LIVE_CHANNEL } from "./constants/realtime";
import { ingestionEventSchema } from "./schemas/ingestion-events";
import {
  broadcastToWebSocketClients,
  registerWebSocketClient,
} from "./realtime/ws-hub";

const EVENTS_STREAM = "events_stream";

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

async function buildServer() {
  const app = Fastify({
    logger: {
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
      endpoints: {
        ingest_events: { method: "POST", path: "/api/v1/events" },
        metrics: { method: "GET", path: "/api/v1/metrics" },
        anomalies: { method: "GET", path: "/api/v1/anomalies" },
        events_stream: {
          protocol: "WebSocket",
          path: "/ws/events",
        },
      },
    });
  });

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

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, "Unhandled error");
    if (!reply.sent) {
      void reply.status(500).send({ error: "internal_server_error" });
    }
  });

  app.post("/api/v1/events", async (request, reply) => {
    const parsed = ingestionEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
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
      await app.redis.xadd(
        EVENTS_STREAM,
        "*",
        "envelope",
        JSON.stringify(envelope),
      );
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
