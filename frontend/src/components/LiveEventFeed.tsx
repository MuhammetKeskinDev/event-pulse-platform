import { Radio } from 'lucide-react'

import type { LiveEventRow } from '../types/dashboard'

interface Props {
  items: LiveEventRow[]
}

export function LiveEventFeed({ items }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-4 w-4 text-sky-400" aria-hidden />
        <h2 className="text-left text-sm font-medium text-slate-400">
          Live event feed
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No events in database yet.</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-left">
          {items.map((row) => (
            <li
              key={`${row.id}-${row.occurred_at}`}
              className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sky-300">{row.event_type}</span>
                {row.source ? (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-amber-200/90">
                      {row.source}
                    </span>
                  </>
                ) : null}
                <span className="text-slate-600">·</span>
                <time className="text-slate-500" dateTime={row.occurred_at}>
                  {new Date(row.occurred_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-600">
                {row.id}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
