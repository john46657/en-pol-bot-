import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RobloxProfile {
  id: string; name: string; displayName: string; description: string; created: string | null; isBanned: boolean;
  avatarUrl: string | null; profileUrl: string;
  /** Vorhandene Akte zu diesem Roblox-Konto (per ID, sonst per Name). */
  person: { id: string; robloxUsername: string } | null;
}

const NAME = /^[A-Za-z0-9_]{3,20}$/;
const ID = /^\d{1,19}$/;
const TTL = 10 * 60_000;

/**
 * Roblox-Konto nachschlagen – per Benutzername oder Roblox-ID – über die öffentliche Roblox-API (kein Token).
 * Antworten werden 10 Minuten zwischengespeichert; Fehler/Timeouts → null (die normale Suche läuft weiter).
 */
@Injectable()
export class RobloxService {
  private cache = new Map<string, { at: number; value: Omit<RobloxProfile, 'person'> | null }>();
  constructor(private readonly prisma: PrismaService) {}

  /** Gültige Eingabe? (Roblox-Name 3–20 Zeichen aus Buchstaben/Ziffern/_ oder eine Roblox-ID; auch Profil-Links) */
  static parse(input: string): { id?: string; name?: string } | null {
    const t = input.trim();
    const link = t.match(/roblox\.com\/users\/(\d{1,19})/i)?.[1];
    if (link) return { id: link };
    if (ID.test(t)) return { id: t };
    const name = t.replace(/^@/, '');
    return NAME.test(name) ? { name } : null;
  }

  async lookup(input: string): Promise<RobloxProfile | null> {
    if (process.env.ROBLOX_LOOKUP === 'off') return null; // Tests ohne Internet
    const p = RobloxService.parse(input);
    if (!p) return null;
    const key = p.id ? `id:${p.id}` : `name:${p.name!.toLowerCase()}`;
    const hit = this.cache.get(key);
    let profile = hit && Date.now() - hit.at < TTL ? hit.value : undefined;
    if (profile === undefined) {
      profile = await this.fetchProfile(p);
      if (this.cache.size > 500) this.cache.clear();
      this.cache.set(key, { at: Date.now(), value: profile });
    }
    if (!profile) return null;
    const person = await this.prisma.person.findFirst({
      where: { OR: [{ robloxUserId: profile.id }, { robloxUsername: { equals: profile.name, mode: 'insensitive' } }] },
      orderBy: { robloxUserId: { sort: 'asc', nulls: 'last' } }, select: { id: true, robloxUsername: true },
    });
    return { ...profile, person };
  }

  /**
   * Roblox-Benutzername prüfen (Bewerbungsfrage „Roblox User“): gefunden → richtige Schreibweise + ID,
   * gibt es nicht → null, Roblox nicht erreichbar (oder Abfrage abgeschaltet) → undefined.
   */
  async verifyName(name: string): Promise<{ id: string; name: string } | null | undefined> {
    if (process.env.ROBLOX_LOOKUP === 'off' || !NAME.test(name)) return undefined;
    const key = `verify:${name.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value ? { id: hit.value.id, name: hit.value.name } : null;
    try {
      const r = await this.get('https://users.roblox.com/v1/usernames/users', { usernames: [name], excludeBannedUsers: false }) as { data?: { id: number; name: string }[] } | null;
      if (!r) return undefined; // Fehlerantwort → nicht entscheidbar
      const u = r.data?.[0];
      const value = u ? { id: String(u.id), name: u.name } : null;
      this.cache.set(key, { at: Date.now(), value: value ? { ...value, displayName: value.name, description: '', created: null, isBanned: false, avatarUrl: null, profileUrl: '' } : null });
      return value;
    } catch { return undefined; }
  }

  /** Für die öffentliche Bewerbung: nur Name, Anzeigename und Bild (keine internen Daten wie Akten). */
  async publicLookup(input: string) {
    const p = await this.lookup(input);
    return p ? { id: p.id, name: p.name, displayName: p.displayName, avatarUrl: p.avatarUrl } : null;
  }

  private async fetchProfile(p: { id?: string; name?: string }): Promise<Omit<RobloxProfile, 'person'> | null> {
    try {
      let id = p.id;
      if (!id) {
        const r = await this.get('https://users.roblox.com/v1/usernames/users', { usernames: [p.name], excludeBannedUsers: false }) as { data?: { id: number }[] } | null;
        const found = r?.data?.[0]?.id;
        if (!found) return null;
        id = String(found);
      }
      const [u, thumb] = await Promise.all([
        this.get(`https://users.roblox.com/v1/users/${id}`) as Promise<{ id: number; name: string; displayName: string; description?: string; created?: string; isBanned?: boolean } | null>,
        this.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`).catch(() => null) as Promise<{ data?: { imageUrl?: string; state?: string }[] } | null>,
      ]);
      if (!u?.id) return null;
      const img = thumb?.data?.[0];
      return {
        id: String(u.id), name: u.name, displayName: u.displayName, description: (u.description ?? '').slice(0, 1000), created: u.created ?? null, isBanned: !!u.isBanned,
        avatarUrl: img?.state === 'Completed' && img.imageUrl?.startsWith('https://') ? img.imageUrl : null,
        profileUrl: `https://www.roblox.com/users/${u.id}/profile`,
      };
    } catch { return null; }
  }

  private async get(url: string, body?: unknown): Promise<unknown> {
    const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) } : { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return res.json();
  }
}
