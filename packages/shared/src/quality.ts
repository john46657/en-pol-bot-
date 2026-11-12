import { z } from 'zod';

/**
 * Automatischer Qualitätsprüfer für Berichte, Fahndungen und Einsätze. Reine Regeln ohne Datenbank: der Server lädt die
 * Datensätze und übergibt sie hier. Die Regeln melden nur, was fehlt oder sich widerspricht – sie ergänzen nie Inhalte und
 * ändern nichts. Korrigieren muss immer ein Mensch.
 */
export const QUALITY_TARGETS = ['REPORT', 'WANTED', 'INCIDENT'] as const;
export type QualityTarget = (typeof QUALITY_TARGETS)[number];
export const QUALITY_TARGET_LABEL: Record<QualityTarget, string> = { REPORT: 'Bericht', WANTED: 'Fahndung', INCIDENT: 'Einsatz' };

export interface QualityFinding {
  /** stabiler Schlüssel der Regel (für Ausnahmen), z. B. `report.incident_missing` */
  code: string;
  level: 'ERROR' | 'WARNING';
  /** betroffenes Feld (für die Markierung im Formular) */
  field: string;
  message: string;
  /** konkreter Korrekturhinweis */
  hint: string;
}

export const qualityConfigSchema = z.object({
  /** Bericht erst einreichen, wenn keine Fehler (ohne dokumentierte Ausnahme) offen sind */
  enforceReportSubmit: z.boolean().default(false),
  /** Einsatz erst abschließen, wenn keine Fehler (ohne dokumentierte Ausnahme) offen sind */
  enforceIncidentClose: z.boolean().default(false),
  /** Mindestlänge des Berichtstexts (Zeichen) – kürzer = Warnung */
  reportMinLength: z.number().int().min(0).max(5000).default(80),
  /** Berichtsarten, die eine Einsatznummer brauchen */
  reportTypesRequiringIncident: z.array(z.string().max(32)).max(20).default(['INCIDENT', 'ARREST', 'TRAFFIC', 'COLLISION']),
  /** Mindestlänge der Fahndungsbeschreibung (Zeichen) – kürzer = Warnung */
  wantedMinDescription: z.number().int().min(0).max(2000).default(30),
  /** Abgeschlossener Einsatz ohne Bericht: aus, Warnung oder Fehler */
  incidentReportRequired: z.enum(['OFF', 'WARNING', 'ERROR']).default('WARNING'),
  /** Entwurf gilt nach so vielen Stunden als liegen geblieben (0 = aus) */
  staleDraftHours: z.number().int().min(0).max(24 * 30).default(48),
  /** Offener Einsatz ohne Änderung nach so vielen Stunden (0 = aus) */
  staleIncidentHours: z.number().int().min(0).max(24 * 30).default(6),
});
export type QualityConfig = z.infer<typeof qualityConfigSchema>;

const f = (level: QualityFinding['level'], code: string, field: string, message: string, hint: string): QualityFinding => ({ code, level, field, message, hint });
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
/** Platzhalter, die beim Schreiben stehen geblieben sind. */
const PLACEHOLDER = (t: string) => /\bTODO\b|\bXXX\b|\?\?\?|\[\s*\.{3}\s*\]/.test(t) || /<\s*(name|ort|datum|uhrzeit|zeit)\s*>|\blorem ipsum\b/i.test(t);
/** Uhrzeit-Spanne im Text, z. B. „14:30 – 13:10“ oder „von 14:30 bis 13:10“. */
const TIME_SPAN = /(?:von\s+)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uhr\s*)?(?:-|–|bis)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi;

/** Uhrzeit-Spannen, deren Ende vor dem Beginn liegt (mögliche Verwechslung – oder über Mitternacht). */
export function contradictoryTimeSpans(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TIME_SPAN)) {
    const start = Number(m[1]) * 60 + Number(m[2]), end = Number(m[3]) * 60 + Number(m[4]);
    // Über Mitternacht (z. B. 23:40 – 00:20) ist plausibel: nur kurze Rücksprünge am Tag gelten als Widerspruch
    if (end < start && start - end < 12 * 60) out.push(m[0].trim());
  }
  return out;
}

/** Einsatznummern im Text (Präfix-Jahr-Nummer, z. B. E-2026-00421). */
export const incidentNumbersIn = (text: string, prefix = '[A-Z]{1,4}') => [...new Set([...text.matchAll(new RegExp(`\\b${prefix}-20\\d{2}-\\d{3,6}\\b`, 'g'))].map((m) => m[0]))];

export interface ReportInput {
  type: string; title: string; body: string; status: string; createdAt: Date; updatedAt: Date;
  incidentId: string | null;
  /** verknüpfter Einsatz; `null` = Verknüpfung zeigt ins Leere (gelöscht, anderer Server) */
  incident: { number: string; createdAt: Date; closedAt: Date | null } | null;
  /** im Text genannte Einsatznummern, die es nicht gibt */
  unknownNumbers: string[];
}
export function checkReport(r: ReportInput, cfg: QualityConfig, now = new Date()): QualityFinding[] {
  const out: QualityFinding[] = [];
  const body = r.body.trim();
  if (r.title.trim().length < 5) out.push(f('ERROR', 'report.title', 'title', 'Titel fehlt oder ist zu kurz.', 'Einen aussagekräftigen Titel mit mindestens 5 Zeichen eintragen (z. B. „Festnahme nach Ladendiebstahl, Postal 210“).'));
  if (!body) out.push(f('ERROR', 'report.body_missing', 'body', 'Der Berichtstext fehlt.', 'Sachverhalt, beteiligte Personen, Maßnahmen und Ergebnis im Berichtstext beschreiben.'));
  else if (body.length < cfg.reportMinLength) out.push(f('WARNING', 'report.body_short', 'body', `Der Berichtstext ist sehr kurz (${body.length} von empfohlen ${cfg.reportMinLength} Zeichen).`, 'Prüfen, ob Sachverhalt, Maßnahmen und Ergebnis vollständig beschrieben sind.'));
  if (body && PLACEHOLDER(body)) out.push(f('WARNING', 'report.placeholder', 'body', 'Im Text stehen noch Platzhalter (z. B. TODO, ???, <Name>).', 'Platzhalter durch die tatsächlichen Angaben ersetzen oder entfernen.'));
  if (cfg.reportTypesRequiringIncident.includes(r.type) && !r.incidentId) out.push(f('ERROR', 'report.incident_missing', 'incidentId', 'Die Einsatznummer fehlt – diese Berichtsart gehört zu einem Einsatz.', 'Den zugehörigen CAD-Einsatz verknüpfen. Gab es keinen Einsatz, eine begründete Ausnahme dokumentieren.'));
  if (r.incidentId && !r.incident) out.push(f('ERROR', 'report.incident_invalid', 'incidentId', 'Der verknüpfte Einsatz existiert nicht (mehr).', 'Die Verknüpfung prüfen und den richtigen Einsatz auswählen.'));
  for (const n of r.unknownNumbers) out.push(f('WARNING', 'report.unknown_number', 'body', `Im Text wird die Einsatznummer ${n} genannt, die es nicht gibt.`, 'Nummer auf Tippfehler prüfen. Ältere, schon gelöschte Einsätze können ebenfalls betroffen sein.'));
  for (const span of contradictoryTimeSpans(body)) out.push(f('WARNING', 'report.time_span', 'body', `Zeitangabe „${span}“: das Ende liegt vor dem Beginn.`, 'Uhrzeiten prüfen. Lief der Vorgang über Mitternacht, kann die Warnung ignoriert oder als Ausnahme dokumentiert werden.'));
  if (r.incident && r.createdAt.getTime() + 5 * 60_000 < r.incident.createdAt.getTime()) out.push(f('WARNING', 'report.before_incident', 'incidentId', `Der Bericht wurde vor dem Einsatz ${r.incident.number} angelegt.`, 'Prüfen, ob der richtige Einsatz verknüpft ist.'));
  if (cfg.staleDraftHours > 0 && r.status === 'DRAFT' && hours(r.updatedAt, now) >= cfg.staleDraftHours) out.push(f('WARNING', 'report.stale_draft', 'status', `Entwurf seit ${Math.floor(hours(r.updatedAt, now))} Stunden nicht eingereicht.`, 'Bericht vervollständigen und einreichen.'));
  if (r.status === 'REJECTED') out.push(f('WARNING', 'report.rejected_open', 'status', 'Der Bericht wurde abgelehnt und noch nicht überarbeitet.', 'Ablehnungsgrund im Verlauf lesen, Bericht überarbeiten und erneut einreichen.'));
  return out;
}

export interface WantedInput {
  reason: string; description: string | null; priority: string; status: string; createdAt: Date; expiresAt: Date | null;
  personId: string | null; vehicleId: string | null;
  /** verknüpfte Person; `null` = Verknüpfung zeigt ins Leere */
  person: { robloxUserId: string | null } | null;
  vehicle: { plate: string } | null;
}
export function checkWanted(w: WantedInput, cfg: QualityConfig, now = new Date()): QualityFinding[] {
  const out: QualityFinding[] = [];
  const desc = (w.description ?? '').trim();
  if (!w.personId && !w.vehicleId) out.push(f('ERROR', 'wanted.subject_missing', 'personId', 'Weder eine Person noch ein Fahrzeug ist verknüpft.', 'Die gesuchte Person bzw. das Fahrzeug aus der Akte verknüpfen.'));
  if (w.personId && !w.person) out.push(f('ERROR', 'wanted.person_invalid', 'personId', 'Die verknüpfte Person existiert nicht (mehr).', 'Die richtige Personenakte verknüpfen.'));
  if (w.vehicleId && !w.vehicle) out.push(f('ERROR', 'wanted.vehicle_invalid', 'vehicleId', 'Das verknüpfte Fahrzeug existiert nicht (mehr).', 'Das richtige Fahrzeug verknüpfen.'));
  if (w.reason.trim().length < 3) out.push(f('ERROR', 'wanted.reason', 'reason', 'Der Fahndungsgrund fehlt.', 'Den Tatvorwurf bzw. Grund der Fahndung angeben.'));
  if (!desc) out.push(f('ERROR', 'wanted.description_missing', 'description', 'Die Fahndungsbeschreibung fehlt.', 'Beschreibung ergänzen: Aussehen/Kleidung, Fahrzeug, zuletzt gesehen (Ort, Zeit), Gefährlichkeit.'));
  else if (desc.length < cfg.wantedMinDescription) out.push(f('WARNING', 'wanted.description_short', 'description', `Die Fahndungsbeschreibung ist unvollständig (${desc.length} von empfohlen ${cfg.wantedMinDescription} Zeichen).`, 'Merkmale ergänzen, an denen Kolleginnen und Kollegen die gesuchte Person bzw. das Fahrzeug erkennen.'));
  if (w.person && !w.person.robloxUserId) out.push(f('WARNING', 'wanted.no_roblox_id', 'personId', 'Die Person hat keine Roblox-ID – der ER:LC-Abgleich kann nur unsichere Namenstreffer melden.', 'Roblox-ID in der Personenakte nachtragen, sobald sie bekannt ist.'));
  if (w.expiresAt && w.expiresAt.getTime() < w.createdAt.getTime()) out.push(f('ERROR', 'wanted.expiry_before_start', 'expiresAt', 'Das Ablaufdatum liegt vor dem Erstellungsdatum.', 'Ablaufdatum korrigieren.'));
  else if (w.expiresAt && w.status === 'ACTIVE' && w.expiresAt < now) out.push(f('WARNING', 'wanted.expired_active', 'expiresAt', 'Die Fahndung ist abgelaufen, steht aber noch auf aktiv.', 'Fahndung verlängern oder erledigen.'));
  return out;
}

export interface IncidentInput {
  number: string | null; title: string; description: string | null; location: string | null; type: string | null; priority: string; status: string;
  closed: boolean; createdAt: Date; updatedAt: Date; closedAt: Date | null; mapX: number | null; mapZ: number | null;
  /** Einheiten, die je zugewiesen waren */
  unitsEver: number;
  /** Berichte, die auf den Einsatz verweisen */
  reports: number;
}
export function checkIncident(i: IncidentInput, cfg: QualityConfig, now = new Date()): QualityFinding[] {
  const out: QualityFinding[] = [];
  if (!i.number) out.push(f('ERROR', 'incident.number', 'number', 'Der Einsatz hat keine Einsatznummer.', 'Systemfehler melden – Einsatznummern werden automatisch vergeben.'));
  if (i.title.trim().length < 3) out.push(f('ERROR', 'incident.title', 'title', 'Das Einsatzstichwort/der Titel fehlt.', 'Kurzbeschreibung eintragen.'));
  if (!i.location?.trim() && (i.mapX === null || i.mapZ === null)) out.push(f(i.closed ? 'ERROR' : 'WARNING', 'incident.location', 'location', 'Kein Einsatzort angegeben.', 'Ort (Straße/Postal) eintragen oder die Position auf der Karte setzen.'));
  if (!i.type) out.push(f('WARNING', 'incident.type', 'type', 'Keine Einsatzart gewählt.', 'Passende Einsatzart wählen (für Statistik und Kartenfilter).'));
  if (i.closed && !i.description?.trim()) out.push(f('WARNING', 'incident.description', 'description', 'Der abgeschlossene Einsatz hat keine Beschreibung.', 'Kurz festhalten, was vorgefallen ist und wie der Einsatz endete.'));
  if (i.closedAt && i.closedAt.getTime() < i.createdAt.getTime()) out.push(f('ERROR', 'incident.closed_before_created', 'closedAt', 'Die Abschlusszeit liegt vor der Anlagezeit.', 'Zeitangaben prüfen (Systemuhr, nachträgliche Änderungen).'));
  if (i.closed && i.unitsEver === 0) out.push(f('WARNING', 'incident.no_units', 'units', 'Dem Einsatz war nie eine Einheit zugewiesen.', 'Eingesetzte Einheit nachtragen oder dokumentieren, warum keine ausrückte.'));
  if (i.closed && i.reports === 0 && cfg.incidentReportRequired !== 'OFF') out.push(f(cfg.incidentReportRequired, 'incident.report_missing', 'reports', 'Zum abgeschlossenen Einsatz gibt es keinen Bericht.', 'Einsatzbericht schreiben und mit dem Einsatz verknüpfen.'));
  if (!i.closed && cfg.staleIncidentHours > 0 && hours(i.updatedAt, now) >= cfg.staleIncidentHours) out.push(f('WARNING', 'incident.stale', 'status', `Offener Einsatz seit ${Math.floor(hours(i.updatedAt, now))} Stunden ohne Änderung.`, 'Status aktualisieren oder Einsatz abschließen.'));
  return out;
}

/** Ergebnis mit dokumentierten Ausnahmen: Fehler mit Ausnahme blockieren nicht mehr, bleiben aber sichtbar. */
export function splitFindings<E extends { code: string }>(findings: QualityFinding[], exceptions: E[]) {
  const ex = new Map(exceptions.map((e) => [e.code, e]));
  const open = findings.filter((x) => !ex.has(x.code));
  return {
    errors: open.filter((x) => x.level === 'ERROR'),
    warnings: open.filter((x) => x.level === 'WARNING'),
    excepted: findings.filter((x) => ex.has(x.code)).map((x) => ({ ...x, exception: ex.get(x.code)! })),
    ok: !open.some((x) => x.level === 'ERROR'),
  };
}
