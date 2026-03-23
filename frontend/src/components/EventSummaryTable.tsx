import type { MetricsResponse } from '../types/metrics'

interface Props {
  metrics: MetricsResponse
}

export function EventSummaryTable({ metrics }: Props) {
  const rows = metrics.last_hour.by_event_type

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Event type</th>
            <th className="px-4 py-3 text-right font-medium">Count (last hour)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={2}
                className="px-4 py-8 text-center text-slate-500"
              >
                No events in the last hour.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.event_type}
                className="border-b border-slate-800/80 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-4 py-3 font-mono text-slate-200">
                  {row.event_type}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
