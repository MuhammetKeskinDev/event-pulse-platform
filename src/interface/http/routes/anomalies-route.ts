import type { FastifyInstance } from "fastify";

import { singleQueryParam } from "../../../lib/query-params";

export function registerAnomaliesRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/anomalies",
    {
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
    },
    async (request, reply) => {
      const aq = request.query as Record<
        string,
        string | string[] | undefined
      >;
      const raw = singleQueryParam(aq.limit);
      const parsed = raw !== undefined ? Number.parseInt(raw, 10) : 10;
      const limit = Number.isFinite(parsed)
        ? Math.min(500, Math.max(1, parsed))
        : 10;

      const params: unknown[] = [];
      const where: string[] = ["1=1"];
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
        where.push(`LOWER(TRIM(severity)) = LOWER(TRIM($${p}::text))`);
        params.push(sevA);
        p += 1;
      }
      if (etA !== undefined && etA.length > 0) {
        where.push(`(event_type = $${p} OR event_type = '*')`);
        params.push(etA);
        p += 1;
      }
      params.push(limit);

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
          WHERE ${where.join(" AND ")}
          ORDER BY detected_at DESC
          LIMIT $${p}
        `,
          params,
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
    },
  );
}
