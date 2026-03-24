/** Normalized event envelope after ingestion validation (queue + worker). */
export type StreamEnvelope = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
  source?: string;
  metadata?: unknown;
  received_at?: string;
};
