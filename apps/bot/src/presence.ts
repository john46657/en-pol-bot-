import { ChannelType, type Client, type Guild, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import type { Api } from './api';

/** Teammitglied für die Teamliste im Dashboard (ohne Voice-Daten). */
export interface MemberReport { id: string; guildId: string; username: string; displayName: string; avatar: string | null; status: 'online' | 'idle' | 'dnd' | 'offline' | 'unknown'; roleIds: string[]; joinedAt: string | null }
/** Voice-Channel mit Personen für das Voice-Widget (getrennt von der Teamliste). */
export interface VoiceReport {
  id: string; guildId: string; name: string; parentId: string | null; parentName: string | null; position: number;
  members: { id: string; displayName: string; avatar: string | null; selfMute: boolean; selfDeaf: boolean; serverMute: boolean; serverDeaf: boolean; video: boolean; streaming: boolean; since: string | null }[];
}

const STATUS = new Set(['online', 'idle', 'dnd', 'offline']);

export function memberReport(m: GuildMember, presences: boolean): MemberReport {
  const raw = m.presence?.status;
  return {
    id: m.id, guildId: m.guild.id, username: m.user.username.slice(0, 100), displayName: m.displayName.slice(0, 100), avatar: m.displayAvatarURL({ size: 128 }) ?? null,
    status: !presences ? 'unknown' : raw && STATUS.has(raw) ? (raw as MemberReport['status']) : 'offline', // ohne Presence = offline/unsichtbar
    roleIds: [...m.roles.cache.keys()].filter((r) => r !== m.guild.id).slice(0, 250), joinedAt: m.joinedAt?.toISOString() ?? null,
  };
}

/** Alle Teammitglieder (mit mindestens einer Teamrolle) aller Server; dieselbe Person auf mehreren Servern nur einmal. */
export function teamMembers(guilds: Guild[], teamRoleIds: string[], presences: boolean): MemberReport[] {
  if (!teamRoleIds.length) return [];
  const out = new Map<string, MemberReport>();
  for (const g of guilds) for (const m of g.members.cache.values()) {
    if (m.user.bot || !teamRoleIds.some((r) => m.roles.cache.has(r))) continue;
    const prev = out.get(m.id);
    const r = memberReport(m, presences);
    out.set(m.id, prev ? { ...prev, roleIds: [...new Set([...prev.roleIds, ...r.roleIds])], status: prev.status === 'online' ? prev.status : r.status } : r);
  }
  return [...out.values()].slice(0, 5000);
}

export function voiceReport(guilds: Guild[], since: Map<string, number>): VoiceReport[] {
  const out: VoiceReport[] = [];
  for (const g of guilds) {
    const voice = [...g.channels.cache.values()].filter((c): c is VoiceBasedChannel => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
    for (const c of voice) {
      out.push({
        id: c.id, guildId: g.id, name: c.name.slice(0, 100), parentId: c.parentId ?? null, parentName: c.parent?.name.slice(0, 100) ?? null, position: c.rawPosition,
        members: [...c.members.values()].slice(0, 500).map((m) => {
          const v = m.voice;
          const t = since.get(`${g.id}:${m.id}`);
          return { id: m.id, displayName: m.displayName.slice(0, 100), avatar: m.displayAvatarURL({ size: 64 }) ?? null, selfMute: !!v.selfMute, selfDeaf: !!v.selfDeaf, serverMute: !!v.serverMute, serverDeaf: !!v.serverDeaf, video: !!v.selfVideo, streaming: !!v.streaming, since: t ? new Date(t).toISOString() : null };
        }),
      });
    }
  }
  return out.slice(0, 500);
}

/**
 * Meldet dem Dashboard Teammitglieder (alle 5 Sekunden und bei Änderungen) und Voice-Channels (bei jeder Änderung).
 * `members`/`presences`: ob die privilegierten Intents „Server Members“ und „Presence“ verfügbar sind.
 */
export function startPresenceReporter(client: () => Client, api: Api, opts: { members: boolean; presences: boolean }, log: (m: string) => void = console.log) {
  const since = new Map<string, number>(); // Aufenthaltsdauer: seit wann in diesem Channel (ab Bot-Start bekannt)
  let teamRoles: string[] = [];
  let lastError: string | undefined;
  const guilds = () => [...client().guilds.cache.values()].slice(0, 50);
  const fail = (what: string) => (e: unknown) => {
    const msg = `${what}: ${e instanceof Error ? e.message : e}`;
    if (msg !== lastError) { log(`team/voice report failed – ${msg} (will keep retrying quietly)`); lastError = msg; }
  };

  const pushMembers = async () => {
    teamRoles = (await api.service<{ roleIds: string[] }>('GET', '/bot/team-roles')).roleIds;
    await api.service('PUT', '/bot/members', { members: teamMembers(guilds(), teamRoles, opts.presences) });
    lastError = undefined;
  };
  const pushVoice = async () => { await api.service('PUT', '/bot/voice', { channels: voiceReport(guilds(), since) }); };

  let mt: NodeJS.Timeout | undefined, vt: NodeJS.Timeout | undefined;
  const membersSoon = () => { clearTimeout(mt); mt = setTimeout(() => void pushMembers().catch(fail('members')), 1_500); mt.unref?.(); };
  const voiceSoon = () => { clearTimeout(vt); vt = setTimeout(() => void pushVoice().catch(fail('voice')), 1_500); vt.unref?.(); };

  const c = client();
  for (const g of guilds()) for (const s of g.voiceStates.cache.values()) if (s.channelId) since.set(`${g.id}:${s.id}`, Date.now());
  c.on('voiceStateUpdate', (before, after) => {
    const key = `${after.guild.id}:${after.id}`;
    if (!after.channelId) since.delete(key);
    else if (before.channelId !== after.channelId) since.set(key, Date.now());
    voiceSoon();
  });
  for (const ev of ['guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'userUpdate', ...(opts.presences ? ['presenceUpdate'] : [])] as const) c.on(ev, membersSoon);
  c.on('channelCreate', voiceSoon); c.on('channelDelete', voiceSoon); c.on('channelUpdate', voiceSoon);

  /** Mitgliederliste einmal vollständig laden (danach hält Discord sie über Ereignisse aktuell). */
  const loadMembers = async () => {
    if (!opts.members) { log('Discord: "Server Members Intent" is off – the dashboard team list only shows members the bot has seen (enable it in the Developer Portal → Bot).'); return; }
    for (const g of guilds()) await g.members.fetch().catch((e) => log(`could not load members of ${g.name}: ${e instanceof Error ? e.message : e}`));
  };
  void loadMembers().then(() => Promise.all([pushMembers().catch(fail('members')), pushVoice().catch(fail('voice'))]));
  // verbindlich: alle 5 Sekunden ein frischer Stand (Dashboard aktualisiert sich im selben Takt)
  setInterval(() => void pushMembers().catch(fail('members')), 5_000).unref();
  setInterval(() => void pushVoice().catch(fail('voice')), 5_000).unref();
  c.on('guildCreate', (g) => { if (opts.members) void g.members.fetch().catch(() => undefined).then(membersSoon); });

  return { sync: () => Promise.all([pushMembers(), pushVoice()]).then(() => undefined) };
}
