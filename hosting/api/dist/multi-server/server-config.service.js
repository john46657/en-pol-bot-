"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerConfigService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const servers_service_1 = require("./servers.service");
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** Bild-Feld der Konfiguration → erlaubte Bildart. */
const SLOT_KIND = { logo: 'logo', avatar: 'avatar', banner: 'banner', background: 'background', 'areas.dashboard': 'area', 'areas.tickets': 'area', 'areas.team': 'area' };
const json = (v) => v;
const conflict = () => new errors_1.AppError('CONFLICT', 'Die Konfiguration wurde inzwischen geändert. Bitte neu laden – deine Änderung ist nicht gespeichert.', { reason: 'VERSION_CONFLICT' });
/**
 * Server-Konfiguration (Name, Branding, Design, Einrichtungsassistent). Mandant = Server aus dem PFAD; jeder Zugriff prüft
 * Mitgliedschaft und Recht genau auf diesem Server (ServersService.access). Bilder gehören genau einem Server.
 */
let ServerConfigService = class ServerConfigService {
    prisma;
    servers;
    audit;
    discord;
    dir = node_path_1.default.resolve((0, env_1.loadEnv)().STORAGE_DIR, 'branding');
    constructor(prisma, servers, audit, discord) {
        this.prisma = prisma;
        this.servers = servers;
        this.audit = audit;
        this.discord = discord;
    }
    assetUrl(serverId, id) { return id ? `/api/v1/servers/${serverId}/assets/${id}` : null; }
    assetOut(a) {
        return { id: a.id, kind: a.kind, mime: a.mime, size: a.size, width: a.width, height: a.height, sha256: a.sha256, originalName: a.originalName, createdAt: a.createdAt, url: this.assetUrl(a.serverId, a.id) };
    }
    /** Gespeicherte Daten lesen; alte/beschädigte Werte → Standard statt Absturz. */
    parse(raw, fallbackName) {
        const r = shared_1.serverConfigSchema.safeParse(raw);
        return r.success ? r.data : (0, shared_1.defaultServerConfig)(fallbackName);
    }
    /** Alles für die Einstellungsseite und den Assistenten (Recht servers.view auf diesem Server). */
    async get(actor, serverId) {
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
            bot: { present: !!g, guildName: g?.name ?? null, icon: g?.icon ?? null, channels: g?.channels.length ?? 0, roles: g?.roles.length ?? 0, permissions: g?.botPermissions ?? null, missing: (0, shared_1.missingBotPermissions)(g?.botPermissions) },
            canManage,
        };
    }
    can(actor, guildId, perm) { return this.servers.allowed(actor, guildId, perm); }
    /**
     * Branding für das Dashboard des gewählten Servers – nur für Mitglieder dieses Servers (Guild-ID aus der Anfrage wird
     * serverseitig gegen die Mitgliedschaft geprüft; fremde Server verhalten sich wie nicht vorhanden).
     */
    async branding(actor, guildId) {
        const s = await this.prisma.discordServer.findUnique({ where: { guildId } });
        if (!s || s.archivedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Server nicht gefunden.');
        await this.servers.accessAsMember(actor, s.id);
        const cfg = await this.prisma.serverConfig.findUnique({ where: { serverId: s.id } });
        const d = this.parse(cfg?.data, s.name);
        const img = (id) => this.assetUrl(s.id, id);
        return {
            serverId: s.id, guildId: s.guildId, configured: !!cfg, setupCompleted: !!cfg?.setupCompletedAt, ...d.general, design: d.design,
            images: { logo: img(d.branding.logo), avatar: img(d.branding.avatar), banner: img(d.branding.banner), background: img(d.branding.background), areas: { dashboard: img(d.branding.areas.dashboard), tickets: img(d.branding.areas.tickets), team: img(d.branding.areas.team) } },
        };
    }
    /** Bilder dürfen nur aus dem eigenen Bestand dieses Servers kommen – und nur in ein passendes Feld. */
    async checkAssets(serverId, d) {
        const slots = [
            ['logo', d.branding.logo], ['avatar', d.branding.avatar], ['banner', d.branding.banner], ['background', d.branding.background],
            ['areas.dashboard', d.branding.areas.dashboard], ['areas.tickets', d.branding.areas.tickets], ['areas.team', d.branding.areas.team],
        ];
        const ids = (0, shared_1.configAssetIds)(d);
        const rows = ids.length ? await this.prisma.serverAsset.findMany({ where: { id: { in: ids } } }) : [];
        const errors = [];
        for (const [slot, id] of slots) {
            if (!id)
                continue;
            const a = rows.find((r) => r.id === id);
            // Bild eines anderen Servers wird wie ein unbekanntes behandelt (keine Rückschlüsse auf fremde Daten)
            if (!a || a.serverId !== serverId || a.deletedAt)
                errors.push({ path: `branding.${slot}`, message: 'Unbekanntes Bild. Bitte das Bild für diesen Server hochladen.' });
            else if (a.kind !== SLOT_KIND[slot])
                errors.push({ path: `branding.${slot}`, message: `Dieses Bild wurde als „${shared_1.BRANDING_IMAGES[a.kind]?.label ?? a.kind}“ hochgeladen und passt nicht in dieses Feld.` });
        }
        if (errors.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Konfiguration enthält ungültige Bilder.', errors);
    }
    async moduleState(serverId) {
        const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId } });
        return Object.fromEntries(shared_1.MODULES.map((m) => [m.key, m.system ? true : rows.find((r) => r.moduleKey === m.key)?.enabled ?? true]));
    }
    /** Speichern (erst nach erfolgreicher Prüfung). Jede Version wird als unveränderliche Revision abgelegt. */
    async save(actor, serverId, body) {
        const s = await this.servers.access(actor, serverId, 'servers.manage');
        const parsed = shared_1.serverConfigSchema.safeParse(body.data);
        if (!parsed.success)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Konfiguration ist ungültig.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
        const d = parsed.data;
        await this.checkAssets(serverId, d);
        const saved = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`server-config:${serverId}`}))`;
            const cur = await tx.serverConfig.findUnique({ where: { serverId } });
            if ((cur?.version ?? 0) !== body.version)
                throw conflict();
            const version = (cur?.version ?? 0) + 1;
            const row = cur
                ? await tx.serverConfig.update({ where: { serverId }, data: { data: json(d), version, updatedById: actor.userId } })
                : await tx.serverConfig.create({ data: { serverId, data: json(d), version, updatedById: actor.userId } });
            await tx.serverConfigRevision.create({ data: { serverId, version, data: json(d), modules: json(await this.moduleState(serverId)), note: body.note?.slice(0, 200) ?? null, createdById: actor.userId } });
            const before = cur ? this.parse(cur.data, s.name) : null;
            await this.audit.record(actor, { action: 'server.config.update', module: 'servers', entityType: 'ServerConfig', entityId: row.id, serverId: s.guildId,
                before: before ? { general: before.general, design: before.design, images: (0, shared_1.configAssetIds)(before).length } : undefined,
                after: { version, general: d.general, design: d.design, images: (0, shared_1.configAssetIds)(d).length } }, tx);
            return row;
        });
        return { version: saved.version, data: d, updatedAt: saved.updatedAt };
    }
    /** Fortschritt des Einrichtungsassistenten (zum späteren Weitermachen). */
    async setup(actor, serverId, b) {
        const s = await this.servers.access(actor, serverId, 'servers.manage');
        const cur = await this.prisma.serverConfig.findUnique({ where: { serverId } });
        if (b.complete && !cur?.version)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte zuerst die Einstellungen speichern (Schritt „Prüfen & speichern“).');
        const data = { setupStep: Math.max(cur?.setupStep ?? 0, b.step), ...(b.complete ? { setupCompletedAt: new Date() } : {}) };
        const row = cur ? await this.prisma.serverConfig.update({ where: { serverId }, data })
            : await this.prisma.serverConfig.create({ data: { serverId, data: json((0, shared_1.defaultServerConfig)(s.name)), version: 0, ...data } });
        if (b.complete)
            await this.audit.record(actor, { action: 'server.setup.complete', module: 'servers', entityType: 'ServerConfig', entityId: row.id, serverId: s.guildId });
        return { setupStep: row.setupStep, setupCompletedAt: row.setupCompletedAt };
    }
    async revisions(actor, serverId) {
        await this.servers.access(actor, serverId, 'servers.view');
        const rows = await this.prisma.serverConfigRevision.findMany({ where: { serverId }, orderBy: { version: 'desc' }, take: 100 });
        const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x) => !!x))] } }, select: { id: true, displayName: true } });
        return rows.map((r) => ({ version: r.version, note: r.note, createdAt: r.createdAt, createdBy: users.find((u) => u.id === r.createdById)?.displayName ?? null, data: r.data, modules: r.modules }));
    }
    /**
     * Frühere Version wiederherstellen: wird als NEUE Version gespeichert (nichts wird überschrieben oder gelöscht).
     * `modules`: auch die Modul-Schalter von damals übernehmen (Recht modules.manage; Daten deaktivierter Module bleiben erhalten).
     */
    async restore(actor, serverId, version, b) {
        const s = await this.servers.access(actor, serverId, 'servers.manage');
        const rev = await this.prisma.serverConfigRevision.findUnique({ where: { serverId_version: { serverId, version } } });
        if (!rev)
            throw new errors_1.AppError('NOT_FOUND', 'Diese Version gibt es nicht.');
        const data = shared_1.serverConfigSchema.safeParse(rev.data);
        if (!data.success)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Version ist nicht mehr gültig und kann nicht wiederhergestellt werden.');
        const r = await this.save(actor, serverId, { data: data.data, version: b.version, note: `Wiederhergestellt aus Version ${version}` });
        let modulesChanged = 0;
        if (b.modules) {
            const want = rev.modules;
            for (const m of await this.servers.modules(actor, serverId)) {
                if (m.system || typeof want[m.key] !== 'boolean' || want[m.key] === m.enabled)
                    continue;
                await this.servers.patchModule(actor, serverId, m.key, { enabled: want[m.key], version: m.version }).then(() => modulesChanged++, () => undefined);
            }
        }
        await this.audit.record(actor, { action: 'server.config.restore', module: 'servers', entityType: 'ServerConfig', entityId: serverId, serverId: s.guildId, after: { from: version, to: r.version, modulesChanged } });
        return { ...r, modulesChanged };
    }
    // ───────── Bilder ─────────
    /** Hochladen mit Prüfung von echtem Dateityp (Magic Bytes), Größe und Abmessungen; nie SVG, nie Client-Dateinamen im Dateisystem. */
    async upload(actor, serverId, kind, file) {
        const s = await this.servers.access(actor, serverId, 'servers.manage');
        if (!(kind in shared_1.BRANDING_IMAGES))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unbekannte Bildart.');
        if (!file?.buffer?.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Bilddatei auswählen.');
        const k = kind;
        const info = (0, shared_1.imageInfo)(file.buffer);
        if (!info)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Dateityp ist nicht erlaubt oder die Datei ist beschädigt. Erlaubt sind PNG, JPG und WebP (kein SVG).');
        // Angabe des Browsers muss zum tatsächlichen Inhalt passen (z. B. keine umbenannte Datei)
        if (file.mimetype && file.mimetype !== info.mime && !(file.mimetype === 'image/jpg' && info.mime === 'image/jpeg'))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Dateiendung bzw. Dateityp passen nicht zum Inhalt der Datei.');
        const bad = (0, shared_1.checkBrandingImage)(k, { mime: info.mime, size: file.buffer.length, width: info.width, height: info.height });
        if (bad)
            throw new errors_1.AppError('VALIDATION_FAILED', bad);
        const sha256 = (0, node_crypto_1.createHash)('sha256').update(file.buffer).digest('hex');
        const same = await this.prisma.serverAsset.findFirst({ where: { serverId, kind: k, sha256, deletedAt: null } });
        if (same)
            return this.assetOut(same);
        const storageKey = `${(0, node_crypto_1.randomUUID)()}.${EXT[info.mime]}`; // zufälliger, nicht erratbarer Name; feste Endung nach echtem Typ
        await (0, promises_1.mkdir)(this.dir, { recursive: true });
        await (0, promises_1.writeFile)(node_path_1.default.join(this.dir, storageKey), file.buffer, { mode: 0o640 });
        const originalName = node_path_1.default.basename(file.originalname || 'bild').replace(/[^\w.\- ]/g, '_').slice(0, 120);
        const a = await this.prisma.serverAsset.create({ data: { serverId, guildId: s.guildId, kind: k, mime: info.mime, size: file.buffer.length, width: info.width, height: info.height, sha256, storageKey, originalName, uploadedById: actor.userId } });
        await this.audit.record(actor, { action: 'server.asset.upload', module: 'servers', entityType: 'ServerAsset', entityId: a.id, serverId: s.guildId, after: { kind: k, mime: a.mime, size: a.size, width: a.width, height: a.height, sha256 } });
        return this.assetOut(a);
    }
    /** Bild ausliefern – nur an Mitglieder dieses Servers und nur, wenn das Bild zu diesem Server gehört. */
    async asset(actor, serverId, assetId) {
        await this.servers.accessAsMember(actor, serverId);
        const a = await this.prisma.serverAsset.findUnique({ where: { id: assetId } });
        if (!a || a.serverId !== serverId || a.deletedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Bild nicht gefunden.');
        const data = await (0, promises_1.readFile)(node_path_1.default.join(this.dir, a.storageKey)).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Bild nicht gefunden.'); });
        return { mime: a.mime, data };
    }
    /** IDs, die die aktuelle Konfiguration bzw. eine gespeicherte Version (Wiederherstellung) noch braucht. */
    async usedAssetIds(serverId) {
        const [cur, revs] = await Promise.all([this.prisma.serverConfig.findUnique({ where: { serverId } }), this.prisma.serverConfigRevision.findMany({ where: { serverId }, select: { data: true } })]);
        const ids = (raw) => { const r = shared_1.serverConfigSchema.safeParse(raw); return r.success ? (0, shared_1.configAssetIds)(r.data) : []; };
        return { current: new Set(cur ? ids(cur.data) : []), revisions: new Set(revs.flatMap((r) => ids(r.data))) };
    }
    /**
     * Bild entfernen: nur wenn weder die aktuelle Konfiguration noch eine gespeicherte Version es verwendet und ausdrücklich
     * bestätigt (`confirm`). Der Eintrag bleibt als Nachweis erhalten, nur die Datei wird gelöscht.
     */
    async removeAsset(actor, serverId, assetId, confirm) {
        const s = await this.servers.access(actor, serverId, 'servers.manage');
        const a = await this.prisma.serverAsset.findUnique({ where: { id: assetId } });
        if (!a || a.serverId !== serverId || a.deletedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Bild nicht gefunden.');
        const used = await this.usedAssetIds(serverId);
        if (used.current.has(a.id))
            throw new errors_1.AppError('CONFLICT', 'Das Bild wird in der aktuellen Konfiguration verwendet. Ersetze oder entferne es dort zuerst.');
        if (used.revisions.has(a.id))
            throw new errors_1.AppError('CONFLICT', 'Das Bild gehört zu einer gespeicherten früheren Version (Wiederherstellung). Es bleibt deshalb erhalten.');
        if (!confirm)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte das Entfernen ausdrücklich bestätigen.');
        await (0, promises_1.unlink)(node_path_1.default.join(this.dir, a.storageKey)).catch((e) => { if (e.code !== 'ENOENT')
            throw e; });
        await this.prisma.serverAsset.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
        await this.audit.record(actor, { action: 'server.asset.delete', module: 'servers', entityType: 'ServerAsset', entityId: a.id, serverId: s.guildId, after: { kind: a.kind, sha256: a.sha256 } });
        return { ok: true };
    }
};
exports.ServerConfigService = ServerConfigService;
exports.ServerConfigService = ServerConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, servers_service_1.ServersService, audit_service_1.AuditService,
        discord_service_1.DiscordService])
], ServerConfigService);
//# sourceMappingURL=server-config.service.js.map