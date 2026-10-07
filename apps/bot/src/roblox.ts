/** Roblox-Namenssuche über die öffentliche Roblox-API (kein Token nötig). Fehler/Timeouts → null. */
export async function robloxLookup(username: string, doFetch: typeof fetch = fetch): Promise<{ id: number; name: string; displayName: string } | null> {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null; // gültige Roblox-Namen: 3–20 Zeichen, Buchstaben/Ziffern/_
  try {
    const res = await doFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }), signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id: number; name: string; displayName: string }[] };
    const hit = json.data?.[0];
    return hit ? { id: hit.id, name: hit.name, displayName: hit.displayName } : null;
  } catch { return null; }
}

/**
 * Bewerbungsfrage „Roblox User“: Konto prüfen (mit Profilbild).
 * Gefunden → Konto, gibt es nicht → null, Roblox nicht erreichbar → undefined (dann prüft der Server erneut).
 */
export async function robloxCheck(username: string, doFetch: typeof fetch = fetch): Promise<{ id: number; name: string; displayName: string; avatarUrl: string | null } | null | undefined> {
  const name = username.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return null;
  try {
    const res = await doFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: [name], excludeBannedUsers: false }), signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;
    const hit = ((await res.json()) as { data?: { id: number; name: string; displayName: string }[] }).data?.[0];
    if (!hit) return null;
    let avatarUrl: string | null = null;
    try {
      const t = await doFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${hit.id}&size=150x150&format=Png&isCircular=false`, { signal: AbortSignal.timeout(4000) });
      const img = t.ok ? ((await t.json()) as { data?: { imageUrl?: string; state?: string }[] }).data?.[0] : undefined;
      if (img?.state === 'Completed' && img.imageUrl?.startsWith('https://')) avatarUrl = img.imageUrl;
    } catch { /* Bild ist optional */ }
    return { id: hit.id, name: hit.name, displayName: hit.displayName, avatarUrl };
  } catch { return undefined; }
}
