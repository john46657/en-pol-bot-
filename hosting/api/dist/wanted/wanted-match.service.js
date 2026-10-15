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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WantedMatchService = exports.wantedRef = exports.matchSettingsSchema = exports.HIT_REVIEW_STATUSES = exports.MATCH_TYPES = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const discord_service_1 = require("../discord/discord.service");
const notify_service_1 = require("../notifications/notify.service");
const realtime_service_1 = require("../realtime/realtime.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const guild_context_1 = require("../common/guild-context");
const pagination_1 = require("../common/pagination");
exports.MATCH_TYPES = ['ROBLOX_ID', 'NAME'];
exports.HIT_REVIEW_STATUSES = ['CONFIRMED', 'PENDING', 'VERIFIED', 'DISMISSED'];
const SETTINGS_KEY = 'wanted.erlcMatch';
const STATE_KEY = 'wanted.erlcMatch.state';
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
exports.matchSettingsSchema = zod_1.z.object({
    /** Abgleich bei jedem erfolgreichen ER:LC-Abruf */
    enabled: zod_1.z.boolean().default(true),
    /** Bestätigte Treffer (Roblox-ID) in Discord melden */
    notifyDiscord: zod_1.z.boolean().default(true),
    /** Auch mögliche Übereinstimmungen (nur Name) in Discord melden – standardmäßig nur im Dashboard */
    notifyPossible: zod_1.z.boolean().default(false),
    /** Eigener interner Kanal; leer = Fahndungs-Kanal aus den Discord-Bot-Channels */
    channelId: sf.nullable().default(null),
});
const lc = (s) => s.trim().toLowerCase();
const playerKey = (p) => (p.id ? `id:${p.id}` : `name:${lc(p.name)}`);
/** Kurze, gut lesbare Fahndungsnummer aus der ID (Fahndungen haben keine eigene laufende Nummer). */
const wantedRef = (id) => `FA-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
exports.wantedRef = wantedRef;
const isUnique = (e) => e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/**
 * Automatischer Abgleich ER:LC-Spieler ↔ aktive Fahndungen (Personen).
 *
 * - Beitritte: Die ER:LC-API bietet für Beitritte keine offiziell dokumentierten Event-Webhooks; die Spielerliste aus
 *   GET /v2/server (ohnehin bei jedem Abruf geladen) wird daher mit den offenen Sitzungen verglichen. Neu in der Liste = Beitritt,
 *   nicht mehr in der Liste = verlassen. Es entstehen keine zusätzlichen API-Anfragen.
 * - Identifikation: bestätigt nur bei exakt gleicher Roblox-ID (Akte ↔ API). Name/Alias allein ergibt nur eine
 *   „mögliche Übereinstimmung“, die manuell geprüft werden muss.
 * - Je Sitzung und Fahndung höchstens ein Treffer (eindeutiger Index) → keine Wiederholungen bei jedem Abruf.
 * - Fällt die API aus, wird nichts abgeglichen und nichts geschlossen; offene Sitzungen bleiben bis zum nächsten Erfolg bestehen.
 * - Es wird nie etwas im Spiel ausgelöst (kein Kick/Bann/Befehl) – reine Information.
 */
let WantedMatchService = class WantedMatchService {
    prisma;
    audit;
    timeline;
    discord;
    notify;
    rt;
    log = new common_1.Logger('WantedMatch');
    constructor(prisma, audit, timeline, discord, notify, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.discord = discord;
        this.notify = notify;
        this.rt = rt;
    }
    // ---- Einstellungen (je Discord-Server) ----
    async settings(guildId) {
        const read = async () => exports.matchSettingsSchema.parse((await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }))?.value ?? {});
        try {
            return guildId === undefined ? await read() : await (0, guild_context_1.runInGuild)(guildId, read);
        }
        catch {
            return exports.matchSettingsSchema.parse({});
        }
    }
    async saveSettings(actor, patch) {
        const before = await this.settings();
        const after = exports.matchSettingsSchema.parse({ ...before, ...patch });
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: after }, update: { value: after } });
            await this.audit.record(actor, { action: 'wanted.match_settings', module: 'wanted', entityType: 'Setting', entityId: SETTINGS_KEY, before, after }, tx);
        });
        return after;
    }
    async saveState(erlcServerId, patch) {
        try {
            const row = await this.prisma.systemSetting.findUnique({ where: { key: STATE_KEY } });
            const all = (row?.value && typeof row.value === 'object' ? row.value : {});
            const prev = all[erlcServerId] ?? { lastRunAt: new Date().toISOString(), lastOkAt: null, lastError: null, online: 0, joined: 0, hits: 0 };
            all[erlcServerId] = { ...prev, ...patch };
            await this.prisma.systemSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value: all }, update: { value: all } });
        }
        catch (e) {
            this.log.warn(`state: ${e instanceof Error ? e.message : e}`);
        }
    }
    /**
     * Nach jedem ERFOLGREICHEN Abruf (ErlcService.poll). `players` = undefined → Spielerliste nicht freigegeben/geliefert: nichts tun.
     * Läuft ohne Server-Kontext; der Akten-Bereich ergibt sich aus dem Discord-Server des ER:LC-Servers.
     */
    async onPlayers(s, players, now = new Date()) {
        const at = now.toISOString();
        if (!players) {
            await this.saveState(s.id, { lastRunAt: at, lastError: 'Spielerliste nicht freigegeben (Funktion „players“) – kein Abgleich.' });
            return { joined: 0, left: 0, hits: 0 };
        }
        const cfg = await this.settings(s.guildId);
        try {
            const { joined, left } = await this.diffSessions(s.id, players, now);
            const hits = cfg.enabled && joined.length ? await this.match(s, joined, cfg) : 0;
            await this.saveState(s.id, { lastRunAt: at, lastOkAt: at, lastError: cfg.enabled ? null : 'Abgleich ist ausgeschaltet.', online: players.length, joined: joined.length, hits });
            return { joined: joined.length, left, hits };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log.error(`Abgleich ${s.name}: ${msg}`);
            await this.saveState(s.id, { lastRunAt: at, lastError: `Abgleich fehlgeschlagen: ${msg.slice(0, 200)}` });
            return { joined: 0, left: 0, hits: 0 };
        }
    }
    /** Spielerliste ↔ offene Sitzungen: neue Sitzungen anlegen, verschwundene schließen, gebliebene „zuletzt gesehen“ setzen. */
    async diffSessions(erlcServerId, players, now) {
        const current = new Map();
        for (const p of players)
            if (p.name || p.id)
                current.set(playerKey(p), p);
        const open = await this.prisma.erlcPlayerSession.findMany({ where: { erlcServerId, leftAt: null } });
        const openKeys = new Set(open.map((o) => o.playerKey));
        const gone = open.filter((o) => !current.has(o.playerKey)).map((o) => o.id);
        const stay = open.filter((o) => current.has(o.playerKey)).map((o) => o.id);
        if (gone.length)
            await this.prisma.erlcPlayerSession.updateMany({ where: { id: { in: gone }, leftAt: null }, data: { leftAt: now } });
        if (stay.length)
            await this.prisma.erlcPlayerSession.updateMany({ where: { id: { in: stay } }, data: { lastSeenAt: now } });
        const joined = [];
        for (const [key, p] of current) {
            if (openKeys.has(key))
                continue;
            try {
                const row = await this.prisma.erlcPlayerSession.create({ data: { erlcServerId, playerKey: key, robloxUserId: p.id, playerName: p.name.slice(0, 64), joinedAt: now, lastSeenAt: now } });
                joined.push({ sessionId: row.id, player: p });
            }
            catch (e) {
                if (!isUnique(e))
                    throw e;
            } // gleichzeitig von einer anderen Instanz angelegt → dort abgeglichen
        }
        return { joined, left: gone.length };
    }
    async match(s, joined, cfg) {
        const space = (0, guild_context_1.recordSpace)(s.guildId) ?? null;
        const now = new Date();
        // nur aktive, nicht abgelaufene Personen-Fahndungen im Akten-Bereich dieses Servers (archivierte/aufgehobene zählen nie)
        const wanted = await this.prisma.wantedRecord.findMany({ where: { serverId: space, status: 'ACTIVE', personId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
        if (!wanted.length)
            return 0;
        const persons = await this.prisma.person.findMany({ where: { id: { in: wanted.map((w) => w.personId) }, status: 'ACTIVE' }, select: { id: true, robloxUserId: true, robloxUsername: true, aliases: true } });
        const byId = new Map(), byName = new Map();
        const push = (m, k, w) => m.set(k, [...(m.get(k) ?? []), w]);
        const personOf = new Map(persons.map((p) => [p.id, p]));
        for (const w of wanted) {
            const p = personOf.get(w.personId);
            if (!p)
                continue;
            if (p.robloxUserId)
                push(byId, p.robloxUserId, w);
            for (const n of new Set([p.robloxUsername, ...p.aliases].filter(Boolean).map(lc)))
                push(byName, n, w);
        }
        let created = 0;
        for (const { sessionId, player } of joined) {
            const idHits = player.id ? byId.get(player.id) ?? [] : [];
            const done = new Set(idHits.map((w) => w.id));
            const nameHits = (byName.get(lc(player.name)) ?? []).filter((w) => !done.has(w.id));
            const cands = [
                ...idHits.map((w) => ({ w, matchType: 'ROBLOX_ID', reviewStatus: 'CONFIRMED', note: null })),
                ...nameHits.map((w) => {
                    const stored = personOf.get(w.personId)?.robloxUserId ?? null;
                    const note = !player.id ? 'Die ER:LC-API hat für diesen Spieler keine Roblox-ID geliefert.'
                        : stored ? `Roblox-ID weicht von der Akte ab (Akte: ${stored}) – vermutlich eine andere Person.`
                            : 'In der Akte ist keine Roblox-ID hinterlegt – nur der Name stimmt überein.';
                    return { w, matchType: 'NAME', reviewStatus: 'PENDING', note };
                }),
            ];
            for (const c of cands) {
                const hit = await this.prisma.wantedHit.create({ data: {
                        serverId: c.w.serverId, wantedId: c.w.id, personId: c.w.personId, erlcServerId: s.id, erlcServerName: s.name, sessionId,
                        playerName: player.name.slice(0, 64), robloxUserId: player.id, matchType: c.matchType, reviewStatus: c.reviewStatus, matchNote: c.note,
                        wantedReason: c.w.reason, wantedPriority: c.w.priority, detectedAt: now,
                    } }).catch((e) => { if (isUnique(e))
                    return null; throw e; });
                if (!hit)
                    continue;
                created++;
                await this.timeline.add(this.prisma, { entityType: 'Wanted', entityId: c.w.id, action: 'wanted.hit', summary: `${c.matchType === 'ROBLOX_ID' ? 'Fahndungstreffer (Roblox-ID)' : 'Mögliche Übereinstimmung (Name)'}: ${player.name} auf ${s.name}`, actorId: null }).catch(() => undefined);
                await this.announce(s, hit, cfg);
            }
        }
        if (created)
            this.rt.publish('cad', 'wanted.hit', { erlcServerId: s.id, count: created });
        return created;
    }
    /** Dashboard-Benachrichtigung (wanted.view) + optional Discord. Fehler dürfen den Abgleich nie stören. */
    async announce(s, hit, cfg) {
        const confirmed = hit.reviewStatus === 'CONFIRMED';
        const ref = (0, exports.wantedRef)(hit.wantedId);
        await this.notify.notifyPermission('wanted.view', {
            type: 'wanted.hit', title: `${confirmed ? '🚨 Fahndungstreffer' : '❔ Mögliche Übereinstimmung'}: ${hit.playerName}`.slice(0, 200),
            body: `${ref} · ${hit.wantedReason} · ER:LC-Server ${s.name}${confirmed ? '' : ' · manuelle Prüfung erforderlich'}`, entityType: 'Wanted', entityId: hit.wantedId,
        }, { guildId: s.guildId });
        if (!cfg.notifyDiscord || (!confirmed && !cfg.notifyPossible))
            return;
        let status = 'SKIPPED', outboxId = null, error = null;
        try {
            const channels = await (0, guild_context_1.runInGuild)(s.guildId, () => this.discord.channels());
            const ids = [cfg.channelId, ...(cfg.channelId ? [] : String(channels.wanted ?? '').split(/[\s,;]+/))].filter((c) => !!c && /^\d{15,25}$/.test(c));
            if (ids.length) {
                // Bewusst knapp: keine Personalien, keine Beschreibung – nur was zum Erkennen nötig ist
                outboxId = await this.discord.enqueue('wanted', 'wanted.hit', {
                    id: hit.id, wantedId: hit.wantedId, reference: ref, player: hit.playerName, robloxUserId: hit.robloxUserId, reason: hit.wantedReason, priority: hit.wantedPriority,
                    server: s.name, detectedAt: hit.detectedAt.toISOString(), confirmed, channelIds: ids, dashboardUrl: (0, web_url_1.webUrl)(`/wanted/hits?id=${hit.id}`),
                }, { always: true });
                status = outboxId ? 'QUEUED' : 'FAILED';
                if (!outboxId)
                    error = 'Konnte nicht an den Bot übergeben werden.';
            }
            else
                error = 'Kein Discord-Kanal für Fahndungen eingestellt.';
        }
        catch (e) {
            status = 'FAILED';
            error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        }
        await this.prisma.wantedHit.update({ where: { id: hit.id }, data: { notifyStatus: status, notifyOutboxId: outboxId, notifyError: error } }).catch(() => undefined);
    }
    // ---- Dashboard ----
    async list(p, f) {
        const where = {
            ...(f.status ? { reviewStatus: f.status } : {}), ...(f.wantedId ? { wantedId: f.wantedId } : {}), ...(f.matchType ? { matchType: f.matchType } : {}),
            ...(p.q ? { OR: [{ playerName: { contains: p.q, mode: 'insensitive' } }, { robloxUserId: p.q }, { wantedReason: { contains: p.q, mode: 'insensitive' } }] } : {}),
        };
        const [items, total] = await Promise.all([this.prisma.wantedHit.findMany({ where, orderBy: { detectedAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.wantedHit.count({ where })]);
        return (0, pagination_1.pageResult)(await this.decorate(items), total, p);
    }
    async get(id) {
        const h = await this.prisma.wantedHit.findUnique({ where: { id } });
        if (!h)
            throw new errors_1.AppError('NOT_FOUND', 'Fahndungstreffer nicht gefunden.');
        return (await this.decorate([h]))[0];
    }
    /** Aktueller Fahndungsstatus, Person, Sitzung (online?), Prüfer und Zustellung nach Discord ergänzen. */
    async decorate(items) {
        const ids = (xs) => [...new Set(xs.filter((x) => !!x))];
        const [wanted, persons, sessions, users, outbox] = await Promise.all([
            this.prisma.wantedRecord.findMany({ where: { id: { in: ids(items.map((i) => i.wantedId)) } }, select: { id: true, status: true, priority: true, reason: true } }),
            this.prisma.person.findMany({ where: { id: { in: ids(items.map((i) => i.personId)) } }, select: { id: true, robloxUsername: true, robloxUserId: true } }),
            this.prisma.erlcPlayerSession.findMany({ where: { id: { in: ids(items.map((i) => i.sessionId)) } }, select: { id: true, joinedAt: true, lastSeenAt: true, leftAt: true } }),
            this.prisma.user.findMany({ where: { id: { in: ids(items.map((i) => i.reviewedById)) } }, select: { id: true, displayName: true } }),
            this.prisma.discordOutbox.findMany({ where: { id: { in: ids(items.map((i) => i.notifyOutboxId)) } }, select: { id: true, sentAt: true, attempts: true, lastError: true } }),
        ]);
        const m = (xs) => new Map(xs.map((x) => [x.id, x]));
        const W = m(wanted), P = m(persons), S = m(sessions), U = m(users), O = m(outbox);
        return items.map((h) => {
            const o = h.notifyOutboxId ? O.get(h.notifyOutboxId) : undefined;
            // Zustellung: QUEUED wird zu SENT (Bot hat bestätigt) bzw. FAILED (5 Versuche ohne Erfolg)
            const delivery = h.notifyStatus !== 'QUEUED' ? h.notifyStatus : o?.sentAt ? 'SENT' : o && o.attempts >= 5 ? 'FAILED' : 'QUEUED';
            return {
                ...h, reference: (0, exports.wantedRef)(h.wantedId), wanted: W.get(h.wantedId) ?? null, person: h.personId ? P.get(h.personId) ?? null : null,
                session: h.sessionId ? S.get(h.sessionId) ?? null : null, reviewedByName: h.reviewedById ? U.get(h.reviewedById)?.displayName ?? null : null,
                delivery, deliveryError: delivery === 'FAILED' ? h.notifyError ?? o?.lastError ?? null : h.notifyStatus === 'SKIPPED' ? h.notifyError : null,
            };
        });
    }
    /** Übersicht: offene Prüfungen, Treffer der letzten 24 h, Abgleich-/Verbindungsstatus je ER:LC-Server. */
    async summary(guildId) {
        const since = new Date(Date.now() - 24 * 3600_000);
        const [pending, confirmed24h, total, servers, state] = await Promise.all([
            this.prisma.wantedHit.count({ where: { reviewStatus: 'PENDING' } }),
            this.prisma.wantedHit.count({ where: { reviewStatus: { in: ['CONFIRMED', 'VERIFIED'] }, detectedAt: { gte: since } } }),
            this.prisma.wantedHit.count(),
            this.prisma.erlcServer.findMany({ select: { id: true, name: true, active: true, status: true, lastSyncAt: true, lastError: true, lastErrorAt: true, features: true } }),
            this.prisma.systemSetting.findUnique({ where: { key: STATE_KEY } }),
        ]);
        const st = (state?.value && typeof state.value === 'object' ? state.value : {});
        return {
            pending, confirmed24h, total, settings: await this.settings(guildId === undefined ? undefined : guildId),
            servers: servers.map((s) => ({ id: s.id, name: s.name, active: s.active, status: s.active ? s.status : 'DISABLED', lastSyncAt: s.lastSyncAt, lastError: s.status === 'CONNECTED' ? null : s.lastError, lastErrorAt: s.lastErrorAt, playersEnabled: s.features.includes('players'), match: st[s.id] ?? null })),
        };
    }
    /**
     * Manuelle Prüfung. PENDING → VERIFIED/DISMISSED; ein ID-Treffer (CONFIRMED) kann verworfen werden (z. B. falsche ID in der Akte).
     * `storeRobloxId`: bei Bestätigung die Roblox-ID aus ER:LC in die Akte übernehmen (nur wenn dort noch keine steht) –
     * künftige Beitritte werden dann eindeutig erkannt.
     */
    async review(actor, id, d) {
        return this.prisma.$transaction(async (tx) => {
            const h = await tx.wantedHit.findUnique({ where: { id } });
            if (!h)
                throw new errors_1.AppError('NOT_FOUND', 'Fahndungstreffer nicht gefunden.');
            const allowed = h.reviewStatus === 'PENDING' || (h.reviewStatus === 'CONFIRMED' && d.decision === 'DISMISSED');
            if (!allowed)
                throw new errors_1.AppError('CONFLICT', 'Dieser Treffer wurde bereits geprüft.');
            const done = await tx.wantedHit.updateMany({ where: { id, reviewStatus: h.reviewStatus }, data: { reviewStatus: d.decision, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: d.note } });
            if (done.count === 0)
                throw new errors_1.AppError('CONFLICT', 'Dieser Treffer wurde gerade von jemand anderem geprüft.');
            let stored = false;
            if (d.decision === 'VERIFIED' && d.storeRobloxId) {
                if (!h.robloxUserId)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Die ER:LC-API hat für diesen Spieler keine Roblox-ID geliefert – es gibt nichts zu übernehmen.');
                const p = h.personId ? await tx.person.findUnique({ where: { id: h.personId } }) : null;
                if (!p)
                    throw new errors_1.AppError('NOT_FOUND', 'Person der Fahndung nicht gefunden.');
                if (p.robloxUserId && p.robloxUserId !== h.robloxUserId)
                    throw new errors_1.AppError('CONFLICT', 'In der Akte steht bereits eine andere Roblox-ID.');
                if (!p.robloxUserId) {
                    const other = await tx.person.findFirst({ where: { serverId: p.serverId, robloxUserId: h.robloxUserId, id: { not: p.id } }, select: { id: true, robloxUsername: true } });
                    if (other)
                        throw new errors_1.AppError('CONFLICT', `Die Roblox-ID gehört bereits zur Akte „${other.robloxUsername}“ – bitte Akten zusammenführen.`, { personId: other.id });
                    await tx.person.update({ where: { id: p.id }, data: { robloxUserId: h.robloxUserId, version: { increment: 1 } } });
                    await this.timeline.add(tx, { entityType: 'Person', entityId: p.id, action: 'person.roblox_id', summary: `Roblox-ID ${h.robloxUserId} nach geprüftem Fahndungstreffer übernommen`, actorId: actor.userId });
                    stored = true;
                }
            }
            await this.timeline.add(tx, { entityType: 'Wanted', entityId: h.wantedId, action: `wanted.hit_${d.decision.toLowerCase()}`, summary: `Treffer ${h.playerName}: ${d.decision === 'VERIFIED' ? 'bestätigt' : 'verworfen'} – ${d.note}`.slice(0, 300), actorId: actor.userId });
            await this.audit.record(actor, { action: `wanted.hit_${d.decision.toLowerCase()}`, module: 'wanted', entityType: 'WantedHit', entityId: id, before: { reviewStatus: h.reviewStatus }, after: { reviewStatus: d.decision, robloxIdStored: stored }, reason: d.note }, tx);
            return { id, reviewStatus: d.decision, robloxIdStored: stored };
        });
    }
};
exports.WantedMatchService = WantedMatchService;
exports.WantedMatchService = WantedMatchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService,
        discord_service_1.DiscordService, notify_service_1.NotifyService, realtime_service_1.RealtimeService])
], WantedMatchService);
//# sourceMappingURL=wanted-match.service.js.map