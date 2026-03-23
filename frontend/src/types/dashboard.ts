export interface PipelineHealth {
  ok: boolean
  redis: boolean
  stream: string
  stream_length: number
  consumer_group: string
  pending_messages: number
  dlq_stream: string
  dlq_length: number
  db_latency_ms: number
  checked_at: string
}

export interface ThroughputBucket {
  bucket_start: string
  counts: Record<string, number>
}

export interface ThroughputApiResponse {
  window_minutes: number
  bucket_minutes: number
  buckets: ThroughputBucket[]
}

export interface LiveEventRow {
  id: string
  event_type: string
  occurred_at: string
  payload: unknown
}
