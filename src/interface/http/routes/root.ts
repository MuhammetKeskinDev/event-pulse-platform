import type { FastifyInstance } from "fastify";

import { SWAGGER_ROUTE_PREFIX } from "../../../constants/swagger-route";

export function registerRootRoute(app: FastifyInstance): void {
  app.get(
    "/",
    {
      schema: {
        tags: ["default"],
        summary: "Service index and endpoint map",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (_request, reply) => {
      return reply.send({
        service: "eventpulse-ingestion-api",
        openapi: SWAGGER_ROUTE_PREFIX,
        endpoints: {
          ingest_single: { method: "POST", path: "/api/v1/events" },
          ingest_batch: { method: "POST", path: "/api/v1/events/batch" },
          pipeline_health: { method: "GET", path: "/api/v1/events/health" },
          metrics: { method: "GET", path: "/api/v1/metrics" },
          metrics_throughput: {
            method: "GET",
            path: "/api/v1/metrics/throughput",
          },
          events_query: { method: "GET", path: "/api/v1/events" },
          events_export: {
            method: "GET",
            path: "/api/v1/events/export",
          },
          event_by_id: { method: "GET", path: "/api/v1/events/:id" },
          anomalies: { method: "GET", path: "/api/v1/anomalies" },
          rules: { method: "GET,POST", path: "/api/v1/rules" },
          events_stream: {
            protocol: "WebSocket",
            path: "/ws/events",
          },
        },
      });
    },
  );
}
