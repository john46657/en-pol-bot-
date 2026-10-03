import type { Client, Guild } from 'discord.js';
import { guildRepository } from '@nexus/database';
import { log } from './logger.js';

/**
 * Guild-Sync: Das Dashboard erkennt "Bot ist auf dem Server" an der Guild-Zeile in der Datenbank,
 * und alle Applications/Panels hängen per Fremdschlüssel daran – ohne Sync wäre beides leer.
 */
export async function syncGuild(guild: Guild): Promise<void> {
  await guildRepository.upsert({
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL(),
    ownerId: guild.ownerId,
  });
}

export async function syncAllGuilds(client: Client): Promise<void> {
  let ok = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      await syncGuild(guild);
      ok++;
    } catch (error) {
      log.error({ guildId: guild.id, err: String(error) }, 'Guild-Sync fehlgeschlagen.');
    }
  }
  log.info(
    { synced: ok, total: client.guilds.cache.size },
    'Server mit der Datenbank abgeglichen.',
  );
}
