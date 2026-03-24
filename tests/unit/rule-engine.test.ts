import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateAlertRulesUseCase } from "@src/application/use-cases/evaluate-alert-rules";
import type {
  AlertRuleRepository,
  AlertRuleRow,
  EventWindowCounter,
  RuleTriggeredPublisher,
  SlackOutbound,
} from "@src/application/ports/alert-rules";
import { resolveSlackWebhookUrl } from "@src/domain/notifications/resolve-slack-webhook";
import { matchesEventMatchCondition } from "@src/domain/rules/payload-match";
import { parseRuleDefinition } from "@src/domain/rules/rule-types";
import { RuleCooldownTracker } from "@src/domain/rules/cooldown-tracker";
import type { StreamEnvelope } from "@src/domain/events/stream-envelope";

const envelope: StreamEnvelope = {
  event_id: "550e8400-e29b-41d4-a716-446655440001",
  event_type: "error",
  occurred_at: "2026-03-23T12:00:00.000Z",
  payload: { severity: "critical", error_code: "E1", message: "x", source_service: "s" },
  source: "payment_service",
};

describe("parseRuleDefinition", () => {
  it("null veya geçersiz döner", () => {
    expect(parseRuleDefinition(null)).toBeNull();
    expect(parseRuleDefinition("x")).toBeNull();
    expect(parseRuleDefinition({})).toBeNull();
    expect(parseRuleDefinition({ condition: {} })).toBeNull();
  });

  it("event_match ayrıştırır", () => {
    const d = parseRuleDefinition({
      condition: {
        kind: "event_match",
        event_types: ["error"],
        payload_match: { severity: "critical" },
      },
      cooldown_seconds: 30,
      severity: "critical",
    });
    expect(d?.condition.kind).toBe("event_match");
    if (d?.condition.kind === "event_match") {
      expect(d.condition.event_types).toEqual(["error"]);
      expect(d.condition.payload_match).toEqual({ severity: "critical" });
    }
    expect(d?.cooldown_seconds).toBe(30);
    expect(d?.severity).toBe("critical");
  });

  it("count_threshold: window, source ve payload_match (PDF §3.2)", () => {
    const d = parseRuleDefinition({
      condition: {
        kind: "count_threshold",
        window_minutes: 5,
        min_count: 10,
        event_type: "error",
        source: "payment_service",
        payload_match: { severity: "critical" },
      },
    });
    expect(d?.condition.kind).toBe("count_threshold");
    if (d?.condition.kind === "count_threshold") {
      expect(d.condition.window_minutes).toBe(5);
      expect(d.condition.min_count).toBe(10);
      expect(d.condition.event_type).toBe("error");
      expect(d.condition.source).toBe("payment_service");
      expect(d.condition.payload_match).toEqual({ severity: "critical" });
    }
  });

  it("count_threshold geçersiz pencere veya eşik reddedilir", () => {
    expect(
      parseRuleDefinition({
        condition: { kind: "count_threshold", window_minutes: 0, min_count: 1 },
      }),
    ).toBeNull();
    expect(
      parseRuleDefinition({
        condition: { kind: "count_threshold", window_minutes: 5, min_count: 0 },
      }),
    ).toBeNull();
  });
});

describe("matchesEventMatchCondition", () => {
  it("event_types ve payload eşleşmesi", () => {
    const cond = {
      kind: "event_match" as const,
      event_types: ["error"],
      payload_match: { severity: "critical" },
    };
    expect(matchesEventMatchCondition(envelope, cond)).toBe(true);
    expect(
      matchesEventMatchCondition({ ...envelope, event_type: "page_view" }, cond),
    ).toBe(false);
  });
});

describe("resolveSlackWebhookUrl", () => {
  afterEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("önce ortam değişkenini kullanır", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/abc";
    expect(resolveSlackWebhookUrl("https://ignored")).toBe(
      "https://hooks.slack.com/services/abc",
    );
  });

  it("channel_hint https ise kullanır", () => {
    expect(resolveSlackWebhookUrl("https://hooks.example/h")).toBe(
      "https://hooks.example/h",
    );
  });
});

describe("evaluateAlertRulesUseCase", () => {
  let cooldown: RuleCooldownTracker;
  const log = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    cooldown = new RuleCooldownTracker();
  });

  it("count_threshold tetiklenince publish ve slack çağrılır", async () => {
    const rule: AlertRuleRow = {
      id: "r1",
      name: "errors>10/5m",
      definition: {
        condition: {
          kind: "count_threshold",
          window_minutes: 5,
          min_count: 10,
          event_type: "error",
        },
      },
      channel_hint: null,
    };
    const rules: AlertRuleRepository = {
      loadEnabledRules: async () => [rule],
    };
    const counter: EventWindowCounter = {
      countInWindow: async () => 11,
    };
    const publish = vi.fn(async () => {});
    const publisher: RuleTriggeredPublisher = { publish };
    const postJson = vi.fn(async () => ({ ok: true }));
    const slack: SlackOutbound = { postJson };

    await evaluateAlertRulesUseCase(
      { rules, counter, publisher, slack, cooldown },
      envelope,
      log as never,
    );

    expect(publish).toHaveBeenCalledTimes(1);
    const payload = publish.mock.calls[0]![0] as { type: string; rule_id: string };
    expect(payload.type).toBe("rule_triggered");
    expect(payload.rule_id).toBe("r1");
    expect(postJson).not.toHaveBeenCalled();
  });

  it("cooldown ikinci tetiklemeyi engeller", async () => {
    const rule: AlertRuleRow = {
      id: "r-cool",
      name: "x",
      definition: {
        condition: {
          kind: "count_threshold",
          window_minutes: 5,
          min_count: 1,
          event_type: null,
        },
        cooldown_seconds: 3600,
      },
      channel_hint: null,
    };
    const rules: AlertRuleRepository = {
      loadEnabledRules: async () => [rule],
    };
    const counter: EventWindowCounter = {
      countInWindow: async () => 5,
    };
    const publish = vi.fn(async () => {});
    const slack: SlackOutbound = {
      postJson: vi.fn(async () => ({ ok: true })),
    };

    await evaluateAlertRulesUseCase(
      { rules, counter, publisher: { publish }, slack, cooldown },
      envelope,
      log as never,
    );
    await evaluateAlertRulesUseCase(
      { rules, counter, publisher: { publish }, slack, cooldown },
      envelope,
      log as never,
    );

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("eşik altında publish yok", async () => {
    const rule: AlertRuleRow = {
      id: "r-low",
      name: "x",
      definition: {
        condition: {
          kind: "count_threshold",
          window_minutes: 5,
          min_count: 100,
          event_type: "error",
        },
      },
      channel_hint: null,
    };
    const publish = vi.fn(async () => {});
    await evaluateAlertRulesUseCase(
      {
        rules: { loadEnabledRules: async () => [rule] },
        counter: { countInWindow: async () => 3 },
        publisher: { publish },
        slack: { postJson: vi.fn(async () => ({ ok: true })) },
        cooldown,
      },
      envelope,
      log as never,
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it("channel_hint slack URL ise postJson çağrılır", async () => {
    const rule: AlertRuleRow = {
      id: "r-s",
      name: "slack",
      definition: {
        condition: { kind: "event_match", event_types: ["error"] },
      },
      channel_hint: "https://hooks.slack.com/services/TEST/TEST/TEST",
    };
    const postJson = vi.fn(async () => ({ ok: true }));
    await evaluateAlertRulesUseCase(
      {
        rules: { loadEnabledRules: async () => [rule] },
        counter: { countInWindow: async () => 0 },
        publisher: { publish: vi.fn(async () => {}) },
        slack: { postJson },
        cooldown,
      },
      envelope,
      log as never,
    );
    expect(postJson).toHaveBeenCalled();
  });
});
