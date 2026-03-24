import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { isUuidParam } from "../../../lib/uuid-param";

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  definition: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  channel_hint: z.string().max(200).optional(),
});

const updateRuleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    definition: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
    channel_hint: z.union([z.string().max(200), z.null()]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "at_least_one_field",
  });

function mapRuleRow(r: {
  id: string;
  name: string;
  definition: unknown;
  enabled: boolean;
  channel_hint: string | null;
  created_at: Date;
  updated_at?: Date;
}) {
  return {
    id: r.id,
    name: r.name,
    definition: r.definition,
    enabled: r.enabled,
    channel_hint: r.channel_hint,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
    updated_at:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : r.updated_at !== undefined
          ? String(r.updated_at)
          : undefined,
  };
}

export function registerRulesRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/rules",
    {
      schema: {
        tags: ["rules"],
        summary: "List alert rules",
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
          updated_at: Date;
        }>(
          `
          SELECT id::text AS id, name, definition, enabled, channel_hint, created_at, updated_at
          FROM alert_rules
          ORDER BY created_at DESC
          LIMIT 200
        `,
        );
        return reply.send({
          items: result.rows.map((r) => mapRuleRow(r)),
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
        summary: "Create alert rule",
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

  app.get<{ Params: { id: string } }>(
    "/api/v1/rules/:id",
    {
      schema: {
        tags: ["rules"],
        summary: "Get one alert rule by id",
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
      const { id } = request.params;
      if (!isUuidParam(id)) {
        return reply.status(400).send({ error: "invalid_rule_id" });
      }
      try {
        const result = await app.pg.query<{
          id: string;
          name: string;
          definition: unknown;
          enabled: boolean;
          channel_hint: string | null;
          created_at: Date;
          updated_at: Date;
        }>(
          `
          SELECT id::text AS id, name, definition, enabled, channel_hint, created_at, updated_at
          FROM alert_rules
          WHERE id = $1::uuid
        `,
          [id],
        );
        const row = result.rows[0];
        if (!row) {
          return reply.status(404).send({ error: "rule_not_found" });
        }
        return reply.send(mapRuleRow(row));
      } catch (err) {
        request.log.error({ err }, "rules_get_failed");
        return reply.status(503).send({ error: "rules_unavailable" });
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/api/v1/rules/:id",
    {
      schema: {
        tags: ["rules"],
        summary: "Update alert rule (partial)",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        body: { type: "object", additionalProperties: true },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          422: { type: "object", additionalProperties: true },
          503: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!isUuidParam(id)) {
        return reply.status(400).send({ error: "invalid_rule_id" });
      }
      const parsed = updateRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: "validation_failed",
          details: z.treeifyError(parsed.error),
        });
      }
      const b = parsed.data;
      const sets: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      if (b.name !== undefined) {
        sets.push(`name = $${p}`);
        params.push(b.name);
        p += 1;
      }
      if (b.definition !== undefined) {
        sets.push(`definition = $${p}::jsonb`);
        params.push(JSON.stringify(b.definition));
        p += 1;
      }
      if (b.enabled !== undefined) {
        sets.push(`enabled = $${p}`);
        params.push(b.enabled);
        p += 1;
      }
      if (b.channel_hint !== undefined) {
        sets.push(`channel_hint = $${p}`);
        params.push(b.channel_hint);
        p += 1;
      }
      sets.push(`updated_at = NOW()`);
      const idPlaceholder = p;
      params.push(id);
      try {
        const result = await app.pg.query<{
          id: string;
          name: string;
          definition: unknown;
          enabled: boolean;
          channel_hint: string | null;
          created_at: Date;
          updated_at: Date;
        }>(
          `
          UPDATE alert_rules
          SET ${sets.join(", ")}
          WHERE id = $${idPlaceholder}::uuid
          RETURNING id::text AS id, name, definition, enabled, channel_hint, created_at, updated_at
        `,
          params,
        );
        const row = result.rows[0];
        if (!row) {
          return reply.status(404).send({ error: "rule_not_found" });
        }
        return reply.send(mapRuleRow(row));
      } catch (err) {
        request.log.error({ err }, "rules_update_failed");
        return reply.status(503).send({ error: "rules_unavailable" });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/rules/:id",
    {
      schema: {
        tags: ["rules"],
        summary: "Delete alert rule",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        response: {
          204: { type: "null" },
          400: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          503: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!isUuidParam(id)) {
        return reply.status(400).send({ error: "invalid_rule_id" });
      }
      try {
        const del = await app.pg.query(
          `DELETE FROM alert_rules WHERE id = $1::uuid RETURNING id`,
          [id],
        );
        if (del.rowCount === 0) {
          return reply.status(404).send({ error: "rule_not_found" });
        }
        return reply.status(204).send();
      } catch (err) {
        request.log.error({ err }, "rules_delete_failed");
        return reply.status(503).send({ error: "rules_unavailable" });
      }
    },
  );
}
