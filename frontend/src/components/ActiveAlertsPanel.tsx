import { BellRing, Trash2 } from 'lucide-react'

import type { ActiveAlertRow } from '../types/active-alert'

interface Props {
  items: ActiveAlertRow[]
  onClear: () => void
  onOpenEventId?: (id: string) => void
}

export function ActiveAlertsPanel({
  items,
  onClear,
  onOpenEventId,
}: Props) {
  return (
    <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-6 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-left text-sm font-medium text-amber-100/90">
            Active alerts
          </h2>
          <span className="text-xs text-amber-200/50">(FR-04 / rule engine)</span>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-800/60 px-2 py-1 text-xs text-amber-200/90 hover:bg-amber-900/30"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-left text-xs text-amber-200/40">
        Kural tetiklendiğinde WebSocket üzerinden buraya düşer; aynı olay için toast
        da gösterilir. Olay ID&apos;sine tıklayarak detay modalını açın.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-amber-200/30">
          Henüz tetiklenmiş kural uyarısı yok.
        </p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1 text-left">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-amber-900/35 bg-slate-950/40 px-3 py-2 text-xs text-amber-50/90"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold uppercase tracking-wide text-amber-400/90">
                  {row.severity}
                </span>
                <span className="text-amber-200/50">·</span>
                <span className="font-medium text-slate-200">{row.rule_name}</span>
                {row.event_type ? (
                  <>
                    <span className="text-amber-200/50">·</span>
                    <span className="font-mono text-slate-400">{row.event_type}</span>
                  </>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 font-mono text-[10px] text-slate-500">
                {row.message}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <time dateTime={row.received_at}>
                  {new Date(row.received_at).toLocaleString()}
                </time>
                {row.event_id.length > 0 && onOpenEventId ? (
                  <button
                    type="button"
                    className="font-mono text-sky-400 underline decoration-sky-500/40 hover:text-sky-300"
                    onClick={() => onOpenEventId(row.event_id)}
                  >
                    event {row.event_id.slice(0, 8)}…
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
