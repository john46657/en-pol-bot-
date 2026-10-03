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
