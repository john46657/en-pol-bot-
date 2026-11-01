import { z } from 'zod';

// ═════════════ Organigramm ═════════════
export const ORG_UNIT_KINDS = ['LEADERSHIP', 'DEPUTY_LEADERSHIP', 'DEPARTMENT', 'DUTY_GROUP', 'UNIT', 'OTHER'] as const;
export type OrgUnitKind = (typeof ORG_UNIT_KINDS)[number];
export const ORG_UNIT_KIND_LABEL: Record<OrgUnitKind, string> = {
  LEADERSHIP: 'Polizeiführung', DEPUTY_LEADERSHIP: 'Stellvertretende Führung', DEPARTMENT: 'Abteilung', DUTY_GROUP: 'Dienstgruppe', UNIT: 'Einheit', OTHER: 'Sonstige Einheit',
};
export const orgUnitSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(ORG_UNIT_KINDS),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  responsibilities: z.string().max(2000).nullable().optional(),
  /** Verknüpfung mit einer Abteilung aus den Personal-Einstellungen: Mitglieder = Personalakten mit dieser Abteilung (keine doppelte Pflege). */
  departmentName: z.string().max(64).nullable().optional(),
  leaderPersonnelId: z.string().uuid().nullable().optional(),
  deputyPersonnelId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
});
export type OrgUnitInput = z.infer<typeof orgUnitSchema>;

export interface OrgNodeLike { id: string; parentId: string | null }
/** Alle Unterknoten (ohne den Knoten selbst). */
export function orgDescendants(nodes: readonly OrgNodeLike[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(children.get(c) ?? []));
  }
  return out;
}
/** Würde `newParentId` als übergeordnete Einheit von `id` einen Kreis erzeugen? */
export function orgWouldCycle(nodes: readonly OrgNodeLike[], id: string, newParentId: string | null | undefined): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  return orgDescendants(nodes, id).has(newParentId);
}
/** Übergeordnete Einheiten von unten nach oben. */
export function orgAncestors(nodes: readonly OrgNodeLike[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  while (cur && !out.includes(cur)) { out.push(cur); cur = byId.get(cur)?.parentId ?? null; }
  return out;
}
export type OrgTree<T> = T & { children: OrgTree<T>[] };
/** Baum aus flacher Liste; verwaiste Einträge (Elternteil fehlt) werden Wurzeln. */
export function buildOrgTree<T extends OrgNodeLike & { position?: number; name?: string }>(nodes: readonly T[]): OrgTree<T>[] {
  const map = new Map<string, OrgTree<T>>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: OrgTree<T>[] = [];
  for (const n of map.values()) {
    const p = n.parentId ? map.get(n.parentId) : undefined;
    (p ? p.children : roots).push(n);
  }
  const sort = (l: OrgTree<T>[]) => { l.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de')); l.forEach((c) => sort(c.children)); };
  sort(roots);
  return roots;
}

// ═════════════ Qualifikationsregister ═════════════
export const QUALIFICATION_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'] as const;
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];
export const QUALIFICATION_STATUS_LABEL: Record<QualificationStatus, string> = { PENDING: 'Zur Bestätigung', ACTIVE: 'Aktiv', SUSPENDED: 'Ruht', REVOKED: 'Entzogen', EXPIRED: 'Abgelaufen' };
export const QUALIFICATION_SOURCES = ['MANUAL', 'TRAINING', 'EXAM', 'PRACTICAL', 'LEGACY'] as const;
export type QualificationSource = (typeof QUALIFICATION_SOURCES)[number];
export const QUALIFICATION_SOURCE_LABEL: Record<QualificationSource, string> = { MANUAL: 'Manuell vergeben', TRAINING: 'Ausbildung', EXAM: 'Theorieprüfung', PRACTICAL: 'Praktische Prüfung', LEGACY: 'Übernommen (Altbestand)' };
/** Wirksamer Status: aktive Qualifikationen mit überschrittenem Ablaufdatum gelten als abgelaufen. */
export function effectiveQualificationStatus(q: { status: string; expiresAt?: Date | string | null }, now = new Date()): QualificationStatus {
  const s = (QUALIFICATION_STATUSES as readonly string[]).includes(q.status) ? (q.status as QualificationStatus) : 'ACTIVE';
  if (s === 'ACTIVE' && q.expiresAt && new Date(q.expiresAt).getTime() < now.getTime()) return 'EXPIRED';
  return s;
}
export const qualificationDefSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(1000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  /** in der Leitstelle/MDT zur Einsatzkoordination anzeigen */
  operational: z.boolean().default(true),
  /** Gültigkeit in Tagen (leer = unbegrenzt) */
  validDays: z.number().int().min(1).max(3650).nullable().optional(),
  /**
   * Bei bestandener Ausbildung/Prüfung direkt aktiv (true) oder erst nach Bestätigung durch jemanden mit `qualification.grant` (false, Standard).
   * Bestehen ist eine bestätigte Leistung – aber die Freigabe bleibt standardmäßig eine bewusste menschliche Entscheidung.
   */
  autoGrant: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type QualificationDefInput = z.infer<typeof qualificationDefSchema>;

// ═════════════ Praktische Prüfungen ═════════════
export const practicalCriterionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  maxPoints: z.number().int().min(1).max(100),
  /** Pflichtkriterium: muss mindestens `minPoints` erreichen, sonst nicht bestanden */
  required: z.boolean().default(false),
  minPoints: z.number().int().min(0).max(100).optional(),
});
export type PracticalCriterion = z.infer<typeof practicalCriterionSchema>;
export const practicalExamSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(4000).nullable().optional(),
  /** Prüfungsaufgaben (Szenario, Ablauf) */
  tasks: z.string().max(8000).nullable().optional(),
  criteria: z.array(practicalCriterionSchema).min(1).max(50),
  /** Bestehensgrenze in Punkten */
  passPoints: z.number().int().min(0).max(5000),
  examinerIds: z.array(z.string().uuid()).max(50).default([]),
  trainingId: z.string().uuid().nullable().optional(),
  qualificationDefId: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
}).refine((e) => e.passPoints <= e.criteria.reduce((s, c) => s + c.maxPoints, 0), { message: 'Die Bestehensgrenze ist höher als die erreichbare Punktzahl.', path: ['passPoints'] })
  .refine((e) => new Set(e.criteria.map((c) => c.id)).size === e.criteria.length, { message: 'Kriterien-IDs müssen eindeutig sein.', path: ['criteria'] })
  .refine((e) => e.criteria.every((c) => c.minPoints === undefined || c.minPoints <= c.maxPoints), { message: 'Mindestpunkte eines Kriteriums dürfen die Höchstpunkte nicht übersteigen.', path: ['criteria'] });
export type PracticalExamInput = z.infer<typeof practicalExamSchema>;
export type PracticalScores = Record<string, { points: number; note?: string }>;

/** Auswertung einer praktischen Prüfung – nachvollziehbar je Kriterium. */
export function scorePractical(criteria: readonly PracticalCriterion[], scores: PracticalScores, passPoints: number) {
  const missing: string[] = []; const invalid: string[] = []; const failedRequired: string[] = [];
  let total = 0; let max = 0;
  for (const c of criteria) {
    max += c.maxPoints;
    const s = scores[c.id];
    if (!s || typeof s.points !== 'number' || Number.isNaN(s.points)) { missing.push(c.id); continue; }
    if (s.points < 0 || s.points > c.maxPoints || !Number.isInteger(s.points)) { invalid.push(c.id); continue; }
    total += s.points;
    if (c.required && s.points < (c.minPoints ?? Math.ceil(c.maxPoints / 2))) failedRequired.push(c.id);
  }
  const complete = !missing.length && !invalid.length;
  return { total, max, complete, missing, invalid, failedRequired, passed: complete && total >= passPoints && !failedRequired.length, percent: max ? Math.round((total / max) * 100) : 0 };
}

// ═════════════ Lernmaterialien ═════════════
export const LEARNING_KINDS = ['TEXT', 'RULES', 'GUIDE', 'MEDIA', 'QUIZ'] as const;
export const LEARNING_KIND_LABEL: Record<(typeof LEARNING_KINDS)[number], string> = { TEXT: 'Lerninhalt', RULES: 'Regelwerk', GUIDE: 'Interne Anleitung', MEDIA: 'Bilder & Dokumente', QUIZ: 'Wissensabfrage' };
export const learningMaterialSchema = z.object({
  title: z.string().trim().min(2).max(120),
  kind: z.enum(LEARNING_KINDS),
  body: z.string().max(50_000).default(''),
  mediaIds: z.array(z.string().uuid()).max(20).default([]),
  trainingIds: z.array(z.string().uuid()).max(50).default([]),
  qualificationDefId: z.string().uuid().nullable().optional(),
  /** Wissensabfrage: verknüpfte (Theorie-)Prüfung */
  examId: z.string().uuid().nullable().optional(),
  published: z.boolean().default(false),
});
export type LearningMaterialInput = z.infer<typeof learningMaterialSchema>;

// ═════════════ Personalakte 2.0 ═════════════
export const PERSONNEL_NOTE_CATEGORIES = ['Allgemein', 'Leistung', 'Gespräch', 'Ausbildung', 'Dienstbetrieb', 'Sonstiges'] as const;
export const PERSONNEL_DOCUMENT_KINDS = ['PERSONNEL', 'TRAINING', 'EXAM', 'OTHER'] as const;
export const PERSONNEL_DOCUMENT_KIND_LABEL: Record<(typeof PERSONNEL_DOCUMENT_KINDS)[number], string> = { PERSONNEL: 'Personalunterlage', TRAINING: 'Ausbildungsnachweis', EXAM: 'Prüfungsnachweis', OTHER: 'Sonstiges Dokument' };

// ═════════════ Hilfe-Center ═════════════
export const HELP_ARTICLE_KINDS = ['ARTICLE', 'GUIDE', 'FAQ'] as const;
export const HELP_ARTICLE_KIND_LABEL: Record<(typeof HELP_ARTICLE_KINDS)[number], string> = { ARTICLE: 'Artikel', GUIDE: 'Anleitung', FAQ: 'Häufige Frage' };
export const HELP_ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const HELP_ARTICLE_STATUS_LABEL: Record<(typeof HELP_ARTICLE_STATUSES)[number], string> = { DRAFT: 'Entwurf', PUBLISHED: 'Veröffentlicht', ARCHIVED: 'Archiviert' };
export const helpCategorySchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).nullable().optional(), icon: z.string().max(8).nullable().optional(), position: z.number().int().min(0).max(10_000).optional() });
export const helpArticleSchema = z.object({
  title: z.string().trim().min(3).max(160),
  categoryId: z.string().uuid().nullable().optional(),
  kind: z.enum(HELP_ARTICLE_KINDS).default('ARTICLE'),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().max(100_000).default(''),
  mediaIds: z.array(z.string().uuid()).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  status: z.enum(HELP_ARTICLE_STATUSES).default('DRAFT'),
  /** Änderungsgrund (Änderungsverlauf) */
  changeNote: z.string().max(300).optional(),
});
export type HelpArticleInput = z.infer<typeof helpArticleSchema>;
/** URL-Kürzel aus dem Titel (ä → ae …), höchstens 80 Zeichen. */
export function helpSlug(title: string): string {
  return title.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'artikel';
}

// ═════════════ Backup-Center 2.0 ═════════════
export const BACKUP_SCOPES = ['FULL', 'DATABASE', 'CONFIG', 'FILES', 'MODULE'] as const;
export type BackupScope = (typeof BACKUP_SCOPES)[number];
export const BACKUP_SCOPE_LABEL: Record<BackupScope, string> = { FULL: 'Vollständig (Datenbank + Dateien)', DATABASE: 'Datenbank', CONFIG: 'Konfiguration', FILES: 'Dateien (Uploads)', MODULE: 'Modul' };
export const BACKUP_FREQUENCIES = ['off', 'hourly', 'daily', 'weekly', 'monthly'] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];
export const backupScheduleSchema = z.object({
  frequency: z.enum(BACKUP_FREQUENCIES).default('hourly'),
  /** Uhrzeit (UTC-Stunde) für täglich/wöchentlich/monatlich */
  hour: z.number().int().min(0).max(23).default(3),
  /** 0 = Sonntag … 6 = Samstag (wöchentlich) */
  weekday: z.number().int().min(0).max(6).default(1),
  /** Tag im Monat (monatlich, 1–28) */
  monthDay: z.number().int().min(1).max(28).default(1),
});
export type BackupSchedule = z.infer<typeof backupScheduleSchema>;

/** Ist laut Zeitplan ein automatisches Backup fällig? `last` = letztes automatisches Backup. */
export function isBackupDue(s: BackupSchedule, last: Date | null, now = new Date()): boolean {
  if (s.frequency === 'off') return false;
  const age = last ? now.getTime() - last.getTime() : Infinity;
  if (s.frequency === 'hourly') return age > 50 * 60_000;
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), s.hour));
  if (s.frequency === 'weekly') slot.setUTCDate(slot.getUTCDate() - ((now.getUTCDay() - s.weekday + 7) % 7));
  if (s.frequency === 'monthly') slot.setUTCDate(s.monthDay);
  // Termin noch nicht erreicht → vorherigen Termin nehmen
  if (slot.getTime() > now.getTime()) {
    if (s.frequency === 'daily') slot.setUTCDate(slot.getUTCDate() - 1);
    else if (s.frequency === 'weekly') slot.setUTCDate(slot.getUTCDate() - 7);
    else slot.setUTCMonth(slot.getUTCMonth() - 1);
  }
  return !last || last.getTime() < slot.getTime();
}

/** Teilbereiche für modulbezogene Backups und selektive Wiederherstellung (Tabellen in Prisma-Namen). */
export const BACKUP_MODULE_GROUPS = [
  { key: 'settings', label: 'Einstellungen & Konfiguration', tables: ['SystemSetting'] },
  { key: 'help', label: 'Hilfe-Center', tables: ['HelpCategory', 'HelpArticle', 'HelpArticleRevision'] },
  { key: 'org', label: 'Organigramm', tables: ['OrgUnit', 'OrgAssignment'] },
  { key: 'learning', label: 'Lernmaterialien', tables: ['HrLearningMaterial'] },
  { key: 'practical', label: 'Praktische Prüfungen', tables: ['HrPracticalExam', 'HrPracticalAssessment'] },
  { key: 'permissions', label: 'Rollen & Rechte', tables: ['Role', 'Permission', 'RolePermission', 'UserRole', 'UserPermissionOverride', 'Group', 'GroupRole', 'GroupMember', 'DiscordRoleMapping'] },
  { key: 'personnel', label: 'Personal (Personalakten, Ausbildung, Prüfungen, Qualifikationen)', tables: ['Personnel', 'PersonnelRecord', 'PersonnelRecordRevision', 'PersonnelDocument', 'PersonnelQualification', 'QualificationDefinition', 'HrRank', 'HrRequest', 'HrTraining', 'HrTrainingProgress', 'HrExam', 'HrExamAttempt', 'HrTrainingSession'] },
  { key: 'support', label: 'Support-Tickets', tables: ['SupportTicket', 'TicketMessage', 'TicketNote', 'TicketLog', 'TicketAccess', 'TicketRating', 'TicketTranscript'] },
] as const;
export type BackupModuleKey = (typeof BACKUP_MODULE_GROUPS)[number]['key'];
/** Konfigurations-Backup: Einstellungen, Rollen/Rechte, Module, Server – ohne Fachdaten. */
export const BACKUP_CONFIG_TABLES: readonly string[] = ['SystemSetting', 'Role', 'Permission', 'RolePermission', 'Group', 'GroupRole', 'DiscordRoleMapping', 'AppModule', 'ServerModuleSetting', 'DiscordServer', 'HrRank', 'QualificationDefinition', 'OrgUnit', 'HelpCategory'];
