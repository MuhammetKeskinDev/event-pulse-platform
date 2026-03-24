import type { FastifyInstance } from "fastify";
import { z } from "zod";

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  definition: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  channel_hint: z.string().max(200).optional(),
});

export function registerRulesRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/rules",
    {
      schema: {
        tags: ["rules"],
        summary: "List alert rules (stub)",
        response: {
          200: { type: "object", additionalProperties: true },
          503: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
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
    },
  );

  app.post(
    "/api/v1/rules",
    {
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
    },
    async (request, reply) => {
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
    },
  );
}
