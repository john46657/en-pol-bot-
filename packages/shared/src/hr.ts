import { z } from 'zod';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const key = z.string().regex(/^[A-Z0-9_]{1,32}$/, 'Schlüssel: A–Z, 0–9, _');
const uuid = z.string().uuid();

// ───────────── Personal-Einstellungen (Administration → Personal) ─────────────

export const hrStatusSchema = z.object({ key, label: z.string().trim().min(1).max(40), emoji: z.string().max(16).default(''), color: color.default('#64748b'), active: z.boolean().default(true) });
export const departmentSchema = z.object({ id: uuid, name: z.string().trim().min(1).max(64), color: color.default('#3b82f6'), discordRoleIds: z.array(sf).max(10).default([]), dashboardRoleIds: z.array(uuid).max(10).default([]), description: z.string().max(300).default('') });
export const severitySchema = z.object({ key, label: z.string().trim().min(1).max(40), emoji: z.string().max(16).default('⚠️'), color: color.default('#f59e0b'), defaultDays: z.number().int().min(0).max(3650).default(30) });
export const awardDefSchema = z.object({
  id: uuid, name: z.string().trim().min(1).max(60), icon: z.string().max(16).default('🏅'), description: z.string().max(500).default(''), color: color.default('#eab308'),
  requirements: z.string().max(500).default(''), public: z.boolean().default(true), discordRoleId: sf.nullable().default(null), active: z.boolean().default(true),
});
export const absenceTypeSchema = z.object({ key, label: z.string().trim().min(1).max(40), emoji: z.string().max(16).default('') });
/** Bereiche der Personalakte: sichtbar ja/nein und ob sie geschützt sind (nur mit personnel.view_sensitive). */
export const PROFILE_SECTIONS = ['overview', 'rank', 'promotions', 'trainings', 'exams', 'awards', 'warnings', 'absences', 'transfers', 'servicenumbers', 'notes', 'history'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export const PROFILE_SECTION_LABEL: Record<ProfileSection, string> = {
  overview: 'Übersicht', rank: 'Rang', promotions: 'Beförderungen', trainings: 'Ausbildungen', exams: 'Prüfungen', awards: 'Auszeichnungen', warnings: 'Verwarnungen',
  absences: 'Abwesenheiten', transfers: 'Versetzungen', servicenumbers: 'Dienstnummern', notes: 'Notizen', history: 'Historie',
};
export const PROFILE_FIELDS = ['discordName', 'discordId', 'avatar', 'robloxName', 'robloxId', 'rank', 'department', 'joinDate', 'status', 'serviceNumber', 'callsign'] as const;
export const PROFILE_FIELD_LABEL: Record<(typeof PROFILE_FIELDS)[number], string> = {
  discordName: 'Discord-Name', discordId: 'Discord-ID', avatar: 'Avatar', robloxName: 'Roblox-Name', robloxId: 'Roblox-ID', rank: 'Rang', department: 'Abteilung',
  joinDate: 'Eintrittsdatum', status: 'Status', serviceNumber: 'Dienstnummer', callsign: 'Rufname',
};

/** Benachrichtigung je Ereignis: Dashboard, Discord-Kanal, Direktnachricht; welche Dashboard-Rollen sie bekommen. */
export const notifyRuleSchema = z.object({ dashboard: z.boolean().default(true), channelId: sf.nullable().default(null), dm: z.boolean().default(false), roleIds: z.array(uuid).max(20).default([]) });
export const HR_EVENTS = ['promotion.requested', 'promotion.approved', 'promotion.rejected', 'promotion.executed', 'transfer.requested', 'transfer.approved', 'transfer.rejected', 'warning.created', 'award.granted', 'training.passed', 'exam.passed'] as const;
export type HrEvent = (typeof HR_EVENTS)[number];
export const HR_EVENT_LABEL: Record<HrEvent, string> = {
  'promotion.requested': 'Neuer Beförderungsantrag', 'promotion.approved': 'Beförderung genehmigt', 'promotion.rejected': 'Beförderung abgelehnt', 'promotion.executed': 'Beförderung durchgeführt',
  'transfer.requested': 'Neuer Versetzungsantrag', 'transfer.approved': 'Versetzung genehmigt', 'transfer.rejected': 'Versetzung abgelehnt', 'warning.created': 'Verwarnung erstellt',
  'award.granted': 'Auszeichnung verliehen', 'training.passed': 'Ausbildung bestanden', 'exam.passed': 'Prüfung bestanden',
};

export const stageSchema = z.object({ id: uuid, name: z.string().trim().min(1).max(60), roleIds: z.array(uuid).max(20).default([]) });
export const REQUEST_STATUSES = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED', 'EXECUTED', 'CANCELLED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const requestStatusDefSchema = z.object({ label: z.string().max(40), emoji: z.string().max(16) });

export const hrConfigSchema = z.object({
  statuses: z.array(hrStatusSchema).max(30).default([]),
  departments: z.array(departmentSchema).max(50).default([]),
  absenceTypes: z.array(absenceTypeSchema).max(30).default([]),
  warningSeverities: z.array(severitySchema).max(20).default([]),
  warningCategories: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  awards: z.array(awardDefSchema).max(100).default([]),
  /** Bereiche der Personalakte */
  sections: z.record(z.enum(PROFILE_SECTIONS), z.object({ visible: z.boolean(), sensitive: z.boolean() })).default({}),
  /** Felder der Übersicht/Akte */
  fields: z.record(z.enum(PROFILE_FIELDS), z.object({ visible: z.boolean(), sensitive: z.boolean() })).default({}),
  /** Abwesenheiten im Teamprofil anzeigen */
  showAbsenceInTeam: z.boolean().default(true),
  promotion: z.object({
    stages: z.array(stageSchema).max(10).default([]),
    approvalsRequired: z.number().int().min(1).max(10).default(1),
    requireReason: z.boolean().default(true),
    /** Antrag nur, wenn alle Voraussetzungen erfüllt sind */
    requireRequirements: z.boolean().default(false),
    /** nach letzter Genehmigung automatisch durchführen */
    autoExecute: z.boolean().default(false),
    discordRoles: z.boolean().default(true),
    dashboardRoles: z.boolean().default(false),
    announceChannelId: sf.nullable().default(null),
    announceTemplate: z.string().max(2000).default('🎖️ **BEFÖRDERUNG**\n\n{mitglied} wurde befördert.\n\n**Alter Rang:** {alter_rang}\n**Neuer Rang:** {neuer_rang}\n\n**Begründung:** {begruendung}\n\n**Befördert durch:** {durch}\n**Datum:** {datum}'),
    announceColor: color.default('#eab308'),
    /** eigene Namen/Emojis für die Status */
    statusLabels: z.record(z.enum(REQUEST_STATUSES), requestStatusDefSchema).default({}),
  }).default({}),
  transfer: z.object({
    approvalsRequired: z.number().int().min(1).max(10).default(1),
    stages: z.array(stageSchema).max(10).default([]),
    discordRoles: z.boolean().default(true),
    dashboardRoles: z.boolean().default(false),
    autoExecute: z.boolean().default(true),
    announceChannelId: sf.nullable().default(null),
  }).default({}),
  notifications: z.record(z.enum(HR_EVENTS), notifyRuleSchema).default({}),
  /** Zertifikate */
  certificate: z.object({ organisation: z.string().max(100).default('EN Polizei'), logo: z.string().max(500).default(''), signature: z.string().max(100).default('') }).default({}),
});
export type HrConfig = z.infer<typeof hrConfigSchema>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const DEFAULT_HR_CONFIG: HrConfig = hrConfigSchema.parse({
  statuses: [
    { key: 'ACTIVE', label: 'Aktiv', emoji: '🟢', color: '#22c55e' }, { key: 'ABSENT', label: 'Abwesend', emoji: '🟡', color: '#eab308' },
    { key: 'TRAINING', label: 'In Ausbildung', emoji: '🔵', color: '#3b82f6' }, { key: 'LOA', label: 'Beurlaubt', emoji: '🟠', color: '#f97316' },
    { key: 'SUSPENDED', label: 'Suspendiert', emoji: '⛔', color: '#b91c1c' }, { key: 'INACTIVE', label: 'Inaktiv', emoji: '🔴', color: '#ef4444' },
    { key: 'RESIGNED', label: 'Ausgetreten', emoji: '⚫', color: '#475569' }, { key: 'TERMINATED', label: 'Entlassen', emoji: '⚫', color: '#334155' },
  ],
  departments: [{ id: id(1), name: 'Polizei', color: '#3b82f6' }, { id: id(2), name: 'Leitstelle', color: '#a855f7' }],
  absenceTypes: [{ key: 'VACATION', label: 'Urlaub', emoji: '🏖️' }, { key: 'SICK', label: 'Krank', emoji: '🤒' }, { key: 'PRIVATE', label: 'Privat', emoji: '🏠' }, { key: 'OTHER', label: 'Sonstige', emoji: '📋' }],
  warningSeverities: [
    { key: 'WARNING', label: 'Verwarnung', emoji: '🟡', color: '#eab308', defaultDays: 30 }, { key: 'REPRIMAND', label: 'Abmahnung', emoji: '🟠', color: '#f97316', defaultDays: 60 },
    { key: 'SEVERE', label: 'Schwerwiegender Verstoß', emoji: '🔴', color: '#ef4444', defaultDays: 180 },
  ],
  warningCategories: ['Verhalten', 'Dienstvergehen', 'Funk', 'Regelverstoß', 'Sonstiges'],
  awards: [{ id: id(10), name: 'Besondere Leistung', icon: '🏅', description: 'Für außergewöhnliche Leistungen.', color: '#eab308' }],
  sections: Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, { visible: true, sensitive: ['warnings', 'notes', 'history'].includes(s) }])),
  fields: Object.fromEntries(PROFILE_FIELDS.map((f) => [f, { visible: true, sensitive: f === 'discordId' || f === 'robloxId' }])),
  notifications: {
    'promotion.requested': { dashboard: true }, 'promotion.approved': { dashboard: true }, 'promotion.rejected': { dashboard: true, dm: true },
    'promotion.executed': { dashboard: true, dm: true }, 'transfer.approved': { dashboard: true, dm: true }, 'award.granted': { dashboard: true, dm: true }, 'warning.created': { dashboard: true },
  },
});
/** Gespeicherte (evtl. ältere) Einstellungen mit den Standardwerten auffüllen. */
export function withHrDefaults(v: unknown): HrConfig {
  const p = hrConfigSchema.safeParse(v ?? {});
  const c = p.success ? p.data : hrConfigSchema.parse({});
  const raw = (v ?? {}) as Partial<Record<keyof HrConfig, unknown>>;
  return {
    ...c,
    statuses: raw.statuses ? c.statuses : DEFAULT_HR_CONFIG.statuses,
    departments: raw.departments ? c.departments : DEFAULT_HR_CONFIG.departments,
    absenceTypes: raw.absenceTypes ? c.absenceTypes : DEFAULT_HR_CONFIG.absenceTypes,
    warningSeverities: raw.warningSeverities ? c.warningSeverities : DEFAULT_HR_CONFIG.warningSeverities,
    warningCategories: raw.warningCategories ? c.warningCategories : DEFAULT_HR_CONFIG.warningCategories,
    awards: raw.awards ? c.awards : DEFAULT_HR_CONFIG.awards,
    sections: { ...DEFAULT_HR_CONFIG.sections, ...c.sections },
    fields: { ...DEFAULT_HR_CONFIG.fields, ...c.fields },
    notifications: raw.notifications ? c.notifications : DEFAULT_HR_CONFIG.notifications,
  };
}

export const REQUEST_STATUS_DEFAULT: Record<RequestStatus, { label: string; emoji: string }> = {
  OPEN: { label: 'Offen', emoji: '🟡' }, IN_REVIEW: { label: 'In Prüfung', emoji: '🔵' }, APPROVED: { label: 'Genehmigt', emoji: '🟢' }, REJECTED: { label: 'Abgelehnt', emoji: '🔴' },
  DEFERRED: { label: 'Zurückgestellt', emoji: '⚫' }, EXECUTED: { label: 'Durchgeführt', emoji: '🎖️' }, CANCELLED: { label: 'Abgebrochen', emoji: '✖️' },
};

// ───────────── Ränge & Voraussetzungen ─────────────

export const REQUIREMENT_TYPES = ['MIN_DAYS_IN_RANK', 'MIN_DUTY_HOURS', 'MIN_INCIDENTS', 'TRAINING', 'EXAM', 'DISCORD_ROLE', 'RECOMMENDATION', 'CUSTOM'] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export const REQUIREMENT_LABEL: Record<RequirementType, string> = {
  MIN_DAYS_IN_RANK: 'Mindestzeit im aktuellen Rang (Tage)', MIN_DUTY_HOURS: 'Mindestanzahl Dienststunden', MIN_INCIDENTS: 'Mindestanzahl Einsätze', TRAINING: 'Bestimmte Ausbildung',
  EXAM: 'Bestandene Prüfung', DISCORD_ROLE: 'Bestimmte Discord-Rolle', RECOMMENDATION: 'Empfehlung(en) eines Vorgesetzten', CUSTOM: 'Frei definierte Voraussetzung (manuell abhaken)',
};
export const requirementSchema = z.object({ id: uuid, type: z.enum(REQUIREMENT_TYPES), label: z.string().max(120).default(''), value: z.number().min(0).max(100000).default(0), ref: z.string().max(64).nullable().default(null) });
export type Requirement = z.infer<typeof requirementSchema>;
export const rankSchema = z.object({
  id: uuid.optional(), name: z.string().trim().min(1).max(64), description: z.string().max(500).nullable().default(null), icon: z.string().max(16).nullable().default(null), color: color.default('#64748b'),
  discordRoleIds: z.array(sf).max(10).default([]), dashboardRoleIds: z.array(uuid).max(10).default([]), nextRankIds: z.array(uuid).max(20).default([]), approverRankIds: z.array(uuid).max(20).default([]),
  requirements: z.array(requirementSchema).max(30).default([]), active: z.boolean().default(true),
});
export type RankInput = z.infer<typeof rankSchema>;
export interface RequirementResult { id: string; type: RequirementType; label: string; met: boolean; current: string; needed: string; manual: boolean }
/** Ergebnis der automatischen Prüfung für den nächsten Rang. */
export interface PromotionCheck { rankId: string; rankName: string; results: RequirementResult[]; met: number; total: number; eligible: boolean }

// ───────────── Prüfungen ─────────────

export const EXAM_QUESTION_TYPES = ['SINGLE', 'MULTI', 'YESNO', 'TEXT', 'NUMBER'] as const;
export const EXAM_QUESTION_TYPE_LABEL: Record<(typeof EXAM_QUESTION_TYPES)[number], string> = { SINGLE: 'Single Choice', MULTI: 'Multiple Choice', YESNO: 'Ja/Nein', TEXT: 'Freitext', NUMBER: 'Zahl' };
export const questionSchema = z.object({
  id: z.string().min(1).max(40), type: z.enum(EXAM_QUESTION_TYPES), text: z.string().trim().min(1).max(1000), options: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext → manuell) */
  correct: z.array(z.string().max(200)).max(10).default([]), points: z.number().min(0).max(100).default(1),
});
export type Question = z.infer<typeof questionSchema>;
/** Automatische Auswertung einer Antwort; `null` = muss manuell bewertet werden (Freitext ohne Musterlösung). */
export function gradeAnswer(q: Question, a: unknown): number | null {
  const norm = (x: unknown) => String(x ?? '').trim().toLowerCase();
  if (q.type === 'TEXT') {
    if (!q.correct.length) return null;
    const t = norm(a);
    return q.correct.every((k) => t.includes(norm(k))) ? q.points : 0;
  }
  if (q.type === 'NUMBER') return Number(String(a).replace(',', '.')) === Number(String(q.correct[0] ?? '').replace(',', '.')) ? q.points : 0;
  if (q.type === 'MULTI') {
    const got = new Set((Array.isArray(a) ? a : []).map(norm));
    const want = new Set(q.correct.map(norm));
    return got.size === want.size && [...want].every((x) => got.has(x)) ? q.points : 0;
  }
  return norm(Array.isArray(a) ? a[0] : a) === norm(q.correct[0]) ? q.points : 0;
}

// ───────────── Dienstnummern ─────────────

export const DN_STATUSES = ['ACTIVE', 'RESERVED', 'FREE', 'BLOCKED', 'FORMER'] as const;
export type DnStatus = (typeof DN_STATUSES)[number];
export const DN_STATUS_LABEL: Record<DnStatus, { label: string; emoji: string }> = {
  ACTIVE: { label: 'Aktiv', emoji: '🟢' }, RESERVED: { label: 'Reserviert', emoji: '🟡' }, FREE: { label: 'Frei', emoji: '⚪' }, BLOCKED: { label: 'Gesperrt', emoji: '🔴' }, FORMER: { label: 'Ehemalig', emoji: '⚫' },
};
export const rangeSchema = z.object({
  name: z.string().trim().min(1).max(60), prefix: z.string().max(10).default(''), suffix: z.string().max(10).default(''), start: z.number().int().min(0).max(9_999_999), end: z.number().int().min(0).max(9_999_999),
  padLength: z.number().int().min(0).max(10).default(0), order: z.enum(['LOWEST_FREE', 'SEQUENTIAL']).default('LOWEST_FREE'), autoAssign: z.boolean().default(true), manual: z.boolean().default(true),
  reuse: z.boolean().default(true), releaseAs: z.enum(['FREE', 'FORMER', 'BLOCKED']).default('FORMER'), department: z.string().max(64).nullable().default(null), active: z.boolean().default(true),
}).refine((r) => r.end >= r.start, { message: 'Endnummer muss ≥ Startnummer sein.', path: ['end'] }).refine((r) => r.end - r.start <= 100_000, { message: 'Höchstens 100 000 Nummern je Kreis.', path: ['end'] });
export type RangeInput = z.infer<typeof rangeSchema>;
export const formatServiceNumber = (r: { prefix: string; suffix: string; padLength: number }, value: number) => `${r.prefix}${String(value).padStart(r.padLength, '0')}${r.suffix}`;

export const hireMappingSchema = z.object({
  /** 'police' = Polizei-Bewerbung, sonst Name der Einheit (Qualifikation) */
  kind: z.string().trim().min(1).max(64),
  /** Nummernkreis (leer = keine automatische Dienstnummer) */
  rangeId: uuid.nullable().default(null),
  department: z.string().max(64).nullable().default(null),
  rankId: uuid.nullable().default(null),
  /** Personalakte anlegen */
  createProfile: z.boolean().default(true),
  /** zusätzliche Discord-Rollen */
  roleIds: z.array(sf).max(10).default([]),
});
export const dnSettingsSchema = z.object({
  /** ACCEPT: direkt bei Annahme · COMPLETE: wenn die Person im Discord verknüpft/erreichbar ist (Einstellung abgeschlossen) · MANUAL: Bestätigung durch berechtigte Person */
  timing: z.enum(['ACCEPT', 'COMPLETE', 'MANUAL']).default('ACCEPT'),
  mappings: z.array(hireMappingSchema).max(50).default([{ kind: 'police', rangeId: null, department: 'Polizei', rankId: null, createProfile: true, roleIds: [] }]),
  nickname: z.object({ enabled: z.boolean().default(false), format: z.string().max(60).default('[{dienstnummer}] {name}') }).default({}),
  dm: z.object({ enabled: z.boolean().default(true), title: z.string().max(256).default('🎉 BEWERBUNG ANGENOMMEN'), template: z.string().max(3000).default('Herzlichen Glückwunsch {user}!\n\nDeine Bewerbung wurde angenommen.\n\n🪪 **Dienstnummer:** {dienstnummer}\n👮 **Rang:** {rang}\n🏢 **Abteilung:** {abteilung}\n\nBitte merke dir deine Dienstnummer.'), color: color.default('#22c55e') }).default({}),
  rankRoles: z.boolean().default(true),
  departmentRoles: z.boolean().default(true),
  /** Wechsel der Nummer braucht eine zweite Person (Genehmiger) */
  changeNeedsApprover: z.boolean().default(false),
});
export type DnSettings = z.infer<typeof dnSettingsSchema>;
export const DN_VARIABLES = ['{user}', '{name}', '{dienstnummer}', '{rang}', '{abteilung}', '{bewerbung}', '{datum}'] as const;
/** Platzhalter füllen (DM, Nickname, Ankündigungen). Unbekannte Platzhalter bleiben stehen. */
export function fillTemplate(tpl: string, vars: Record<string, string | null | undefined>) {
  return tpl.replace(/\{([\w.]{1,40})\}/g, (m, k: string) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m)).replace(/@(everyone|here)/g, '@​$1');
}
