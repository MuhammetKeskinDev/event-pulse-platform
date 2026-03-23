import { Activity, Loader2, Radio } from 'lucide-react'

import { AnomalyTimelineChart } from './components/AnomalyTimelineChart'
import { ErrorRateGauge } from './components/ErrorRateGauge'
import { EventSummaryTable } from './components/EventSummaryTable'
import { LiveEventFeed } from './components/LiveEventFeed'
import { MultiSeriesThroughputChart } from './components/MultiSeriesThroughputChart'
import { RecentAnomalies } from './components/RecentAnomalies'
import { SystemHealthPanel } from './components/SystemHealthPanel'
import { ToastStack } from './components/ToastStack'
import { useMetrics } from './hooks/useMetrics'

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
  } = useMetrics()

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

        <div className="mb-6">
          <SystemHealthPanel health={health} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 lg:col-span-2">
            <h2 className="mb-1 text-left text-sm font-medium text-slate-400">
              Throughput by event type
            </h2>
            <p className="mb-4 text-left text-xs text-slate-600">
              Last hour, 5-minute buckets (GET /api/v1/metrics/throughput).
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
            <AnomalyTimelineChart items={anomalies} />
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
