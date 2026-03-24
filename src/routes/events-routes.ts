import type { FastifyInstance } from "fastify";

import { singleQueryParam } from "../lib/query-params";

export function registerEventsRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/events",
    {
      schema: {
        tags: ["query"],
        summary: "Query events with filters and pagination",
        querystring: {
          type: "object",
          properties: {
            event_type: { type: "string" },
            source: { type: "string" },
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
    },
    async (request, reply) => {
      const q = request.query as Record<
        string,
        string | string[] | undefined
      >;
      const limit = Math.min(
        100,
        Math.max(
          1,
          Number.parseInt(singleQueryParam(q.limit) ?? "50", 10) || 50,
        ),
      );
      const offset = Math.max(
        0,
        Number.parseInt(singleQueryParam(q.offset) ?? "0", 10) || 0,
      );

      const params: unknown[] = [];
      let p = 1;
      const where: string[] = ["1=1"];
      const etEv = singleQueryParam(q.event_type);
      const srcEv = singleQueryParam(q.source);
      const fromEv = singleQueryParam(q.from);
      const toEv = singleQueryParam(q.to);
      if (etEv !== undefined && etEv.length > 0) {
        where.push(`event_type = $${p}`);
        params.push(etEv);
        p += 1;
      }
      if (srcEv !== undefined && srcEv.length > 0) {
        where.push(`source = $${p}`);
        params.push(srcEv);
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
               payload,
               source
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
          source: string;
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
            source: row.source,
          })),
          limit,
          offset,
        });
      } catch (err) {
        request.log.error({ err }, "events_query_failed");
        return reply.status(503).send({ error: "events_unavailable" });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/events/:id",
    {
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
    },
    async (request, reply) => {
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
    },
  );
}
