/** In-process cooldown between repeated triggers of the same rule id. */
export class RuleCooldownTracker {
  private readonly lastTriggerEpochMs = new Map<string, number>();

  inCooldown(ruleId: string, cooldownSec: number): boolean {
    const prev = this.lastTriggerEpochMs.get(ruleId);
    if (prev === undefined) {
      return false;
    }
    return Date.now() - prev < cooldownSec * 1000;
  }

  markTriggered(ruleId: string): void {
    this.lastTriggerEpochMs.set(ruleId, Date.now());
  }

  /** Test helper */
  clear(): void {
    this.lastTriggerEpochMs.clear();
  }
}

export const ruleEngineCooldown = new RuleCooldownTracker();
