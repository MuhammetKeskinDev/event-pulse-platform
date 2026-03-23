import { useCallback, useEffect, useState } from 'react'

import type { AnomalyRow } from '../types/anomaly'
import type { MetricsResponse, ThroughputPoint } from '../types/metrics'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const WS_BASE = import.meta.env.VITE_WS_BASE ?? ''
const MAX_POINTS = 360

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
  const [throughputSeries, setThroughputSeries] = useState<ThroughputPoint[]>(
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10)
  const [wsState, setWsState] = useState<WsConnectionState>('connecting')

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
    setThroughputSeries((prev) => {
      const t = new Date(data.refreshed_at)
      const point: ThroughputPoint = {
        key: `${data.refreshed_at}-${prev.length}`,
        timeLabel: t.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        totalInWindow: data.last_hour.total_events,
      }
      return [...prev, point].slice(-MAX_POINTS)
    })

    try {
      const aRes = await fetch(anomaliesUrl(12))
      if (aRes.ok) {
        const body = (await aRes.json()) as { items: AnomalyRow[] }
        setAnomalies(body.items ?? [])
      }
    } catch {
      /* anomalies optional */
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

      socket.onmessage = () => {
        if (cancelled) {
          return
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
  }, [fetchOnce])

  return {
    metrics,
    anomalies,
    throughputSeries,
    error,
    loading,
    pollIntervalSeconds,
    wsState,
    transport: 'websocket' as const,
  }
}
