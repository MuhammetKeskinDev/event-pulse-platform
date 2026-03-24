import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import { parseExemplarEventId } from '../lib/anomaly-description'
import type { AnomalyRow } from '../types/anomaly'

interface Props {
  items: AnomalyRow[]
  onViewEventId?: (id: string) => void
}

type ScatterTooltipDatum = {
  x?: number
  severity?: string
  event_type?: string
  exemplar_event_id?: string | null
}

/** Scatter + ZAxis için Recharts her eksen (X/Y/Z) ayrı tooltip satırı üretir; tek blok gösteriyoruz. */
function AnomalyScatterTooltipContent({
  active,
  payload,
  label,
  contentStyle,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ScatterTooltipDatum }>
  label?: string | number
  contentStyle?: CSSProperties
}) {
  if (!active || !payload?.length) {
    return null
  }
  const datum = payload[0]?.payload
  if (!datum) {
    return null
  }
  const timeMs =
    typeof label === 'number'
      ? label
      : typeof datum.x === 'number'
        ? datum.x
        : NaN
  const timeStr = Number.isFinite(timeMs)
    ? new Date(timeMs).toLocaleString()
    : '—'
  const parts = [
    `severity: ${datum.severity ?? ''}`,
    `event_type: ${datum.event_type ?? ''}`,
  ]
  if (datum.exemplar_event_id) {
    parts.push('linked event: click for detail')
  }
  return (
    <div
      className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-rose-100"
      style={{
        background: '#0f172a',
        ...contentStyle,
      }}
    >
      <p className="mb-1 font-medium text-slate-300">{timeStr}</p>
      <p>{parts.join(' · ')}</p>
    </div>
  )
}

function severityRank(s: string): number {
  const x = s.toLowerCase()
  if (x === 'critical') {
    return 4
  }
  if (x === 'high') {
    return 3
  }
  if (x === 'medium') {
    return 2
  }
  if (x === 'low') {
    return 1
  }
  return 2
}

export function AnomalyTimelineChart({ items, onViewEventId }: Props) {
  const data = useMemo(
    () =>
      items.map((a) => ({
        id: a.id,
        x: new Date(a.detected_at).getTime(),
        y: severityRank(a.severity),
        severity: a.severity,
        event_type: a.event_type,
        exemplar_event_id: parseExemplarEventId(a.description),
      })),
    [items],
  )

  if (data.length === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20">
      <h2 className="mb-1 text-left text-sm font-medium text-slate-400">
        Anomaly timeline
      </h2>
      <p className="mb-4 text-left text-xs text-slate-600">
        Severity vs detection time (Y: low→critical).
        {onViewEventId
          ? ' Click a point to open the related sample event in the detail modal when available.'
          : null}
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v) =>
                new Date(v).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
              tick={{ fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0.5, 4.5]}
              ticks={[1, 2, 3, 4]}
              tickFormatter={(v) =>
                ({ 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' } as Record<
                  number,
                  string
                >)[v as number] ?? String(v)
              }
              tick={{ fill: '#94a3b8', fontSize: 10 }}
            />
            <ZAxis type="number" dataKey="y" range={[60, 120]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                padding: 0,
              }}
              content={AnomalyScatterTooltipContent}
            />
            <Scatter
              data={data}
              fill="#fb7185"
              isAnimationActive={false}
              className={
                onViewEventId
                  ? '[&_.recharts-scatter-symbol]:cursor-pointer'
                  : undefined
              }
              onClick={
                onViewEventId
                  ? (dot) => {
                      const p = dot as {
                        exemplar_event_id?: string | null
                        payload?: { exemplar_event_id?: string | null }
                      }
                      const eid =
                        typeof p.exemplar_event_id === 'string'
                          ? p.exemplar_event_id
                          : typeof p.payload?.exemplar_event_id === 'string'
                            ? p.payload.exemplar_event_id
                            : null
                      if (eid && eid.length > 0) {
                        onViewEventId(eid)
                      }
                    }
                  : undefined
              }
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
