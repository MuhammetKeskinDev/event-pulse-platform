"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const cors_1 = __importDefault(require("@fastify/cors"));
const postgres_1 = __importDefault(require("@fastify/postgres"));
const redis_1 = __importDefault(require("@fastify/redis"));
const fastify_1 = __importDefault(require("fastify"));
const zod_1 = require("zod");
const ingestion_events_1 = require("./schemas/ingestion-events");
const EVENTS_STREAM = "events_stream";
const connectionString = process.env.DATABASE_URL ??
    "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const logLevel = (process.env.LOG_LEVEL ?? "info");
async function buildServer() {
    const app = (0, fastify_1.default)({
        logger: {
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
    await app.register(postgres_1.default, {
        connectionString,
        max: 10,
    });
    await app.register(redis_1.default, {
        url: redisUrl,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
    });
    app.setErrorHandler((err, request, reply) => {
        request.log.error({ err }, "Unhandled error");
        if (!reply.sent) {
            void reply.status(500).send({ error: "internal_server_error" });
        }
    });
    app.post("/api/v1/events", async (request, reply) => {
        const parsed = ingestion_events_1.ingestionEventSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
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
            payload: body.payload,
            received_at: new Date().toISOString(),
        };
        try {
            await app.redis.xadd(EVENTS_STREAM, "*", "envelope", JSON.stringify(envelope));
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