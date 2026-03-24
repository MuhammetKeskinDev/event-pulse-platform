import type { Logger } from "pino";

export type AlertRuleRow = {
  id: string;
  name: string;
  definition: unknown;
  channel_hint: string | null;
};

export type WindowCountParams = {
  windowMinutes: number;
  eventType: string | null;
  source: string | null;
  payloadMatch: Record<string, unknown> | null;
};

export interface AlertRuleRepository {
  loadEnabledRules(): Promise<AlertRuleRow[]>;
}

export interface EventWindowCounter {
  countInWindow(params: WindowCountParams): Promise<number>;
}

export interface RuleTriggeredPublisher {
  publish(payload: Record<string, unknown>): Promise<void>;
}

export interface SlackOutbound {
  postJson(webhookUrl: string, body: unknown): Promise<{ ok: boolean }>;
}

/** PDF §3.4 — e-posta kanalı P2: gönderim yerine yapılandırılmış log. */
export interface EmailNotificationStub {
  logDelivery(
    log: Logger,
    params: {
      ruleId: string;
      ruleName: string;
      channelHint: string | null;
      body: string;
    },
  ): void;
}
