import { describe, expect, it } from "vitest";

import { batchIngestionSchema } from "@src/schemas/batch-ingestion";
import { ingestionEventSchema } from "@src/schemas/ingestion-events";

const validEvent = ingestionEventSchema.parse({
  event_type: "page_view",
  source: "web_app",
  occurred_at: "2026-03-23T12:00:00.000Z",
  payload: {
    session_id: "s",
    page_url: "https://example.com/",
  },
});

describe("ingestionEventSchema (PDF Appendix A)", () => {
  it("timestamp ile occurred_at yerine kabul eder", () => {
    const r = ingestionEventSchema.safeParse({
      event_type: "page_view",
      source: "web_app",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { session_id: "s", url: "/products/x" },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.occurred_at).toBe("2026-01-01T00:00:00.000Z");
    }
  });
});

describe("batchIngestionSchema", () => {
  it("1–500 arası kabul eder", () => {
    const events = Array.from({ length: 500 }, () => ({ ...validEvent }));
    const r = batchIngestionSchema.safeParse({ events });
    expect(r.success).toBe(true);
  });

  it("501 olayı reddeder", () => {
    const events = Array.from({ length: 501 }, () => ({ ...validEvent }));
    const r = batchIngestionSchema.safeParse({ events });
    expect(r.success).toBe(false);
  });
});
