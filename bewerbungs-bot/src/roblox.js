/**
 * Frage „Roblox-Benutzer“: Konto bei Roblox suchen.
 * Ergebnis: { id, name, displayName, avatarUrl } · null = gibt es nicht · undefined = Roblox nicht erreichbar.
 */
const cache = new Map();

export function createRoblox({ enabled = true, fetchImpl = globalThis.fetch } = {}) {
  async function lookup(name) {
    if (!enabled) return undefined;
    const key = String(name).toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.at > Date.now() - 10 * 60_000) return hit.value;
    try {
      const res = await fetchImpl('https://users.roblox.com/v1/usernames/users', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usernames: [name], excludeBannedUsers: false }), signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return undefined;
      const u = (await res.json()).data?.[0];
      let value = null;
      if (u) {
        let avatarUrl = null;
        try {
          const t = await fetchImpl(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${u.id}&size=150x150&format=Png&isCircular=false`, { signal: AbortSignal.timeout(5000) });
          if (t.ok) avatarUrl = (await t.json()).data?.[0]?.imageUrl ?? null;
        } catch { /* ohne Bild */ }
        value = { id: String(u.id), name: u.name, displayName: u.displayName ?? u.name, avatarUrl };
      }
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      return undefined;
    }
  }
  return { lookup };
}
