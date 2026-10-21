import { Injectable } from '@nestjs/common';
import { Prisma, type ServerAsset } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BRANDING_IMAGES, MODULES, checkBrandingImage, configAssetIds, defaultServerConfig, imageInfo, missingBotPermissions, serverConfigSchema,
  type BrandingImageKind, type ModuleDef, type ServerConfigData,
} from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { ServersService } from './servers.service';

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** Bild-Feld der Konfiguration → erlaubte Bildart. */
const SLOT_KIND: Record<string, BrandingImageKind> = { logo: 'logo', avatar: 'avatar', banner: 'banner', background: 'background', 'areas.dashboard': 'area', 'areas.tickets': 'area', 'areas.team': 'area' };
const json = (v: unknown) => v as Prisma.InputJsonValue;
const conflict = () => new AppError('CONFLICT', 'Die Konfiguration wurde inzwischen geändert. Bitte neu laden – deine Änderung ist nicht gespeichert.', { reason: 'VERSION_CONFLICT' });

/**
 * Server-Konfiguration (Name, Branding, Design, Einrichtungsassistent). Mandant = Server aus dem PFAD; jeder Zugriff prüft
 * Mitgliedschaft und Recht genau auf diesem Server (ServersService.access). Bilder gehören genau einem Server.
 */
@Injectable()
export class ServerConfigService {
  private readonly dir = path.resolve(loadEnv().STORAGE_DIR, 'branding');
  constructor(
    private readonly prisma: PrismaService, private readonly servers: ServersService, private readonly audit: AuditService,
    private readonly discord: DiscordService,
  ) {}

  private assetUrl(serverId: string, id: string | null) { return id ? `/api/v1/servers/${serverId}/assets/${id}` : null; }
  private assetOut(a: ServerAsset) {
    return { id: a.id, kind: a.kind, mime: a.mime, size: a.size, width: a.width, height: a.height, sha256: a.sha256, originalName: a.originalName, createdAt: a.createdAt, url: this.assetUrl(a.serverId, a.id) };
  }
  /** Gespeicherte Daten lesen; alte/beschädigte Werte → Standard statt Absturz. */
  private parse(raw: unknown, fallbackName: string): ServerConfigData {
    const r = serverConfigSchema.safeParse(raw);
    return r.success ? r.data : defaultServerConfig(fallbackName);
  }

  /** Alles für die Einstellungsseite und den Assistenten (Recht servers.view auf diesem Server). */
  async get(actor: Actor, serverId: string) {
    const s = await this.servers.access(actor, serverId, 'servers.view');
    const [cfg, assets, canManage, guilds] = await Promise.all([
      this.prisma.serverConfig.findUnique({ where: { serverId } }),
      this.prisma.serverAsset.findMany({ where: { serverId, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      this.can(actor, s.guildId, 'servers.manage'), this.discord.reportedGuilds(),
    ]);
    const g = guilds.find((x) => x.id === s.guildId);
    const used = await this.usedAssetIds(serverId);
    return {
      server: { id: s.id, guildId: s.guildId, name: s.name, status: s.status, archivedAt: s.archivedAt },
      config: { data: this.parse(cfg?.data, s.name), version: cfg?.version ?? 0, setupStep: cfg?.setupStep ?? 0, setupCompletedAt: cfg?.setupCompletedAt ?? null, saved: !!cfg, updatedAt: cfg?.updatedAt ?? null },
      assets: assets.map((a) => ({ ...this.assetOut(a), inUse: used.current.has(a.id), inRevisions: used.revisions.has(a.id) })),
      // Discord-Verbindung: nur was der Bot tatsächlich gemeldet hat (nichts wird angenommen)
      bot: { present: !!g, guildName: g?.name ?? null, icon: g?.icon ?? null, channels: g?.channels.length ?? 0, roles: g?.roles.length ?? 0, permissions: g?.botPermissions ?? null, missing: missingBotPermissions(g?.botPermissions) },
      canManage,
    };
  }
  private can(actor: Actor, guildId: string, perm: string) { return this.servers.allowed(actor, guildId, perm); }

  /**
   * Branding für das Dashboard des gewählten Servers – nur für Mitglieder dieses Servers (Guild-ID aus der Anfrage wird
   * serverseitig gegen die Mitgliedschaft geprüft; fremde Server verhalten sich wie nicht vorhanden).
   */
  async branding(actor: Actor, guildId: string) {
    const s = await this.prisma.discordServer.findUnique({ where: { guildId } });
    if (!s || s.archivedAt) throw new AppError('NOT_FOUND', 'Server nicht gefunden.');
    await this.servers.accessAsMember(actor, s.id);
    const cfg = await this.prisma.serverConfig.findUnique({ where: { serverId: s.id } });
    const d = this.parse(cfg?.data, s.name);
    const img = (id: string | null) => this.assetUrl(s.id, id);
    return {
      serverId: s.id, guildId: s.guildId, configured: !!cfg, setupCompleted: !!cfg?.setupCompletedAt, ...d.general, design: d.design,
      images: { logo: img(d.branding.logo), avatar: img(d.branding.avatar), banner: img(d.branding.banner), background: img(d.branding.background), areas: { dashboard: img(d.branding.areas.dashboard), tickets: img(d.branding.areas.tickets), team: img(d.branding.areas.team) } },
    };
  }

  /** Bilder dürfen nur aus dem eigenen Bestand dieses Servers kommen – und nur in ein passendes Feld. */
  private async checkAssets(serverId: string, d: ServerConfigData) {
    const slots: [string, string | null][] = [
      ['logo', d.branding.logo], ['avatar', d.branding.avatar], ['banner', d.branding.banner], ['background', d.branding.background],
      ['areas.dashboard', d.branding.areas.dashboard], ['areas.tickets', d.branding.areas.tickets], ['areas.team', d.branding.areas.team],
    ];
    const ids = configAssetIds(d);
    const rows = ids.length ? await this.prisma.serverAsset.findMany({ where: { id: { in: ids } } }) : [];
    const errors: { path: string; message: string }[] = [];
    for (const [slot, id] of slots) {
      if (!id) continue;
      const a = rows.find((r) => r.id === id);
      // Bild eines anderen Servers wird wie ein unbekanntes behandelt (keine Rückschlüsse auf fremde Daten)
      if (!a || a.serverId !== serverId || a.deletedAt) errors.push({ path: `branding.${slot}`, message: 'Unbekanntes Bild. Bitte das Bild für diesen Server hochladen.' });
      else if (a.kind !== SLOT_KIND[slot]) errors.push({ path: `branding.${slot}`, message: `Dieses Bild wurde als „${BRANDING_IMAGES[a.kind as BrandingImageKind]?.label ?? a.kind}“ hochgeladen und passt nicht in dieses Feld.` });
    }
    if (errors.length) throw new AppError('VALIDATION_FAILED', 'Die Konfiguration enthält ungültige Bilder.', errors);
  }

  private async moduleState(serverId: string) {
    const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId } });
    return Object.fromEntries((MODULES as readonly ModuleDef[]).map((m) => [m.key, m.system ? true : rows.find((r) => r.moduleKey === m.key)?.enabled ?? true]));
  }

  /** Speichern (erst nach erfolgreicher Prüfung). Jede Version wird als unveränderliche Revision abgelegt. */
  async save(actor: Actor, serverId: string, body: { data: unknown; version: number; note?: string }) {
    const s = await this.servers.access(actor, serverId, 'servers.manage');
    const parsed = serverConfigSchema.safeParse(body.data);
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Die Konfiguration ist ungültig.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const d = parsed.data;
    await this.checkAssets(serverId, d);
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`server-config:${serverId}`}))`;
      const cur = await tx.serverConfig.findUnique({ where: { serverId } });
      if ((cur?.version ?? 0) !== body.version) throw conflict();
      const version = (cur?.version ?? 0) + 1;
      const row = cur
        ? await tx.serverConfig.update({ where: { serverId }, data: { data: json(d), version, updatedById: actor.userId } })
        : await tx.serverConfig.create({ data: { serverId, data: json(d), version, updatedById: actor.userId } });
      await tx.serverConfigRevision.create({ data: { serverId, version, data: json(d), modules: json(await this.moduleState(serverId)), note: body.note?.slice(0, 200) ?? null, createdById: actor.userId } });
      const before = cur ? this.parse(cur.data, s.name) : null;
      await this.audit.record(actor, { action: 'server.config.update', module: 'servers', entityType: 'ServerConfig', entityId: row.id, serverId: s.guildId,
        before: before ? { general: before.general, design: before.design, images: configAssetIds(before).length } : undefined,
        after: { version, general: d.general, design: d.design, images: configAssetIds(d).length } }, tx);
      return row;
    });
    return { version: saved.version, data: d, updatedAt: saved.updatedAt };
  }

  /** Fortschritt des Einrichtungsassistenten (zum späteren Weitermachen). */
  async setup(actor: Actor, serverId: string, b: { step: number; complete?: boolean }) {
    const s = await this.servers.access(actor, serverId, 'servers.manage');
    const cur = await this.prisma.serverConfig.findUnique({ where: { serverId } });
    if (b.complete && !cur?.version) throw new AppError('VALIDATION_FAILED', 'Bitte zuerst die Einstellungen speichern (Schritt „Prüfen & speichern“).');
    const data = { setupStep: Math.max(cur?.setupStep ?? 0, b.step), ...(b.complete ? { setupCompletedAt: new Date() } : {}) };
    const row = cur ? await this.prisma.serverConfig.update({ where: { serverId }, data })
      : await this.prisma.serverConfig.create({ data: { serverId, data: json(defaultServerConfig(s.name)), version: 0, ...data } });
    if (b.complete) await this.audit.record(actor, { action: 'server.setup.complete', module: 'servers', entityType: 'ServerConfig', entityId: row.id, serverId: s.guildId });
    return { setupStep: row.setupStep, setupCompletedAt: row.setupCompletedAt };
  }

  async revisions(actor: Actor, serverId: string) {
    await this.servers.access(actor, serverId, 'servers.view');
    const rows = await this.prisma.serverConfigRevision.findMany({ where: { serverId }, orderBy: { version: 'desc' }, take: 100 });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } });
    return rows.map((r) => ({ version: r.version, note: r.note, createdAt: r.createdAt, createdBy: users.find((u) => u.id === r.createdById)?.displayName ?? null, data: r.data, modules: r.modules }));
  }

  /**
   * Frühere Version wiederherstellen: wird als NEUE Version gespeichert (nichts wird überschrieben oder gelöscht).
   * `modules`: auch die Modul-Schalter von damals übernehmen (Recht modules.manage; Daten deaktivierter Module bleiben erhalten).
   */
  async restore(actor: Actor, serverId: string, version: number, b: { version: number; modules: boolean }) {
    const s = await this.servers.access(actor, serverId, 'servers.manage');
    const rev = await this.prisma.serverConfigRevision.findUnique({ where: { serverId_version: { serverId, version } } });
    if (!rev) throw new AppError('NOT_FOUND', 'Diese Version gibt es nicht.');
    const data = serverConfigSchema.safeParse(rev.data);
    if (!data.success) throw new AppError('VALIDATION_FAILED', 'Diese Version ist nicht mehr gültig und kann nicht wiederhergestellt werden.');
    const r = await this.save(actor, serverId, { data: data.data, version: b.version, note: `Wiederhergestellt aus Version ${version}` });
    let modulesChanged = 0;
    if (b.modules) {
      const want = rev.modules as Record<string, boolean>;
      for (const m of await this.servers.modules(actor, serverId)) {
        if (m.system || typeof want[m.key] !== 'boolean' || want[m.key] === m.enabled) continue;
        await this.servers.patchModule(actor, serverId, m.key, { enabled: want[m.key], version: m.version }).then(() => modulesChanged++, () => undefined);
      }
    }
    await this.audit.record(actor, { action: 'server.config.restore', module: 'servers', entityType: 'ServerConfig', entityId: serverId, serverId: s.guildId, after: { from: version, to: r.version, modulesChanged } });
    return { ...r, modulesChanged };
  }

  // ───────── Bilder ─────────
  /** Hochladen mit Prüfung von echtem Dateityp (Magic Bytes), Größe und Abmessungen; nie SVG, nie Client-Dateinamen im Dateisystem. */
  async upload(actor: Actor, serverId: string, kind: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number } | undefined) {
    const s = await this.servers.access(actor, serverId, 'servers.manage');
    if (!(kind in BRANDING_IMAGES)) throw new AppError('VALIDATION_FAILED', 'Unbekannte Bildart.');
    if (!file?.buffer?.length) throw new AppError('VALIDATION_FAILED', 'Bitte eine Bilddatei auswählen.');
    const k = kind as BrandingImageKind;
    const info = imageInfo(file.buffer);
    if (!info) throw new AppError('VALIDATION_FAILED', 'Dieser Dateityp ist nicht erlaubt oder die Datei ist beschädigt. Erlaubt sind PNG, JPG und WebP (kein SVG).');
    // Angabe des Browsers muss zum tatsächlichen Inhalt passen (z. B. keine umbenannte Datei)
    if (file.mimetype && file.mimetype !== info.mime && !(file.mimetype === 'image/jpg' && info.mime === 'image/jpeg')) throw new AppError('VALIDATION_FAILED', 'Dateiendung bzw. Dateityp passen nicht zum Inhalt der Datei.');
    const bad = checkBrandingImage(k, { mime: info.mime, size: file.buffer.length, width: info.width, height: info.height });
    if (bad) throw new AppError('VALIDATION_FAILED', bad);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const same = await this.prisma.serverAsset.findFirst({ where: { serverId, kind: k, sha256, deletedAt: null } });
    if (same) return this.assetOut(same);
    const storageKey = `${randomUUID()}.${EXT[info.mime]}`; // zufälliger, nicht erratbarer Name; feste Endung nach echtem Typ
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, storageKey), file.buffer, { mode: 0o640 });
    const originalName = path.basename(file.originalname || 'bild').replace(/[^\w.\- ]/g, '_').slice(0, 120);
    const a = await this.prisma.serverAsset.create({ data: { serverId, guildId: s.guildId, kind: k, mime: info.mime, size: file.buffer.length, width: info.width, height: info.height, sha256, storageKey, originalName, uploadedById: actor.userId } });
    await this.audit.record(actor, { action: 'server.asset.upload', module: 'servers', entityType: 'ServerAsset', entityId: a.id, serverId: s.guildId, after: { kind: k, mime: a.mime, size: a.size, width: a.width, height: a.height, sha256 } });
    return this.assetOut(a);
  }

  /** Bild ausliefern – nur an Mitglieder dieses Servers und nur, wenn das Bild zu diesem Server gehört. */
  async asset(actor: Actor, serverId: string, assetId: string) {
    await this.servers.accessAsMember(actor, serverId);
    const a = await this.prisma.serverAsset.findUnique({ where: { id: assetId } });
    if (!a || a.serverId !== serverId || a.deletedAt) throw new AppError('NOT_FOUND', 'Bild nicht gefunden.');
    const data = await readFile(path.join(this.dir, a.storageKey)).catch(() => { throw new AppError('NOT_FOUND', 'Bild nicht gefunden.'); });
    return { mime: a.mime, data };
  }

  /** IDs, die die aktuelle Konfiguration bzw. eine gespeicherte Version (Wiederherstellung) noch braucht. */
  private async usedAssetIds(serverId: string) {
    const [cur, revs] = await Promise.all([this.prisma.serverConfig.findUnique({ where: { serverId } }), this.prisma.serverConfigRevision.findMany({ where: { serverId }, select: { data: true } })]);
    const ids = (raw: unknown) => { const r = serverConfigSchema.safeParse(raw); return r.success ? configAssetIds(r.data) : []; };
    return { current: new Set(cur ? ids(cur.data) : []), revisions: new Set(revs.flatMap((r) => ids(r.data))) };
  }

  /**
   * Bild entfernen: nur wenn weder die aktuelle Konfiguration noch eine gespeicherte Version es verwendet und ausdrücklich
   * bestätigt (`confirm`). Der Eintrag bleibt als Nachweis erhalten, nur die Datei wird gelöscht.
   */
  async removeAsset(actor: Actor, serverId: string, assetId: string, confirm: boolean) {
    const s = await this.servers.access(actor, serverId, 'servers.manage');
    const a = await this.prisma.serverAsset.findUnique({ where: { id: assetId } });
    if (!a || a.serverId !== serverId || a.deletedAt) throw new AppError('NOT_FOUND', 'Bild nicht gefunden.');
    const used = await this.usedAssetIds(serverId);
    if (used.current.has(a.id)) throw new AppError('CONFLICT', 'Das Bild wird in der aktuellen Konfiguration verwendet. Ersetze oder entferne es dort zuerst.');
    if (used.revisions.has(a.id)) throw new AppError('CONFLICT', 'Das Bild gehört zu einer gespeicherten früheren Version (Wiederherstellung). Es bleibt deshalb erhalten.');
    if (!confirm) throw new AppError('VALIDATION_FAILED', 'Bitte das Entfernen ausdrücklich bestätigen.');
    await unlink(path.join(this.dir, a.storageKey)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
    await this.prisma.serverAsset.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    await this.audit.record(actor, { action: 'server.asset.delete', module: 'servers', entityType: 'ServerAsset', entityId: a.id, serverId: s.guildId, after: { kind: a.kind, sha256: a.sha256 } });
    return { ok: true };
  }
}
