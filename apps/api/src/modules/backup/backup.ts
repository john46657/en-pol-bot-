import { Prisma, assertGuildId, prisma } from '@nexus/database';

/**
 * Konfigurations-Backup eines Servers (Einstellungen, Rechte, Rollen, Bewerbungsarten mit Fragen/Panels, Ticket-Kategorien,
 * Strukturen, Design). Nutzdaten (Bewerbungen, Tickets, Akten, Schichten …) gehören nicht dazu.
 *
 * Wiederherstellen = Upsert je Eintrag über seinen Schlüssel, Eltern vor Kindern: vorhandene Einträge erhalten den Stand des
 * Backups, fehlende werden angelegt; neuere Einträge bleiben bestehen (so bleiben Bewerbungen/Tickets, die auf Bewerbungsarten
 * oder Kategorien verweisen, gültig). Nur in denselben Server; jeder Eintrag wird auf Zugehörigkeit geprüft.
 */
export const BACKUP_FORMAT = 'nexus-config-backup';
export const BACKUP_VERSION = 1;

interface TableSpec {
  /** Prisma-Modellname */
  model: string;
  /** Schlüsselfelder (Upsert) */
  key: string[];
  /** Eltern-Bezug für Tabellen ohne guildId: Feld → Tabelle */
  parent?: { field: string; model: string } | undefined;
}

/** Reihenfolge = Wiederherstellungsreihenfolge (Eltern vor Kindern). */
export const TABLES: readonly TableSpec[] = [
  { model: 'GuildSettings', key: ['guildId'] },
  { model: 'DashboardSettings', key: ['guildId'] },
  { model: 'DashboardTheme', key: ['id'] },
  { model: 'DashboardThemeVersion', key: ['id'], parent: { field: 'themeId', model: 'DashboardTheme' } },
  { model: 'DiscordRole', key: ['id'] },
  { model: 'Permission', key: ['id'] },
  { model: 'PermissionProfile', key: ['id'] },
  { model: 'RoleProfile', key: ['id'] },
  { model: 'UserPermission', key: ['id'] },
  { model: 'NexusRole', key: ['id'] },
  { model: 'NexusRoleMember', key: ['id'] },
  { model: 'Panel', key: ['id'] },
  { model: 'LogForward', key: ['id'] },
  { model: 'Rank', key: ['id'] },
  { model: 'Team', key: ['id'] },
  { model: 'ShiftType', key: ['id'] },
  { model: 'RadioChannel', key: ['id'] },
  { model: 'DangerLevel', key: ['id'] },
  { model: 'TrainingCourse', key: ['id'] },
  { model: 'Qualification', key: ['id'] },
  { model: 'PromotionRule', key: ['id'] },
  { model: 'SekConfig', key: ['guildId'] },
  { model: 'TicketSettings', key: ['guildId'] },
  { model: 'TicketCategory', key: ['id'] },
  { model: 'Application', key: ['id'] },
  { model: 'ApplicationVersion', key: ['id'], parent: { field: 'applicationId', model: 'Application' } },
  { model: 'ApplicationQuestion', key: ['id'], parent: { field: 'applicationId', model: 'Application' } },
  { model: 'ApplicationQuestionOption', key: ['id'], parent: { field: 'questionId', model: 'ApplicationQuestion' } },
  { model: 'ApplicationCondition', key: ['id'], parent: { field: 'questionId', model: 'ApplicationQuestion' } },
  { model: 'ApplicationRoleRule', key: ['id'], parent: { field: 'applicationId', model: 'Application' } },
  { model: 'ApplicationIntegration', key: ['id'], parent: { field: 'applicationId', model: 'Application' } },
  { model: 'ApplicationAutomation', key: ['id'] },
  { model: 'ApplicationPanel', key: ['id'] },
  { model: 'ApplicationPanelApplication', key: ['panelId', 'applicationId'], parent: { field: 'panelId', model: 'ApplicationPanel' } },
  { model: 'ApplicationTemplate', key: ['id'] },
  { model: 'QuestionTemplate', key: ['id'] },
];

type Row = Record<string, unknown>;
type Delegate = {
  findMany: (a: unknown) => Promise<Row[]>;
  upsert: (a: unknown) => Promise<unknown>;
};
const delegate = (model: string): Delegate => (prisma as unknown as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)]!;
const fieldsOf = (model: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === model)!.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
const hasGuildId = (model: string) => fieldsOf(model).some((f) => f.name === 'guildId');

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  guildId: string;
  createdAt: string;
  tables: Record<string, Row[]>;
}

export async function createBackup(guildId: string): Promise<Backup> {
  const gid = assertGuildId(guildId);
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) {
    const where = hasGuildId(t.model) ? { guildId: gid } : { [t.parent!.field]: { in: (tables[t.parent!.model] ?? []).map((r) => r['id'] as string) } };
    tables[t.model] = await delegate(t.model).findMany({ where });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, guildId: gid, createdAt: new Date().toISOString(), tables };
}

/** JSON mit BigInt als Text (kommt in den Tabellen derzeit nicht vor, schadet aber nicht). */
export const backupJson = (b: Backup) => JSON.stringify(b, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2);

export interface RestoreResult {
  restored: Record<string, number>;
  skipped: { model: string; key: string; reason: string }[];
}

export class BackupError extends Error {}

/** Werte aus JSON in Prisma-Typen zurückwandeln (Datum, BigInt, JSON-null); unbekannte Felder verwerfen. */
function revive(model: string, row: Row): Row {
  const out: Row = {};
  for (const f of fieldsOf(model)) {
    if (!(f.name in row)) continue;
    const v = row[f.name];
    if (f.type === 'Json') out[f.name] = v === null ? Prisma.DbNull : v;
    else if (v === null) out[f.name] = null;
    else if (f.type === 'DateTime') out[f.name] = new Date(String(v));
    else if (f.type === 'BigInt') out[f.name] = BigInt(String(v));
    else out[f.name] = v;
  }
  return out;
}

export async function restoreBackup(guildId: string, raw: unknown): Promise<RestoreResult> {
  const gid = assertGuildId(guildId);
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object' || b.tables === null) throw new BackupError('Das ist keine NEXUS-Sicherung.');
  if (b.version !== BACKUP_VERSION) throw new BackupError(`Nicht unterstützte Version der Sicherung (${String(b.version)}).`);
  if (b.guildId !== gid) throw new BackupError('Die Sicherung stammt von einem anderen Server und kann hier nicht eingespielt werden.');
  const result: RestoreResult = { restored: {}, skipped: [] };
  // Erlaubte Eltern: aus der Sicherung (geprüft) und bereits vorhandene Einträge dieses Servers
  const allowed = new Map<string, Set<string>>();
  for (const t of TABLES) {
    const rows = Array.isArray(b.tables[t.model]) ? (b.tables[t.model] as Row[]) : [];
    const ok = new Set<string>();
    const existingParents = t.parent ? allowed.get(t.parent.model) ?? new Set<string>() : null;
    for (const row of rows) {
      const key = t.key.map((k) => String(row[k] ?? '')).join('/');
      if (!row || typeof row !== 'object' || t.key.some((k) => typeof row[k] !== 'string')) {
        result.skipped.push({ model: t.model, key, reason: 'Ungültiger Eintrag.' });
        continue;
      }
      if (hasGuildId(t.model) ? row['guildId'] !== gid : !existingParents!.has(String(row[t.parent!.field]))) {
        result.skipped.push({ model: t.model, key, reason: 'Gehört nicht zu diesem Server.' });
        continue;
      }
      const data = revive(t.model, row);
      const where = t.key.length === 1 ? { [t.key[0]!]: data[t.key[0]!] } : { [t.key.join('_')]: Object.fromEntries(t.key.map((k) => [k, data[k]])) };
      const update = Object.fromEntries(Object.entries(data).filter(([k]) => !t.key.includes(k)));
      try {
        await delegate(t.model).upsert({ where, create: data, update });
        ok.add(String(row['id'] ?? key));
        result.restored[t.model] = (result.restored[t.model] ?? 0) + 1;
      } catch (e) {
        result.skipped.push({ model: t.model, key, reason: e instanceof Error && /Unique constraint/i.test(e.message) ? 'Konflikt mit einem neueren Eintrag (z. B. gleicher Name).' : 'Konnte nicht gespeichert werden.' });
      }
    }
    // vorhandene Einträge dieses Servers zählen ebenfalls als gültige Eltern
    if (hasGuildId(t.model) && fieldsOf(t.model).some((f) => f.name === 'id')) for (const r of await delegate(t.model).findMany({ where: { guildId: gid }, select: { id: true } } as never)) ok.add(String(r['id']));
    else if (t.parent) for (const r of await delegate(t.model).findMany({ where: { [t.parent.field]: { in: [...(allowed.get(t.parent.model) ?? [])] } }, select: { id: true } } as never).catch(() => [])) ok.add(String(r['id']));
    allowed.set(t.model, ok);
  }
  return result;
}

/** Bereiche, die sich zurücksetzen lassen. */
export const RESET_SCOPES = {
  settings: 'Grundeinstellungen (Kanal-/Rollenauswahl, Module, Sprache, Log-Kanal)',
  design: 'Design und Menü des Dashboards',
  tickets: 'Ticket-Einstellungen (nicht die Kategorien)',
  logs: 'Log-Weiterleitungen',
  permissions: 'Rechte (Rollenrechte, Profile, Benutzerausnahmen, Dashboard-Rollen)',
} as const;
export type ResetScope = keyof typeof RESET_SCOPES;

export async function resetSettings(guildId: string, scopes: ResetScope[]): Promise<Record<ResetScope, boolean>> {
  const gid = assertGuildId(guildId);
  const done = Object.fromEntries(Object.keys(RESET_SCOPES).map((k) => [k, false])) as Record<ResetScope, boolean>;
  await prisma.$transaction(async (tx) => {
    if (scopes.includes('settings')) {
      await tx.guildSettings.upsert({ where: { guildId: gid }, create: { guildId: gid }, update: { data: {}, locale: 'de', timezone: 'Europe/Berlin', logChannelId: null } });
      done.settings = true;
    }
    if (scopes.includes('design')) {
      await tx.dashboardSettings.deleteMany({ where: { guildId: gid } });
      done.design = true;
    }
    if (scopes.includes('tickets')) {
      await tx.ticketSettings.deleteMany({ where: { guildId: gid } });
      done.tickets = true;
    }
    if (scopes.includes('logs')) {
      await tx.logForward.deleteMany({ where: { guildId: gid } });
      await tx.logForwardCursor.deleteMany({ where: { guildId: gid } });
      done.logs = true;
    }
    if (scopes.includes('permissions')) {
      await tx.permission.deleteMany({ where: { guildId: gid } });
      await tx.roleProfile.deleteMany({ where: { guildId: gid } });
      await tx.permissionProfile.deleteMany({ where: { guildId: gid } });
      await tx.userPermission.deleteMany({ where: { guildId: gid } });
      await tx.nexusRole.deleteMany({ where: { guildId: gid } });
      done.permissions = true;
    }
  });
  return done;
}
