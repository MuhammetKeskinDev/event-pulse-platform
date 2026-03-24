import type { FastifyInstance } from "fastify";

import { registerAnomaliesRoutes } from "./anomalies-route";
import { registerEventsRoutes } from "./events-routes";
import { registerHealthRoutes } from "./health";
import { registerIngestionRoutes } from "./ingestion-routes";
import { registerMetricsRoutes } from "./metrics-routes";
import { registerRootRoute } from "./root";
import { registerRulesRoutes } from "./rules-routes";
import { registerWebSocketRoute } from "./websocket-route";

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
