const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export function buildEventsExportUrl(
  format: 'csv' | 'pdf',
  fromIso: string,
  toIso: string,
  opts: { eventType?: string; source?: string; limit?: number },
): string {
  const p = new URLSearchParams({
    format,
    from: fromIso,
    to: toIso,
  })
  if (opts.eventType !== undefined && opts.eventType.length > 0) {
    p.set('event_type', opts.eventType)
  }
  if (opts.source !== undefined && opts.source.length > 0) {
    p.set('source', opts.source)
  }
  if (opts.limit !== undefined) {
    p.set('limit', String(opts.limit))
  }
  return `${API_BASE}/api/v1/events/export?${p.toString()}`
}
