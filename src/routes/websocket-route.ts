import type { FastifyInstance } from "fastify";

import { registerWebSocketClient } from "../realtime/ws-hub";

export function registerWebSocketRoute(app: FastifyInstance): void {
  app.get("/ws/events", { websocket: true }, (socket, req) => {
    registerWebSocketClient(socket);
    socket.on("error", (err) => {
      req.log.error({ err }, "ws_client_error");
    });
  });
}
