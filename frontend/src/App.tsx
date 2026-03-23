import { useMemo } from 'react'
import { Activity, Loader2, Radio } from 'lucide-react'

import { AnomalyTimelineChart } from './components/AnomalyTimelineChart'
import { ErrorRateGauge } from './components/ErrorRateGauge'
import { EventSummaryTable } from './components/EventSummaryTable'
import { LiveEventFeed } from './components/LiveEventFeed'
import { MultiSeriesThroughputChart } from './components/MultiSeriesThroughputChart'
import { RecentAnomalies } from './components/RecentAnomalies'
import { SystemHealthPanel } from './components/SystemHealthPanel'
import { ToastStack } from './components/ToastStack'
import {
  useMetrics,
  type DashboardWindowPreset,
  type EventTypeFilterOption,
} from './hooks/useMetrics'

const WINDOW_LABEL: Record<DashboardWindowPreset, string> = {
  15: 'Last 15 minutes',
  60: 'Last 1 hour',
  1440: 'Last 24 hours',
}

function App() {
  const {
    metrics,
    anomalies,
    throughputBuckets,
    health,
    liveEvents,
    toasts,
    error,
    loading,
    wsState,
    windowPreset,
    setWindowPreset,
    eventTypeFilter,
    setEventTypeFilter,
  } = useMetrics()

  const anomaliesInSelectedWindow = useMemo(() => {
    if (!metrics?.window) {
      return anomalies
    }
    const start = new Date(metrics.window.start).getTime()
    const end = new Date(metrics.window.end).getTime()
    return anomalies.filter((a) => {
      const t = new Date(a.detected_at).getTime()
      return t >= start && t <= end
    })
  }, [anomalies, metrics?.window])

  const wsTone =
    wsState === 'open'
      ? 'text-emerald-400'
      : wsState === 'reconnecting' || wsState === 'connecting'
        ? 'text-amber-400'
        : 'text-slate-500'
  const wsLabel =
    wsState === 'open'
      ? 'Live'
      : wsState === 'connecting'
        ? 'Connecting…'
        : wsState === 'reconnecting'
          ? 'Reconnecting…'
          : 'Offline'

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <ToastStack toasts={toasts} />
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <Activity className="h-6 w-6" aria-hidden />
            </div>
            <div className="text-left">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                EventPulse
              </h1>
              <p className="text-sm text-slate-500">
                PDF P0/P1 — WebSocket + multi-series throughput + health
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Radio className={`h-4 w-4 ${wsTone}`} aria-hidden />
            <span className={wsTone}>{wsLabel}</span>
            <span className="text-slate-600">·</span>
            {loading ? (
              <Loader2
                className="h-4 w-4 animate-spin text-sky-400"
                aria-hidden
              />
            ) : null}
            <span>
              In-app toasts on WS ·{' '}
              <span className="font-mono text-slate-400">/ws/events</span>
              {metrics?.refreshed_at ? (
                <>
                  {' '}
                  · Metrics{' '}
                  <span className="font-mono text-slate-400">
                    {new Date(metrics.refreshed_at).toLocaleTimeString()}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </header>

        {error ? (
          <div
            className="mb-6 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error} — Retrying on the next WS message.
          </div>
        ) : null}

        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-4">
          <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
            Time range
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={windowPreset}
              onChange={(e) =>
                setWindowPreset(Number(e.target.value) as DashboardWindowPreset)
              }
            >
              <option value={15}>15 minutes</option>
              <option value={60}>1 hour</option>
              <option value={1440}>24 hours</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
            Event type
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={eventTypeFilter}
              onChange={(e) =>
                setEventTypeFilter(e.target.value as EventTypeFilterOption)
              }
            >
              <option value="">All types</option>
              <option value="page_view">page_view</option>
              <option value="purchase">purchase</option>
              <option value="error">error</option>
              <option value="system_health">system_health</option>
            </select>
          </label>
        </div>

        <div className="mb-6">
          <SystemHealthPanel health={health} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 lg:col-span-2">
            <h2 className="mb-1 text-left text-sm font-medium text-slate-400">
              Throughput by event type
            </h2>
            <p className="mb-4 text-left text-xs text-slate-600">
              {WINDOW_LABEL[windowPreset]}
              {eventTypeFilter ? ` · ${eventTypeFilter}` : ''}, 5-minute buckets
              (GET /api/v1/metrics/throughput).
            </p>
            <MultiSeriesThroughputChart buckets={throughputBuckets} />
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
            <h2 className="mb-4 text-left text-sm font-medium text-slate-400">
              Error rate
            </h2>
            {metrics ? (
              <ErrorRateGauge
                percent={metrics.all_time.error_rate_percent}
                totalEvents={metrics.all_time.total_events}
                errorEvents={metrics.all_time.error_events}
              />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500">
                {loading ? 'Loading…' : 'No data'}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
            <h2 className="mb-4 text-left text-sm font-medium text-slate-400">
              Event summary
            </h2>
            {metrics ? (
              <EventSummaryTable metrics={metrics} />
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500">
                {loading ? 'Loading…' : 'No data'}
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            {anomaliesInSelectedWindow.length > 0 ? (
              <AnomalyTimelineChart items={anomaliesInSelectedWindow} />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500 shadow-xl shadow-black/20">
                <p className="mb-1 font-medium text-slate-400">
                  Anomaly timeline
                </p>
                <p>
                  Seçilen zaman aralığında anomali yok. Aşağıdaki tablo, son
                  kayıtların tamamını (zaman penceresinden bağımsız) listeler.
                </p>
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            <RecentAnomalies items={anomalies} />
          </section>

          <section className="lg:col-span-2">
            <LiveEventFeed items={liveEvents} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default App
