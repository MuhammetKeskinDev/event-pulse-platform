import { useMemo } from 'react'
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

import type { AnomalyRow } from '../types/anomaly'

interface Props {
  items: AnomalyRow[]
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

export function AnomalyTimelineChart({ items }: Props) {
  const data = useMemo(
    () =>
      items.map((a) => ({
        id: a.id,
        x: new Date(a.detected_at).getTime(),
        y: severityRank(a.severity),
        severity: a.severity,
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
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
              }}
              formatter={(_v, _n, props) => {
                const p = props?.payload as { severity?: string } | undefined
                return [p?.severity ?? '', 'severity']
              }}
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
            />
            <Scatter data={data} fill="#fb7185" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
