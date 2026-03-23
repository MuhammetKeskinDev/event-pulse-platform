import { AlertTriangle } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

function rateColor(percent: number): string {
  if (percent > 5) {
    return '#ef4444'
  }
  if (percent >= 2) {
    return '#eab308'
  }
  return '#22c55e'
}

interface Props {
  /** System-wide error rate (all-time), percentage */
  percent: number
  totalEvents: number
  errorEvents: number
}

export function ErrorRateGauge({ percent, totalEvents, errorEvents }: Props) {
  const color = rateColor(percent)
  const rest = Math.max(0, 100 - percent)
  const pieData = [
    { name: 'errors', value: percent },
    { name: 'ok', value: rest },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[200px] w-full max-w-xs">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius="55%"
              outerRadius="90%"
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={color} />
              <Cell fill="#1e293b" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center">
          <span
            className="text-3xl font-semibold tabular-nums"
            style={{ color }}
          >
            {percent.toFixed(2)}%
          </span>
          <span className="mt-1 text-xs text-slate-500">All-time error rate</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
        {percent > 5 ? (
          <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
        ) : null}
        <span>
          {errorEvents.toLocaleString()} errors / {totalEvents.toLocaleString()}{' '}
          events
        </span>
      </div>
      <p className="mt-1 text-center text-xs text-slate-600">
        &gt;5% red · 2–5% amber · &lt;2% green
      </p>
    </div>
  )
}
