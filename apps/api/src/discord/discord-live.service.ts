import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotifyService } from '../notifications/notify.service';

/** Ein Teammitglied, wie der Bot es auf Discord sieht (nur Team-Informationen, keine Voice-Daten). */
export interface LiveMember { id: string; guildId: string; username: string; displayName: string; avatar: string | null; status: 'online' | 'idle' | 'dnd' | 'offline' | 'unknown'; roleIds: string[]; joinedAt: string | null }
/** Voice-Channel mit den Personen darin (getrennt von der Teamliste gehalten). */
export interface LiveVoiceChannel {
  id: string; guildId: string; name: string; parentId: string | null; parentName: string | null; position: number;
  members: { id: string; displayName: string; avatar: string | null; selfMute: boolean; selfDeaf: boolean; serverMute: boolean; serverDeaf: boolean; video: boolean; streaming: boolean; since: string | null }[];
}
export interface TeamChange { at: string; guildId: string; discordId: string; name: string; kind: 'joined' | 'left' | 'roles' | 'name' | 'avatar' | 'status'; detail?: string }

const MAX_CHANGES = 100;

/**
 * Aktueller Discord-Stand, den der Bot meldet (Teammitglieder ≥ alle 60 s, Voice bei jeder Änderung).
 * Bewusst nur im Speicher: es sind flüchtige Live-Daten. Änderungen an Teammitgliedern werden erkannt
 * und als Team-Aktivität bereitgestellt; Teamliste und Voice werden getrennt veröffentlicht.
 */
@Injectable()
export class DiscordLiveService {
  private members = new Map<string, LiveMember>();
  private membersAt: Date | null = null;
  private voice: LiveVoiceChannel[] = [];
  private voiceAt: Date | null = null;
  private changes: TeamChange[] = [];
  constructor(private readonly prisma: PrismaService, private readonly rt: RealtimeService, private readonly notify: NotifyService) {}

  /** Welche Discord-Rollen machen jemanden zum Teammitglied? Zugangsrollen + mit Dashboard-Rollen verknüpfte Rollen. */
  async teamRoleIds(): Promise<string[]> {
    const login = (await this.prisma.systemSetting.findUnique({ where: { key: 'auth.discord' } }))?.value as { teamRoleIds?: string[]; roleMap?: { discordRoleId: string }[] } | undefined;
    const linked = await this.prisma.role.findMany({ where: { active: true, discordRoleIds: { isEmpty: false } }, select: { discordRoleIds: true } });
    return [...new Set([...(login?.teamRoleIds ?? []), ...(login?.roleMap ?? []).map((m) => m.discordRoleId), ...linked.flatMap((r) => r.discordRoleIds)])];
  }

  setMembers(list: LiveMember[]) {
    const next = new Map(list.map((m) => [`${m.guildId}:${m.id}`, m]));
    const now = new Date().toISOString();
    const found: TeamChange[] = [];
    if (this.membersAt) { // erster Bericht nach dem Start ist keine „Änderung“
      for (const [id, m] of next) {
        const old = this.members.get(id);
        if (!old) { found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'joined' }); continue; }
        if (old.displayName !== m.displayName || old.username !== m.username) found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'name', detail: `${old.displayName} → ${m.displayName}` });
        if (old.avatar !== m.avatar) found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'avatar' });
        if ([...old.roleIds].sort().join() !== [...m.roleIds].sort().join()) found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'roles' });
        if (old.status !== m.status) found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'status', detail: `${old.status} → ${m.status}` });
      }
      for (const [id, m] of this.members) if (!next.has(id)) found.push({ at: now, guildId: m.guildId, discordId: m.id, name: m.displayName, kind: 'left' });
    }
    this.members = next;
    this.membersAt = new Date();
    if (found.length) {
      this.changes = [...found.reverse(), ...this.changes].slice(0, MAX_CHANGES);
      this.rt.publish('team', 'team.roster', { changes: found.length });
      // 👥 Teamänderung (neu im Team / nicht mehr im Team) → Teamleitung des jeweiligen Servers
      for (const c of found.filter((x) => x.kind === 'joined' || x.kind === 'left').slice(0, 20)) {
        void this.notify.notifyPermission('team.manage', { type: 'TEAM_CHANGE', title: c.kind === 'joined' ? `👥 ${c.name} ist neu im Team` : `👥 ${c.name} ist nicht mehr im Team`, entityType: 'DiscordMember', entityId: c.discordId }, { guildId: c.guildId });
      }
    }
  }

  setVoice(channels: LiveVoiceChannel[]) {
    const changed = JSON.stringify(channels) !== JSON.stringify(this.voice);
    this.voice = channels;
    this.voiceAt = new Date();
    if (changed) this.rt.publish('team', 'team.voice', {});
  }

  getMembers() { return { members: [...this.members.values()], updatedAt: this.membersAt }; }
  getVoice() { return { channels: this.voice, updatedAt: this.voiceAt }; }
  getChanges(limit = 30, guildId: string | null = null) { return this.changes.filter((c) => !guildId || c.guildId === guildId).slice(0, limit); }
}
