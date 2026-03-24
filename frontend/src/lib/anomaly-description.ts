/** Anomali `description` JSON içinden örnek olay kimliği (modal / detay için). */
export function parseExemplarEventId(description: string): string | null {
  try {
    const o = JSON.parse(description) as { exemplar_event_id?: string }
    return typeof o.exemplar_event_id === 'string' &&
      o.exemplar_event_id.length > 0
      ? o.exemplar_event_id
      : null
  } catch {
    return null
  }
}
