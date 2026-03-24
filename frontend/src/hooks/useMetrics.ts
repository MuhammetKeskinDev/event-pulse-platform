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

/** Dashboard time range (minutes) — PDF FR-05 (15m, 1h, 6h, 24h) */
export type DashboardWindowPreset = 15 | 60 | 360 | 1440

export type EventTypeFilterOption =
  | ''
  | 'page_view'
  | 'purchase'
  | 'error'
  | 'system_health'

/** PDF Appendix A + seed / default `unknown` */
export type SourceFilterOption =
  | ''
  | 'web_app'
  | 'payment_service'
  | 'api_gateway'
  | 'mobile_ios'
  | 'seed_script'
  | 'unknown'

export type SeverityFilterOption =
  | ''
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'warning'
  | 'info'

function rangeForPreset(preset: DashboardWindowPreset): {
  from: string
  to: string
} {
  const to = new Date()
  const from = new Date(to.getTime() - preset * 60_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

function metricsUrl(
  from: string,
  to: string,
  eventType: EventTypeFilterOption,
  source: SourceFilterOption,
): string {
  const p = new URLSearchParams({ from, to })
  if (eventType.length > 0) {
    p.set('event_type', eventType)
  }
  if (source.length > 0) {
    p.set('source', source)
  }
  return `${API_BASE}/api/v1/metrics?${p.toString()}`
}

function anomaliesRecentListUrl(
  from: string,
  to: string,
  eventType: EventTypeFilterOption,
  severity: SeverityFilterOption,
  limit: number,
): string {
  const p = new URLSearchParams({
    limit: String(limit),
    from,
    to,
  })
  if (eventType.length > 0) {
    p.set('event_type', eventType)
  }
  if (severity.length > 0) {
    p.set('severity', severity)
  }
  return `${API_BASE}/api/v1/anomalies?${p.toString()}`
}

function healthUrl(): string {
  return `${API_BASE}/api/v1/events/health`
}

function throughputUrl(
  from: string,
  to: string,
  windowMinutes: number,
  eventType: EventTypeFilterOption,
  source: SourceFilterOption,
): string {
  const w = Math.min(1440, Math.max(15, Math.round(windowMinutes)))
  const p = new URLSearchParams({
    from,
    to,
    windowMinutes: String(w),
    bucketMinutes: '5',
  })
  if (eventType.length > 0) {
    p.set('event_type', eventType)
  }
  if (source.length > 0) {
    p.set('source', source)
  }
  return `${API_BASE}/api/v1/metrics/throughput?${p.toString()}`
}

function recentEventsUrl(
  eventType: EventTypeFilterOption,
  source: SourceFilterOption,
  limit: number,
  from?: string,
  to?: string,
): string {
  const p = new URLSearchParams({ limit: String(limit) })
  if (eventType.length > 0) {
    p.set('event_type', eventType)
  }
  if (source.length > 0) {
    p.set('source', source)
  }
  if (from !== undefined && from.length > 0) {
    p.set('from', from)
  }
  if (to !== undefined && to.length > 0) {
    p.set('to', to)
  }
  return `${API_BASE}/api/v1/events?${p.toString()}`
}

export type TimeRangeMode = 'preset' | 'custom'

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function minutesBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime()
  const b = new Date(toIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    return 60
  }
  return Math.ceil((b - a) / 60_000)
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
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>(60)
  const [timeRangeMode, setTimeRangeMode] = useState<TimeRangeMode>('preset')
  const [customFromIso, setCustomFromIso] = useState(() =>
    new Date(Date.now() - 60 * 60_000).toISOString(),
  )
  const [customToIso, setCustomToIso] = useState(() =>
    new Date().toISOString(),
  )
  const [eventTypeFilter, setEventTypeFilter] =
    useState<EventTypeFilterOption>('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilterOption>('')
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilterOption>('')

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
    const { from, to } =
      timeRangeMode === 'preset'
        ? rangeForPreset(windowPreset)
        : { from: customFromIso, to: customToIso }
    const throughputWindowMinutes =
      timeRangeMode === 'preset'
        ? windowPreset
        : minutesBetween(from, to)
    const mRes = await fetch(
      metricsUrl(from, to, eventTypeFilter, sourceFilter),
      {
        cache: 'no-store',
      },
    )
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
      const hRes = await fetch(healthUrl(), { cache: 'no-store' })
      if (hRes.ok) {
        setHealth((await hRes.json()) as PipelineHealth)
      }
    } catch {
      /* optional */
    }

    try {
      const tRes = await fetch(
        throughputUrl(
          from,
          to,
          throughputWindowMinutes,
          eventTypeFilter,
          sourceFilter,
        ),
        { cache: 'no-store' },
      )
      if (tRes.ok) {
        const tb = (await tRes.json()) as { buckets?: ThroughputBucket[] }
        setThroughputBuckets(tb.buckets ?? [])
      }
    } catch {
      /* optional */
    }

    try {
      const eRes = await fetch(
        recentEventsUrl(eventTypeFilter, sourceFilter, 15, from, to),
        {
          cache: 'no-store',
        },
      )
      if (eRes.ok) {
        const eb = (await eRes.json()) as { items?: LiveEventRow[] }
        setLiveEvents(eb.items ?? [])
      }
    } catch {
      /* optional */
    }

    try {
      const aRes = await fetch(
        anomaliesRecentListUrl(
          from,
          to,
          eventTypeFilter,
          severityFilter,
          500,
        ),
        {
          cache: 'no-store',
        },
      )
      if (aRes.ok) {
        const body = (await aRes.json()) as { items: AnomalyRow[] }
        setAnomalies(body.items ?? [])
      }
    } catch {
      /* optional */
    }
  }, [
    windowPreset,
    timeRangeMode,
    customFromIso,
    customToIso,
    eventTypeFilter,
    sourceFilter,
    severityFilter,
  ])

  /** İlk yükleme ve filtre değişimi: WebSocket bağlanmasını beklemeden REST ile veri çek (WS kapalı/proxy sorununda panel boş kalmasın). */
  useEffect(() => {
    let cancelled = false
    void fetchOnce()
      .then(() => {
        if (!cancelled) {
          setError(null)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load metrics',
          )
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [fetchOnce])

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
            message?: string
            rule_name?: string
            rule_id?: string
          }
          if (msg.type === 'event_processed' && msg.event_type) {
            pushToast(`Processed: ${msg.event_type}`)
          } else if (msg.type === 'anomaly_recorded') {
            pushToast('Anomaly recorded (critical)')
          } else if (msg.type === 'event_dlq') {
            pushToast('Event moved to DLQ after retries')
          } else if (msg.type === 'rule_triggered') {
            const line =
              typeof msg.message === 'string' && msg.message.length > 0
                ? msg.message
                : `Rule fired: ${msg.rule_name ?? msg.rule_id ?? 'unknown'}`
            pushToast(line)
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

  useEffect(() => {
    if (wsState !== 'open') {
      return
    }
    void fetchOnce()
      .then(() => setError(null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load metrics'),
      )
  }, [
    windowPreset,
    timeRangeMode,
    customFromIso,
    customToIso,
    eventTypeFilter,
    sourceFilter,
    severityFilter,
    wsState,
    fetchOnce,
  ])

  const dashboardWindowIso =
    timeRangeMode === 'preset'
      ? rangeForPreset(windowPreset)
      : { from: customFromIso, to: customToIso }

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
    windowPreset,
    setWindowPreset,
    timeRangeMode,
    setTimeRangeMode,
    customFromLocal: isoToDatetimeLocalValue(customFromIso),
    customToLocal: isoToDatetimeLocalValue(customToIso),
    setCustomFromLocal: (v: string) => {
      if (v.length > 0) {
        setCustomFromIso(new Date(v).toISOString())
      }
    },
    setCustomToLocal: (v: string) => {
      if (v.length > 0) {
        setCustomToIso(new Date(v).toISOString())
      }
    },
    eventTypeFilter,
    setEventTypeFilter,
    sourceFilter,
    setSourceFilter,
    severityFilter,
    setSeverityFilter,
    transport: 'websocket' as const,
    dashboardWindowIso,
  }
}
