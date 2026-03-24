import type { FastifyInstance } from "fastify";

import {
  denseThroughputBuckets,
  errorRatePercent,
  METRICS_CACHE_MAX_AGE_SEC,
  parseIsoOr,
  toBigIntString,
} from "../../../lib/metrics-helpers";
import { singleQueryParam } from "../../../lib/query-params";

export function registerMetricsRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/metrics",
    {
      schema: {
        tags: ["metrics"],
        summary:
          "Aggregated metrics; optional from/to (ISO-8601), event_type filter",
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", description: "ISO-8601 window start" },
            to: { type: "string", description: "ISO-8601 window end" },
            event_type: { type: "string" },
            source: { type: "string", description: "Originating system filter" },
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
      void reply.header(
        "Cache-Control",
        `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`,
      );

      const q = request.query as Record<
        string,
        string | string[] | undefined
      >;
      const fromQ = singleQueryParam(q.from);
      const toQ = singleQueryParam(q.to);
      const now = new Date();
      const hasCustom =
        (fromQ !== undefined && fromQ.length > 0) ||
        (toQ !== undefined && toQ.length > 0);
      let windowEnd = parseIsoOr(toQ, now);
      let windowStart = hasCustom
        ? parseIsoOr(fromQ, new Date(windowEnd.getTime() - 60 * 60 * 1000))
        : new Date(windowEnd.getTime() - 60 * 60 * 1000);
      if (!hasCustom) {
        windowEnd = now;
        windowStart = new Date(windowEnd.getTime() - 60 * 60 * 1000);
      }
      if (windowStart >= windowEnd) {
        return reply.status(400).send({ error: "invalid_time_range" });
      }

      const etRaw = singleQueryParam(q.event_type);
      const eventTypeFilter =
        etRaw !== undefined && etRaw.length > 0 ? etRaw : null;
      const srcRaw = singleQueryParam(q.source);
      const sourceFilter =
        srcRaw !== undefined && srcRaw.length > 0 ? srcRaw : null;

      try {
        const distParams: unknown[] = [
          windowStart,
          windowEnd,
          eventTypeFilter,
          sourceFilter,
        ];
        const distSql = `
            SELECT event_type, COUNT(*)::bigint AS count
            FROM events
            WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
              AND ($3::text IS NULL OR event_type = $3)
              AND ($4::text IS NULL OR source = $4)
            GROUP BY event_type
            ORDER BY count DESC
          `;

        const allParams: unknown[] = [];
        let allSql: string;
        if (hasCustom) {
          allParams.push(
            windowStart,
            windowEnd,
            eventTypeFilter,
            sourceFilter,
          );
          allSql = `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE event_type = 'error')::bigint AS errors
            FROM events
            WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
              AND ($3::text IS NULL OR event_type = $3)
              AND ($4::text IS NULL OR source = $4)
          `;
        } else {
          allParams.push(eventTypeFilter, sourceFilter);
          allSql = `
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE event_type = 'error')::bigint AS errors
            FROM events
            WHERE ($1::text IS NULL OR event_type = $1)
              AND ($2::text IS NULL OR source = $2)
          `;
        }

        const [distResult, allTimeResult] = await Promise.all([
          app.pg.query<{
            event_type: string;
            count: string | number | bigint;
          }>(distSql, distParams),
          app.pg.query<{
            total: string | number | bigint;
            errors: string | number | bigint;
          }>(allSql, allParams),
        ]);

        const byEventType = distResult.rows.map((row) => ({
          event_type: row.event_type,
          count: Number(toBigIntString(row.count)),
        }));

        let lastHourTotal = 0n;
        let lastHourErrors = 0n;
        for (const row of distResult.rows) {
          const c = toBigIntString(row.count);
          lastHourTotal += c;
          if (row.event_type === "error") {
            lastHourErrors += c;
          }
        }

        const allRow = allTimeResult.rows[0];
        const allTotal = allRow ? toBigIntString(allRow.total) : 0n;
        const allErrors = allRow ? toBigIntString(allRow.errors) : 0n;

        request.log.debug(
          { lastHourTotal: String(lastHourTotal) },
          "metrics_served",
        );

        /** PDF §3.5 — percentiles alanı; gerçek APM bağlanana kadar tasarım hedefiyle uyumlu stub. */
        const latencyStub = {
          p95_ms: 165,
          p99_ms: 210,
          scope: "ingestion_api_response",
          source: "design_stub_until_apm",
        };

        return reply.send({
          refreshed_at: now.toISOString(),
          suggested_poll_interval_seconds: METRICS_CACHE_MAX_AGE_SEC,
          window: {
            label: hasCustom ? "custom" : "last_1_hour",
            start: windowStart.toISOString(),
            end: windowEnd.toISOString(),
          },
          last_hour: {
            by_event_type: byEventType,
            total_events: Number(lastHourTotal),
            error_events: Number(lastHourErrors),
            error_rate_percent: errorRatePercent(lastHourErrors, lastHourTotal),
          },
          all_time: {
            total_events: Number(allTotal),
            error_events: Number(allErrors),
            error_rate_percent: errorRatePercent(allErrors, allTotal),
          },
          latency_ms_percentiles: latencyStub,
        });
      } catch (err) {
        request.log.error({ err }, "metrics_query_failed");
        return reply.status(503).send({ error: "metrics_unavailable" });
      }
    },
  );

  app.get(
    "/api/v1/metrics/throughput",
    {
      schema: {
        tags: ["metrics"],
        summary: "Throughput buckets by event_type",
        querystring: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "ISO-8601 (metrics ile aynı pencere)",
            },
            to: { type: "string", description: "ISO-8601" },
            windowMinutes: { type: "string" },
            bucketMinutes: { type: "string" },
            event_type: { type: "string" },
            source: { type: "string" },
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
      void reply.header(
        "Cache-Control",
        `public, max-age=${METRICS_CACHE_MAX_AGE_SEC}`,
      );
      const q = request.query as Record<
        string,
        string | string[] | undefined
      >;
      const windowMin = Math.min(
        24 * 60,
        Math.max(
          15,
          Number.parseInt(singleQueryParam(q.windowMinutes) ?? "60", 10) ||
            60,
        ),
      );
      const bucketMin = Math.min(
        60,
        Math.max(
          1,
          Number.parseInt(singleQueryParam(q.bucketMinutes) ?? "5", 10) || 5,
        ),
      );
      const etRaw = singleQueryParam(q.event_type);
      const et = etRaw !== undefined && etRaw.length > 0 ? etRaw : null;
      const srcRaw = singleQueryParam(q.source);
      const src = srcRaw !== undefined && srcRaw.length > 0 ? srcRaw : null;

      const bucketWidthSec = bucketMin * 60;
      const now = new Date();
      const fromQ = singleQueryParam(q.from);
      const toQ = singleQueryParam(q.to);
      const hasBounds =
        fromQ !== undefined &&
        fromQ.length > 0 &&
        toQ !== undefined &&
        toQ.length > 0;
      let windowEnd = parseIsoOr(toQ, now);
      let windowStart = hasBounds
        ? parseIsoOr(fromQ, new Date(windowEnd.getTime() - windowMin * 60_000))
        : new Date(windowEnd.getTime() - windowMin * 60_000);
      if (!hasBounds) {
        windowEnd = now;
        windowStart = new Date(windowEnd.getTime() - windowMin * 60_000);
      }
      if (windowStart >= windowEnd) {
        return reply.status(400).send({ error: "invalid_time_range" });
      }
      const windowStartSec = Math.floor(windowStart.getTime() / 1000);
      const windowEndSec = Math.floor(windowEnd.getTime() / 1000);

      try {
        const rows = hasBounds
          ? await app.pg.query<{
              bucket_epoch: string;
              event_type: string;
              c: string;
            }>(
              `
          SELECT
            ((floor(EXTRACT(EPOCH FROM occurred_at))::bigint / $5::bigint) * $5::bigint)::text AS bucket_epoch,
            event_type,
            COUNT(*)::text AS c
          FROM events
          WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
            AND ($3::text IS NULL OR event_type = $3)
            AND ($4::text IS NULL OR source = $4)
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
              [windowStart, windowEnd, et, src, bucketWidthSec],
            )
          : await app.pg.query<{
              bucket_epoch: string;
              event_type: string;
              c: string;
            }>(
              `
          SELECT
            ((floor(EXTRACT(EPOCH FROM occurred_at))::bigint / $4::bigint) * $4::bigint)::text AS bucket_epoch,
            event_type,
            COUNT(*)::text AS c
          FROM events
          WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 minute')
            AND ($2::text IS NULL OR event_type = $2)
            AND ($3::text IS NULL OR source = $3)
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
              [windowMin, et, src, bucketWidthSec],
            );

        const bucketMap = new Map<number, { counts: Record<string, number> }>();

        for (const row of rows.rows) {
          const aligned = Number.parseInt(row.bucket_epoch, 10);
          if (!Number.isFinite(aligned)) {
            continue;
          }
          let b = bucketMap.get(aligned);
          if (!b) {
            b = { counts: {} };
            bucketMap.set(aligned, b);
          }
          b.counts[row.event_type] = Number(row.c);
        }

        const buckets = denseThroughputBuckets(
          bucketMap,
          windowStartSec,
          windowEndSec,
          bucketWidthSec,
          et,
        );

        const windowMinutesReported = Math.max(
          1,
          Math.round((windowEnd.getTime() - windowStart.getTime()) / 60_000),
        );

        return reply.send({
          window_minutes: windowMinutesReported,
          bucket_minutes: bucketMin,
          event_type_filter: et,
          source_filter: src,
          buckets,
        });
      } catch (err) {
        request.log.error({ err }, "throughput_series_failed");
        return reply.status(503).send({ error: "throughput_unavailable" });
      }
    },
  );
}
