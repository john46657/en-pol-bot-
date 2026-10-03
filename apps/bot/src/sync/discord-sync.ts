import type { Client, Guild } from 'discord.js';
import { discordSyncRepository, userRepository } from '@nexus/database';
import { log } from '../logger.js';
import { channelService, roleService, toMemberInfo } from '../services/index.js';

/**
 * Discord → Datenbank: Rollen, Kanäle (Text, Voice, Kategorien) und Benutzer eines Servers.
 * Quelle ist der Gateway-Cache von discord.js – der Sync verursacht keine zusätzlichen REST-Aufrufe
 * (nur das Laden der Mitglieder bei kleinen Servern).
 */
const MEMBER_SYNC_LIMIT = Number(process.env['NEXUS_MEMBER_SYNC_LIMIT'] ?? 1000);

export async function syncRoles(guild: Guild): Promise<void> {
  const roles = roleService.list(guild).filter((r) => !r.isEveryone);
  await discordSyncRepository.syncRoles(
    guild.id,
    roles.map((r) => ({
      discordId: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: r.permissions,
      managed: r.managed,
      mentionable: r.mentionable,
      hoist: r.hoist,
    })),
  );
}

export async function syncChannels(guild: Guild): Promise<void> {
  const channels = channelService.list(guild).filter((c) => c.kind !== 'other');
  await discordSyncRepository.syncChannels(
    guild.id,
    channels.map((c) => ({
      discordId: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      position: c.position,
    })),
  );
}

/** Lädt Mitglieder nur bei Servern bis `NEXUS_MEMBER_SYNC_LIMIT`; größere Server werden per Event/Login nachgezogen. */
export async function syncUsers(guild: Guild): Promise<number> {
  if (guild.memberCount > MEMBER_SYNC_LIMIT) return 0;
  const members = await guild.members.fetch();
  let n = 0;
  for (const member of members.values()) {
    await userRepository.upsert({
      id: member.id,
      username: member.user.username,
      globalName: member.user.globalName,
      avatarUrl: member.user.avatar ? member.user.displayAvatarURL({ size: 128 }) : null,
      bot: member.user.bot,
    });
    n++;
  }
  return n;
}

export async function syncGuildResources(guild: Guild): Promise<void> {
  await syncRoles(guild);
  await syncChannels(guild);
  const users = await syncUsers(guild).catch((e) => {
    log.warn({ guildId: guild.id, err: String(e) }, 'Benutzer-Sync übersprungen.');
    return 0;
  });
  log.info(
    {
      guildId: guild.id,
      roles: guild.roles.cache.size,
      channels: guild.channels.cache.size,
      users,
    },
    'Rollen/Kanäle/Benutzer synchronisiert.',
  );
}

// --- Event-getriebene Nachsynchronisierung (gebündelt, damit Massenänderungen nur einen Sync auslösen)

const timers = new Map<string, NodeJS.Timeout>();

export function scheduleSync(guild: Guild, kind: 'roles' | 'channels', delayMs = 2000): void {
  const key = `${guild.id}:${kind}`;
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      (kind === 'roles' ? syncRoles(guild) : syncChannels(guild)).catch((e) =>
        log.error({ guildId: guild.id, kind, err: String(e) }, 'Sync fehlgeschlagen.'),
      );
    }, delayMs),
  );
}

export async function syncAllGuildResources(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await syncGuildResources(guild).catch((e) =>
      log.error({ guildId: guild.id, err: String(e) }, 'Sync fehlgeschlagen.'),
    );
  }
}

export { toMemberInfo };
