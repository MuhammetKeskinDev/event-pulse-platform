import { asRecord } from "./payload-match";
import type { EventMatchCondition } from "./payload-match";

export type CountThresholdCondition = {
  kind: "count_threshold";
  /** PDF §3.2 sliding window (minutes), e.g. 5 for “last 5 minutes”. */
  window_minutes: number;
  min_count: number;
  event_type?: string | null | undefined;
  /** Optional: only events from this source (e.g. payment_service). */
  source?: string | null | undefined;
  /** Optional: JSONB containment on `payload` (e.g. { "severity": "critical" }). */
  payload_match?: Record<string, unknown> | undefined;
};

export type RuleCondition = EventMatchCondition | CountThresholdCondition;

export type ParsedRuleDefinition = {
  condition: RuleCondition;
  cooldown_seconds: number;
  severity: string;
};

export function parseRuleDefinition(raw: unknown): ParsedRuleDefinition | null {
  const o = asRecord(raw);
  if (!o) {
    return null;
  }
  const cond = o.condition;
  const c = asRecord(cond);
  if (!c || typeof c.kind !== "string") {
    return null;
  }
  if (c.kind === "event_match") {
    const event_types = Array.isArray(c.event_types)
      ? c.event_types.filter((x): x is string => typeof x === "string")
      : undefined;
    const payload_match = asRecord(c.payload_match);
    const condition: EventMatchCondition = { kind: "event_match" };
    if (event_types !== undefined && event_types.length > 0) {
      condition.event_types = event_types;
    }
    if (payload_match !== null && Object.keys(payload_match).length > 0) {
      condition.payload_match = payload_match;
    }
    return {
      condition,
      cooldown_seconds:
        typeof o.cooldown_seconds === "number" ? o.cooldown_seconds : 60,
      severity: typeof o.severity === "string" ? o.severity : "warning",
    };
  }
  if (c.kind === "count_threshold") {
    const wm = Number(c.window_minutes);
    const mc = Number(c.min_count);
    if (!Number.isFinite(wm) || wm <= 0 || !Number.isFinite(mc) || mc <= 0) {
      return null;
    }
    const condition: CountThresholdCondition = {
      kind: "count_threshold",
      window_minutes: Math.min(24 * 60, Math.floor(wm)),
      min_count: Math.floor(mc),
    };
    if (typeof c.event_type === "string") {
      condition.event_type = c.event_type;
    } else if (c.event_type === null) {
      condition.event_type = null;
    }
    if (typeof c.source === "string" && c.source.length > 0) {
      condition.source = c.source;
    } else if (c.source === null) {
      condition.source = null;
    }
    const pm = asRecord(c.payload_match);
    if (pm !== null && Object.keys(pm).length > 0) {
      condition.payload_match = pm;
    }
    return {
      condition,
      cooldown_seconds:
        typeof o.cooldown_seconds === "number" ? o.cooldown_seconds : 120,
      severity: typeof o.severity === "string" ? o.severity : "warning",
    };
  }
  return null;
}
