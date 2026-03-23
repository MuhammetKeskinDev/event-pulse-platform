"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionEventSchema = exports.systemHealthEventSchema = exports.errorEventSchema = exports.purchaseEventSchema = exports.pageViewEventSchema = void 0;
const zod_1 = require("zod");
/**
 * Appendix A — Ingestion event şemaları (`docs/api.md` ile hizalı).
 * Ortak zarf: event_type, isteğe bağlı event_id, occurred_at (ISO-8601), türe özel payload.
 */
const occurredAtSchema = zod_1.z.iso.datetime();
const pageViewPayloadSchema = zod_1.z.object({
    session_id: zod_1.z.string().min(1),
    page_url: zod_1.z.string().url(),
    referrer: zod_1.z.string().url().optional(),
    user_id: zod_1.z.string().min(1).optional(),
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
exports.pageViewEventSchema = zod_1.z.object({
    event_type: zod_1.z.literal("page_view"),
    event_id: zod_1.z.uuid().optional(),
    occurred_at: occurredAtSchema,
    payload: pageViewPayloadSchema,
});
exports.purchaseEventSchema = zod_1.z.object({
    event_type: zod_1.z.literal("purchase"),
    event_id: zod_1.z.uuid().optional(),
    occurred_at: occurredAtSchema,
    payload: purchasePayloadSchema,
});
exports.errorEventSchema = zod_1.z.object({
    event_type: zod_1.z.literal("error"),
    event_id: zod_1.z.uuid().optional(),
    occurred_at: occurredAtSchema,
    payload: errorPayloadSchema,
});
exports.systemHealthEventSchema = zod_1.z.object({
    event_type: zod_1.z.literal("system_health"),
    event_id: zod_1.z.uuid().optional(),
    occurred_at: occurredAtSchema,
    payload: systemHealthPayloadSchema,
});
exports.ingestionEventSchema = zod_1.z.discriminatedUnion("event_type", [
    exports.pageViewEventSchema,
    exports.purchaseEventSchema,
    exports.errorEventSchema,
    exports.systemHealthEventSchema,
]);
//# sourceMappingURL=ingestion-events.js.map