export function resolveSlackWebhookUrl(
  channelHint: string | null | undefined,
): string | undefined {
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
