"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionEventSchema = exports.systemHealthEventSchema = exports.errorEventSchema = exports.purchaseEventSchema = exports.pageViewEventSchema = void 0;
const zod_1 = require("zod");
/**
 * PDF Appendix A: source (required), timestamp | occurred_at, optional metadata.
 */
const occurredAtSchema = zod_1.z.iso.datetime();
const pageViewPayloadSchema = zod_1.z
    .object({
    session_id: zod_1.z.string().min(1),
    page_url: zod_1.z.string().url().optional(),
    url: zod_1.z.string().min(1).optional(),
    referrer: zod_1.z.string().url().optional(),
    user_id: zod_1.z.string().min(1).optional(),
})
    .refine((p) => Boolean(p.page_url || p.url), {
    message: "Provide page_url or url (PDF Appendix A)",
    path: ["page_url"],
})
    .transform((p) => {
    const page_url = p.page_url ?? new URL(p.url, "https://canonical.eventpulse.local").href;
    const { url: _drop, ...rest } = p;
    return { ...rest, page_url };
});
const purchasePayloadSchema = zod_1.z.object({
    order_id: zod_1.z.string().min(1),
    amount: zod_1.z.number().finite().positive(),
    currency: zod_1.z.string().length(3).toUpperCase(),
    line_items: zod_1.z
        .array(zod_1.z.object({
        product_id: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
        unit_price: zod_1.z.number().finite().nonnegative(),
    }))
        .optional(),
    user_id: zod_1.z.string().min(1).optional(),
});
const errorPayloadSchema = zod_1.z.object({
    error_code: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
    severity: zod_1.z.enum(["low", "medium", "high", "critical"]).optional(),
    source_service: zod_1.z.string().min(1),
    correlation_id: zod_1.z.string().min(1).optional(),
});
const systemHealthPayloadSchema = zod_1.z.object({
    component: zod_1.z.string().min(1),
    status: zod_1.z.enum(["ok", "degraded", "down"]),
    details: zod_1.z.string().optional(),
    metric_snapshot: zod_1.z.record(zod_1.z.string(), zod_1.z.number().finite()).optional(),
});
function withPdfEnvelope(eventType, payloadSchema) {
    return zod_1.z
        .object({
        event_type: zod_1.z.literal(eventType),
        source: zod_1.z.string().min(1),
        event_id: zod_1.z.uuid().optional(),
        occurred_at: occurredAtSchema.optional(),
        timestamp: occurredAtSchema.optional(),
        metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        payload: payloadSchema,
    })
        .refine((d) => d.occurred_at !== undefined || d.timestamp !== undefined, {
        message: "Provide occurred_at or timestamp (ISO-8601, PDF Appendix A)",
        path: ["timestamp"],
    })
        .transform((d) => {
        const occurred_at = d.occurred_at ?? d.timestamp;
        const { timestamp: _ts, ...rest } = d;
        return { ...rest, occurred_at };
    });
}
exports.pageViewEventSchema = withPdfEnvelope("page_view", pageViewPayloadSchema);
exports.purchaseEventSchema = withPdfEnvelope("purchase", purchasePayloadSchema);
exports.errorEventSchema = withPdfEnvelope("error", errorPayloadSchema);
exports.systemHealthEventSchema = withPdfEnvelope("system_health", systemHealthPayloadSchema);
exports.ingestionEventSchema = zod_1.z.discriminatedUnion("event_type", [
    exports.pageViewEventSchema,
    exports.purchaseEventSchema,
    exports.errorEventSchema,
    exports.systemHealthEventSchema,
]);
//# sourceMappingURL=ingestion-events.js.map