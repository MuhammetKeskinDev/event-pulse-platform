import { useCallback, useEffect, useRef, useState } from 'react'

import type { MetricsResponse, ThroughputPoint } from '../types/metrics'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const MAX_POINTS = 360

function metricsUrl(): string {
  return `${API_BASE}/api/v1/metrics`
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [throughputSeries, setThroughputSeries] = useState<ThroughputPoint[]>(
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10)
  const pollMsRef = useRef(10_000)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOnce = useCallback(async () => {
    const res = await fetch(metricsUrl())
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as MetricsResponse
    setMetrics(data)
    const sec = data.suggested_poll_interval_seconds
    if (typeof sec === 'number' && sec > 0 && Number.isFinite(sec)) {
      pollMsRef.current = Math.round(sec * 1000)
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
  }, [])

  useEffect(() => {
    let cancelled = false

    const clearTimer = () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const scheduleNext = (delay: number) => {
      clearTimer()
      timeoutRef.current = setTimeout(() => {
        void tick()
      }, delay)
    }

    const tick = async () => {
      if (cancelled) {
        return
      }
      try {
        await fetchOnce()
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load metrics')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          scheduleNext(pollMsRef.current)
        }
      }
    }

    void tick()

    return () => {
      cancelled = true
      clearTimer()
    }
  }, [fetchOnce])

  return {
    metrics,
    throughputSeries,
    error,
    loading,
    pollIntervalSeconds,
  }
}
