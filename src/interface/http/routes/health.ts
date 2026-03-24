import type { FastifyInstance } from "fastify";

import {
  CONSUMER_GROUP,
  EVENTS_DLQ_STREAM,
  EVENTS_STREAM,
} from "../../../constants/streams";

export function registerHealthRoutes(app: FastifyInstance): void {
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
}
