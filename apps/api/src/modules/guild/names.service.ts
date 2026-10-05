import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertGuildId, prisma } from '@nexus/database';
import { getGuildMember, getUserProfile } from '@nexus/discord';

export interface NameInfo {
  /** Anzeigename: Spitzname auf dem Server, sonst Discord-Anzeigename, sonst Benutzername; `null` = unbekannt. */
  name: string | null;
  username: string | null;
  /** RP-Name aus der Personalakte (falls vorhanden). */
  rpName: string | null;
  avatarUrl: string | null;
  /** Ist die Person (noch) auf dem Server? */
  inGuild: boolean;
}

const TTL_MS = 10 * 60_000;
const MAX_IDS = 100;
const PARALLEL = 5;

/**
 * Discord-IDs → Namen fürs Dashboard (gesammelt je Anfrage, 10 Minuten zwischengespeichert). Personen, die den Server
 * verlassen haben, erscheinen mit ihrem Kontonamen; Fehler bei Discord führen zu „unbekannt“, nie zu einem Abbruch.
 */
@Injectable()
export class NamesService {
  private readonly cache = new Map<string, { at: number; info: Omit<NameInfo, 'rpName'> }>();

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  private async lookup(guildId: string, id: string): Promise<Omit<NameInfo, 'rpName'>> {
    const key = `${guildId}:${id}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.info;
    let info: Omit<NameInfo, 'rpName'> = { name: null, username: null, avatarUrl: null, inGuild: false };
    try {
      const m = await getGuildMember(this.token, guildId, id);
      if (m) info = { name: m.nick || m.globalName || m.username, username: m.username, avatarUrl: m.avatar ? `https://cdn.discordapp.com/avatars/${id}/${m.avatar}.png?size=64` : null, inGuild: true };
      else {
        const u = await getUserProfile(this.token, id);
        if (u) info = { name: u.globalName || u.username, username: u.username, avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=64` : null, inGuild: false };
      }
    } catch {
      return info; // nicht zwischenspeichern – beim nächsten Mal erneut versuchen
    }
    this.cache.set(key, { at: Date.now(), info });
    if (this.cache.size > 20_000) this.cache.delete(this.cache.keys().next().value!);
    return info;
  }

  async resolve(guildId: string, rawIds: string[]): Promise<Record<string, NameInfo>> {
    const gid = assertGuildId(guildId);
    const ids = [...new Set(rawIds.filter((x) => /^\d{5,25}$/.test(x)))].slice(0, MAX_IDS);
    const records = await prisma.personnelRecord.findMany({ where: { guildId: gid, userId: { in: ids } }, select: { userId: true, rpName: true } });
    const rp = new Map(records.map((r) => [r.userId, r.rpName]));
    const out: Record<string, NameInfo> = {};
    for (let i = 0; i < ids.length; i += PARALLEL) {
      const batch = ids.slice(i, i + PARALLEL);
      const infos = await Promise.all(batch.map((id) => this.lookup(gid, id)));
      batch.forEach((id, k) => (out[id] = { ...infos[k]!, rpName: rp.get(id) ?? null }));
    }
    return out;
  }
}
