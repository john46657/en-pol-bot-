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
exports.VoiceSupportService = exports.roomsSchema = exports.roomSchema = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const realtime_service_1 = require("../realtime/realtime.service");
const discord_service_1 = require("../discord/discord.service");
const KEY = 'voice-support.rooms';
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const hhmm = zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit HH:MM');
exports.roomSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(), guildId: sf, name: zod_1.z.string().trim().min(1).max(100), enabled: zod_1.z.boolean(),
    waitingChannelId: sf, notifyChannelId: sf, teamRoleId: sf,
    channelPrefix: zod_1.z.string().max(20).default(''),
    notes: zod_1.z.boolean().default(false), ownChannels: zod_1.z.boolean().default(false), ownChannelIds: zod_1.z.array(sf).max(25).default([]),
    times: zod_1.z.array(zod_1.z.object({ days: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).min(1).max(7), from: hhmm, to: hhmm })).max(20).default([]),
    rating: zod_1.z.boolean().default(false),
    music: zod_1.z.object({ enabled: zod_1.z.boolean().default(false), openTrack: zod_1.z.enum(Object.keys(shared_1.MUSIC_TRACKS)).default(''), closedTrack: zod_1.z.enum(Object.keys(shared_1.MUSIC_TRACKS)).default('') }).default({}),
    primary: zod_1.z.boolean().default(false),
}).superRefine((r, ctx) => { if (r.ownChannels && !r.ownChannelIds.length)
    ctx.addIssue({ code: 'custom', path: ['ownChannelIds'], message: 'Wähle mindestens einen eigenen Sprachkanal.' }); });
exports.roomsSchema = zod_1.z.array(exports.roomSchema).max(30).superRefine((rs, ctx) => {
    const seen = new Set();
    for (const [i, r] of rs.entries()) {
        if (seen.has(r.waitingChannelId))
            ctx.addIssue({ code: 'custom', path: [i, 'waitingChannelId'], message: 'Dieser Warteraum gehört schon zu einem anderen Raum.' });
        seen.add(r.waitingChannelId);
    }
    // je Server höchstens ein Primär-Raum (Wartemusik)
    const primaries = rs.filter((r) => r.primary).map((r) => r.guildId);
    if (new Set(primaries).size !== primaries.length)
        ctx.addIssue({ code: 'custom', path: [], message: 'Je Server kann nur ein Raum primär sein.' });
});
const COLOR = { WAITING: 0x5865f2, CLAIMED: 0x22c55e, DECLINED: 0xef4444, ABANDONED: 0x64748b, CLOSED: 0x64748b };
const OPEN = ['WAITING', 'CLAIMED'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ts = (d) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
/**
 * Sprach-Support: Das System entscheidet (Räume, Zeiten, Rechte, Status, Texte), der Bot führt die Discord-Seite aus
 * (Meldung posten/ändern, Sprachkanal anlegen, Personen verschieben, DMs).
 */
let VoiceSupportService = class VoiceSupportService {
    prisma;
    audit;
    rt;
    discord;
    constructor(prisma, audit, rt, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
    }
    /** Dashboard sofort aktualisieren (Liste der Fälle). */
    changed(id) { this.rt.publish('tickets', 'voice.case', { id }); }
    // ---------------- Einrichtung ----------------
    async rooms(guildId) {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = exports.roomsSchema.safeParse(v ?? []);
        const all = p.success ? p.data : [];
        return guildId ? all.filter((r) => r.guildId === guildId) : all;
    }
    /** `guildId`: nur die Räume dieses Servers ersetzen (Server-Ansicht), sonst alle. */
    async saveRooms(actor, input, guildId) {
        if (guildId && input.some((r) => r.guildId !== guildId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'In der Server-Ansicht kannst du nur Räume dieses Servers speichern.');
        const keep = guildId ? (await this.rooms()).filter((r) => r.guildId !== guildId) : [];
        const all = exports.roomsSchema.parse([...keep, ...input]);
        const value = all;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
            await this.audit.record(actor, { action: 'voice_support.rooms', module: 'tickets', entityType: 'SystemSetting', entityId: KEY, after: { rooms: input.map((r) => r.name), guildId: guildId ?? null } }, tx);
        });
        return this.rooms(guildId);
    }
    async room(id) { return (await this.rooms()).find((r) => r.id === id); }
    async cases(f) {
        return this.prisma.voiceSupportCase.findMany({ where: { ...(f.guildId ? { guildId: f.guildId } : {}), ...(f.status === 'OPEN' ? { status: { in: OPEN } } : f.status ? { status: f.status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    }
    // ---------------- Meldung „Ein neuer Support-Fall“ ----------------
    message(c, room) {
        const who = (id, name) => (id ? `<@${id}>` : name ?? 'dem Team');
        const head = {
            WAITING: `### ➕ Ein neuer Support-Fall\n<@${c.userId}> braucht Hilfe!`,
            CLAIMED: `### ✅ Support-Fall übernommen\n${who(c.claimedById, c.claimedByName)} kümmert sich um <@${c.userId}>.`,
            DECLINED: `### ❌ Support-Fall abgelehnt\nAbgelehnt von ${who(c.closedById, c.closedByName)}${c.closeReason ? ` – ${c.closeReason}` : ''}.`,
            ABANDONED: `### 🚪 Warteraum verlassen\n<@${c.userId}> hat den Warteraum vor der Übernahme verlassen.`,
            CLOSED: `### 🔒 Support-Fall geschlossen\n${c.closedByName ? `Geschlossen von ${c.closedById ? `<@${c.closedById}>` : c.closedByName}` : 'Geschlossen'}${c.closeReason ? ` – ${c.closeReason}` : ''}.`,
        }[c.status] ?? '';
        const lines = [
            `• 🧾 **Case-ID:** \`#${c.number}\``, `• 🕒 **Erstellt am:** ${ts(c.createdAt)}`, `• 👤 **Nutzer:** <@${c.userId}>`,
            ...(c.claimedById || c.claimedByName ? [`• 🎧 **Bearbeiter:** ${who(c.claimedById, c.claimedByName)}${c.channelId && c.status === 'CLAIMED' ? ` · <#${c.channelId}>` : ''}`] : []),
            ...(c.messages ? [`• 💬 **Nachrichten an Nutzer:** ${c.messages}`] : []),
            ...(c.rating ? [`• ⭐ **Bewertung:** ${'⭐'.repeat(c.rating)}`] : []),
        ];
        const id = c.id;
        const buttons = c.status === 'WAITING'
            ? [{ id: `vs:claim:${id}`, label: 'Übernehmen', emoji: '✅', style: 'success' }, { id: `vs:decline:${id}`, label: 'Ablehnen', emoji: '❌', style: 'danger' }, { id: `vs:msg:${id}`, label: 'Nachricht', emoji: '💬', style: 'secondary' }]
            : c.status === 'CLAIMED' ? [{ id: `vs:msg:${id}`, label: 'Nachricht', emoji: '💬', style: 'secondary' }, { id: `vs:close:${id}`, label: 'Schließen', emoji: '🔒', style: 'danger' }] : [];
        const ping = c.status === 'WAITING' && room?.teamRoleId;
        return {
            ...(ping ? { content: `<@&${room.teamRoleId}>`, mentionRoles: [room.teamRoleId] } : {}),
            embeds: [{ title: `🏠 ${c.roomName}`, description: `${head}\n\n${lines.join('\n')}`, color: COLOR[c.status] ?? 0x64748b, footer: 'Sprach-Support' }],
            buttons,
        };
    }
    edit(c, room) {
        return c.notifyChannelId && c.notifyMessageId ? { channelId: c.notifyChannelId, messageId: c.notifyMessageId, message: this.message(c, room) } : null;
    }
    // ---------------- vom Bot: Warteraum ----------------
    /** Jemand hat einen Sprachkanal betreten: Warteraum eines Raums → neuer Fall (oder Hinweis „geschlossen“). */
    async join(d, now = new Date()) {
        const room = (await this.rooms(d.guildId)).find((r) => r.enabled && r.waitingChannelId === d.channelId);
        if (!room)
            return { action: 'none' };
        if (!(0, shared_1.isSupportOpen)(room.times, now)) {
            const times = room.times.map((t) => `${t.days.map((x) => shared_1.WEEKDAYS[x]).join(', ')} ${t.from}–${t.to}`).join(' · ');
            return { action: 'closed', dm: { embeds: [{ title: `🕒 ${room.name}: Support geschlossen`, description: `Der Support ist gerade nicht besetzt.\n\n**Supportzeiten:** ${times}`, color: 0x64748b }] } };
        }
        if (await this.prisma.voiceSupportCase.findFirst({ where: { guildId: d.guildId, userId: d.discordId, status: { in: OPEN } } }))
            return { action: 'none' };
        let number = 'S-';
        for (let i = 0; i < 10; i++)
            number += LETTERS[(0, node_crypto_1.randomInt)(LETTERS.length)];
        const c = await this.prisma.voiceSupportCase.create({ data: { number, roomId: room.id, roomName: room.name, guildId: d.guildId, userId: d.discordId, userName: d.userName.slice(0, 100), notifyChannelId: room.notifyChannelId } });
        this.changed(c.id);
        return { action: 'notify', caseId: c.id, channelId: room.notifyChannelId, message: this.message(c, room) };
    }
    async posted(id, messageId) {
        await this.prisma.voiceSupportCase.update({ where: { id }, data: { notifyMessageId: messageId } }).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Support-Fall nicht gefunden.'); });
    }
    /** Jemand hat einen Sprachkanal verlassen: wartender Fall in diesem Warteraum → „Warteraum verlassen“. */
    async left(d) {
        const rooms = (await this.rooms(d.guildId)).filter((r) => r.waitingChannelId === d.channelId).map((r) => r.id);
        if (!rooms.length)
            return { edits: [] };
        const open = await this.prisma.voiceSupportCase.findMany({ where: { guildId: d.guildId, userId: d.discordId, status: 'WAITING', roomId: { in: rooms } } });
        const edits = [];
        for (const c of open) {
            const u = await this.prisma.voiceSupportCase.update({ where: { id: c.id }, data: { status: 'ABANDONED', closedAt: new Date() } });
            this.changed(c.id);
            const e = this.edit(u);
            if (e)
                edits.push(e);
        }
        return { edits };
    }
    /** Ein Support-Kanal ist leer geworden → Fall schließen (vom Bot angelegte Kanäle werden gelöscht). */
    async channelEmpty(channelId) {
        const c = await this.prisma.voiceSupportCase.findFirst({ where: { channelId, status: 'CLAIMED' } });
        if (!c)
            return { closed: false };
        return { closed: true, ...(await this.finish(c, { name: 'Automatik' }, 'Kanal leer')) };
    }
    // ---------------- vom Bot: Buttons (Team) ----------------
    async load(id) {
        const c = await this.prisma.voiceSupportCase.findUnique({ where: { id } });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Support-Fall nicht gefunden.');
        return { c, room: await this.room(c.roomId) };
    }
    assertTeam(room, s) {
        if (s.admin || (room && s.roleIds.includes(room.teamRoleId)))
            return;
        throw new errors_1.AppError('PERMISSION_DENIED', 'Nur das Support-Team (Team-Rolle des Raums) kann das.');
    }
    /** Übernehmen: Status + Infos, damit der Bot den Sprachkanal bereitstellt und die Person verschiebt. */
    async claim(id, s) {
        const { c, room } = await this.load(id);
        this.assertTeam(room, s);
        const r = await this.prisma.voiceSupportCase.updateMany({ where: { id, status: 'WAITING' }, data: { status: 'CLAIMED', claimedById: s.discordId, claimedByName: s.name, claimedAt: new Date() } });
        if (!r.count)
            throw new errors_1.AppError('CONFLICT', c.status === 'CLAIMED' ? `Schon übernommen von ${c.claimedByName ?? 'jemand anderem'}.` : 'Dieser Support-Fall ist nicht mehr offen.');
        const u = await this.prisma.voiceSupportCase.findUniqueOrThrow({ where: { id } });
        this.changed(id);
        return {
            case: { id, number: u.number, userId: u.userId, userName: u.userName, guildId: u.guildId },
            room: room ? { name: room.name, waitingChannelId: room.waitingChannelId, teamRoleId: room.teamRoleId, channelPrefix: room.channelPrefix, notes: room.notes, ownChannels: room.ownChannels, ownChannelIds: room.ownChannelIds } : null,
            edit: this.edit(u, room),
        };
    }
    /** Bot meldet den bereitgestellten Sprachkanal (und Notizen-Thread). */
    async channel(id, d) {
        const u = await this.prisma.voiceSupportCase.update({ where: { id }, data: { channelId: d.channelId, createdChannel: d.created, threadId: d.threadId } }).catch(() => { throw new errors_1.AppError('NOT_FOUND', 'Support-Fall nicht gefunden.'); });
        this.changed(id);
        return { edit: this.edit(u, await this.room(u.roomId)) };
    }
    async decline(id, s, reason) {
        const { c, room } = await this.load(id);
        this.assertTeam(room, s);
        const r = await this.prisma.voiceSupportCase.updateMany({ where: { id, status: 'WAITING' }, data: { status: 'DECLINED', closedById: s.discordId, closedByName: s.name, closedAt: new Date(), closeReason: reason || null } });
        if (!r.count)
            throw new errors_1.AppError('CONFLICT', 'Dieser Support-Fall ist nicht mehr offen.');
        const u = await this.prisma.voiceSupportCase.findUniqueOrThrow({ where: { id } });
        this.changed(id);
        return {
            edit: this.edit(u, room), userId: c.userId,
            dm: { embeds: [{ title: `❌ ${c.roomName}: Support-Fall abgelehnt`, description: `Dein Support-Fall \`#${c.number}\` wurde abgelehnt.${reason ? `\n\n**Grund:** ${reason}` : ''}`, color: 0xef4444 }] },
        };
    }
    /** „Nachricht“: Text vom Team per DM an die Person (auch im Notizen-Thread vermerkt). */
    async sendMessage(id, s, text) {
        const { c, room } = await this.load(id);
        this.assertTeam(room, s);
        if (!OPEN.includes(c.status))
            throw new errors_1.AppError('CONFLICT', 'Dieser Support-Fall ist nicht mehr offen.');
        const u = await this.prisma.voiceSupportCase.update({ where: { id }, data: { messages: { increment: 1 } } });
        this.changed(id);
        return {
            edit: this.edit(u, room), userId: c.userId, threadId: c.threadId,
            dm: { embeds: [{ title: `💬 Nachricht vom Support-Team (${c.roomName})`, description: text, color: 0x5865f2, footer: `Support-Fall #${c.number} · ${s.name}` }] },
            log: `💬 **${s.name}** an <@${c.userId}>: ${text}`,
        };
    }
    async close(id, s) {
        const { c, room } = await this.load(id);
        this.assertTeam(room, s);
        if (c.status !== 'CLAIMED')
            throw new errors_1.AppError('CONFLICT', 'Nur übernommene Support-Fälle können geschlossen werden.');
        return this.finish(c, { discordId: s.discordId, name: s.name }, null);
    }
    async finish(c, by, reason) {
        const r = await this.prisma.voiceSupportCase.updateMany({ where: { id: c.id, status: 'CLAIMED' }, data: { status: 'CLOSED', closedById: by.discordId ?? null, closedByName: by.name, closedAt: new Date(), closeReason: reason } });
        if (!r.count)
            throw new errors_1.AppError('CONFLICT', 'Dieser Support-Fall ist nicht mehr offen.');
        const u = await this.prisma.voiceSupportCase.findUniqueOrThrow({ where: { id: c.id } });
        this.changed(c.id);
        const room = await this.room(c.roomId);
        return {
            edit: this.edit(u, room), deleteChannelId: u.createdChannel ? u.channelId : null, userId: u.userId,
            ratingDm: room?.rating ? {
                embeds: [{ title: `⭐ Wie zufrieden warst du mit dem Support?`, description: `Dein Support-Fall \`#${u.number}\` (${u.roomName}) ist abgeschlossen. Bewerte ihn mit einem Klick.`, color: 0xfacc15 }],
                buttons: [1, 2, 3, 4, 5].map((n) => ({ id: `vs:rate:${u.id}:${n}`, label: '⭐'.repeat(n), style: n >= 4 ? 'success' : n <= 2 ? 'danger' : 'secondary' })),
            } : null,
        };
    }
    async rate(id, discordId, stars) {
        const { c, room } = await this.load(id);
        if (c.userId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur die Person des Support-Falls kann bewerten.');
        const r = await this.prisma.voiceSupportCase.updateMany({ where: { id, status: 'CLOSED', rating: null }, data: { rating: stars } });
        if (!r.count)
            throw new errors_1.AppError('CONFLICT', 'Du hast diesen Support-Fall schon bewertet.');
        this.changed(id);
        return { edit: this.edit(await this.prisma.voiceSupportCase.findUniqueOrThrow({ where: { id } }), room) };
    }
    // ---------------- Dashboard: Team-Aktionen (der Bot führt den Discord-Teil per Outbox aus) ----------------
    async webStaff(actor) {
        const [user, link] = await Promise.all([this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }), this.prisma.discordLink.findUnique({ where: { userId: actor.userId } })]);
        return { discordId: link?.discordId ?? null, name: user?.displayName ?? 'Team', roleIds: [], admin: true }; // Recht ticket.claim prüft der Controller
    }
    effects(payload) { return this.discord.enqueue('tickets', 'voice.effects', payload, { always: true }); }
    async webAction(actor, id, a) {
        const s = await this.webStaff(actor);
        if (a.action === 'claim') {
            const r = await this.claim(id, s);
            await this.effects({ provision: r, staffDiscordId: s.discordId });
        }
        else if (a.action === 'decline') {
            const r = await this.decline(id, s, a.reason);
            await this.effects({ edit: r.edit, dm: { userId: r.userId, message: r.dm } });
        }
        else if (a.action === 'message') {
            const r = await this.sendMessage(id, s, a.text);
            await this.effects({ edit: r.edit, dm: { userId: r.userId, message: r.dm }, ...(r.threadId ? { threadPost: { threadId: r.threadId, text: r.log } } : {}) });
        }
        else {
            const r = await this.close(id, s);
            await this.effects({ edit: r.edit, deleteChannelId: r.deleteChannelId, ...(r.ratingDm ? { dm: { userId: r.userId, message: r.ratingDm } } : {}) });
        }
        await this.audit.record(actor, { action: `voice_support.${a.action}`, module: 'tickets', entityType: 'VoiceSupportCase', entityId: id });
        return this.prisma.voiceSupportCase.findUniqueOrThrow({ where: { id } });
    }
};
exports.VoiceSupportService = VoiceSupportService;
exports.VoiceSupportService = VoiceSupportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService])
], VoiceSupportService);
//# sourceMappingURL=voice-support.service.js.map