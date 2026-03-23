import { z } from "zod";

/**
 * Appendix A — Ingestion event şemaları (`docs/api.md` ile hizalı).
 * Ortak zarf: event_type, isteğe bağlı event_id, occurred_at (ISO-8601), türe özel payload.
 */

const occurredAtSchema = z.iso.datetime();

const pageViewPayloadSchema = z.object({
  session_id: z.string().min(1),
  page_url: z.string().url(),
  referrer: z.string().url().optional(),
  user_id: z.string().min(1).optional(),
});

const purchasePayloadSchema = z.object({
  order_id: z.string().min(1),
  amount: z.number().finite().positive(),
  currency: z.string().length(3).toUpperCase(),
  line_items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity: z.number().int().positive(),
        unit_price: z.number().finite().nonnegative(),
      }),
    )
    .optional(),
  user_id: z.string().min(1).optional(),
});

const errorPayloadSchema = z.object({
  error_code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  source_service: z.string().min(1),
  correlation_id: z.string().min(1).optional(),
});

const systemHealthPayloadSchema = z.object({
  component: z.string().min(1),
  status: z.enum(["ok", "degraded", "down"]),
  details: z.string().optional(),
  metric_snapshot: z.record(z.string(), z.number().finite()).optional(),
});

export const pageViewEventSchema = z.object({
  event_type: z.literal("page_view"),
  event_id: z.uuid().optional(),
  occurred_at: occurredAtSchema,
  payload: pageViewPayloadSchema,
});

export const purchaseEventSchema = z.object({
  event_type: z.literal("purchase"),
  event_id: z.uuid().optional(),
  occurred_at: occurredAtSchema,
  payload: purchasePayloadSchema,
});

export const errorEventSchema = z.object({
  event_type: z.literal("error"),
  event_id: z.uuid().optional(),
  occurred_at: occurredAtSchema,
  payload: errorPayloadSchema,
});

export const systemHealthEventSchema = z.object({
  event_type: z.literal("system_health"),
  event_id: z.uuid().optional(),
  occurred_at: occurredAtSchema,
  payload: systemHealthPayloadSchema,
});

export const ingestionEventSchema = z.discriminatedUnion("event_type", [
  pageViewEventSchema,
  purchaseEventSchema,
  errorEventSchema,
  systemHealthEventSchema,
]);

export type IngestionEvent = z.infer<typeof ingestionEventSchema>;
