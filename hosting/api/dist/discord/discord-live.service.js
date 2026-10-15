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
exports.DiscordLiveService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_service_1 = require("../realtime/realtime.service");
const notify_service_1 = require("../notifications/notify.service");
const MAX_CHANGES = 100;
/**
 * Aktueller Discord-Stand, den der Bot meldet (Teammitglieder ≥ alle 60 s, Voice bei jeder Änderung).
 * Bewusst nur im Speicher: es sind flüchtige Live-Daten. Änderungen an Teammitgliedern werden erkannt
 * und als Team-Aktivität bereitgestellt; Teamliste und Voice werden getrennt veröffentlicht.
 */
let DiscordLiveService = class DiscordLiveService {
    prisma;
    rt;
    notify;
    members = new Map();
    membersAt = null;
    voice = [];
    voiceAt = null;
    changes = [];
    constructor(prisma, rt, notify) {
        this.prisma = prisma;
        this.rt = rt;
        this.notify = notify;
    }
    /** Welche Discord-Rollen machen jemanden zum Teammitglied? Zugangsrollen + mit Dashboard-Rollen verknüpfte Rollen. */
    async teamRoleIds() {
        const login = (await this.prisma.systemSetting.findUnique({ where: { key: 'auth.discord' } }))?.value;
        const linked = await this.prisma.role.findMany({ where: { active: true, discordRoleIds: { isEmpty: false } }, select: { discordRoleIds: true } });
        return [...new Set([...(login?.teamRoleIds ?? []), ...(login?.roleMap ?? []).map((m) => m.discordRoleId), ...linked.flatMap((r) => r.discordRoleIds)])];
    }
    setMembers(list) {
        const next = new Map(list.map((m) => [`${m.guildId}:${m.id}`, m]));
        const now = new Date().toISOString();
        const found = [];
        if (this.membersAt) { // erster Bericht nach dem Start ist keine „Änderung“
            for (const [id, m] of next) {
                const old = this.members.get(id);
                if (!old) {
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'joined' });
                    continue;
                }
                if (old.displayName !== m.displayName || old.username !== m.username)
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'name', detail: `${old.displayName} → ${m.displayName}` });
                if (old.avatar !== m.avatar)
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'avatar' });
                if ([...old.roleIds].sort().join() !== [...m.roleIds].sort().join())
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'roles' });
                if (old.status !== m.status)
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'status', detail: `${old.status} → ${m.status}` });
            }
            for (const [id, m] of this.members)
                if (!next.has(id))
                    found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'left' });
        }
        this.members = next;
        this.membersAt = new Date();
        if (found.length) {
            this.changes = [...found.reverse(), ...this.changes].slice(0, MAX_CHANGES);
            this.rt.publish('team', 'team.roster', { changes: found.length });
            // 👥 Teamänderung (neu im Team / nicht mehr im Team) → Teamleitung des jeweiligen Servers
            for (const c of found.filter((x) => x.kind === 'joined' || x.kind === 'left').slice(0, 20)) {
                void this.notify.notifyPermission('team.manage', { type: 'TEAM_CHANGE', title: c.kind === 'joined' ? `👥 ${c.name} ist neu im Team` : `👥 ${c.name} ist nicht mehr im Team`, entityType: 'DiscordMember', entityId: c.discordId }, { guildId: c.guildId }).catch(() => undefined);
            }
        }
    }
    setVoice(channels) {
        const changed = JSON.stringify(channels) !== JSON.stringify(this.voice);
        this.voice = channels;
        this.voiceAt = new Date();
        if (changed)
            this.rt.publish('team', 'team.voice', {});
    }
    getMembers() { return { members: [...this.members.values()], updatedAt: this.membersAt }; }
    getVoice() { return { channels: this.voice, updatedAt: this.voiceAt }; }
    getChanges(limit = 30, guildId = null) { return this.changes.filter((c) => !guildId || c.guildId === guildId).slice(0, limit); }
};
exports.DiscordLiveService = DiscordLiveService;
exports.DiscordLiveService = DiscordLiveService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, realtime_service_1.RealtimeService, notify_service_1.NotifyService])
], DiscordLiveService);
//# sourceMappingURL=discord-live.service.js.map