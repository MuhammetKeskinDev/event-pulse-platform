import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ThroughputBucket } from '../types/dashboard'

const PALETTE = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#c084fc',
  '#f472b6',
]

interface Props {
  buckets: ThroughputBucket[]
}

function eventTypesFromBuckets(buckets: ThroughputBucket[]): string[] {
  const s = new Set<string>()
  for (const b of buckets) {
    for (const k of Object.keys(b.counts)) {
      s.add(k)
    }
  }
  return [...s].sort()
}

export function MultiSeriesThroughputChart({ buckets }: Props) {
  const types = useMemo(() => eventTypesFromBuckets(buckets), [buckets])
  const data = useMemo(() => {
    return buckets.map((b) => {
      const row: Record<string, string | number> = {
        key: b.bucket_start,
        timeLabel: new Date(b.bucket_start).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      for (const t of types) {
        row[t] = b.counts[t] ?? 0
      }
      return row
    })
  }, [buckets, types])

  if (buckets.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 text-sm text-slate-500">
        No bucketed data yet — ingest events and wait for the next 5-minute bucket.
      </div>
    )
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis
            dataKey="timeLabel"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {types.map((t, i) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              name={t}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
