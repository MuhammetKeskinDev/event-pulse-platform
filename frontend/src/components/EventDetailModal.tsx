import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export type EventDetailPayload = {
  id: string
  event_type: string
  occurred_at: string
  payload: unknown
  source?: string
  metadata?: unknown
}

interface Props {
  eventId: string | null
  onClose: () => void
}

export function EventDetailModal({ eventId, onClose }: Props) {
  const [data, setData] = useState<EventDetailPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (eventId === null) {
      setData(null)
      setErr(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErr(null)
    void fetch(`${API_BASE}/api/v1/events/${eventId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) {
          return
        }
        if (!res.ok) {
          if (res.status === 404) {
            setErr('Event not found')
          } else {
            setErr(`HTTP ${res.status}`)
          }
          setData(null)
          return
        }
        const body = (await res.json()) as EventDetailPayload
        setData(body)
      })
      .catch(() => {
        if (!cancelled) {
          setErr('Request failed')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (eventId === null) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-detail-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2
            id="event-detail-title"
            className="text-sm font-semibold text-slate-100"
          >
            Event detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-3.5rem)] overflow-auto p-4 text-left text-sm">
          {loading ? (
            <p className="text-slate-500">Loading…</p>
          ) : err ? (
            <p className="text-rose-400">{err}</p>
          ) : data ? (
            <div className="space-y-3 font-mono text-xs text-slate-300">
              <p>
                <span className="text-slate-500">id</span> {data.id}
              </p>
              <p>
                <span className="text-slate-500">event_type</span>{' '}
                {data.event_type}
              </p>
              <p>
                <span className="text-slate-500">occurred_at</span>{' '}
                {data.occurred_at}
              </p>
              {data.source !== undefined ? (
                <p>
                  <span className="text-slate-500">source</span> {data.source}
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-slate-500">metadata</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900/80 p-3 text-[11px] text-slate-400">
                  {JSON.stringify(data.metadata ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-slate-500">payload</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900/80 p-3 text-[11px] text-slate-400">
                  {JSON.stringify(data.payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
