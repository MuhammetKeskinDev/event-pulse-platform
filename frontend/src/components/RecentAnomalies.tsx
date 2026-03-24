import { AlertOctagon } from 'lucide-react'

import { parseExemplarEventId } from '../lib/anomaly-description'
import type { AnomalyRow } from '../types/anomaly'

interface Props {
  items: AnomalyRow[]
  onViewEventId?: (id: string) => void
}

function formatDescriptionCell(description: string): string {
  try {
    const o = JSON.parse(description) as Record<string, unknown>
    const rule = o.rule
    const count = o.eval_count
    const z = o.z_score_sigma ?? o.sigma_distance
    if (rule === 'zscore_3sigma_minute_volume' && typeof count === 'number') {
      const zPart =
        z === 'inf' || z === Infinity
          ? 'σ = ∞'
          : typeof z === 'number'
            ? `Z ≈ ${z}σ`
            : z !== undefined
              ? `Z ≈ ${String(z)}`
              : ''
      return `Dakika hacmi ${count} olay · baseline'a göre 3σ kuralı${zPart ? ` · ${zPart}` : ''}`
    }
  } catch {
    /* plain text */
  }
  return description.length > 200
    ? `${description.slice(0, 197)}…`
    : description
}

function severityBadgeClass(severity: string): string {
  const s = severity.toLowerCase()
  if (s === 'critical') {
    return 'border-rose-800/80 bg-rose-950/90 text-rose-200'
  }
  if (s === 'high') {
    return 'border-orange-800/80 bg-orange-950/90 text-orange-200'
  }
  if (s === 'medium') {
    return 'border-amber-800/80 bg-amber-950/90 text-amber-100'
  }
  if (s === 'low') {
    return 'border-sky-800/80 bg-sky-950/80 text-sky-200'
  }
  return 'border-slate-700 bg-slate-800/90 text-slate-300'
}

function eventTypeLabel(eventType: string): string {
  if (eventType === '*') {
    return 'Aggregate (*)'
  }
  return eventType
}

export function RecentAnomalies({ items, onViewEventId }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-rose-400" aria-hidden />
        <h2 className="text-left text-sm font-medium text-slate-200">
          Recent anomalies
        </h2>
        <span className="text-xs text-slate-600">(FR-09 P1)</span>
      </div>
      <p className="mb-3 text-left text-xs text-slate-600">
        Üstteki zaman aralığı (preset/custom), severity ve event type ile API
        filtrelenir; toplu hacim anomalileri{' '}
        <span className="font-mono text-slate-500">*</span> seçili türde de
        gösterilir. En fazla 500 kayıt.
        {onViewEventId ? (
          <>
            {' '}
            <strong className="font-medium text-slate-500">
              İlişkili örnek olayı olan satıra tıklayın
            </strong>{' '}
            — olay detayı açılır.
          </>
        ) : null}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No anomalies recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Timestamp
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Severity
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Event type
                </th>
                <th scope="col" className="py-2 font-medium">
                  Description
                </th>
                {onViewEventId ? (
                  <th scope="col" className="py-2 font-medium">
                    Related event
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const exemplarId = onViewEventId
                  ? parseExemplarEventId(row.description)
                  : null
                const rowOpensDetail = Boolean(exemplarId && onViewEventId)
                return (
                <tr
                  key={row.id}
                  tabIndex={rowOpensDetail ? 0 : undefined}
                  role={rowOpensDetail ? 'button' : undefined}
                  aria-label={
                    rowOpensDetail
                      ? 'Open related event detail'
                      : undefined
                  }
                  onClick={
                    rowOpensDetail && exemplarId && onViewEventId
                      ? () => onViewEventId(exemplarId)
                      : undefined
                  }
                  onKeyDown={
                    rowOpensDetail && exemplarId && onViewEventId
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onViewEventId(exemplarId)
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-slate-800/80 last:border-0 ${
                    rowOpensDetail
                      ? 'cursor-pointer hover:bg-slate-800/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500/60'
                      : ''
                  }`}
                >
                  <td className="whitespace-nowrap py-3 pr-4 align-top text-slate-300">
                    <time dateTime={row.detected_at}>
                      {new Date(row.detected_at).toLocaleString()}
                    </time>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${severityBadgeClass(row.severity)}`}
                    >
                      {row.severity}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-xs text-slate-400">
                    {eventTypeLabel(row.event_type)}
                  </td>
                  <td
                    className="max-w-md py-3 align-top text-slate-300"
                    title={row.description}
                  >
                    {formatDescriptionCell(row.description)}
                  </td>
                  {onViewEventId ? (
                    <td className="py-3 align-top">
                      {(() => {
                        const eid = parseExemplarEventId(row.description)
                        return eid ? (
                          <button
                            type="button"
                            className="text-xs font-mono text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                            onClick={(e) => {
                              e.stopPropagation()
                              onViewEventId(eid)
                            }}
                          >
                            {eid.slice(0, 8)}…
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )
                      })()}
                    </td>
                  ) : null}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
