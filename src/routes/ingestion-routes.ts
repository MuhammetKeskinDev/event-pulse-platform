import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { batchIngestionSchema } from "../schemas/batch-ingestion";
import { ingestionEventSchema } from "../schemas/ingestion-events";
import { enqueueEnvelope } from "./stream-envelope";

export function registerIngestionRoutes(app: FastifyInstance): void {
  app.post(
    "/api/v1/events",
    {
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
    },
    async (request, reply) => {
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
        source: body.source,
        metadata: body.metadata,
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
    },
  );

  app.post(
    "/api/v1/events/batch",
    {
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
    },
    async (request, reply) => {
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
            source: ev.source,
            metadata: ev.metadata,
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
    },
  );
}
