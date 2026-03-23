import { useMemo, useState } from 'react'

import type { MetricsResponse } from '../types/metrics'

interface Props {
  metrics: MetricsResponse
}

type SortKey = 'event_type' | 'count'

export function EventSummaryTable({ metrics }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    const r = [...metrics.last_hour.by_event_type]
    r.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'count') {
        return (a.count - b.count) * mul
      }
      return a.event_type.localeCompare(b.event_type) * mul
    })
    return r
  }, [metrics.last_hour.by_event_type, sortKey, sortDir])

  const toggle = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'count' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">
              <button
                type="button"
                className="hover:text-slate-300"
                onClick={() => toggle('event_type')}
              >
                Event type
                {sortKey === 'event_type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </th>
            <th className="px-4 py-3 text-right font-medium">
              <button
                type="button"
                className="hover:text-slate-300"
                onClick={() => toggle('count')}
              >
                Count (time window)
                {sortKey === 'count' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={2}
                className="px-4 py-8 text-center text-slate-500"
              >
                No events in this time window.
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
