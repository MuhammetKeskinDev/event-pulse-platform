import type { SlackOutbound } from "../../application/ports/alert-rules";

export class FetchSlackOutbound implements SlackOutbound {
  async postJson(
    webhookUrl: string,
    body: unknown,
  ): Promise<{ ok: boolean }> {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok };
  }
}
