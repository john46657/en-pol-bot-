import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { backupConfigSchema, BACKUP_PARTS, type BackupConfig, type BackupPart, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';

const KEY = 'backup.config';
/** Flüchtige Daten (Sitzungen, Bot-Warteschlange, Sperren, Einmal-Codes) und die Discord-Backups selbst gehören nicht in ein Daten-Backup. */
const SKIP = new Set(['Session', 'DiscordOutbox', 'EditLock', 'DiscordLinkCode', 'RobloxVerifyCode', 'RobloxOAuthState', 'DiscordBackup']);
/** Beim Einspielen unangetastet: das Audit-Log ist unveränderlich (nur anhängen) und bleibt vollständig erhalten. */
const KEEP_ON_RESTORE = new Set(['AuditLog']);
const FILE = /^(auto|manuell|vor-wiederherstellung)-(\d{8}-\d{6})\.json\.gz$/;
const delegate = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

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

/**
 * Backups: Dashboard-Daten (alle Tabellen als komprimierte JSON-Datei im Speicherordner, herunterladbar und wieder einspielbar)
 * und Discord-Server (wie Xenon – der Bot liest Rollen/Kanäle/Rechte/Einstellungen und stellt sie wieder her).
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Backup');
  private readonly dir = path.resolve(loadEnv().STORAGE_DIR, 'backups');
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

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

  /** Täglich: Daten-Backup und (falls an) Discord-Backup je Server; alte automatische Backups aufräumen. */
  async autoTick(now = new Date()) {
    const cfg = await this.config();
    const day = 23 * 60 * 60_000;
    if (cfg.dataAuto) {
      const last = (await this.listData()).find((f) => f.kind === 'auto');
      if (!last || now.getTime() - new Date(last.createdAt).getTime() > day) await this.createData(null, 'auto');
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

  // ───────────── Dashboard-Daten ─────────────
  async listData() {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => FILE.test(f));
    const out = await Promise.all(files.map(async (name) => {
      const m = FILE.exec(name)!;
      const st = await stat(path.join(this.dir, name));
      const t = m[2]!;
      return { name, kind: m[1] as 'auto' | 'manuell' | 'vor-wiederherstellung', size: st.size, createdAt: new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`).toISOString() };
    }));
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Alle Tabellen als JSON (gzip) in den Speicherordner; automatische werden auf „keep“ begrenzt. */
  async createData(actor: Actor | null, kind: 'auto' | 'manuell' | 'vor-wiederherstellung' = 'manuell') {
    await mkdir(this.dir, { recursive: true });
    const tables: Record<string, unknown[]> = {};
    let rows = 0;
    for (const m of modelOrder()) {
      const list = await (this.prisma as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[delegate(m.name)]!.findMany();
      tables[m.name] = list;
      rows += list.length;
    }
    const migrations = await this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`.catch(() => []);
    const body = { app: 'en-polizei', version: 1, createdAt: new Date().toISOString(), migration: migrations[0]?.migration_name ?? null, tables };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `${kind}-${stamp}.json.gz`;
    const data = gzipSync(Buffer.from(JSON.stringify(body)));
    await writeFile(path.join(this.dir, name), data);
    if (kind === 'auto') {
      const keep = (await this.config()).keep;
      for (const f of (await this.listData()).filter((x) => x.kind === 'auto').slice(keep)) await unlink(path.join(this.dir, f.name)).catch(() => undefined);
    }
    if (actor) await this.audit.record(actor, { action: 'backup.data.create', module: 'settings', entityType: 'Backup', entityId: name, after: { rows, size: data.length } });
    return { name, rows, size: data.length };
  }

  private file(name: string) {
    if (!FILE.test(name)) throw new AppError('NOT_FOUND', 'Backup nicht gefunden.');
    return path.join(this.dir, name);
  }
  async readData(name: string) { return readFile(this.file(name)).catch(() => { throw new AppError('NOT_FOUND', 'Backup nicht gefunden.'); }); }
  async deleteData(actor: Actor, name: string) {
    await unlink(this.file(name)).catch(() => { throw new AppError('NOT_FOUND', 'Backup nicht gefunden.'); });
    await this.audit.record(actor, { action: 'backup.data.delete', module: 'settings', entityType: 'Backup', entityId: name });
  }

  /**
   * Daten einspielen (gespeichertes Backup oder hochgeladene Datei): vorher wird automatisch der aktuelle Stand gesichert,
   * dann werden alle Tabellen in einer Transaktion ersetzt. Sitzungen und das Audit-Log bleiben – angemeldete Benutzer bleiben angemeldet.
   */
  async restoreData(actor: Actor, source: { name?: string; buffer?: Buffer }) {
    const raw = source.name ? await this.readData(source.name) : source.buffer;
    if (!raw?.length) throw new AppError('VALIDATION_FAILED', 'Keine Backup-Datei.');
    let body: { app?: string; version?: number; tables?: Record<string, Record<string, unknown>[]> };
    try { body = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8')); } catch { throw new AppError('VALIDATION_FAILED', 'Die Datei ist kein gültiges Backup.'); }
    if (body.app !== 'en-polizei' || body.version !== 1 || !body.tables) throw new AppError('VALIDATION_FAILED', 'Die Datei ist kein Backup dieses Dashboards.');
    const order = modelOrder().filter((m) => !KEEP_ON_RESTORE.has(m.name));
    const unknown = Object.keys(body.tables).filter((t) => !order.some((m) => m.name === t) && !SKIP.has(t) && !KEEP_ON_RESTORE.has(t));
    if (unknown.length) throw new AppError('VALIDATION_FAILED', `Das Backup passt nicht zu dieser Version (unbekannte Tabellen: ${unknown.slice(0, 5).join(', ')}).`);
    const safety = await this.createData(null, 'vor-wiederherstellung');
    let rows = 0;
    await this.prisma.$transaction(async (tx) => {
      const db = tx as unknown as Record<string, { deleteMany(): Promise<unknown>; createMany(a: { data: unknown[] }): Promise<unknown> }>;
      // Sitzungen hängen an den Benutzern (werden beim Leeren mitgelöscht) → danach für weiterhin vorhandene Benutzer zurückholen
      const sessions = await tx.session.findMany();
      for (const m of [...order].reverse()) await db[delegate(m.name)]!.deleteMany();
      for (const m of order) {
        const list = body.tables![m.name] ?? [];
        const fields = new Map(m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => [f.name, f]));
        const data = list.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => fields.has(k)).map(([k, v]) => [k, v === null && fields.get(k)!.type === 'Json' ? Prisma.DbNull : v])));
        for (let i = 0; i < data.length; i += 500) await db[delegate(m.name)]!.createMany({ data: data.slice(i, i + 500) });
        rows += data.length;
      }
      const users = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
      const keep = sessions.filter((x) => users.has(x.userId));
      if (keep.length) await tx.session.createMany({ data: keep, skipDuplicates: true });
    }, { timeout: 10 * 60_000, maxWait: 30_000 });
    await this.audit.record(actor, { action: 'backup.data.restore', module: 'settings', entityType: 'Backup', entityId: source.name ?? 'upload', after: { rows, safety: safety.name } });
    return { rows, safety: safety.name };
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
