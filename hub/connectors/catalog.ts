export type ConnectorName = 'local-schedule' | 'gmail' | 'google-calendar' | 'local-documents' | 'system-notifications' | 'web-research'
export type ConnectorEntry = {
  id: ConnectorName, name: string, status: 'available' | 'prepared' | 'planned', operations: readonly string[],
  authorization: string, unavailable: string | null
}
export const connectors: readonly ConnectorEntry[] = [
  { id: 'local-schedule', name: 'Lokale Planung', status: 'available', operations: ['read_schedule', 'propose_slot', 'propose_reminder'],
    authorization: 'Bestätigter Testauftrag und Freigabe der konkreten lokalen Aktion', unavailable: null },
  { id: 'gmail', name: 'Gmail', status: 'prepared', operations: ['read_inbox_metadata'],
    authorization: 'Separate Google-Zustimmung für Mail-Metadaten', unavailable: null },
  { id: 'google-calendar', name: 'Google Calendar', status: 'prepared', operations: ['read_primary_calendar_window'],
    authorization: 'Separate Google-Zustimmung für Kalender-Lesezugriff', unavailable: null },
  { id: 'local-documents', name: 'Lokale Textquellen', status: 'available', operations: ['read_selected_text_source'],
    authorization: 'Fiktive UTF-8-Textdatei bis 8 KB, eigenständige Analysefreigabe und Freigabe lokaler Änderungen', unavailable: null },
  { id: 'system-notifications', name: 'macOS-Benachrichtigungen', status: 'planned', operations: ['deliver_scheduled_notice'],
    authorization: 'Lokale Systemberechtigung und bestätigte Erinnerung', unavailable: 'Erinnerungen werden derzeit in LifePilot angezeigt' },
  { id: 'web-research', name: 'Webrecherche', status: 'planned', operations: ['search', 'read_approved_source'],
    authorization: 'Freigegebene Quellen und getrennte Netzwerkregeln', unavailable: 'Quellen- und Netzwerkprüfung ausstehend' },
]
