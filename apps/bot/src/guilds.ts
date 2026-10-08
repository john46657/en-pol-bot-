import { ChannelType, type Client, type Guild } from 'discord.js';
import type { Api } from './api';

/** Server mit Channels und Rollen, wie das Dashboard sie für Namen und Auswahllisten braucht. */
export interface GuildInfo {
  id: string; name: string; icon: string | null;
  channels: { id: string; name: string; type: 'text' | 'category' | 'voice' | 'other'; parentId: string | null; position: number }[];
  roles: { id: string; name: string; color: number; position: number }[];
}

const kind = (t: ChannelType): GuildInfo['channels'][number]['type'] =>
  t === ChannelType.GuildText || t === ChannelType.GuildAnnouncement ? 'text' : t === ChannelType.GuildCategory ? 'category' : t === ChannelType.GuildVoice || t === ChannelType.GuildStageVoice ? 'voice' : 'other';

export function guildInfo(g: Guild): GuildInfo {
  return {
    id: g.id, name: g.name.slice(0, 100), icon: g.iconURL({ size: 64 }) ?? null,
    channels: [...g.channels.cache.values()].filter((c) => !c.isThread()).slice(0, 500)
      .map((c) => ({ id: c.id, name: c.name.slice(0, 100), type: kind(c.type), parentId: 'parentId' in c ? c.parentId ?? null : null, position: 'rawPosition' in c ? (c.rawPosition as number) : 0 })),
    // @everyone und Rollen von Bots/Integrationen sind keine sinnvolle Auswahl
    roles: [...g.roles.cache.values()].filter((r) => r.id !== g.id && !r.managed).slice(0, 250)
      .map((r) => ({ id: r.id, name: r.name.slice(0, 100), color: r.color, position: r.position })),
  };
}

/** Meldet alle Server des Bots an das System (beim Start, bei Änderungen und regelmäßig). */
export function startGuildDirectory(client: () => Client, api: Api, log: (m: string) => void = console.log) {
  let timer: NodeJS.Timeout | undefined;
  const push = async () => {
    const guilds = [...client().guilds.cache.values()].slice(0, 50).map(guildInfo);
    await api.service('PUT', '/bot/guilds', { guilds }).catch((e) => log(`Serverliste nicht gesendet: ${e instanceof Error ? e.message : e}`));
  };
  // mehrere Änderungen kurz hintereinander nur einmal melden
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => void push(), 5_000); timer.unref?.(); };
  const c = client();
  for (const ev of ['guildCreate', 'guildDelete', 'guildUpdate', 'channelCreate', 'channelDelete', 'channelUpdate', 'roleCreate', 'roleDelete', 'roleUpdate'] as const) c.on(ev, soon);
  void push();
  setInterval(() => void push(), 10 * 60_000).unref();
  return { push };
}
