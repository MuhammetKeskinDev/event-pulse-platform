export interface MetricsResponse {
  refreshed_at: string
  suggested_poll_interval_seconds: number
  window: {
    label: string
    start: string
    end: string
  }
  last_hour: {
    by_event_type: { event_type: string; count: number }[]
    total_events: number
    error_events: number
    error_rate_percent: number
  }
  all_time: {
    total_events: number
    error_events: number
    error_rate_percent: number
  }
}

export interface ThroughputPoint {
  /** Monotonic key for Recharts */
  key: string
  timeLabel: string
  totalInWindow: number
}
