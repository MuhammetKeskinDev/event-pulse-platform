import type Redis from "ioredis";

import { EVENTS_STREAM } from "../../constants/streams";

export type QueueEnvelope = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
  source?: string;
  metadata?: unknown;
  received_at: string;
};

export async function enqueueEnvelope(
  redis: Redis,
  envelope: QueueEnvelope,
): Promise<void> {
  await redis.xadd(
    EVENTS_STREAM,
    "*",
    "envelope",
    JSON.stringify(envelope),
  );
}
