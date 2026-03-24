import type { Logger } from "pino";

import type { EmailNotificationStub } from "../../application/ports/alert-rules";

/**
 * PDF §3.4 P2: SMTP yerine yapılandırılmış kanalda e-postayı simüle eder; yalnızca yapılandırılmış log kaydı üretir.
 * Tetikleme: `channel_hint` === `email_stub` | `email_log` (büyük/küçük harf duyarsız).
 */
export class LoggingEmailNotificationStub implements EmailNotificationStub {
  logDelivery(
    log: Logger,
    params: {
      ruleId: string;
      ruleName: string;
      channelHint: string | null;
      body: string;
    },
  ): void {
    const hint = (params.channelHint ?? "").trim().toLowerCase();
    if (hint !== "email_stub" && hint !== "email_log") {
      return;
    }
    log.info(
      {
        stub: "email_notification",
        rule_id: params.ruleId,
        rule_name: params.ruleName,
        to: "ops-team@example.invalid",
        subject: `[EventPulse] Rule: ${params.ruleName}`,
        body: params.body,
      },
      "email_notification_stub",
    );
  }
}
