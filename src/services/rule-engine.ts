import type Redis from "ioredis";
import type pg from "pg";
import type { Logger } from "pino";

import { EVENTS_LIVE_CHANNEL } from "../constants/realtime";

export type StreamEnvelope = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
  source?: string;
  metadata?: unknown;
  received_at?: string;
};

type RuleRow = {
  id: string;
  name: string;
  definition: unknown;
  channel_hint: string | null;
};

type ConditionMatch = {
  kind: "event_match";
  event_types?: string[] | undefined;
  /** Shallow key paths (supports one dot). */
  payload_match?: Record<string, unknown> | undefined;
};

type ConditionCount = {
  kind: "count_threshold";
  window_minutes: number;
  min_count: number;
  event_type?: string | null | undefined;
};

type RuleDefinitionV1 = {
  condition?: ConditionMatch | ConditionCount;
  cooldown_seconds?: number;
  severity?: string;
};

const rulesCache: { rows: RuleRow[]; at: number } = { rows: [], at: 0 };
const RULES_TTL_MS = 30_000;
const lastTriggerEpochMs = new Map<string, number>();

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function getPayloadField(payload: unknown, key: string): unknown {
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

function payloadMatches(
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

function parseDefinition(raw: unknown): RuleDefinitionV1 | null {
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
    const cond: ConditionMatch = { kind: "event_match" };
    if (event_types !== undefined && event_types.length > 0) {
      cond.event_types = event_types;
    }
    if (payload_match !== null && Object.keys(payload_match).length > 0) {
      cond.payload_match = payload_match;
    }
    return {
      condition: cond,
      cooldown_seconds: typeof o.cooldown_seconds === "number" ? o.cooldown_seconds : 60,
      severity: typeof o.severity === "string" ? o.severity : "warning",
    };
  }
  if (c.kind === "count_threshold") {
    const wm = Number(c.window_minutes);
    const mc = Number(c.min_count);
    if (!Number.isFinite(wm) || wm <= 0 || !Number.isFinite(mc) || mc <= 0) {
      return null;
    }
    const cond: ConditionCount = {
      kind: "count_threshold",
      window_minutes: Math.min(24 * 60, Math.floor(wm)),
      min_count: Math.floor(mc),
    };
    if (typeof c.event_type === "string") {
      cond.event_type = c.event_type;
    } else if (c.event_type === null) {
      cond.event_type = null;
    }
    return {
      condition: cond,
      cooldown_seconds: typeof o.cooldown_seconds === "number" ? o.cooldown_seconds : 120,
      severity: typeof o.severity === "string" ? o.severity : "warning",
    };
  }
  return null;
}

async function loadRules(pool: pg.Pool): Promise<RuleRow[]> {
  const now = Date.now();
  if (rulesCache.at > 0 && now - rulesCache.at < RULES_TTL_MS) {
    return rulesCache.rows;
  }
  const r = await pool.query<RuleRow>(
    `
      SELECT id::text AS id, name, definition, channel_hint
      FROM alert_rules
      WHERE enabled = true
      ORDER BY created_at ASC
    `,
  );
  rulesCache.rows = r.rows;
  rulesCache.at = now;
  return r.rows;
}

function inCooldown(ruleId: string, cooldownSec: number): boolean {
  const prev = lastTriggerEpochMs.get(ruleId);
  if (prev === undefined) {
    return false;
  }
  return Date.now() - prev < cooldownSec * 1000;
}

async function countEventsWindow(
  pool: pg.Pool,
  windowMinutes: number,
  eventType: string | null | undefined,
): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM events
      WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 minute')
        AND ($2::text IS NULL OR event_type = $2)
    `,
    [windowMinutes, eventType ?? null],
  );
  const row = r.rows[0];
  if (!row) {
    return 0;
  }
  return Number.parseInt(row.c, 10) || 0;
}

function eventMatch(
  envelope: StreamEnvelope,
  cond: ConditionMatch,
): boolean {
  if (cond.event_types && cond.event_types.length > 0) {
    if (!cond.event_types.includes(envelope.event_type)) {
      return false;
    }
  }
  return payloadMatches(envelope.payload, cond.payload_match);
}

async function slackNotify(
  text: string,
  webhookUrl: string,
  log: Logger,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "slack_webhook_non_ok");
    }
  } catch (err) {
    log.warn({ err }, "slack_webhook_failed");
  }
}

function resolveWebhookUrl(channelHint: string | null): string | undefined {
  const env = process.env.SLACK_WEBHOOK_URL?.trim();
  if (env) {
    return env;
  }
  const hint = channelHint?.trim();
  if (hint?.startsWith("https://")) {
    return hint;
  }
  return undefined;
}

export async function evaluateAlertRules(
  pool: pg.Pool,
  redis: Redis,
  envelope: StreamEnvelope,
  log: Logger,
): Promise<void> {
  let rules: RuleRow[];
  try {
    rules = await loadRules(pool);
  } catch (err) {
    log.warn({ err }, "rule_engine_load_failed");
    return;
  }

  for (const rule of rules) {
    const def = parseDefinition(rule.definition);
    if (!def?.condition) {
      continue;
    }
    const cooldown = def.cooldown_seconds ?? 60;
    if (inCooldown(rule.id, cooldown)) {
      continue;
    }

    let matched = false;
    let detail = "";

    if (def.condition.kind === "event_match") {
      matched = eventMatch(envelope, def.condition);
      detail = `event_match on ${envelope.event_type}`;
    } else if (def.condition.kind === "count_threshold") {
      const c = def.condition;
      const cnt = await countEventsWindow(pool, c.window_minutes, c.event_type ?? null);
      matched = cnt >= c.min_count;
      detail = `count_threshold ${cnt} >= ${c.min_count} (${c.window_minutes}m)`;
    }

    if (!matched) {
      continue;
    }

    lastTriggerEpochMs.set(rule.id, Date.now());
    const msg = `[EventPulse] Rule "${rule.name}" (${rule.id}) — ${detail} | event_id=${envelope.event_id}`;

    log.warn(
      { rule_id: rule.id, rule_name: rule.name, event_id: envelope.event_id },
      "alert_rule_triggered",
    );

    try {
      await redis.publish(
        EVENTS_LIVE_CHANNEL,
        JSON.stringify({
          type: "rule_triggered",
          rule_id: rule.id,
          rule_name: rule.name,
          severity: def.severity ?? "warning",
          event_id: envelope.event_id,
          event_type: envelope.event_type,
          message: msg,
        }),
      );
    } catch (err) {
      log.warn({ err }, "rule_trigger_ws_publish_failed");
    }

    const hook = resolveWebhookUrl(rule.channel_hint);
    if (hook) {
      await slackNotify(msg, hook, log);
    }
  }
}
