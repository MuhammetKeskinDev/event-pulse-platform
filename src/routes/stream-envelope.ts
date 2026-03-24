import type { FastifyInstance } from "fastify";

import { EVENTS_STREAM } from "../constants/streams";

export async function enqueueEnvelope(
  app: FastifyInstance,
  envelope: {
    event_id: string;
    event_type: string;
    occurred_at: string;
    payload: unknown;
    source?: string;
    metadata?: unknown;
    received_at: string;
  },
): Promise<void> {
  await app.redis.xadd(
    EVENTS_STREAM,
    "*",
    "envelope",
    JSON.stringify(envelope),
  );
}
