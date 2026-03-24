import type Redis from "ioredis";
import type pg from "pg";
import type { Logger } from "pino";

import { evaluateAlertRulesUseCase } from "../application/use-cases/evaluate-alert-rules";
import { ruleEngineCooldown } from "../domain/rules/cooldown-tracker";
import type { StreamEnvelope } from "../domain/events/stream-envelope";
import { PgCachedAlertRuleRepository } from "../infrastructure/alert-rules/pg-cached-rule-repository";
import { PgEventWindowCounter } from "../infrastructure/alert-rules/pg-event-window-counter";
import { RedisRuleTriggeredPublisher } from "../infrastructure/alert-rules/redis-rule-triggered-publisher";
import { FetchSlackOutbound } from "../infrastructure/alert-rules/fetch-slack-outbound";

export type { StreamEnvelope } from "../domain/events/stream-envelope";

export async function evaluateAlertRules(
  pool: pg.Pool,
  redis: Redis,
  envelope: StreamEnvelope,
  log: Logger,
): Promise<void> {
  const rules = new PgCachedAlertRuleRepository(pool);
  const counter = new PgEventWindowCounter(pool);
  const publisher = new RedisRuleTriggeredPublisher(redis);
  const slack = new FetchSlackOutbound();
  await evaluateAlertRulesUseCase(
    {
      rules,
      counter,
      publisher,
      slack,
      cooldown: ruleEngineCooldown,
    },
    envelope,
    log,
  );
}
