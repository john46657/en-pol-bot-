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
exports.RosterService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const discord_live_service_1 = require("../discord/discord-live.service");
const discord_service_1 = require("../discord/discord.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
/** „🏛️ · Polizeipräsident“ und „Polizeipräsident“ gelten als gleich. */
const norm = (n) => n.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
/** Erster Wert der Liste (Reihenfolge = Rang), den die Person als Discord-Rolle hat. */
const fromRoles = (list, roleNames) => { const have = new Set(roleNames.map(norm)); return list.find((x) => have.has(norm(x))) ?? null; };
const uniq = (v) => [...new Set(v.filter((x) => !!x && !!x.trim()))];
/**
 * Teamliste: Personalakten (Team, Dienstgrad, Büro, Dienstnummer) + Discord-Teammitglieder (Avatar, Name, Online-Status).
 * Enthält bewusst KEINE Voice-Informationen – die liefert ausschließlich `/team/voice`.
 */
let RosterService = class RosterService {
    prisma;
    live;
    discord;
    perms;
    constructor(prisma, live, discord, perms) {
        this.prisma = prisma;
        this.live = live;
        this.discord = discord;
        this.perms = perms;
    }
    /** Teams, Dienstgrade und Büros: aus den Einstellungen, ergänzt um Werte, die in Personalakten vorkommen. */
    /** Server-Einstellung, sonst die gemeinsame. */
    async setting(key) {
        const g = (0, guild_context_1.currentGuild)();
        return (g ? await this.prisma.systemSetting.findUnique({ where: { key: (0, guild_context_1.scopedKey)(key, g) } }) : null) ?? this.prisma.systemSetting.findUnique({ where: { key } });
    }
    async structure() {
        const [cfg, order, used] = await Promise.all([
            this.setting('team.structure'),
            this.setting('team.rankOrder'),
            this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, select: { team: true, rank: true, office: true } }),
        ]);
        const s = (cfg?.value ?? {});
        return {
            teams: uniq([...(s.teams ?? []), ...used.map((u) => u.team)]),
            ranks: uniq([...(order?.value ?? []), ...used.map((u) => u.rank)]),
            offices: uniq([...(s.offices ?? []), ...used.map((u) => u.office)]),
        };
    }
    async roster() {
        const [people, links, structure, guilds] = await Promise.all([
            this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] }, user: { active: true } }, include: { user: { select: { id: true, displayName: true, username: true } } } }),
            this.prisma.discordLink.findMany(),
            this.structure(),
            this.discord.guilds(),
        ]);
        // Server getrennt: nur Mitglieder des gewählten Servers (Personalakten nur, wenn die Person dort Teammitglied ist)
        const g = (0, guild_context_1.currentGuild)();
        const { members: all, updatedAt } = this.live.getMembers();
        const live = g ? all.filter((m) => m.guildId === g) : [...new Map(all.map((m) => [m.id, m])).values()];
        const roleName = new Map(guilds.flatMap((x) => x.roles.map((r) => [r.id, r.name])));
        const names = (d) => (d?.roleIds ?? []).map((r) => roleName.get(r) ?? '');
        const linkOf = new Map(links.map((l) => [l.userId, l.discordId]));
        const userOf = new Map(links.map((l) => [l.discordId, l.userId]));
        const byDiscord = new Map(live.map((m) => [m.id, m]));
        const out = [];
        const seen = new Set();
        for (const p of people) {
            const discordId = linkOf.get(p.userId) ?? null;
            const d = discordId ? byDiscord.get(discordId) : undefined;
            if (g && !d)
                continue;
            if (discordId)
                seen.add(discordId);
            out.push({
                key: p.userId, userId: p.userId, discordId, name: d?.displayName ?? p.user.displayName, username: d?.username ?? p.user.username, avatar: d?.avatar ?? null,
                // ohne Eintrag in der Personalakte: aus den Discord-Rollen (gleichnamige Rolle wie Team/Dienstgrad/Büro)
                team: p.team ?? fromRoles(structure.teams, names(d)), rank: p.rank ?? fromRoles(structure.ranks, names(d)), office: p.office ?? fromRoles(structure.offices, names(d)), serviceNumber: p.serviceNumber, callsign: p.callsign,
                status: d?.status ?? (live.length ? 'offline' : 'unknown'), joinedAt: (d?.joinedAt ?? p.joinDate.toISOString()) || null,
                discordRoles: (d?.roleIds ?? []).map((r) => roleName.get(r) ?? r),
            });
        }
        // Teammitglieder nur auf Discord (Teamrolle, aber noch keine Personalakte)
        for (const d of live) {
            if (seen.has(d.id))
                continue;
            out.push({
                key: `discord:${d.id}`, userId: userOf.get(d.id) ?? null, discordId: d.id, name: d.displayName, username: d.username, avatar: d.avatar,
                team: fromRoles(structure.teams, names(d)), rank: fromRoles(structure.ranks, names(d)), office: fromRoles(structure.offices, names(d)), serviceNumber: null, callsign: null, status: d.status, joinedAt: d.joinedAt, discordRoles: d.roleIds.map((r) => roleName.get(r) ?? r),
            });
        }
        const rankIdx = (r) => { const i = r ? structure.ranks.indexOf(r) : -1; return i < 0 ? 999 : i; };
        out.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || a.name.localeCompare(b.name));
        return { members: out, structure, discordUpdatedAt: updatedAt, generatedAt: new Date() };
    }
    /** Profil eines Teammitglieds. Discord-ID, Rollen und Beitrittsdatum nur mit `personnel.view` oder `users.view`. */
    async profile(viewerId, key) {
        const r = await this.roster();
        const m = r.members.find((x) => x.key === key || x.userId === key || x.discordId === key);
        if (!m)
            throw new errors_1.AppError('NOT_FOUND', 'Teammitglied nicht gefunden.');
        const ctx = await this.perms.contextFor(viewerId);
        const details = (0, shared_1.can)(ctx, 'personnel.view') || (0, shared_1.can)(ctx, 'users.view');
        const personnelId = m.userId && (0, shared_1.can)(ctx, 'personnel.view') ? (await this.prisma.personnel.findFirst({ where: { userId: m.userId }, select: { id: true } }))?.id ?? null : null;
        return { ...m, discordId: details ? m.discordId : null, discordRoles: details ? m.discordRoles : [], joinedAt: details ? m.joinedAt : null, personnelId, detailed: details };
    }
    /** Voice-Channels mit Personen (eigenes Widget, getrennt von der Teamliste). */
    voice() {
        const g = (0, guild_context_1.currentGuild)();
        const v = this.live.getVoice();
        return { ...v, channels: g ? v.channels.filter((c) => c.guildId === g) : v.channels };
    }
    activity(limit) { return this.live.getChanges(limit, (0, guild_context_1.currentGuild)()); }
    /** „Jetzt aktualisieren“: den Bot um einen sofortigen Bericht bitten (er meldet sonst ohnehin alle 60 Sekunden). */
    async requestSync() { await this.discord.enqueue('duty', 'members.sync', {}, { always: true }); }
};
exports.RosterService = RosterService;
exports.RosterService = RosterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, discord_live_service_1.DiscordLiveService, discord_service_1.DiscordService, permission_service_1.PermissionService])
], RosterService);
//# sourceMappingURL=roster.service.js.map