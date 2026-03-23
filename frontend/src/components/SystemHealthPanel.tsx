import { Activity, Database, Layers, Server } from 'lucide-react'

import type { PipelineHealth } from '../types/dashboard'

interface Props {
  health: PipelineHealth | null
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-500'}`}
      aria-hidden
    />
  )
}

export function SystemHealthPanel({ health }: Props) {
  if (!health) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Pipeline health unavailable.
      </div>
    )
  }

  const cards = [
    {
      label: 'API / Postgres',
      ok: health.ok,
      detail: `${health.db_latency_ms} ms`,
      icon: Database,
    },
    {
      label: 'Redis stream',
      ok: health.redis,
      detail: `${health.stream_length} messages`,
      icon: Layers,
    },
    {
      label: 'Pending (group)',
      ok: health.pending_messages < 10_000,
      detail: `${health.pending_messages} pending`,
      icon: Server,
    },
    {
      label: 'DLQ',
      ok: health.dlq_length === 0,
      detail: `${health.dlq_length} in DLQ`,
      icon: Activity,
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
      <h2 className="mb-4 text-left text-sm font-medium text-slate-400">
        System health
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, ok, detail, icon: Icon }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-3"
          >
            <Icon className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden />
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Dot ok={ok} />
                {label}
              </div>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-left text-xs text-slate-600">
        Checked {new Date(health.checked_at).toLocaleTimeString()} ·{' '}
        <span className="font-mono">{health.stream}</span>
      </p>
    </div>
  )
}
