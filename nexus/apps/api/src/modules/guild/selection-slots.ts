/**
 * Konfigurierbare Auswahl-Felder („Slots“): Der Administrator wählt Rollen/Kanäle aus Discord aus,
 * gespeichert wird die ID unter dem Slot-Schlüssel. Weitere Module (Panels, Shifts, Büro-Warteraum …)
 * ergänzen hier ihre Slots.
 */
export type SlotKind = 'role' | 'text' | 'voice' | 'category';

export interface SelectionSlot {
  key: string;
  kind: SlotKind;
  label: string;
  description: string;
  /** Rolle muss vom Bot verwaltbar sein (weil der Bot sie vergibt). */
  requiresManageable?: boolean;
}

export const SELECTION_SLOTS: readonly SelectionSlot[] = [
  {
    key: 'log-channel',
    kind: 'text',
    label: 'Log-Kanal',
    description: 'Hier schreibt der Bot Protokoll-Meldungen.',
  },
  {
    key: 'application-review-channel',
    kind: 'text',
    label: 'Bewerbungs-Eingang',
    description: 'Hier erscheinen neue Bewerbungen für das Team (mit Annehmen/Ablehnen).',
  },
  {
    key: 'application-category',
    kind: 'category',
    label: 'Bewerbungs-Kategorie',
    description: 'Kategorie für Bewerbungs-Kanäle.',
  },
  {
    key: 'application-review-role',
    kind: 'role',
    label: 'Bewerbungsteam-Rolle',
    description: 'Rolle, die Bewerbungen bearbeitet.',
  },
  {
    key: 'application-accepted-role',
    kind: 'role',
    label: 'Rolle bei Annahme',
    description: 'Wird angenommenen Bewerbern vom Bot vergeben.',
    requiresManageable: true,
  },
  {
    key: 'office-waiting-voice',
    kind: 'voice',
    label: 'Büro-Warteraum',
    description: 'Voice-Channel, der als Warteraum gilt.',
  },
  {
    key: 'shift-alert-channel',
    kind: 'text',
    label: 'Schicht-Hinweise',
    description: 'Hier meldet der Bot Schichten, die ungewöhnlich lange laufen (vergessenes Dienstende).',
  },
  {
    key: 'danger-channel',
    kind: 'text',
    label: 'Gefahrenstatus-Kanal',
    description: 'Hier hält der Bot die aktuelle Gefahrenstufe als Statusmeldung aktuell.',
  },
  {
    key: 'ticket-log-channel',
    kind: 'text',
    label: 'Ticket-Protokoll',
    description: 'Hier erscheint eine Zusammenfassung jedes geschlossenen Tickets.',
  },
  {
    key: 'absence-channel',
    kind: 'text',
    label: 'Abmeldungen',
    description: 'Hier meldet der Bot neue Abmeldungs-Anträge für die Führung.',
  },
  {
    key: 'report-channel',
    kind: 'text',
    label: 'Berichte',
    description: 'Hier veröffentlicht der Bot Tages- und Wochenberichte.',
  },
];

export const getSlot = (key: string): SelectionSlot | undefined =>
  SELECTION_SLOTS.find((s) => s.key === key);
