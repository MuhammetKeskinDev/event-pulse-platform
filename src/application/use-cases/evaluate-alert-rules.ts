import type { Logger } from "pino";

import { resolveSlackWebhookUrl } from "../../domain/notifications/resolve-slack-webhook";
import type { StreamEnvelope } from "../../domain/events/stream-envelope";
import { matchesEventMatchCondition } from "../../domain/rules/payload-match";
import type { CountThresholdCondition } from "../../domain/rules/rule-types";
import { parseRuleDefinition } from "../../domain/rules/rule-types";
import type { RuleCooldownTracker } from "../../domain/rules/cooldown-tracker";
import type {
  AlertRuleRepository,
  EventWindowCounter,
  RuleTriggeredPublisher,
  SlackOutbound,
} from "../ports/alert-rules";

export type EvaluateAlertRulesDeps = {
  rules: AlertRuleRepository;
  counter: EventWindowCounter;
  publisher: RuleTriggeredPublisher;
  slack: SlackOutbound;
  cooldown: RuleCooldownTracker;
};

async function countForThreshold(
  counter: EventWindowCounter,
  c: CountThresholdCondition,
): Promise<number> {
  return counter.countInWindow({
    windowMinutes: c.window_minutes,
    eventType:
      c.event_type === undefined
        ? null
        : c.event_type === null
          ? null
          : c.event_type,
    source:
      c.source === undefined ? null : c.source === null ? null : c.source,
    payloadMatch:
      c.payload_match && Object.keys(c.payload_match).length > 0
        ? c.payload_match
        : null,
  });
}

/**
 * PDF FR-04 / §3.2: evaluate stored rules after an event is persisted (windowed counts + per-event match).
 */
export async function evaluateAlertRulesUseCase(
  deps: EvaluateAlertRulesDeps,
  envelope: StreamEnvelope,
  log: Logger,
): Promise<void> {
  let rows: Awaited<ReturnType<AlertRuleRepository["loadEnabledRules"]>>;
  try {
    rows = await deps.rules.loadEnabledRules();
  } catch (err) {
    log.warn({ err }, "rule_engine_load_failed");
    return;
  }

  for (const rule of rows) {
    const def = parseRuleDefinition(rule.definition);
    if (!def?.condition) {
      continue;
    }
    const cooldownSec = def.cooldown_seconds ?? 60;
    if (deps.cooldown.inCooldown(rule.id, cooldownSec)) {
      continue;
    }

    let matched = false;
    let detail = "";

    if (def.condition.kind === "event_match") {
      matched = matchesEventMatchCondition(envelope, def.condition);
      detail = `event_match on ${envelope.event_type}`;
    } else if (def.condition.kind === "count_threshold") {
      const c = def.condition;
      const cnt = await countForThreshold(deps.counter, c);
      matched = cnt >= c.min_count;
      detail = `count_threshold ${cnt} >= ${c.min_count} (${c.window_minutes}m window)`;
    }

    if (!matched) {
      continue;
    }

    deps.cooldown.markTriggered(rule.id);
    const msg = `[EventPulse] Rule "${rule.name}" (${rule.id}) — ${detail} | event_id=${envelope.event_id}`;

    log.warn(
      { rule_id: rule.id, rule_name: rule.name, event_id: envelope.event_id },
      "alert_rule_triggered",
    );

    try {
      await deps.publisher.publish({
        type: "rule_triggered",
        rule_id: rule.id,
        rule_name: rule.name,
        severity: def.severity ?? "warning",
        event_id: envelope.event_id,
        event_type: envelope.event_type,
        message: msg,
      });
    } catch (err) {
      log.warn({ err }, "rule_trigger_ws_publish_failed");
    }

    const hook = resolveSlackWebhookUrl(rule.channel_hint);
    if (hook) {
      try {
        const res = await deps.slack.postJson(hook, { text: msg });
        if (!res.ok) {
          log.warn({ status: "non_ok" }, "slack_webhook_non_ok");
        }
      } catch (err) {
        log.warn({ err }, "slack_webhook_failed");
      }
    }
  }
}
