export function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function getPayloadField(payload: unknown, key: string): unknown {
  const o = asRecord(payload);
  if (!o) {
    return undefined;
  }
  if (key.includes(".")) {
    const [a, b] = key.split(".", 2);
    if (a === undefined || b === undefined) {
      return undefined;
    }
    const mid = o[a];
    const inner = asRecord(mid);
    return inner ? inner[b] : undefined;
  }
  return o[key];
}

export function payloadMatches(
  payload: unknown,
  match: Record<string, unknown> | undefined,
): boolean {
  if (!match || Object.keys(match).length === 0) {
    return true;
  }
  for (const [k, expected] of Object.entries(match)) {
    const actual = getPayloadField(payload, k);
    if (actual !== expected) {
      return false;
    }
  }
  return true;
}

export type EventMatchCondition = {
  kind: "event_match";
  event_types?: string[] | undefined;
  payload_match?: Record<string, unknown> | undefined;
};

export function matchesEventMatchCondition(
  envelope: { event_type: string; payload: unknown },
  cond: EventMatchCondition,
): boolean {
  if (cond.event_types && cond.event_types.length > 0) {
    if (!cond.event_types.includes(envelope.event_type)) {
      return false;
    }
  }
  return payloadMatches(envelope.payload, cond.payload_match);
}
