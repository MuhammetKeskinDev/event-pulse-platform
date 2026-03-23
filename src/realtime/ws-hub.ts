import WebSocket from "ws";

const clients = new Set<WebSocket>();

export function registerWebSocketClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on("close", () => {
    clients.delete(ws);
  });
}

export function broadcastToWebSocketClients(message: string | Buffer): void {
  const payload =
    typeof message === "string" ? message : message.toString("utf8");
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) {
      clients.delete(ws);
      continue;
    }
    try {
      ws.send(payload);
    } catch {
      clients.delete(ws);
    }
  }
}
