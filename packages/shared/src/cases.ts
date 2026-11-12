/**
 * Intelligente Vorgangsverknüpfung: ein Vorgang (eindeutige Vorgangsnummer) bündelt Datensätze aus den bestehenden Modulen.
 * Verknüpft wird nur ausdrücklich (durch eine berechtigte Person) – nie automatisch über ähnliche Namen.
 */
export const CASE_LINK_TYPES = ['INCIDENT', 'CALL', 'REPORT', 'WANTED', 'PERSON', 'VEHICLE', 'TICKET', 'COMPLAINT', 'UNIT', 'OFFICER', 'HR_REQUEST', 'PERSONNEL_RECORD'] as const;
export type CaseLinkType = (typeof CASE_LINK_TYPES)[number];
export const CASE_LINK_LABEL: Record<CaseLinkType, string> = {
  INCIDENT: 'CAD-Einsatz', CALL: 'Notruf', REPORT: 'Einsatzbericht', WANTED: 'Fahndung', PERSON: 'Beteiligte Person', VEHICLE: 'Fahrzeug', TICKET: 'Bußgeld (MDT)',
  COMPLAINT: 'Beschwerde', UNIT: 'Einheit', OFFICER: 'Beamter', HR_REQUEST: 'Personalvorgang (Beförderung/Versetzung)', PERSONNEL_RECORD: 'Personalakten-Eintrag',
};
/** Recht, das zum Ansehen der Details eines verknüpften Datensatzes nötig ist (ohne Recht: nur „Verknüpfung vorhanden“). */
export const CASE_LINK_VIEW_PERMISSION: Record<CaseLinkType, string> = {
  INCIDENT: 'cad.view', CALL: 'cad.view', REPORT: 'reports.view', WANTED: 'wanted.view', PERSON: 'persons.view', VEHICLE: 'vehicles.view', TICKET: 'tickets.view',
  COMPLAINT: 'complaints.view', UNIT: 'cad.view', OFFICER: 'personnel.view', HR_REQUEST: 'personnel.view_sensitive', PERSONNEL_RECORD: 'personnel.view_sensitive',
};
/** Rolle eines Datensatzes im Vorgang (frei wählbar, Vorschläge). */
export const CASE_LINK_ROLES = ['BETEILIGT', 'TATVERDÄCHTIG', 'ZEUGE', 'GESCHÄDIGT', 'EINGESETZT', 'BEZUG'] as const;
export const CASE_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', CLOSED: 'Abgeschlossen' };

/** Ähnlichkeit zweier Titel (Jaccard über Wörter ab 3 Zeichen) – nur für VORSCHLÄGE, nie für automatisches Zusammenführen. */
export function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9äöüß]+/).filter((w) => w.length >= 3));
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / (x.size + y.size - inter);
}
