import type { Api } from './api';

interface Targets { enabled: boolean; guildId: string | null; roleIds: string[]; discordIds: string[] }
export interface RadioMember { id: string; name?: string | null; roleIds: string[] }
/** Was der Abgleich von Discord braucht (in Tests ersetzbar). */
export interface RadioGuildSource {
  /** Alle Mitglieder des Servers (bzw. die im Cache, wenn der Intent „Server Members“ fehlt). */
  members(guildId: string): Promise<RadioMember[]>;
}

const CHUNK = 500;
const TARGET_TTL_MS = 60_000;

/**
 * Funk-Whitelist ↔ Discord-Rollen. Der Bot meldet nur Rollenstände; was daraus folgt (Freigabe erteilen/entziehen),
 * entscheidet ausschließlich die API anhand der Regeln im Dashboard.
 * - Rollenänderung / Verlassen des Servers: sofort für das betroffene Mitglied (nur wenn eine relevante Rolle betroffen ist
 *   oder das Mitglied auf der Whitelist steht)
 * - vollständiger Abgleich: auf Anforderung aus dem Dashboard, nach dem Start und alle 30 Minuten (holt verpasste Änderungen nach)
 */
export function createRadioRoleSync(api: Api, source: RadioGuildSource, log: (m: string) => void = console.log) {
  let cache: { at: number; t: Targets } | null = null;
  async function targets(force = false): Promise<Targets> {
    if (!force && cache && Date.now() - cache.at < TARGET_TTL_MS) return cache.t;
    const t = await api.service<Targets>('GET', '/bot/radio-whitelist/sync-targets');
    cache = { at: Date.now(), t };
    return t;
  }
  const post = (guildId: string, members: { discordId: string; name?: string | null; roleIds: string[] | null }[], full: boolean) =>
    api.service<{ changed: number; failed: number }>('POST', '/bot/radio-whitelist/roles', { guildId, full, members });

  /** Einzelnes Mitglied: `roleIds = null` → hat den Server verlassen. `before` = Rollen vorher (falls bekannt). */
  async function memberChanged(guildId: string, discordId: string, name: string | null, roleIds: string[] | null, before?: string[]) {
    const t = await targets();
    if (!t.enabled || (t.guildId && t.guildId !== guildId)) return false;
    const listed = t.discordIds.includes(discordId);
    const touched = (r: string[] | null | undefined) => (r ?? []).some((x) => t.roleIds.includes(x));
    const relevant = listed || touched(roleIds) || touched(before);
    if (!relevant) return false;
    if (before && roleIds && t.roleIds.every((r) => before.includes(r) === roleIds.includes(r)) && listed) return false; // relevante Rollen unverändert
    await post(guildId, [{ discordId, name, roleIds }], false);
    cache = null; // Whitelist kann sich geändert haben
    return true;
  }

  /** Vollständiger Abgleich des konfigurierten Servers. */
  async function full(guildIdHint?: string) {
    const t = await targets(true);
    const guildId = t.guildId ?? guildIdHint;
    if (!t.enabled || !guildId) return { checked: 0, changed: 0, failed: 0 };
    const all = await source.members(guildId);
    const byId = new Map(all.map((m) => [m.id, m]));
    const relevant = all.filter((m) => m.roleIds.some((r) => t.roleIds.includes(r)) || t.discordIds.includes(m.id));
    const list: { discordId: string; name?: string | null; roleIds: string[] | null }[] = relevant.map((m) => ({ discordId: m.id, name: m.name ?? null, roleIds: m.roleIds }));
    // auf der Whitelist, aber nicht (mehr) auf dem Server
    for (const id of t.discordIds) if (!byId.has(id)) list.push({ discordId: id, roleIds: null });
    let changed = 0, failed = 0;
    for (let i = 0; i < list.length || i === 0; i += CHUNK) {
      const part = list.slice(i, i + CHUNK);
      const r = await post(guildId, part, i + CHUNK >= list.length);
      changed += r.changed ?? 0; failed += r.failed ?? 0;
      if (!list.length) break;
    }
    cache = null;
    if (changed || failed) log(`radio whitelist role sync: ${list.length} checked, ${changed} changed, ${failed} failed`);
    return { checked: list.length, changed, failed };
  }

  function start(minutes = 30) {
    const run = () => void full().catch((e) => log(`radio whitelist role sync failed: ${e instanceof Error ? e.message : e}`));
    const first = setTimeout(run, 30_000);
    const timer = setInterval(run, minutes * 60_000);
    first.unref?.(); timer.unref?.();
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  return { memberChanged, full, start, targets };
}
