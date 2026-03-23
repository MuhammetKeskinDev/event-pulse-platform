import { z } from "zod";

/**
 * PDF Appendix A: source (required), timestamp | occurred_at, optional metadata.
 */

const occurredAtSchema = z.iso.datetime();

const pageViewPayloadSchema = z
  .object({
    session_id: z.string().min(1),
    page_url: z.string().url().optional(),
    url: z.string().min(1).optional(),
    referrer: z.string().url().optional(),
    user_id: z.string().min(1).optional(),
  })
  .refine((p) => Boolean(p.page_url || p.url), {
    message: "Provide page_url or url (PDF Appendix A)",
    path: ["page_url"],
  })
  .transform((p) => {
    const page_url =
      p.page_url ?? new URL(p.url!, "https://canonical.eventpulse.local").href;
    const { url: _drop, ...rest } = p;
    return { ...rest, page_url };
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

function withPdfEnvelope<P extends z.ZodTypeAny>(
  eventType: "page_view" | "purchase" | "error" | "system_health",
  payloadSchema: P,
) {
  return z
    .object({
      event_type: z.literal(eventType),
      source: z.string().min(1),
      event_id: z.uuid().optional(),
      occurred_at: occurredAtSchema.optional(),
      timestamp: occurredAtSchema.optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      payload: payloadSchema,
    })
    .refine((d) => d.occurred_at !== undefined || d.timestamp !== undefined, {
      message: "Provide occurred_at or timestamp (ISO-8601, PDF Appendix A)",
      path: ["timestamp"],
    })
    .transform((d) => {
      const occurred_at = d.occurred_at ?? d.timestamp!;
      const { timestamp: _ts, ...rest } = d;
      return { ...rest, occurred_at };
    });
}

export const pageViewEventSchema = withPdfEnvelope("page_view", pageViewPayloadSchema);
export const purchaseEventSchema = withPdfEnvelope("purchase", purchasePayloadSchema);
export const errorEventSchema = withPdfEnvelope("error", errorPayloadSchema);
export const systemHealthEventSchema = withPdfEnvelope(
  "system_health",
  systemHealthPayloadSchema,
);

export const ingestionEventSchema = z.discriminatedUnion("event_type", [
  pageViewEventSchema,
  purchaseEventSchema,
  errorEventSchema,
  systemHealthEventSchema,
]);

export type IngestionEvent = z.infer<typeof ingestionEventSchema>;
