import { useCallback, useEffect, useState } from 'react'

import type { AnomalyRow } from '../types/anomaly'
import type {
  LiveEventRow,
  PipelineHealth,
  ThroughputBucket,
} from '../types/dashboard'
import type { MetricsResponse } from '../types/metrics'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const WS_BASE = import.meta.env.VITE_WS_BASE ?? ''

export type WsConnectionState =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'

function metricsUrl(): string {
  return `${API_BASE}/api/v1/metrics`
}

function anomaliesUrl(limit: number): string {
  return `${API_BASE}/api/v1/anomalies?limit=${limit}`
}

function healthUrl(): string {
  return `${API_BASE}/api/v1/events/health`
}

function throughputUrl(): string {
  return `${API_BASE}/api/v1/metrics/throughput?windowMinutes=60&bucketMinutes=5`
}

function recentEventsUrl(): string {
  return `${API_BASE}/api/v1/events?limit=15`
}

function wsEventsUrl(): string {
  if (WS_BASE) {
    let base = WS_BASE.replace(/\/$/, '')
    if (base.startsWith('https://')) {
      base = `wss://${base.slice(8)}`
    } else if (base.startsWith('http://')) {
      base = `ws://${base.slice(7)}`
    }
    return `${base}/ws/events`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/events`
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([])
  const [throughputBuckets, setThroughputBuckets] = useState<ThroughputBucket[]>(
    [],
  )
  const [health, setHealth] = useState<PipelineHealth | null>(null)
  const [liveEvents, setLiveEvents] = useState<LiveEventRow[]>([])
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10)
  const [wsState, setWsState] = useState<WsConnectionState>('connecting')

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev.slice(-5), { id, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const fetchOnce = useCallback(async () => {
    const mRes = await fetch(metricsUrl())
    if (!mRes.ok) {
      throw new Error(`HTTP ${mRes.status}`)
    }
    const data = (await mRes.json()) as MetricsResponse
    setMetrics(data)
    const sec = data.suggested_poll_interval_seconds
    if (typeof sec === 'number' && sec > 0 && Number.isFinite(sec)) {
      setPollIntervalSeconds(sec)
    }

    try {
      const hRes = await fetch(healthUrl())
      if (hRes.ok) {
        setHealth((await hRes.json()) as PipelineHealth)
      }
    } catch {
      /* optional */
    }

    try {
      const tRes = await fetch(throughputUrl())
      if (tRes.ok) {
        const tb = (await tRes.json()) as { buckets?: ThroughputBucket[] }
        setThroughputBuckets(tb.buckets ?? [])
      }
    } catch {
      /* optional */
    }

    try {
      const eRes = await fetch(recentEventsUrl())
      if (eRes.ok) {
        const eb = (await eRes.json()) as { items?: LiveEventRow[] }
        setLiveEvents(eb.items ?? [])
      }
    } catch {
      /* optional */
    }

    try {
      const aRes = await fetch(anomaliesUrl(10))
      if (aRes.ok) {
        const body = (await aRes.json()) as { items: AnomalyRow[] }
        setAnomalies(body.items ?? [])
      }
    } catch {
      /* optional */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) {
        return
      }
      clearReconnect()
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (cancelled) {
        return
      }
      clearReconnect()
      setWsState(attempt === 0 ? 'connecting' : 'reconnecting')
      try {
        socket = new WebSocket(wsEventsUrl())
      } catch {
        attempt += 1
        scheduleReconnect()
        return
      }

      socket.onopen = () => {
        if (cancelled) {
          return
        }
        attempt = 0
        setWsState('open')
        void fetchOnce()
          .then(() => {
            setError(null)
            setLoading(false)
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : 'Failed to load metrics')
            setLoading(false)
          })
      }

      socket.onmessage = (ev) => {
        if (cancelled) {
          return
        }
        try {
          const msg = JSON.parse(ev.data as string) as {
            type?: string
            event_type?: string
          }
          if (msg.type === 'event_processed' && msg.event_type) {
            pushToast(`Processed: ${msg.event_type}`)
          } else if (msg.type === 'anomaly_recorded') {
            pushToast('Anomaly recorded (critical)')
          } else if (msg.type === 'event_dlq') {
            pushToast('Event moved to DLQ after retries')
          }
        } catch {
          /* non-json */
        }
        void fetchOnce()
          .then(() => setError(null))
          .catch((e) =>
            setError(e instanceof Error ? e.message : 'Failed to load metrics'),
          )
      }

      socket.onclose = () => {
        if (cancelled) {
          return
        }
        setWsState('closed')
        attempt += 1
        scheduleReconnect()
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      clearReconnect()
      socket?.close()
    }
  }, [fetchOnce, pushToast])

  return {
    metrics,
    anomalies,
    throughputBuckets,
    health,
    liveEvents,
    toasts,
    error,
    loading,
    pollIntervalSeconds,
    wsState,
    transport: 'websocket' as const,
  }
}
