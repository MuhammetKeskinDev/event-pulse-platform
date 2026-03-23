import { AlertOctagon } from 'lucide-react'

import type { AnomalyRow } from '../types/anomaly'

interface Props {
  items: AnomalyRow[]
}

function shortSummary(description: string): string {
  try {
    const o = JSON.parse(description) as Record<string, unknown>
    const count = o.eval_count
    const z = o.z_score_sigma ?? o.sigma_distance
    if (typeof count === 'number' && z !== undefined) {
      return `Volume spike: ${count} events · Z≈${String(z)}`
    }
  } catch {
    /* plain text */
  }
  return description.length > 120
    ? `${description.slice(0, 117)}…`
    : description
}

export function RecentAnomalies({ items }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-rose-400" aria-hidden />
        <h2 className="text-left text-sm font-medium text-slate-400">
          Recent anomalies
        </h2>
        <span className="text-xs text-slate-600">(FR-09 P1)</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No anomalies recorded yet.</p>
      ) : (
        <ul className="max-h-56 space-y-3 overflow-y-auto pr-1 text-left">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-rose-950/80 px-1.5 py-0.5 font-medium uppercase tracking-wide text-rose-300">
                  {row.severity}
                </span>
                <span className="font-mono text-slate-500">
                  {row.event_type === '*' ? 'all types' : row.event_type}
                </span>
                <span className="text-slate-600">·</span>
                <time
                  className="text-slate-500"
                  dateTime={row.detected_at}
                >
                  {new Date(row.detected_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-sm text-slate-300">
                {shortSummary(row.description)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
