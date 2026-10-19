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
exports.ErlcWantedService = exports.wantedSpaceWhere = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const realtime_service_1 = require("../realtime/realtime.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const guild_context_1 = require("../common/guild-context");
const pagination_1 = require("../common/pagination");
const cad_notify_service_1 = require("./cad-notify.service");
const validId = (id) => !!id && /^\d{1,20}$/.test(id);
/**
 * Fahndungen, die für einen ER:LC-Server gelten: Akten-Bereich seines Discord-Servers und der gemeinsame Bestand
 * (z. B. unter „Alle Server“ angelegt) – sonst würde eine solche Fahndung nie abgeglichen.
 */
const wantedSpaceWhere = (space) => (space === null ? { serverId: null } : { OR: [{ serverId: space }, { serverId: null }] });
exports.wantedSpaceWhere = wantedSpaceWhere;
/** Wanted-Sterne eines Spielers laut letztem Abruf (für die Anzeige). */
const starsOf = (snap, id, name) => {
    const p = (snap?.players ?? []).find((x) => (id ? x.id === id : x.name === name));
    return Math.max(0, Math.floor(p?.wantedStars ?? 0));
};
/** Priorität nach Wanted-Sternen: 1–2 mittel, 3–4 hoch, ab 5 dringend. */
const inGamePriority = (n) => (n >= 5 ? 'URGENT' : n >= 3 ? 'HIGH' : 'MEDIUM');
const activePersonWanted = (space, now) => ({ AND: [(0, exports.wantedSpaceWhere)(space), { status: 'ACTIVE', personId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] });
/**
 * Automatischer Fahndungsabgleich ER:LC ↔ eigene Fahndungen.
 * - Die ER:LC-API kennt keine Beitritts-Ereignisse per Webhook (nur Notrufe und „;“-Nachrichten). Darum: nach jedem erfolgreichen
 *   Abruf von GET /v2/server die Spielerliste mit der vorherigen vergleichen (Sitzungen in ErlcPlayerPresence, übersteht Neustarts).
 * - Je Sitzung und Fahndung höchstens ein Treffer (Unique-Index) → keine Wiederholung bei jedem Abfragezyklus, keine doppelten Discord-Meldungen.
 * - Bestätigt nur bei exakt gleicher Roblox-ID (aus der API). Name/Alias = „Mögliche Übereinstimmung“, manuelle Prüfung nötig.
 * - Nur Information: es wird nie ein Befehl (Kick/Ban o. ä.) an den ER:LC-Server gesendet.
 * - API-Ausfall: dieser Abgleich läuft gar nicht (nur nach erfolgreichem Abruf) → keine erfundenen Treffer, Sitzungen bleiben erhalten.
 */
let ErlcWantedService = class ErlcWantedService {
    prisma;
    audit;
    timeline;
    rt;
    notify;
    log = new common_1.Logger('ErlcWanted');
    constructor(prisma, audit, timeline, rt, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.rt = rt;
        this.notify = notify;
    }
    /** Nach einem erfolgreichen Abruf: Sitzungen fortschreiben, aktive Fahndungen abgleichen, neue Treffer melden. Fehler stören den Abruf nie. */
    async check(s, snap) {
        if (!s.features.includes('players') || !snap.players)
            return { created: 0, skipped: 'players-disabled' };
        try {
            const created = await this.run(s, snap);
            await this.prisma.erlcServer.update({ where: { id: s.id }, data: { wantedCheckAt: new Date(), wantedCheckError: null } });
            return { created };
        }
        catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
            this.log.error(`Fahndungsabgleich ${s.name}: ${msg}`);
            await this.prisma.erlcServer.update({ where: { id: s.id }, data: { wantedCheckError: msg } }).catch(() => undefined);
            return { created: 0, error: msg };
        }
    }
    /** Server laut API leer/offline (nicht: API nicht erreichbar) → alle Sitzungen sind beendet. */
    async serverEmpty(serverId) {
        await this.prisma.erlcPlayerPresence.deleteMany({ where: { serverId } }).catch(() => undefined);
        await this.endInGame(serverId, [], new Date()).catch(() => undefined);
    }
    /**
     * „Im Spiel gesucht“ gilt nur, solange der Spieler im Spiel gesucht wird: Treffer ohne Prüfung, deren Aufenthalt
     * vorbei ist (Server verlassen, Server leer) oder deren Spieler keine Sterne mehr hat, werden automatisch beendet.
     */
    async endInGame(serverId, stillWanted, now) {
        const r = await this.prisma.erlcWantedHit.updateMany({
            where: { erlcServerId: serverId, matchType: 'ERLC_WANTED', reviewStatus: 'NEW', sessionId: { notIn: stillWanted } },
            data: { reviewStatus: 'ENDED', reviewedAt: now, reviewNote: 'Automatisch: Spieler hat keine Wanted-Sterne mehr oder den Server verlassen' },
        });
        if (r.count)
            this.rt.publish('cad', 'wanted.hits', { serverId, count: 0 });
        return r.count;
    }
    async run(s, snap) {
        const now = new Date();
        const players = (snap.players ?? []).filter((p) => p.name?.trim()).map((p) => ({ name: p.name.trim(), id: validId(p.id) ? p.id : null }));
        // Wanted-Sterne im Spiel (ER:LC) je Spieler
        const stars = new Map((snap.players ?? []).filter((p) => p.name?.trim()).map((p) => [(0, shared_1.playerKey)({ name: p.name.trim(), id: validId(p.id) ? p.id : null }), Math.max(0, Math.floor(p.wantedStars ?? 0))]));
        // Beitritte laut Join-Logs (nur wenn freigegeben): erkennt „kurz raus und wieder rein“ zwischen zwei Abfragen
        const joins = new Map();
        for (const j of snap.joinLogs ?? [])
            if (j.join && j.timestamp) {
                const k = (0, shared_1.playerKey)({ name: j.player, id: validId(j.playerId) ? j.playerId : null });
                joins.set(k, Math.max(joins.get(k) ?? 0, j.timestamp * 1000));
            }
        const previous = await this.prisma.erlcPlayerPresence.findMany({ where: { serverId: s.id } });
        const d = (0, shared_1.diffPresence)(players, previous, joins);
        if (d.left.length || d.rejoined.length)
            await this.prisma.erlcPlayerPresence.deleteMany({ where: { id: { in: [...d.left, ...d.rejoined.map((r) => r.row)].map((r) => r.id) } } });
        if (d.stayed.length)
            await this.prisma.erlcPlayerPresence.updateMany({ where: { id: { in: d.stayed.map((x) => x.row.id) } }, data: { lastSeenAt: now } });
        // Namensänderung bei gleicher ID: Namen nachziehen
        for (const x of d.stayed) {
            const old = previous.find((p) => p.id === x.row.id);
            if (old && old.playerName !== x.player.name)
                await this.prisma.erlcPlayerPresence.update({ where: { id: old.id }, data: { playerName: x.player.name } }).catch(() => undefined);
        }
        for (const p of [...d.joined, ...d.rejoined.map((r) => r.player)]) {
            await this.prisma.erlcPlayerPresence.create({ data: { serverId: s.id, playerKey: (0, shared_1.playerKey)(p), playerName: p.name, robloxUserId: p.id, joinedAt: now, lastSeenAt: now } })
                .catch((e) => { if (!(e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
                throw e; });
        }
        const sessions = await this.prisma.erlcPlayerPresence.findMany({ where: { serverId: s.id } });
        await this.endInGame(s.id, sessions.filter((x) => (stars.get(x.playerKey) ?? 0) > 0).map((x) => x.id), now);
        if (!sessions.length)
            return 0;
        const space = (0, guild_context_1.recordSpace)(s.guildId) ?? null;
        let created = await this.inGameWanted(s, sessions, stars, space, now);
        // Aktive Personen-Fahndungen im Akten-Bereich des Discord-Servers dieses ER:LC-Servers
        const wanted = await this.prisma.wantedRecord.findMany({ where: activePersonWanted(space, now) });
        if (!wanted.length) {
            if (created)
                this.rt.publish('cad', 'wanted.hits', { serverId: s.id, count: created });
            return created;
        }
        const persons = await this.prisma.person.findMany({ where: { id: { in: wanted.map((w) => w.personId) } }, select: { id: true, robloxUserId: true, robloxUsername: true, aliases: true } });
        const byPerson = new Map(persons.map((p) => [p.id, p]));
        const subjects = wanted.flatMap((w) => { const p = byPerson.get(w.personId); return p ? [{ wantedId: w.id, personId: p.id, robloxUserId: validId(p.robloxUserId) ? p.robloxUserId : null, robloxUsername: p.robloxUsername, aliases: p.aliases }] : []; });
        const wantedById = new Map(wanted.map((w) => [w.id, w]));
        const existing = await this.prisma.erlcWantedHit.findMany({ where: { sessionId: { in: sessions.map((x) => x.id) } }, select: { sessionId: true, wantedId: true } });
        const done = new Set(existing.map((h) => `${h.sessionId}|${h.wantedId}`));
        for (const sess of sessions) {
            for (const m of (0, shared_1.matchWantedPlayer)({ name: sess.playerName, id: sess.robloxUserId }, subjects)) {
                if (done.has(`${sess.id}|${m.wantedId}`))
                    continue;
                const w = wantedById.get(m.wantedId);
                const hit = await this.prisma.erlcWantedHit.create({ data: {
                        guildId: s.guildId, erlcServerId: s.id, serverName: s.name, wantedId: w.id, wantedNumber: w.number, wantedReason: w.reason, wantedPriority: w.priority, personId: m.personId,
                        sessionId: sess.id, sessionStartedAt: sess.joinedAt, playerName: sess.playerName, robloxUserId: sess.robloxUserId, matchType: m.matchType, identified: m.identified,
                        reviewStatus: m.identified ? 'NEW' : 'REVIEW_REQUIRED', detectedAt: now,
                    } }).catch((e) => { if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                    return null; throw e; }); // parallel schon angelegt
                if (!hit)
                    continue;
                done.add(`${sess.id}|${m.wantedId}`);
                created++;
                await this.timeline.add(this.prisma, { entityType: 'Wanted', entityId: w.id, action: m.identified ? 'wanted.hit' : 'wanted.possible_hit',
                    summary: `${m.identified ? 'Fahndungstreffer' : 'Mögliche Übereinstimmung'} auf ${s.name}: ${sess.playerName}${sess.robloxUserId ? ` (Roblox-ID ${sess.robloxUserId})` : ''} – ${shared_1.WANTED_MATCH_LABELS[m.matchType]}`, actorId: null }).catch(() => undefined);
                await this.notifyHit(hit, s, w.status);
            }
        }
        if (created)
            this.rt.publish('cad', 'wanted.hits', { serverId: s.id, count: created });
        return created;
    }
    /**
     * Im Spiel gesucht: Spieler mit ER:LC-Wanted-Sternen → ein Treffer je Aufenthalt (Roblox-ID von der API, ohne eigene Fahndung).
     * Steigen die Sterne während des Aufenthalts, wird nur der Treffer nachgezogen – keine neue Meldung.
     */
    async inGameWanted(s, sessions, stars, space, now) {
        const wantedNow = sessions.filter((x) => (stars.get(x.playerKey) ?? 0) > 0);
        if (!wantedNow.length)
            return 0;
        const existing = new Map((await this.prisma.erlcWantedHit.findMany({ where: { sessionId: { in: wantedNow.map((x) => x.id) }, matchType: 'ERLC_WANTED' }, select: { id: true, sessionId: true, wantedReason: true, reviewStatus: true } })).map((h) => [h.sessionId, h]));
        const ids = wantedNow.map((x) => x.robloxUserId).filter((x) => !!x);
        const persons = ids.length ? await this.prisma.person.findMany({ where: { serverId: space, robloxUserId: { in: ids } }, select: { id: true, robloxUserId: true } }) : [];
        let created = 0;
        for (const sess of wantedNow) {
            const n = stars.get(sess.playerKey);
            const reason = `Im Spiel gesucht (${n} ${n === 1 ? 'Stern' : 'Sterne'} ★)`;
            const old = existing.get(sess.id);
            if (old) {
                const before = Number(/\((\d+)/.exec(old.wantedReason)?.[1] ?? 0);
                // Sterne im selben Aufenthalt wieder da → Treffer wieder offen (ohne neue Meldung)
                const reopen = old.reviewStatus === 'ENDED' ? { reviewStatus: 'NEW', reviewedAt: null, reviewNote: null } : {};
                if (n > before || old.reviewStatus === 'ENDED')
                    await this.prisma.erlcWantedHit.update({ where: { id: old.id }, data: { ...reopen, wantedReason: reason, wantedPriority: inGamePriority(n) } }).catch(() => undefined);
                continue;
            }
            const hit = await this.prisma.erlcWantedHit.create({ data: {
                    guildId: s.guildId, erlcServerId: s.id, serverName: s.name, wantedId: null, wantedNumber: null, wantedReason: reason, wantedPriority: inGamePriority(n),
                    personId: persons.find((p) => p.robloxUserId === sess.robloxUserId)?.id ?? null, sessionId: sess.id, sessionStartedAt: sess.joinedAt, playerName: sess.playerName,
                    robloxUserId: sess.robloxUserId, matchType: 'ERLC_WANTED', identified: true, reviewStatus: 'NEW', detectedAt: now,
                } });
            created++;
            await this.notifyHit(hit, s, 'ACTIVE');
        }
        return created;
    }
    /**
     * Discord (über den vorhandenen Bot, Ausgang/Outbox): Kanäle aus CAD → Einstellungen → Discord-Kanäle, Ereignis „Fahndungstreffer“
     * bzw. „Mögliche Fahndungsübereinstimmung“. Nie an verbundene Server. Nur das Nötigste: keine Beschreibung, keine Personalien.
     * Einmal je Treffer; ein Fehler beim Einreihen wird am Treffer vermerkt, der Treffer selbst bleibt.
     */
    async notifyHit(hit, s, wantedStatus) {
        let status = 'NOT_CONFIGURED', outboxId = null;
        try {
            const inGame = hit.matchType === 'ERLC_WANTED';
            const event = inGame ? 'wanted.erlc' : hit.identified ? 'wanted.hit' : 'wanted.possible';
            // Kanalzuordnungen gelten je Discord-Server → Konfiguration dieses Servers lesen; „im Spiel gesucht“ ohne eigenen Kanal → Fahndungstreffer
            let t = await (0, guild_context_1.runInGuild)(s.guildId, () => this.notify.targets(event, s.guildId));
            if (inGame && !t.channelIds.length)
                t = await (0, guild_context_1.runInGuild)(s.guildId, () => this.notify.targets('wanted.hit', s.guildId));
            if (t.channelIds.length) {
                const row = await this.prisma.discordOutbox.create({ data: { type: `cad.${event}`, channelKey: 'wanted', payload: {
                            id: hit.id, playerName: hit.playerName, robloxUserId: hit.robloxUserId, wantedNumber: hit.wantedNumber, reason: hit.wantedReason, priority: hit.wantedPriority, wantedStatus,
                            detectedAt: hit.detectedAt.toISOString(), identified: hit.identified, matchType: hit.matchType, matchLabel: shared_1.WANTED_MATCH_LABELS[hit.matchType], server: s.name,
                            dashboardUrl: (0, web_url_1.webUrl)(`/wanted?id=${hit.id}`), channelIds: t.channelIds, pingRoleIds: t.pingRoleIds,
                        } } });
                status = 'QUEUED';
                outboxId = row.id;
            }
        }
        catch (e) {
            status = 'FAILED';
            this.log.warn(`Discord-Meldung für Treffer ${hit.id} nicht eingereiht: ${e instanceof Error ? e.message : e}`);
        }
        await this.prisma.erlcWantedHit.update({ where: { id: hit.id }, data: { notifyStatus: status, outboxId } }).catch(() => undefined);
    }
    // ---- Dashboard ----
    async list(p, f) {
        const where = {
            ...(f.id ? { id: f.id } : {}), ...(f.wantedId ? { wantedId: f.wantedId } : {}), ...(f.status ? { reviewStatus: f.status } : {}),
            ...(f.open ? { reviewStatus: { in: ['NEW', 'REVIEW_REQUIRED'] } } : {}), ...(f.identified !== undefined ? { identified: f.identified } : {}),
            ...(p.q ? { OR: [{ playerName: { contains: p.q, mode: 'insensitive' } }, { robloxUserId: p.q }, { wantedNumber: { contains: p.q, mode: 'insensitive' } }, { wantedReason: { contains: p.q, mode: 'insensitive' } }] } : {}),
        };
        const [rows, total] = await Promise.all([
            this.prisma.erlcWantedHit.findMany({ where, orderBy: { detectedAt: 'desc' }, include: { wanted: { select: { id: true, number: true, status: true, priority: true, reason: true, expiresAt: true } } }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.erlcWantedHit.count({ where }),
        ]);
        const outbox = await this.prisma.discordOutbox.findMany({ where: { id: { in: rows.map((r) => r.outboxId).filter((x) => !!x) } }, select: { id: true, sentAt: true, attempts: true, lastError: true } });
        const reviewers = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.reviewedById).filter((x) => !!x) } }, select: { id: true, displayName: true } });
        const persons = await this.prisma.person.findMany({ where: { id: { in: rows.map((r) => r.personId).filter((x) => !!x) } }, select: { id: true, robloxUsername: true, robloxUserId: true } });
        return (0, pagination_1.pageResult)(rows.map((r) => this.view(r, outbox.find((o) => o.id === r.outboxId), reviewers.find((u) => u.id === r.reviewedById)?.displayName ?? null, persons.find((x) => x.id === r.personId) ?? null)), total, p);
    }
    view(r, o, reviewer, person) {
        // Discord-Zustellung ehrlich aus dem Ausgang ablesen (gesendet / wird wiederholt / aufgegeben)
        const delivery = r.notifyStatus !== 'QUEUED' ? r.notifyStatus : !o ? 'UNKNOWN' : o.sentAt ? 'SENT' : o.attempts >= 5 ? 'FAILED' : o.attempts > 0 ? 'RETRYING' : 'QUEUED';
        return {
            id: r.id, serverName: r.serverName, erlcServerId: r.erlcServerId, playerName: r.playerName, robloxUserId: r.robloxUserId,
            matchType: r.matchType, matchLabel: shared_1.WANTED_MATCH_LABELS[r.matchType] ?? r.matchType, identified: r.identified,
            identification: r.matchType === 'ERLC_WANTED' ? 'Im Spiel gesucht (ER:LC)' : r.identified ? (r.matchType === 'ROBLOX_ID' ? 'Bestätigt (Roblox-ID)' : 'Manuell bestätigt') : r.reviewStatus === 'REJECTED' ? 'Verworfen' : 'Mögliche Übereinstimmung – manuelle Prüfung erforderlich',
            reviewStatus: r.reviewStatus, reviewLabel: shared_1.WANTED_HIT_STATUS_LABELS[r.reviewStatus] ?? r.reviewStatus, reviewedBy: reviewer, reviewedAt: r.reviewedAt, reviewNote: r.reviewNote,
            detectedAt: r.detectedAt, sessionStartedAt: r.sessionStartedAt,
            wantedId: r.wantedId, wantedNumber: r.wanted?.number ?? r.wantedNumber, reason: r.wantedReason, priority: r.wanted?.priority ?? r.wantedPriority,
            wantedStatus: r.wanted?.status ?? null, personId: r.personId, person,
            notify: { status: delivery, attempts: o?.attempts ?? 0, error: delivery === 'FAILED' || delivery === 'RETRYING' ? o?.lastError ?? null : null },
        };
    }
    /** Verbindungs- und Abgleichsstatus je ER:LC-Server (keine Geheimnisse). */
    async status() {
        const servers = await this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, guildId: true, active: true, status: true, lastSyncAt: true, lastError: true, lastErrorAt: true, features: true, wantedCheckAt: true, wantedCheckError: true, snapshot: true, _count: { select: { presence: true } }, presence: { select: { playerName: true, robloxUserId: true }, orderBy: { joinedAt: 'asc' }, take: 20 } } });
        // Zur Fehlersuche: wie viele Fahndungen dieser Server abgleicht (ohne Server-Filter der Anfrage – maßgeblich ist der Bereich des ER:LC-Servers)
        const now = new Date();
        const wantedCounts = await (0, guild_context_1.unscoped)(() => Promise.all(servers.map((s) => this.prisma.wantedRecord.count({ where: activePersonWanted((0, guild_context_1.recordSpace)(s.guildId) ?? null, now) }))));
        const [open, review] = await Promise.all([this.prisma.erlcWantedHit.count({ where: { reviewStatus: 'NEW' } }), this.prisma.erlcWantedHit.count({ where: { reviewStatus: 'REVIEW_REQUIRED' } })]);
        return {
            open, review,
            servers: servers.map((s, i) => ({
                id: s.id, name: s.name, active: s.active, status: s.active ? s.status : 'DISABLED', lastSyncAt: s.lastSyncAt, lastError: s.status === 'CONNECTED' ? null : s.lastError, lastErrorAt: s.lastErrorAt,
                playersEnabled: s.features.includes('players'), joinLogsEnabled: s.features.includes('joinLogs'), wantedCheckAt: s.wantedCheckAt, wantedCheckError: s.wantedCheckError, online: s._count.presence,
                players: s.presence.map((p) => ({ name: p.playerName, robloxUserId: p.robloxUserId, wantedStars: starsOf(s.snapshot, p.robloxUserId, p.playerName) })), activeWanted: wantedCounts[i] ?? 0,
            })),
        };
    }
    /**
     * Prüfung durch berechtigte Personen. Treffer per Roblox-ID: „zur Kenntnis genommen“. Mögliche Übereinstimmung: bestätigen oder verwerfen;
     * beim Bestätigen kann die Roblox-ID aus ER:LC in die Personenakte übernommen werden (nur, wenn die Akte noch keine hat).
     */
    async review(actor, id, d) {
        return this.prisma.$transaction(async (tx) => {
            const h = await tx.erlcWantedHit.findUnique({ where: { id } });
            if (!h)
                throw new errors_1.AppError('NOT_FOUND', 'Fahndungstreffer nicht gefunden.');
            if (h.reviewStatus !== 'NEW' && h.reviewStatus !== 'REVIEW_REQUIRED')
                throw new errors_1.AppError('CONFLICT', 'Dieser Treffer wurde bereits bearbeitet.');
            if (h.reviewStatus === 'NEW' && d.decision !== 'ACKNOWLEDGED')
                throw new errors_1.AppError('VALIDATION_FAILED', 'Ein Treffer per Roblox-ID kann nur zur Kenntnis genommen werden.');
            if (h.reviewStatus === 'REVIEW_REQUIRED' && d.decision === 'ACKNOWLEDGED')
                throw new errors_1.AppError('VALIDATION_FAILED', 'Eine mögliche Übereinstimmung muss bestätigt oder verworfen werden.');
            if (d.decision !== 'ACKNOWLEDGED' && (!d.note || d.note.trim().length < 3))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine kurze Begründung angeben.');
            let linked = false;
            if (d.decision === 'CONFIRMED' && d.linkRobloxId) {
                if (!h.robloxUserId)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Die ER:LC-API hat für diesen Spieler keine Roblox-ID geliefert.');
                const p = h.personId ? await tx.person.findUnique({ where: { id: h.personId } }) : null;
                if (!p)
                    throw new errors_1.AppError('NOT_FOUND', 'Personenakte nicht gefunden.');
                if (p.robloxUserId && p.robloxUserId !== h.robloxUserId)
                    throw new errors_1.AppError('CONFLICT', 'Die Personenakte hat bereits eine andere Roblox-ID – bitte die Akte prüfen.');
                if (!p.robloxUserId) {
                    const taken = await tx.person.findFirst({ where: { serverId: p.serverId, robloxUserId: h.robloxUserId, id: { not: p.id } }, select: { id: true } });
                    if (taken)
                        throw new errors_1.AppError('CONFLICT', 'Diese Roblox-ID gehört bereits zu einer anderen Personenakte.', { personId: taken.id });
                    await tx.person.update({ where: { id: p.id }, data: { robloxUserId: h.robloxUserId, version: { increment: 1 } } });
                    await this.timeline.add(tx, { entityType: 'Person', entityId: p.id, action: 'person.roblox_linked', summary: `Roblox-ID ${h.robloxUserId} aus Fahndungstreffer übernommen`, actorId: actor.userId });
                    linked = true;
                }
            }
            const after = await tx.erlcWantedHit.update({ where: { id }, data: { reviewStatus: d.decision, identified: d.decision === 'CONFIRMED' ? true : h.identified, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: d.note?.trim() || null } });
            if (h.wantedId)
                await this.timeline.add(tx, { entityType: 'Wanted', entityId: h.wantedId, action: `wanted.hit_${d.decision.toLowerCase()}`, summary: `Treffer ${h.playerName}: ${shared_1.WANTED_HIT_STATUS_LABELS[d.decision]}`, actorId: actor.userId });
            await this.audit.record(actor, { action: `wanted.hit.${d.decision.toLowerCase()}`, module: 'wanted', entityType: 'ErlcWantedHit', entityId: id, before: { reviewStatus: h.reviewStatus, identified: h.identified }, after: { reviewStatus: after.reviewStatus, identified: after.identified, robloxIdLinked: linked }, reason: d.note }, tx);
            return { id, reviewStatus: after.reviewStatus, identified: after.identified, robloxIdLinked: linked };
        }).then((r) => { this.rt.publish('cad', 'wanted.hits', { id }); return r; });
    }
};
exports.ErlcWantedService = ErlcWantedService;
exports.ErlcWantedService = ErlcWantedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, realtime_service_1.RealtimeService, cad_notify_service_1.CadNotifyService])
], ErlcWantedService);
//# sourceMappingURL=erlc-wanted.service.js.map