/** Deutsche Anzeigenamen für Status- und Prioritätswerte (Dashboard, Benachrichtigungen, Verlauf). */
export const STATUS_LABEL: Record<string, string> = {
  SUSPECT: 'Verdächtige Person', WITNESS: 'Zeuge', VICTIM: 'Opfer', PERSON_OF_INTEREST: 'Relevante Person',
  NEW: 'Neu', ACKNOWLEDGED: 'Bestätigt', ASSIGNED: 'Zugewiesen', EN_ROUTE: 'Anfahrt', ON_SCENE: 'Vor Ort', PROCESSING: 'In Bearbeitung', CLEARING: 'Abschluss', CLOSED: 'Geschlossen', CANCELLED: 'Abgebrochen',
  DRAFT: 'Entwurf', SUBMITTED: 'Eingereicht', UNDER_REVIEW: 'In Prüfung', APPROVED: 'Genehmigt', REJECTED: 'Abgelehnt', ARCHIVED: 'Archiviert',
  ISSUED: 'Ausgestellt', PAID: 'Bezahlt', VOID: 'Ungültig', ACTIVE: 'Aktiv', CLEARED: 'Erledigt', EXPIRED: 'Abgelaufen', OPEN: 'Offen', SUSPENDED: 'Ausgesetzt',
  RECEIVED: 'Eingegangen', SCREENING: 'Vorprüfung', INVESTIGATION: 'Ermittlung', REVIEW: 'Prüfung', RESOLVED: 'Gelöst',
  AVAILABLE: 'Verfügbar', BUSY: 'Beschäftigt', UNAVAILABLE: 'Nicht verfügbar', OFF_DUTY: 'Außer Dienst', ON_DUTY: 'Im Dienst', BREAK: 'Pause', TRAINING: 'Ausbildung', ADMINISTRATIVE: 'Verwaltung',
  COLLECTED: 'Sichergestellt', STORED: 'Eingelagert', TRANSFERRED: 'Übergeben', REVIEWED: 'Geprüft', RELEASED: 'Freigegeben',
  INTERVIEW: 'Gespräch', PENDING_DECISION: 'Entscheidung ausstehend', ACCEPTED: 'Angenommen', WITHDRAWN: 'Zurückgezogen', PENDING: 'Ausstehend', CONFIRMED: 'Bestätigt',
  ONLINE: 'Online', OFFLINE: 'Offline', UNKNOWN: 'Unbekannt', ERROR: 'Fehler',
  UNVERIFIED: 'Nicht verifiziert', VERIFIED: 'Verifiziert', FAILED: 'Fehlgeschlagen', MANUAL: 'Manuell',
  DENIED: 'Abgelehnt', ENDED: 'Beendet', CONNECTED: 'Verbunden', LIMITED: 'Eingeschränkt', DISABLED: 'Deaktiviert', CLAIMED: 'Übernommen',
  LOA: 'Abgemeldet', RESIGNED: 'Ausgetreten', TERMINATED: 'Entlassen', PROMOTION: 'Beförderung', AWARD: 'Auszeichnung', DISCIPLINE: 'Disziplinarmaßnahme', NOTE: 'Notiz',
  INCIDENT: 'Einsatz', PATROL: 'Streife', TRAFFIC: 'Verkehr', ARREST: 'Festnahme', CITATION: 'Verwarnung', COLLISION: 'Unfall', GENERAL: 'Allgemein',
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
/** Deutsche Anzeigenamen für Prioritäten. */
export const PRIORITY_LABEL: Record<string, string> = { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch', URGENT: 'Dringend', CRITICAL: 'Kritisch' };
