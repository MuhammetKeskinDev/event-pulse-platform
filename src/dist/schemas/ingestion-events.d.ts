import { z } from "zod";
export declare const pageViewEventSchema: z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    payload: z.ZodPipe<z.ZodObject<{
        session_id: z.ZodString;
        page_url: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        referrer: z.ZodOptional<z.ZodString>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodTransform<{
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    }, {
        session_id: string;
        page_url?: string | undefined;
        url?: string | undefined;
        referrer?: string | undefined;
        user_id?: string | undefined;
    }>>;
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>;
export declare const purchaseEventSchema: z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        order_id: string;
        amount: number;
        currency: string;
        line_items?: {
            product_id: string;
            quantity: number;
            unit_price: number;
        }[] | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        order_id: string;
        amount: number;
        currency: string;
        line_items?: {
            product_id: string;
            quantity: number;
            unit_price: number;
        }[] | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>;
export declare const errorEventSchema: z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        error_code: string;
        message: string;
        source_service: string;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        correlation_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        error_code: string;
        message: string;
        source_service: string;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        correlation_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>;
export declare const systemHealthEventSchema: z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        component: string;
        status: "ok" | "degraded" | "down";
        details?: string | undefined;
        metric_snapshot?: Record<string, number> | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        component: string;
        status: "ok" | "degraded" | "down";
        details?: string | undefined;
        metric_snapshot?: Record<string, number> | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>;
export declare const ingestionEventSchema: z.ZodDiscriminatedUnion<[z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    payload: z.ZodPipe<z.ZodObject<{
        session_id: z.ZodString;
        page_url: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        referrer: z.ZodOptional<z.ZodString>;
        user_id: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodTransform<{
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    }, {
        session_id: string;
        page_url?: string | undefined;
        url?: string | undefined;
        referrer?: string | undefined;
        user_id?: string | undefined;
    }>>;
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        page_url: string;
        session_id: string;
        referrer?: string | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>, z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        order_id: string;
        amount: number;
        currency: string;
        line_items?: {
            product_id: string;
            quantity: number;
            unit_price: number;
        }[] | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        order_id: string;
        amount: number;
        currency: string;
        line_items?: {
            product_id: string;
            quantity: number;
            unit_price: number;
        }[] | undefined;
        user_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>, z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        error_code: string;
        message: string;
        source_service: string;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        correlation_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        error_code: string;
        message: string;
        source_service: string;
        severity?: "low" | "medium" | "high" | "critical" | undefined;
        correlation_id?: string | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>, z.ZodPipe<z.ZodObject<{
    event_type: z.ZodLiteral<"error" | "page_view" | "purchase" | "system_health">;
    source: z.ZodString;
    event_id: z.ZodOptional<z.ZodUUID>;
    occurred_at: z.ZodOptional<z.ZodISODateTime>;
    timestamp: z.ZodOptional<z.ZodISODateTime>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
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
}, z.core.$strip>, z.ZodTransform<Omit<{
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        component: string;
        status: "ok" | "degraded" | "down";
        details?: string | undefined;
        metric_snapshot?: Record<string, number> | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, "timestamp"> & {
    occurred_at: string;
}, {
    event_type: "error" | "page_view" | "purchase" | "system_health";
    source: string;
    payload: {
        component: string;
        status: "ok" | "degraded" | "down";
        details?: string | undefined;
        metric_snapshot?: Record<string, number> | undefined;
    };
    event_id?: string | undefined;
    occurred_at?: string | undefined;
    timestamp?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>], "event_type">;
export type IngestionEvent = z.infer<typeof ingestionEventSchema>;
