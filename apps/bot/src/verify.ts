import type { VerifyConfig } from '@enrp/shared';
import type { Api } from './api';

/** Rollen und Nickname, die die Verifizierung für ein Mitglied vorgibt. */
export interface VerifyActions { add: string[]; remove: string[]; nickname: string | null }
export interface VerifyLink { discordId: string; discordName: string | null; robloxId: string; robloxName: string; displayName: string; verifiedAt: string; profileUrl: string }
export interface VerifyStatus { enabled: boolean; link: VerifyLink | null; actions: VerifyActions | null }

/** Was der Bot dafür in Discord tut (echte Umsetzung in index.ts, in Tests ein Fake). Liefert Hinweise, was nicht ging. */
export interface VerifyMemberOps {
  apply(guildId: string, userId: string, a: VerifyActions): Promise<string[]>;
  /** Server, auf denen das Mitglied ist. */
  guildsOf(userId: string): Promise<{ guildId: string; displayName: string }[]>;
}

const CACHE_MS = 30_000;

/** Roblox-Verifizierung im Bot: beim Beitritt automatisch, nach Änderungen im Dashboard auf allen Servern. */
export function createVerify(api: Api, ops: VerifyMemberOps, log: (m: string) => void = console.error) {
  const cache = new Map<string, { at: number; cfg: VerifyConfig }>();
  const config = async (guildId: string) => {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.cfg;
    const cfg = await api.service<VerifyConfig>('GET', `/bot/verify/config?guildId=${guildId}`);
    cache.set(guildId, { at: Date.now(), cfg });
    return cfg;
  };
  /** Status holen und anwenden; null = auf diesem Server aus. */
  const sync = async (guildId: string, userId: string, discordName?: string) => {
    const s = await api.service<VerifyStatus>('POST', '/bot/verify/status', { guildId, discordId: userId, ...(discordName ? { discordName } : {}) });
    if (!s.enabled || !s.actions) return null;
    return { status: s, problems: await ops.apply(guildId, userId, s.actions) };
  };
  return {
    sync,
    /** Beitritt: Verifizierte bekommen sofort Rollen + Nickname, alle anderen die „nicht verifiziert“-Rollen. */
    async joined(m: { guildId: string; id: string; bot: boolean; displayName?: string }) {
      if (m.bot) return;
      const cfg = await config(m.guildId).catch((e) => { log(`Verifizierungs-Einstellungen nicht geladen: ${e instanceof Error ? e.message : e}`); return null; });
      if (!cfg?.enabled || !cfg.autoOnJoin) return;
      const r = await sync(m.guildId, m.id, m.displayName).catch((e) => { log(`Verifizierung beim Beitritt fehlgeschlagen: ${e instanceof Error ? e.message : e}`); return null; });
      if (r?.problems.length) log(`Verifizierung beim Beitritt (${m.guildId}): ${r.problems.join('; ')}`);
    },
    /** Nach Entfernen/Ändern im Dashboard: auf allen Servern neu setzen. */
    async refreshEverywhere(userId: string) {
      for (const g of await ops.guildsOf(userId)) {
        const r = await sync(g.guildId, userId, g.displayName).catch((e) => { log(`Verifizierung aktualisieren fehlgeschlagen (${g.guildId}): ${e instanceof Error ? e.message : e}`); return null; });
        if (r?.problems.length) log(`Verifizierung aktualisieren (${g.guildId}): ${r.problems.join('; ')}`);
      }
    },
    clear() { cache.clear(); },
  };
}
export type Verify = ReturnType<typeof createVerify>;
