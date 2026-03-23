import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "@src/app";

const EVENTS_STREAM = "events_stream";

const runIntegration = process.env.RUN_INTEGRATION === "1";

describe.skipIf(!runIntegration)("POST /api/v1/events → Redis stream", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer({ silent: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("geçerli event kabul edilir ve events_stream uzunluğu artar", async () => {
    const before = await app.redis.xlen(EVENTS_STREAM);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "content-type": "application/json" },
      payload: {
        event_type: "page_view",
        occurred_at: "2026-03-23T12:00:00.000Z",
        payload: {
          session_id: "s-int-test",
          page_url: "https://example.com/p",
        },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body) as { status: string; event_id: string };
    expect(body.status).toBe("accepted");
    expect(body.event_id).toBeTruthy();

    const after = await app.redis.xlen(EVENTS_STREAM);
    expect(after).toBeGreaterThan(before);
  });
});
