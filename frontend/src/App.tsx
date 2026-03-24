import { useMemo, useState } from 'react'
import { Activity, Download, Loader2, Radio } from 'lucide-react'

import { AnomalyTimelineChart } from './components/AnomalyTimelineChart'
import { ErrorRateGauge } from './components/ErrorRateGauge'
import { EventDetailModal } from './components/EventDetailModal'
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
  type SourceFilterOption,
  type SeverityFilterOption,
} from './hooks/useMetrics'
import { buildEventsExportUrl } from './lib/eventsExportUrl'

const WINDOW_LABEL: Record<DashboardWindowPreset, string> = {
  15: 'Last 15 minutes',
  60: 'Last 1 hour',
  360: 'Last 6 hours',
  1440: 'Last 24 hours',
}

function App() {
  const [detailEventId, setDetailEventId] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
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
    timeRangeMode,
    setTimeRangeMode,
    customFromLocal,
    customToLocal,
    setCustomFromLocal,
    setCustomToLocal,
    eventTypeFilter,
    setEventTypeFilter,
    sourceFilter,
    setSourceFilter,
    severityFilter,
    setSeverityFilter,
    dashboardWindowIso,
  } = useMetrics()

  const rangeDescription = useMemo(() => {
    if (timeRangeMode === 'custom') {
      return 'Custom range (from / to)'
    }
    return WINDOW_LABEL[windowPreset]
  }, [timeRangeMode, windowPreset])

  const filterSummary = [
    eventTypeFilter ? `type=${eventTypeFilter}` : null,
    sourceFilter ? `source=${sourceFilter}` : null,
    severityFilter ? `severity=${severityFilter}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  /** Anomaliler API'den zaten seçilen zaman aralığı + severity + event_type (tür seçiliyken '*' toplu satırlar dahil) ile gelir. */
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

  async function runExport() {
    setExportError(null)
    setExportBusy(true)
    try {
      const url = buildEventsExportUrl(
        exportFormat,
        dashboardWindowIso.from,
        dashboardWindowIso.to,
        {
          eventType: eventTypeFilter || undefined,
          source: sourceFilter || undefined,
          limit: 5000,
        },
      )
      const res = await fetch(url)
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const j = (await res.json()) as { error?: string }
          if (typeof j.error === 'string') {
            msg = j.error
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition')
      let filename = `events-export.${exportFormat}`
      const m = cd?.match(/filename="([^"]+)"/)
      if (m?.[1]) {
        filename = m[1]
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.rel = 'noopener'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

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
              value={timeRangeMode}
              onChange={(e) =>
                setTimeRangeMode(e.target.value as 'preset' | 'custom')
              }
            >
              <option value="preset">Preset</option>
              <option value="custom">Custom (from / to)</option>
            </select>
          </label>
          {timeRangeMode === 'preset' ? (
            <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
              Preset
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={windowPreset}
                onChange={(e) =>
                  setWindowPreset(
                    Number(e.target.value) as DashboardWindowPreset,
                  )
                }
              >
                <option value={15}>15 minutes</option>
                <option value={60}>1 hour</option>
                <option value={360}>6 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
                From
                <input
                  type="datetime-local"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={customFromLocal}
                  onChange={(e) => setCustomFromLocal(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
                To
                <input
                  type="datetime-local"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={customToLocal}
                  onChange={(e) => setCustomToLocal(e.target.value)}
                />
              </label>
            </>
          )}
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
          <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
            Source
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as SourceFilterOption)
              }
            >
              <option value="">All sources</option>
              <option value="web_app">web_app</option>
              <option value="payment_service">payment_service</option>
              <option value="api_gateway">api_gateway</option>
              <option value="mobile_ios">mobile_ios</option>
              <option value="seed_script">seed_script</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-left text-xs text-slate-400">
            Anomaly severity
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as SeverityFilterOption)
              }
            >
              <option value="">All severities</option>
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
              <option value="warning">warning</option>
              <option value="info">info</option>
            </select>
          </label>
          <div className="flex min-w-[12rem] flex-col gap-1 text-left text-xs text-slate-400">
            <span>Export reports (FR-12)</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                value={exportFormat}
                onChange={(e) =>
                  setExportFormat(e.target.value as 'csv' | 'pdf')
                }
                aria-label="Export format"
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => void runExport()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700/60 bg-sky-950/50 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-900/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                Download
              </button>
            </div>
            <p className="text-[10px] leading-snug text-slate-600">
              Uses dashboard time range + event type + source (not severity).
              Max 5000 rows.
            </p>
            {exportError ? (
              <p className="text-[11px] text-red-300" role="alert">
                {exportError}
              </p>
            ) : null}
          </div>
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
              {rangeDescription}
              {filterSummary ? ` · ${filterSummary}` : ''}, 5-minute buckets
              (GET /api/v1/metrics/throughput). Severity applies to anomaly list &
              timeline only.
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
            {anomalies.length > 0 ? (
              <AnomalyTimelineChart items={anomalies} />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500 shadow-xl shadow-black/20">
                <p className="mb-1 font-medium text-slate-400">
                  Anomaly timeline
                </p>
                <p>
                  Seçilen zaman aralığı ve filtrelerle eşleşen anomali yok.
                  Severity / event type / zamanı değiştirmeyi veya seed/load-gen
                  ile veri eklemeyi deneyin.
                </p>
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            <RecentAnomalies
              items={anomalies}
              onViewEventId={(id) => setDetailEventId(id)}
            />
          </section>

          <section className="lg:col-span-2">
            <LiveEventFeed
              items={liveEvents}
              onSelectEventId={(id) => setDetailEventId(id)}
            />
          </section>
        </div>
      </div>
      <EventDetailModal
        eventId={detailEventId}
        onClose={() => setDetailEventId(null)}
      />
    </div>
  )
}

export default App
