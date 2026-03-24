import type Redis from "ioredis";

import { EVENTS_LIVE_CHANNEL } from "../../constants/realtime";
import type { RuleTriggeredPublisher } from "../../application/ports/alert-rules";

export class RedisRuleTriggeredPublisher implements RuleTriggeredPublisher {
  constructor(private readonly redis: Redis) {}

  async publish(payload: Record<string, unknown>): Promise<void> {
    await this.redis.publish(EVENTS_LIVE_CHANNEL, JSON.stringify(payload));
  }
}
