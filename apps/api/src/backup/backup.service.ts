import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { backupConfigSchema, BACKUP_CONFIG_TABLES, BACKUP_MODULE_GROUPS, BACKUP_PARTS, isBackupDue, type BackupConfig, type BackupPart, type BackupRestoreResult, type BackupScope, type DiscordBackupData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { unscoped } from '../common/guild-context';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { NotifyService } from '../notifications/notify.service';

const KEY = 'backup.config';
/** Flüchtige Daten (Sitzungen, Bot-Warteschlange, Sperren, Einmal-Codes), die Discord-Backups und das Backup-Manifest selbst gehören nicht in ein Daten-Backup. */
const SKIP = new Set(['Session', 'DiscordOutbox', 'EditLock', 'DiscordLinkCode', 'RobloxVerifyCode', 'RobloxOAuthState', 'DiscordBackup', 'BackupRecord']);
/** Beim Einspielen unangetastet: Audit-Log und Wochenarchive sind unveränderlich (nur anhängen) und bleiben vollständig erhalten. */
const KEEP_ON_RESTORE = new Set(['AuditLog', 'DutyWeekArchive']);
/**
 * Bewusst entfernte Tabellen: ältere Backups enthalten sie noch – beim Einspielen werden sie übersprungen und die Zeilen,
 * die die zugehörige Migration ebenfalls gelöscht hat, herausgefiltert (sonst kämen z. B. gelöschte Rechte zurück).
 */
const REMOVED_TABLES = new Set(['HrAnnouncement', 'HrAnnouncementRead', 'HrPoll', 'HrPollVote']);
const removedPermission = (key: unknown) => typeof key === 'string' && /^(announcements|polls)\./.test(key);
const REMOVED_ROWS: Record<string, (r: Record<string, unknown>) => boolean> = {
  Notification: (r) => r.entityType === 'HrAnnouncement' || r.entityType === 'HrPoll',
  Permission: (r) => removedPermission(r.key),
  RolePermission: (r) => removedPermission(r.permissionKey),
  UserPermissionOverride: (r) => removedPermission(r.permissionKey),
};
const FILE = /^(auto|manuell|vor-wiederherstellung|vor-umstellung|vor-mehrserver|vor-zusammenfuehrung|vor-update)-(\d{8}-\d{6})(?:-([a-z0-9]{4}))?\.json\.gz(\.enc)?$/;
export type DataBackupKind = 'auto' | 'manuell' | 'vor-wiederherstellung' | 'vor-umstellung' | 'vor-mehrserver' | 'vor-zusammenfuehrung' | 'vor-update';
/** Verschlüsselte Backups: Kennung + Version, dann IV (12), Auth-Tag (16), Geheimtext (gzip). */
const MAGIC = Buffer.from('ENPB\x02', 'latin1');
/** Höchstgröße der Dateien in einem Datei-Backup (Uploads). */
const MAX_FILES_BYTES = 400 * 1024 * 1024;
/** Nach dem Einspielen (z. B. eines Backups aus dem Ein-Server-Betrieb): gesetzt vom MultiServerRestoreService. */
let afterRestore: (() => Promise<unknown>) | null = null;
export const setAfterRestore = (fn: (() => Promise<unknown>) | null) => { afterRestore = fn; };
const delegate = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
type Model = (typeof Prisma.dmmf.datamodel.models)[number];
interface BackupBody { app?: string; version?: number; createdAt?: string; migration?: string | null; scope?: BackupScope; modules?: string[]; tables?: Record<string, Record<string, unknown>[]>; files?: { path: string; data: string }[] }

/**
 * Aufbewahrung der stündlichen Daten-Backups: die letzten 48 Stunden vollständig, davor das jeweils neueste Backup
 * eines Tages für `keep` Tage. `list` neueste zuerst.
 */
export function autoBackupsToDelete<T extends { createdAt: string }>(list: T[], keep: number, now = new Date()): T[] {
  const recent = now.getTime() - 48 * 60 * 60_000;
  const days = new Set<string>();
  return list.filter((f) => {
    if (new Date(f.createdAt).getTime() >= recent) return false;
    const d = f.createdAt.slice(0, 10);
    if (days.has(d) || days.size >= keep) return true;
    days.add(d);
    return false;
  });
}

/** Tabellen in einer Reihenfolge, in der jede Tabelle nach denen kommt, auf die sie verweist (zum Einspielen). */
function modelOrder() {
  const models = Prisma.dmmf.datamodel.models.filter((m) => !SKIP.has(m.name));
  const deps = new Map(models.map((m) => [m.name, m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)]));
  const out: typeof models = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name) || !deps.has(name)) return;
    seen.add(name);
    for (const d of deps.get(name)!) visit(d);
    out.push(models.find((m) => m.name === name)!);
  };
  for (const m of models) visit(m.name);
  return out;
}

/** Zeilen einer Tabelle mit Verweis auf sich selbst (z. B. Organigramm) so sortieren, dass übergeordnete zuerst kommen. */
function parentsFirst(m: Model, rows: Record<string, unknown>[]) {
  const self = m.fields.find((f) => f.type === m.name && f.relationFromFields?.length);
  if (!self) return rows;
  const fk = self.relationFromFields![0]!;
  const ids = new Set(rows.map((r) => r.id));
  const done = new Set<unknown>(); const out: Record<string, unknown>[] = [];
  let rest = rows;
  while (rest.length) {
    const next = rest.filter((r) => !r[fk] || !ids.has(r[fk]) || done.has(r[fk]));
    if (!next.length) { out.push(...rest); break; } // Kreis (sollte es nicht geben) – unverändert anhängen
    for (const r of next) { out.push(r); done.add(r.id); }
    rest = rest.filter((r) => !done.has(r.id));
  }
  return out;
}

/** Tabellen, die außerhalb der Auswahl auf eine ausgewählte Tabelle verweisen (Löschen würde dort Daten mitreißen). */
export function externalDependents(selected: ReadonlySet<string>) {
  const out: string[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    if (selected.has(m.name) || SKIP.has(m.name)) continue;
    for (const f of m.fields) if (f.relationFromFields?.length && selected.has(f.type)) out.push(`${m.name} → ${f.type}`);
  }
  return out;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Backup-Center 2.0: Dashboard-Daten (alle Tabellen bzw. Konfiguration/Module, optional mit Dateien) als komprimierte,
 * auf Wunsch verschlüsselte Datei im Speicherordner, mit Manifest (Prüfsumme, Prüfergebnis, Ersteller, Archiv); Discord-Server
 * (wie Xenon – der Bot liest Rollen/Kanäle/Rechte/Einstellungen und stellt sie wieder her).
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Backup');
  private readonly dir = path.resolve(loadEnv().STORAGE_DIR, 'backups');
  private readonly storage = path.resolve(loadEnv().STORAGE_DIR);
  private readonly key = loadEnv().BACKUP_ENCRYPTION_KEY ? Buffer.from(loadEnv().BACKUP_ENCRYPTION_KEY!, 'hex') : null;
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly perms: PermissionService, private readonly notify: NotifyService) {}

  /**
   * Daten-Backups enthalten ALLE Server samt Konten – nur für globale Systemadministratoren. Ein Server-Administrator
   * (settings.manage nur auf seinem Server) darf sie weder sehen noch einspielen.
   */
  async requireGlobal(actor: Actor) {
    if (!actor.userId || !(await this.perms.isOwner(actor.userId))) throw new AppError('PERMISSION_DENIED', 'Daten-Backups enthalten alle Server – das dürfen nur globale Systemadministratoren.');
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.autoTick().catch((e) => this.log.warn(`auto backup failed: ${e instanceof Error ? e.message : e}`)), 60 * 60_000);
    setTimeout(() => void this.autoTick().catch(() => undefined), 5 * 60_000).unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async config(): Promise<BackupConfig> {
    const p = backupConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value ?? {});
    return p.success ? p.data : backupConfigSchema.parse({});
  }
  async saveConfig(actor: Actor, c: BackupConfig) {
    const v = backupConfigSchema.parse(c);
    await this.prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: v }, update: { value: v } });
    await this.audit.record(actor, { action: 'backup.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: v });
    return v;
  }
  /** Status für das Backup-Center (ohne Geheimnisse). */
  async status() {
    const cfg = await this.config();
    const recs = await this.prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const lastOk = recs.find((r) => r.status === 'OK');
    return { encryptionAvailable: !!this.key, encryptionActive: !!this.key && cfg.encrypt, schedule: cfg.schedule, dataAuto: cfg.dataAuto, lastBackupAt: recs[0]?.createdAt ?? null, lastOkAt: lastOk?.createdAt ?? null, failed: recs.filter((r) => r.status === 'FAILED' || r.status === 'CORRUPT').length, location: 'Speicherordner der API (STORAGE_DIR/backups, nicht öffentlich erreichbar)' };
  }

  /** Stündlicher Lauf: Daten-Backup nach Zeitplan und (falls an) Discord-Backup je Server; alte automatische Backups aufräumen. */
  async autoTick(now = new Date()) {
    const cfg = await this.config();
    const day = 23 * 60 * 60_000;
    if (cfg.dataAuto) {
      const last = (await this.listData()).find((f) => f.kind === 'auto');
      if (isBackupDue(cfg.schedule, last ? new Date(last.createdAt) : null, now)) {
        try {
          const b = await this.createData(null, 'auto', { scope: cfg.autoScope });
          await this.statusMessage(cfg, `✅ Automatisches Backup erstellt: ${b.name} (${Math.round(b.size / 1024)} KB)`, true);
        } catch (e) {
          await this.statusMessage(cfg, `⛔ Automatisches Backup fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 200) : 'Unbekannter Fehler'}`, false);
          throw e;
        }
      }
    }
    if (cfg.discordAuto) {
      for (const g of await this.discord.guilds()) {
        const last = await this.prisma.discordBackup.findFirst({ where: { guildId: g.id, auto: true }, orderBy: { createdAt: 'desc' } });
        if (!last || now.getTime() - last.createdAt.getTime() > day) await this.createDiscord(null, g.id, 'Automatisch', true);
        const old = await this.prisma.discordBackup.findMany({ where: { guildId: g.id, auto: true }, orderBy: { createdAt: 'desc' }, skip: cfg.keep, select: { id: true } });
        if (old.length) await this.prisma.discordBackup.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }
    }
  }

  /** Statusmeldung an globale Administratoren (Dashboard) und optional an einen privaten Discord-Kanal – nie Inhalte. */
  private async statusMessage(cfg: BackupConfig, text: string, ok: boolean) {
    try {
      const admins = await this.notify.usersWith('backup.view', { guildId: null });
      const owners: string[] = [];
      for (const u of admins) if (await this.perms.isOwner(u)) owners.push(u);
      await this.notify.notify(owners, { type: 'BACKUP', title: text.slice(0, 200) });
      if (cfg.statusChannelId) await this.discord.postMessage(`backup-${Date.now().toString(36)}`, cfg.statusChannelId, { embeds: [{ title: ok ? 'Backup-Center' : 'Backup-Center – Fehler', description: text.slice(0, 1000), color: ok ? 0x22c55e : 0xef4444, timestamp: new Date().toISOString() }] }, { forceNew: true });
    } catch (e) { this.log.warn(`backup status message failed: ${e instanceof Error ? e.message : e}`); }
  }

  // ───────────── Dashboard-Daten ─────────────
  /** Dateien im Speicherordner mit Manifest-Angaben (Dateien ohne Manifest = ältere Backups, „ungeprüft“). */
  async listData(opts: { archived?: boolean } = {}) {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => FILE.test(f));
    const recs = new Map((await this.prisma.backupRecord.findMany({ where: { fileName: { in: files } } })).map((r) => [r.fileName, r]));
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...recs.values()].map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const out = await Promise.all(files.map(async (name) => {
      const m = FILE.exec(name)!;
      const st = await stat(path.join(this.dir, name));
      const t = m[2]!;
      const r = recs.get(name);
      return {
        name, kind: m[1] as DataBackupKind, size: st.size, encrypted: !!m[4],
        createdAt: new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`).toISOString(),
        scope: (r?.scope ?? 'DATABASE') as BackupScope, modules: r?.modules ?? [], status: r?.status ?? 'UNVERIFIED', sha256: r?.sha256 ?? null, verifiedAt: r?.verifiedAt ?? null, verifyMessage: r?.verifyMessage ?? null,
        archivedAt: r?.archivedAt ?? null, createdBy: r?.createdById ? names.get(r.createdById) ?? '—' : r ? 'System' : null, rows: r?.rows ?? null, migration: r?.migration ?? null, note: r?.note ?? null,
        location: 'STORAGE_DIR/backups',
      };
    }));
    return out.filter((f) => opts.archived === undefined || !!f.archivedAt === opts.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private tablesFor(scope: BackupScope, modules: string[]) {
    const all = modelOrder();
    if (scope === 'FILES') return [];
    if (scope === 'CONFIG') return all.filter((m) => BACKUP_CONFIG_TABLES.includes(m.name));
    if (scope === 'MODULE') {
      const want = new Set(BACKUP_MODULE_GROUPS.filter((g) => modules.includes(g.key)).flatMap((g) => g.tables as readonly string[]));
      if (!want.size) throw new AppError('VALIDATION_FAILED', 'Bitte mindestens einen Bereich wählen.');
      return all.filter((m) => want.has(m.name));
    }
    return all;
  }

  /** Uploads (ohne den Backup-Ordner) für Datei-Backups; Pfade relativ zum Speicherordner. */
  private async collectFiles() {
    const out: { path: string; data: string }[] = [];
    let total = 0;
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, e.name);
        if (full === this.dir || e.name.startsWith('.')) continue;
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) {
          const data = await readFile(full);
          total += data.length;
          if (total > MAX_FILES_BYTES) throw new AppError('VALIDATION_FAILED', 'Die Dateien sind zu groß für ein Datei-Backup (über 400 MB) – bitte über das Server-Backup des Speicherordners sichern.');
          out.push({ path: path.relative(this.storage, full).split(path.sep).join('/'), data: data.toString('base64') });
        }
      }
    };
    await walk(this.storage);
    return out;
  }

  private encrypt(gz: Buffer) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key!, iv);
    const enc = Buffer.concat([c.update(gz), c.final()]);
    return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
  }
  /** Datei → JSON (entschlüsseln, entpacken, prüfen). Wirft bei beschädigten/fremden Dateien. */
  decode(raw: Buffer): BackupBody {
    let gz = raw;
    if (raw.subarray(0, MAGIC.length).equals(MAGIC)) {
      if (!this.key) throw new AppError('VALIDATION_FAILED', 'Das Backup ist verschlüsselt, aber BACKUP_ENCRYPTION_KEY ist nicht gesetzt.');
      try {
        const iv = raw.subarray(MAGIC.length, MAGIC.length + 12); const tag = raw.subarray(MAGIC.length + 12, MAGIC.length + 28);
        const d = createDecipheriv('aes-256-gcm', this.key, iv); d.setAuthTag(tag);
        gz = Buffer.concat([d.update(raw.subarray(MAGIC.length + 28)), d.final()]);
      } catch { throw new AppError('VALIDATION_FAILED', 'Das Backup lässt sich nicht entschlüsseln (falscher Schlüssel oder beschädigt).'); }
    }
    let body: BackupBody;
    try { body = JSON.parse((gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz).toString('utf8')); } catch { throw new AppError('VALIDATION_FAILED', 'Die Datei ist kein gültiges Backup.'); }
    if (body.app !== 'en-polizei' || (body.version !== 1 && body.version !== 2) || (!body.tables && !body.files)) throw new AppError('VALIDATION_FAILED', 'Die Datei ist kein Backup dieses Dashboards.');
    return body;
  }

  /** Backup erstellen (Standard: alle Tabellen). Automatische werden nach Aufbewahrung aufgeräumt (archivierte nie). */
  async createData(actor: Actor | null, kind: DataBackupKind = 'manuell', opts: { scope?: BackupScope; modules?: string[]; note?: string } = {}) {
    await mkdir(this.dir, { recursive: true });
    const scope = opts.scope ?? 'DATABASE';
    const modules = scope === 'MODULE' ? (opts.modules ?? []) : [];
    const cfg = await this.config();
    const encrypt = !!this.key && cfg.encrypt;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `${kind}-${stamp}-${randomBytes(3).toString('hex').slice(0, 4)}.json.gz${encrypt ? '.enc' : ''}`;
    const rec = await this.prisma.backupRecord.create({ data: { fileName: name, kind, scope, modules, encrypted: encrypt, status: 'CREATING', createdById: actor?.userId ?? null, note: opts.note?.slice(0, 300) ?? null } });
    try {
      const tables: Record<string, unknown[]> = {};
      let rows = 0;
      for (const m of this.tablesFor(scope, modules)) {
        // vollständiger Bestand aller Server
        const list = await unscoped(() => (this.prisma as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[delegate(m.name)]!.findMany());
        tables[m.name] = list;
        rows += list.length;
      }
      const files = scope === 'FILES' || scope === 'FULL' ? await this.collectFiles() : undefined;
      const migration = await this.currentMigration();
      // Zugangsdaten (Passwort-Hashes, 2FA-Geheimnisse, verschlüsselte Integrations-Schlüssel) liegen nur verschlüsselt bzw. gehasht in der Datenbank;
      // unverschlüsselte Backups sind deshalb nur im nicht öffentlichen Speicherordner und nur für globale Administratoren erreichbar.
      const body: BackupBody = { app: 'en-polizei', version: 2, createdAt: new Date().toISOString(), migration, scope, modules, tables: scope === 'FILES' ? {} : tables as BackupBody['tables'], ...(files ? { files } : {}) };
      const gz = gzipSync(Buffer.from(JSON.stringify(body)));
      const data = encrypt ? this.encrypt(gz) : gz;
      await writeFile(path.join(this.dir, name), data, { mode: 0o600 });
      await this.prisma.backupRecord.update({ where: { id: rec.id }, data: { status: 'OK', sizeBytes: Math.min(data.length, 2_147_483_647), sha256: sha256(data), rows, migration, verifiedAt: new Date(), verifyMessage: 'Beim Erstellen geprüft (Prüfsumme gespeichert).' } });
      if (kind === 'auto') {
        const keep = cfg.keep;
        for (const f of autoBackupsToDelete((await this.listData({ archived: false })).filter((x) => x.kind === 'auto'), keep)) {
          await unlink(path.join(this.dir, f.name)).catch(() => undefined);
          await this.prisma.backupRecord.deleteMany({ where: { fileName: f.name } });
        }
      }
      if (actor) await this.audit.record(actor, { action: 'backup.data.create', module: 'settings', entityType: 'Backup', entityId: name, after: { rows, size: data.length, scope, modules, encrypted: encrypt } });
      return { name, rows, size: data.length, scope, encrypted: encrypt, sha256: sha256(data) };
    } catch (e) {
      await this.prisma.backupRecord.update({ where: { id: rec.id }, data: { status: 'FAILED', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) } }).catch(() => undefined);
      await unlink(path.join(this.dir, name)).catch(() => undefined);
      if (actor) await this.audit.record(actor, { action: 'backup.data.create', module: 'settings', entityType: 'Backup', entityId: name, result: 'FAILED', after: { error: e instanceof Error ? e.message : String(e) } }).catch(() => undefined);
      throw e;
    }
  }

  private async currentMigration() {
    const m = await this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`.catch(() => []);
    return m[0]?.migration_name ?? null;
  }
  private async appliedMigrations() {
    return new Set((await this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`.catch(() => [])).map((x) => x.migration_name));
  }

  private file(name: string) {
    if (!FILE.test(name)) throw new AppError('NOT_FOUND', 'Backup nicht gefunden.');
    return path.join(this.dir, name);
  }
  async readData(name: string) { return readFile(this.file(name)).catch(() => { throw new AppError('NOT_FOUND', 'Backup nicht gefunden.'); }); }
  async downloadData(actor: Actor, name: string) {
    const buf = await this.readData(name);
    await this.audit.record(actor, { action: 'backup.data.download', module: 'settings', entityType: 'Backup', entityId: name, after: { size: buf.length } });
    return buf;
  }
  async deleteData(actor: Actor, name: string) {
    await unlink(this.file(name)).catch(() => { throw new AppError('NOT_FOUND', 'Backup nicht gefunden.'); });
    await this.prisma.backupRecord.deleteMany({ where: { fileName: name } });
    await this.audit.record(actor, { action: 'backup.data.delete', module: 'settings', entityType: 'Backup', entityId: name });
  }

  /** Integrität prüfen: Prüfsumme (falls bekannt), Entschlüsselung, Entpacken, Aufbau. Ergebnis wird im Manifest gespeichert. */
  async verify(actor: Actor | null, name: string) {
    const raw = await this.readData(name).catch(async (e) => {
      await this.prisma.backupRecord.updateMany({ where: { fileName: name }, data: { status: 'MISSING', verifiedAt: new Date(), verifyMessage: 'Datei fehlt.' } });
      throw e;
    });
    const rec = await this.prisma.backupRecord.findUnique({ where: { fileName: name } });
    const hash = sha256(raw);
    let status = 'OK'; let message = 'Prüfsumme, Aufbau und Inhalt in Ordnung.'; let body: BackupBody | null = null;
    if (rec?.sha256 && rec.sha256 !== hash) { status = 'CORRUPT'; message = 'Prüfsumme stimmt nicht – die Datei wurde verändert oder ist beschädigt.'; }
    else {
      try { body = this.decode(raw); } catch (e) { status = 'CORRUPT'; message = e instanceof Error ? e.message : 'Beschädigt.'; }
    }
    const m = FILE.exec(name)!;
    const rows = body?.tables ? Object.values(body.tables).reduce((n, t) => n + t.length, 0) : null;
    const data = { status, verifiedAt: new Date(), verifyMessage: message, sha256: rec?.sha256 ?? (status === 'OK' ? hash : null), sizeBytes: Math.min(raw.length, 2_147_483_647), ...(rows !== null ? { rows } : {}), ...(body?.migration !== undefined ? { migration: body.migration } : {}) };
    await this.prisma.backupRecord.upsert({ where: { fileName: name }, create: { fileName: name, kind: m[1]!, scope: body?.scope ?? 'DATABASE', modules: body?.modules ?? [], encrypted: !!m[4], ...data }, update: data });
    if (actor) await this.audit.record(actor, { action: 'backup.data.verify', module: 'settings', entityType: 'Backup', entityId: name, after: { status, message } });
    return { name, status, message, sha256: hash };
  }

  async setArchived(actor: Actor, name: string, archived: boolean) {
    await this.readData(name);
    if (!(await this.prisma.backupRecord.findUnique({ where: { fileName: name } }))) await this.verify(null, name);
    await this.prisma.backupRecord.update({ where: { fileName: name }, data: { archivedAt: archived ? new Date() : null, archivedById: archived ? actor.userId : null } });
    await this.audit.record(actor, { action: archived ? 'backup.data.archive' : 'backup.data.unarchive', module: 'settings', entityType: 'Backup', entityId: name });
    return { name, archived };
  }

  private restoreTables(body: BackupBody, groups?: string[]) {
    const all = modelOrder().filter((m) => !KEEP_ON_RESTORE.has(m.name));
    const present = new Set(Object.keys(body.tables ?? {}));
    if (!groups?.length) {
      // Teil-Backups (Konfiguration/Modul) ersetzen nur die enthaltenen Tabellen
      return body.scope === 'CONFIG' || body.scope === 'MODULE' ? all.filter((m) => present.has(m.name)) : body.scope === 'FILES' ? [] : all;
    }
    const want = new Set(BACKUP_MODULE_GROUPS.filter((g) => groups.includes(g.key)).flatMap((g) => g.tables as readonly string[]));
    return all.filter((m) => want.has(m.name) && present.has(m.name));
  }

  /**
   * Wiederherstellungsplan (Schritte 2, 3 und 5): Integrität, Version/Kompatibilität, Umfang je Tabelle und ob neuere Daten
   * überschrieben würden. Ändert nichts.
   */
  async plan(source: { name?: string; buffer?: Buffer }, groups?: string[]) {
    const raw = source.name ? await this.readData(source.name) : source.buffer;
    if (!raw?.length) throw new AppError('VALIDATION_FAILED', 'Keine Backup-Datei.');
    if (source.name) {
      const v = await this.verify(null, source.name);
      if (v.status !== 'OK') throw new AppError('CONFLICT', `Das Backup ist fehlerhaft: ${v.message}`, { reason: 'CORRUPT' });
    }
    const body = this.decode(raw);
    const order = this.restoreTables(body, groups);
    const unknown = Object.keys(body.tables ?? {}).filter((t) => !modelOrder().some((m) => m.name === t) && !SKIP.has(t) && !KEEP_ON_RESTORE.has(t) && !REMOVED_TABLES.has(t));
    const applied = await this.appliedMigrations();
    const warnings: string[] = []; const blockers: string[] = [];
    if (unknown.length) blockers.push(`Das Backup passt nicht zu dieser Version (unbekannte Tabellen: ${unknown.slice(0, 5).join(', ')}).`);
    if (body.migration && applied.size && !applied.has(body.migration)) blockers.push(`Das Backup stammt aus einer neueren Version (${body.migration}) – zuerst die Anwendung aktualisieren.`);
    else if (body.migration && body.migration !== (await this.currentMigration())) warnings.push(`Das Backup stammt aus einer älteren Version (${body.migration}); fehlende neue Felder bekommen Standardwerte.`);
    if (groups?.length) {
      const sel = new Set(order.map((m) => m.name));
      const deps = externalDependents(sel);
      if (deps.length) blockers.push(`Selektive Wiederherstellung dieser Bereiche ist nicht sicher möglich – andere Daten verweisen darauf (${deps.slice(0, 4).join(', ')}). Bitte vollständig wiederherstellen.`);
    }
    const created = body.createdAt ? new Date(body.createdAt) : null;
    const tables = await unscoped(async () => Promise.all(order.map(async (m) => {
      const d = (this.prisma as unknown as Record<string, { count(a?: unknown): Promise<number> }>)[delegate(m.name)]!;
      const ts = m.fields.find((f) => f.name === 'updatedAt') ?? m.fields.find((f) => f.name === 'createdAt');
      const [current, newer] = await Promise.all([d.count(), created && ts ? d.count({ where: { [ts.name]: { gt: created } } }) : Promise.resolve(0)]);
      return { table: m.name, inBackup: (body.tables?.[m.name] ?? []).length, current, newer };
    })));
    const newerRows = tables.reduce((n, t) => n + t.newer, 0);
    if (newerRows) warnings.push(newerRows === 1 ? '1 Datensatz wurde nach dem Backup angelegt oder geändert und geht beim Wiederherstellen verloren.' : `${newerRows} Datensätze wurden nach dem Backup angelegt oder geändert und gehen beim Wiederherstellen verloren.`);
    return { createdAt: body.createdAt ?? null, version: body.version, migration: body.migration ?? null, scope: body.scope ?? 'DATABASE', modules: body.modules ?? [], files: body.files?.length ?? 0, tables: tables.filter((t) => t.inBackup || t.current), newerRows, warnings, blockers, restorable: !blockers.length };
  }

  /**
   * Wiederherstellen (Backup-Center): 1. Recht (Controller) 2. Integrität 3. Version 4. Sicherung des aktuellen Stands
   * 5. Umfang (plan) 6. ausdrückliche Bestätigung (Controller; neuere Daten zusätzlich `acknowledgeNewer`) 7. Einspielen in einer
   * Transaktion 8. Protokoll 9. Prüfung des Ergebnisses (Zeilen je Tabelle). Sitzungen und das Audit-Log bleiben.
   */
  async restoreData(actor: Actor, source: { name?: string; buffer?: Buffer }, opts: { groups?: string[]; acknowledgeNewer?: boolean } = {}) {
    const raw = source.name ? await this.readData(source.name) : source.buffer;
    if (!raw?.length) throw new AppError('VALIDATION_FAILED', 'Keine Backup-Datei.');
    const plan = await this.plan(source, opts.groups);
    if (plan.blockers.length) throw new AppError(plan.blockers[0]!.startsWith('Das Backup passt nicht') ? 'VALIDATION_FAILED' : 'CONFLICT', plan.blockers[0]!, { plan });
    if (plan.newerRows && !opts.acknowledgeNewer) throw new AppError('CONFLICT', `Seit dem Backup ${plan.newerRows === 1 ? 'wurde 1 Datensatz' : `wurden ${plan.newerRows} Datensätze`} angelegt oder geändert. Zum Überschreiben ausdrücklich bestätigen.`, { reason: 'NEWER_DATA', plan });
    const body = this.decode(raw);
    const order = this.restoreTables(body, opts.groups);
    const full = !opts.groups?.length && (body.scope ?? 'DATABASE') !== 'CONFIG' && body.scope !== 'MODULE';
    const safety = await this.createData(null, 'vor-wiederherstellung', { scope: 'DATABASE' });
    let rows = 0;
    const expected: Record<string, number> = {};
    if (order.length) {
      // vollständiger Bestand aller Server, ohne Filter (sonst blieben z. B. unter „Alle Server“ ausgeblendete Altbestände stehen → Konflikte)
      await unscoped(() => this.prisma.$transaction(async (tx) => {
        const db = tx as unknown as Record<string, { deleteMany(): Promise<unknown>; createMany(a: { data: unknown[] }): Promise<unknown> }>;
        // Sitzungen hängen an den Benutzern (werden beim Leeren mitgelöscht) → danach für weiterhin vorhandene Benutzer zurückholen
        const sessions = full ? await tx.session.findMany() : [];
        for (const m of [...order].reverse()) await db[delegate(m.name)]!.deleteMany();
        for (const m of order) {
          const list = parentsFirst(m, (body.tables![m.name] ?? []).filter((r) => !REMOVED_ROWS[m.name]?.(r)));
          const fields = new Map(m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => [f.name, f]));
          const data = list.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => fields.has(k)).map(([k, v]) => [k, v === null && fields.get(k)!.type === 'Json' ? Prisma.DbNull : v])));
          for (let i = 0; i < data.length; i += 500) await db[delegate(m.name)]!.createMany({ data: data.slice(i, i + 500) });
          rows += data.length; expected[m.name] = data.length;
        }
        if (full) {
          const users = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
          const keep = sessions.filter((x) => users.has(x.userId));
          if (keep.length) await tx.session.createMany({ data: keep, skipDuplicates: true });
          // Wochenarchive aus dem Backup, die hier fehlen, ergänzen – vorhandene werden nie überschrieben
          const weeks = (body.tables!.DutyWeekArchive ?? []) as Prisma.DutyWeekArchiveCreateManyInput[];
          for (let i = 0; i < weeks.length; i += 500) await tx.dutyWeekArchive.createMany({ data: weeks.slice(i, i + 500), skipDuplicates: true });
        }
      }, { timeout: 10 * 60_000, maxWait: 30_000 }));
    }
    // Dateien: fehlende/abweichende Dateien schreiben, vorhandene andere Dateien bleiben (nichts wird gelöscht)
    let files = 0;
    for (const f of body.files ?? []) {
      const target = path.resolve(this.storage, f.path);
      if (!target.startsWith(this.storage + path.sep) || target.startsWith(this.dir + path.sep)) continue; // kein Pfad außerhalb des Speicherordners
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(f.data, 'base64'));
      files++;
    }
    // Systemzustand prüfen: Zeilen je Tabelle wie im Backup?
    const mismatches = await unscoped(async () => {
      const out: string[] = [];
      for (const [t, n] of Object.entries(expected)) {
        const c = await (this.prisma as unknown as Record<string, { count(): Promise<number> }>)[delegate(t)]!.count();
        if (c !== n) out.push(`${t}: ${c} statt ${n}`);
      }
      return out;
    });
    const check = { ok: !mismatches.length, mismatches };
    await this.audit.record(actor, { action: 'backup.data.restore', module: 'settings', entityType: 'Backup', entityId: source.name ?? 'upload', after: { rows, files, safety: safety.name, groups: opts.groups ?? null, acknowledgedNewer: plan.newerRows ? true : false, check } });
    // Backup aus dem Ein-Server-Betrieb eingespielt → Daten wieder dem Server zuordnen (siehe MultiServerRestoreService)
    if (full && afterRestore) await afterRestore().catch((e) => this.log.warn(`Nach dem Einspielen: ${e instanceof Error ? e.message : e}`));
    await this.statusMessage(await this.config(), `♻️ Wiederherstellung ${check.ok ? 'abgeschlossen' : 'mit Abweichungen'}: ${source.name ?? 'hochgeladene Datei'} (${rows} Datensätze, ${files} Dateien)`, check.ok);
    return { rows, files, safety: safety.name, check };
  }

  // ───────────── Discord-Server ─────────────
  listDiscord(guildId?: string) {
    return this.prisma.discordBackup.findMany({ where: guildId ? { guildId } : {}, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, guildId: true, guildName: true, name: true, auto: true, status: true, stats: true, error: true, createdAt: true, restoredAt: true, restoreResult: true, createdById: true } });
  }
  async getDiscord(id: string) {
    const b = await this.prisma.discordBackup.findUnique({ where: { id } });
    if (!b) throw new AppError('NOT_FOUND', 'Backup nicht gefunden.');
    return b;
  }
  /** Backup anlegen – der Bot liest den Server aus und schickt die Daten (Status PENDING → READY). */
  async createDiscord(actor: Actor | null, guildId: string, name?: string, auto = false) {
    const g = (await this.discord.guilds()).find((x) => x.id === guildId);
    if (!g) throw new AppError('VALIDATION_FAILED', 'Diesen Server kennt der Bot nicht.');
    const b = await this.prisma.discordBackup.create({ data: { guildId, guildName: g.name, name: (name?.trim() || `Backup ${new Date().toLocaleDateString('de-DE')}`).slice(0, 80), auto, createdById: actor?.userId ?? null } });
    await this.prisma.discordOutbox.create({ data: { type: 'bot.backup.create', channelKey: 'announcements', payload: { backupId: b.id, guildId } } });
    if (actor) await this.audit.record(actor, { action: 'backup.discord.create', module: 'settings', entityType: 'DiscordBackup', entityId: b.id, after: { guild: g.name } });
    return b;
  }
  async deleteDiscord(actor: Actor, id: string) {
    await this.getDiscord(id);
    await this.prisma.discordBackup.delete({ where: { id } });
    await this.audit.record(actor, { action: 'backup.discord.delete', module: 'settings', entityType: 'DiscordBackup', entityId: id });
  }
  /** Wiederherstellen (sicher: Vorhandenes wird angepasst, Fehlendes angelegt – nichts gelöscht). Ziel kann ein anderer Server sein. */
  async restoreDiscord(actor: Actor, id: string, d: { guildId?: string; parts: BackupPart[] }) {
    const b = await this.getDiscord(id);
    if (b.status !== 'READY') throw new AppError('CONFLICT', 'Das Backup ist noch nicht fertig.');
    const target = d.guildId ?? b.guildId;
    if (!(await this.discord.guilds()).some((g) => g.id === target)) throw new AppError('VALIDATION_FAILED', 'Auf diesem Server ist der Bot nicht.');
    const parts = BACKUP_PARTS.filter((p) => d.parts.includes(p));
    if (!parts.length) throw new AppError('VALIDATION_FAILED', 'Wähle aus, was wiederhergestellt werden soll.');
    await this.prisma.discordOutbox.create({ data: { type: 'bot.backup.restore', channelKey: 'announcements', payload: { backupId: id, guildId: target, parts } } });
    await this.audit.record(actor, { action: 'backup.discord.restore', module: 'settings', entityType: 'DiscordBackup', entityId: id, after: { target, parts } });
    return { queued: true };
  }

  // Bot-Dienstweg
  async botSaveData(id: string, d: { data?: DiscordBackupData; error?: string }) {
    await this.getDiscord(id);
    const stats = d.data ? { roles: d.data.roles.length, channels: d.data.channels.filter((c) => c.type !== 'category').length, categories: d.data.channels.filter((c) => c.type === 'category').length } : undefined;
    await this.prisma.discordBackup.update({ where: { id }, data: d.data ? { status: 'READY', data: d.data as unknown as Prisma.InputJsonValue, stats, error: null } : { status: 'FAILED', error: (d.error ?? 'Unbekannter Fehler').slice(0, 500) } });
  }
  async botRestoreResult(id: string, r: BackupRestoreResult) {
    await this.prisma.discordBackup.update({ where: { id }, data: { restoredAt: new Date(), restoreResult: r as unknown as Prisma.InputJsonValue } });
  }
}
