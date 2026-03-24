import { useState } from 'react'
import { ChevronDown, ChevronRight, Radio } from 'lucide-react'

import type { LiveEventRow } from '../types/dashboard'

interface Props {
  items: LiveEventRow[]
  onSelectEventId?: (id: string) => void
}

export function LiveEventFeed({ items, onSelectEventId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          {items.map((row) => {
            const open = expandedId === row.id
            return (
            <li
              key={`${row.id}-${row.occurred_at}`}
              className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center text-slate-500 hover:text-slate-300"
                  aria-expanded={open}
                  aria-label={open ? 'Collapse payload' : 'Expand payload'}
                  onClick={() =>
                    setExpandedId((cur) => (cur === row.id ? null : row.id))
                  }
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
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
              <p className="mt-1 font-mono text-[10px] text-slate-600">
                {onSelectEventId ? (
                  <button
                    type="button"
                    className="truncate text-left text-sky-400 underline decoration-sky-400/40 hover:text-sky-300"
                    onClick={() => onSelectEventId(row.id)}
                  >
                    {row.id}
                  </button>
                ) : (
                  <span className="truncate">{row.id}</span>
                )}
              </p>
              {open ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-left font-mono text-[10px] text-slate-400">
                  {JSON.stringify(row.payload, null, 2)}
                </pre>
              ) : null}
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
