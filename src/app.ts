import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import postgres from "@fastify/postgres";
import redis from "@fastify/redis";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import type Redis from "ioredis";

import { EVENTS_LIVE_CHANNEL } from "./constants/realtime";
import { SWAGGER_ROUTE_PREFIX } from "./constants/swagger-route";
import { broadcastToWebSocketClients } from "./interface/ws/ws-hub";
import { registerAllRoutes } from "./interface/http/register-routes";

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

  registerAllRoutes(app);

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
