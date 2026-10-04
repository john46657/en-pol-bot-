import { discordSyncRepository, prisma } from '@nexus/database';
import { getGuildChannels, getGuildRoles } from '@nexus/discord';

/**
 * Discord-Synchronisierung per REST: gleicht Rollen und Kanäle aller bekannten Server mit der Datenbank ab
 * (Ergänzung zum ereignisbasierten Abgleich im Bot – fängt verpasste Ereignisse nach Ausfällen ein).
 * Fehler eines Servers (z. B. Bot wurde entfernt) stoppen die anderen nicht.
 */
export async function syncAllGuilds(botToken: string): Promise<{ ok: number; failed: { guildId: string; error: string }[] }> {
  const guilds = await prisma.guild.findMany({ select: { id: true } });
  const failed: { guildId: string; error: string }[] = [];
  let ok = 0;
  for (const g of guilds) {
    try {
      const [roles, channels] = await Promise.all([getGuildRoles(botToken, g.id), getGuildChannels(botToken, g.id)]);
      await discordSyncRepository.syncRoles(g.id, roles.map((r) => ({ discordId: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, mentionable: r.mentionable })));
      await discordSyncRepository.syncChannels(g.id, channels.map((c) => ({ discordId: c.id, name: c.name, type: c.type, parentId: c.parentId, position: 0 })));
      ok++;
    } catch (e) {
      failed.push({ guildId: g.id, error: e instanceof Error ? e.message.slice(0, 200) : 'Fehler' });
    }
  }
  return { ok, failed };
}
