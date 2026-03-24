import type { FastifyInstance } from "fastify";

import { registerAnomaliesRoutes } from "./routes/anomalies-route";
import { registerEventsRoutes } from "./routes/events-routes";
import { registerHealthRoutes } from "./routes/health";
import { registerIngestionRoutes } from "./routes/ingestion-routes";
import { registerMetricsRoutes } from "./routes/metrics-routes";
import { registerRootRoute } from "./routes/root";
import { registerRulesRoutes } from "./routes/rules-routes";
import { registerWebSocketRoute } from "./routes/websocket-route";

/** Tüm HTTP/WS route’ları; PDF’deki uç noktalar ve davranış aynı kalır. */
export function registerAllRoutes(app: FastifyInstance): void {
  registerWebSocketRoute(app);
  registerRootRoute(app);
  registerHealthRoutes(app);
  registerMetricsRoutes(app);
  registerAnomaliesRoutes(app);
  registerEventsRoutes(app);
  registerRulesRoutes(app);
  registerIngestionRoutes(app);
}
