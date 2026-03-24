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
