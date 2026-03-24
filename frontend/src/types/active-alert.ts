/** Kural motoru WS `rule_triggered` ile gelen satır (Active Alerts paneli). */
export interface ActiveAlertRow {
  id: string
  rule_id: string
  rule_name: string
  severity: string
  message: string
  event_id: string
  event_type?: string
  received_at: string
}
