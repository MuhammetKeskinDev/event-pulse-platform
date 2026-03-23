import { hostname } from "node:os";

import Redis from "ioredis";
import pg from "pg";
import pino from "pino";

import { EVENTS_LIVE_CHANNEL } from "../constants/realtime";
import {
  CONSUMER_GROUP,
  EVENTS_DLQ_STREAM,
  EVENTS_STREAM as STREAM_KEY,
} from "../constants/streams";
import { detectAndPersistAnomaly } from "../services/anomaly-detector";

const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  name: "event-consumer",
});

const CONSUMER_NAME =
  process.env.CONSUMER_NAME ?? `event-consumer-${hostname()}-${process.pid}`;

const BLOCK_MS = 5000;
const BATCH_SIZE = 32;
const ANOMALY_INTERVAL_MS = 60_000;

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

interface StreamEnvelope {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: unknown;
  received_at?: string;
}

function fieldsArrayToRecord(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const k = fields[i];
    const v = fields[i + 1];
    if (k !== undefined && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function applyCriticalErrorRule(envelope: StreamEnvelope): void {
  if (envelope.event_type !== "error") {
    return;
  }
  if (
    typeof envelope.payload !== "object" ||
    envelope.payload === null ||
    !("severity" in envelope.payload) ||
    !("message" in envelope.payload)
  ) {
    return;
  }
  const p = envelope.payload as { severity?: string; message?: string };
  if (p.severity === "critical" && typeof p.message === "string") {
    console.log(`CRITICAL ALERT: ${p.message}`);
  }
}

async function ensureConsumerGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "0", "MKSTREAM");
    log.info({ stream: STREAM_KEY, group: CONSUMER_GROUP }, "consumer_group_created");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("BUSYGROUP")) {
      return;
    }
    throw err;
  }
}

async function persistEvent(
  pool: pg.Pool,
  envelope: StreamEnvelope,
): Promise<void> {
  const text = `
    INSERT INTO events (id, event_type, occurred_at, payload)
    VALUES ($1::uuid, $2, $3::timestamptz, $4::jsonb)
    ON CONFLICT (id, occurred_at) DO NOTHING
  `;
  await pool.query(text, [
    envelope.event_id,
    envelope.event_type,
    envelope.occurred_at,
    JSON.stringify(envelope.payload),
  ]);
}

const PERSIST_MAX_ATTEMPTS = 3;

async function persistOrDlq(
  redis: Redis,
  pool: pg.Pool,
  messageId: string,
  rawEnvelope: string,
  envelope: StreamEnvelope,
): Promise<"persisted" | "dlq"> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= PERSIST_MAX_ATTEMPTS; attempt++) {
    try {
      applyCriticalErrorRule(envelope);
      await persistEvent(pool, envelope);
      return "persisted";
    } catch (err) {
      lastErr = err;
      log.warn({ err, messageId, attempt }, "persist_attempt_failed");
      if (attempt < PERSIST_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  log.error({ messageId, msg }, "event_sent_to_dlq_after_retries");
  await redis.xadd(
    EVENTS_DLQ_STREAM,
    "*",
    "original_message_id",
    messageId,
    "envelope",
    rawEnvelope,
    "error",
    msg,
    "failed_at",
    new Date().toISOString(),
  );
  return "dlq";
}

async function run(): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 5 });
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  try {
    await pool.query("SELECT 1");
  } catch (err) {
    log.error({ err }, "postgres_connect_failed");
    process.exit(1);
  }

  try {
    await redis.ping();
  } catch (err) {
    log.error({ err }, "redis_connect_failed");
    process.exit(1);
  }

  await ensureConsumerGroup(redis);

  log.info(
    { stream: STREAM_KEY, group: CONSUMER_GROUP, consumer: CONSUMER_NAME },
    "event_consumer_started",
  );

  let shuttingDown = false;

  const runAnomalyJob = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    try {
      const result = await detectAndPersistAnomaly(pool);
      if (result.persisted) {
        log.warn(
          {
            evalMinuteStart: result.evalMinuteStart,
            evalCount: result.evalCount,
            sigma: result.sigmaDistance,
          },
          "anomaly_critical_persisted",
        );
        try {
          await redis.publish(
            EVENTS_LIVE_CHANNEL,
            JSON.stringify({
              type: "anomaly_recorded",
              severity: "critical",
              detected_at: new Date().toISOString(),
            }),
          );
        } catch (pubErr) {
          log.warn({ pubErr }, "anomaly_ws_publish_failed");
        }
      }
    } catch (err) {
      log.error({ err }, "anomaly_detection_job_failed");
    }
  };

  const anomalyTimer = setInterval(() => {
    void runAnomalyJob();
  }, ANOMALY_INTERVAL_MS);

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info("event_consumer_shutting_down");
    clearInterval(anomalyTimer);
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  while (!shuttingDown) {
    let readResult: [string, [string, string[]][]][] | null;
    try {
      readResult = (await redis.xreadgroup(
        "GROUP",
        CONSUMER_GROUP,
        CONSUMER_NAME,
        "COUNT",
        BATCH_SIZE,
        "BLOCK",
        BLOCK_MS,
        "STREAMS",
        STREAM_KEY,
        ">",
      )) as [string, [string, string[]][]][] | null;
    } catch (err) {
      log.error({ err }, "xreadgroup_failed");
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    if (readResult === null) {
      continue;
    }

    for (const [, entries] of readResult) {
      for (const [messageId, rawFields] of entries) {
        const fields = fieldsArrayToRecord(rawFields);
        const raw = fields.envelope;
        if (raw === undefined) {
          log.error({ messageId }, "stream_message_missing_envelope_ack");
          try {
            await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
          } catch (ackErr) {
            log.error({ ackErr, messageId }, "xack_failed_after_bad_shape");
          }
          continue;
        }

        let envelope: StreamEnvelope;
        try {
          envelope = JSON.parse(raw) as StreamEnvelope;
        } catch (err) {
          log.error({ err, messageId }, "envelope_json_parse_failed_ack");
          try {
            await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
          } catch (ackErr) {
            log.error({ ackErr, messageId }, "xack_failed_after_parse_error");
          }
          continue;
        }

        if (
          typeof envelope.event_id !== "string" ||
          typeof envelope.event_type !== "string" ||
          typeof envelope.occurred_at !== "string"
        ) {
          log.error({ messageId, envelope }, "envelope_shape_invalid_ack");
          try {
            await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
          } catch (ackErr) {
            log.error({ ackErr, messageId }, "xack_failed_after_shape_error");
          }
          continue;
        }

        try {
          const outcome = await persistOrDlq(
            redis,
            pool,
            messageId,
            raw,
            envelope,
          );
          await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
          if (outcome === "persisted") {
            log.info(
              {
                messageId,
                event_id: envelope.event_id,
                event_type: envelope.event_type,
              },
              "event_persisted",
            );
            try {
              await redis.publish(
                EVENTS_LIVE_CHANNEL,
                JSON.stringify({
                  type: "event_processed",
                  event_id: envelope.event_id,
                  event_type: envelope.event_type,
                  occurred_at: envelope.occurred_at,
                }),
              );
            } catch (pubErr) {
              log.warn(
                { pubErr, event_id: envelope.event_id },
                "ws_live_publish_failed",
              );
            }
          } else {
            try {
              await redis.publish(
                EVENTS_LIVE_CHANNEL,
                JSON.stringify({
                  type: "event_dlq",
                  message_id: messageId,
                  event_id: envelope.event_id,
                }),
              );
            } catch (pubErr) {
              log.warn({ pubErr, messageId }, "dlq_ws_publish_failed");
            }
          }
        } catch (err) {
          log.error(
            { err, messageId, event_id: envelope.event_id },
            "event_processing_fatal_after_dlq",
          );
        }
      }
    }
  }
}

void run().catch((err) => {
  log.fatal({ err }, "event_consumer_fatal");
  process.exit(1);
});
