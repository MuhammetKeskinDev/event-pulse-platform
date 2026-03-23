import { z } from "zod";
export declare const pageViewEventSchema: z.ZodObject<{
    event_type: z.ZodLiteral<"page_view">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        session_id: z.ZodString;
        page_url: z.ZodString;
        referrer: z.ZodOptional<z.ZodString>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const purchaseEventSchema: z.ZodObject<{
    event_type: z.ZodLiteral<"purchase">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        order_id: z.ZodString;
        amount: z.ZodNumber;
        currency: z.ZodString;
        line_items: z.ZodOptional<z.ZodArray<z.ZodObject<{
            product_id: z.ZodString;
            quantity: z.ZodNumber;
            unit_price: z.ZodNumber;
        }, z.core.$strip>>>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const errorEventSchema: z.ZodObject<{
    event_type: z.ZodLiteral<"error">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        error_code: z.ZodString;
        message: z.ZodString;
        severity: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        source_service: z.ZodString;
        correlation_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const systemHealthEventSchema: z.ZodObject<{
    event_type: z.ZodLiteral<"system_health">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        component: z.ZodString;
        status: z.ZodEnum<{
            ok: "ok";
            degraded: "degraded";
            down: "down";
        }>;
        details: z.ZodOptional<z.ZodString>;
        metric_snapshot: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ingestionEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    event_type: z.ZodLiteral<"page_view">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        session_id: z.ZodString;
        page_url: z.ZodString;
        referrer: z.ZodOptional<z.ZodString>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    event_type: z.ZodLiteral<"purchase">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        order_id: z.ZodString;
        amount: z.ZodNumber;
        currency: z.ZodString;
        line_items: z.ZodOptional<z.ZodArray<z.ZodObject<{
            product_id: z.ZodString;
            quantity: z.ZodNumber;
            unit_price: z.ZodNumber;
        }, z.core.$strip>>>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    event_type: z.ZodLiteral<"error">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        error_code: z.ZodString;
        message: z.ZodString;
        severity: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        source_service: z.ZodString;
        correlation_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    event_type: z.ZodLiteral<"system_health">;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodISODateTime;
    payload: z.ZodObject<{
        component: z.ZodString;
        status: z.ZodEnum<{
            ok: "ok";
            degraded: "degraded";
            down: "down";
        }>;
        details: z.ZodOptional<z.ZodString>;
        metric_snapshot: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>;
}, z.core.$strip>], "event_type">;
export type IngestionEvent = z.infer<typeof ingestionEventSchema>;
