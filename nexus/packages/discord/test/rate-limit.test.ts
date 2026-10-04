import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordApiError, TtlCache, getGuildMember, rateLimitBucket } from '../src/index.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const member = { user: { id: '1', username: 'a' }, roles: ['r'], nick: null };

afterEach(() => vi.unstubAllGlobals());

describe('Discord: Rate Limits & unnötige Aufrufe', () => {
  it('Bereichsschlüssel behält die Haupt-ID, ersetzt weitere IDs', () => {
    expect(rateLimitBucket('GET', '/guilds/11111/members/22222?x=1')).toBe('GET /guilds/11111/members/:id');
    expect(rateLimitBucket('PUT', '/guilds/11111/members/22222/roles/33333')).toBe('PUT /guilds/11111/members/:id/roles/:id');
  });

  it('gleichzeitige gleiche Lesezugriffe teilen sich eine Discord-Anfrage', async () => {
    const fetchMock = vi.fn(async () => json(member));
    vi.stubGlobal('fetch', fetchMock);
    const all = await Promise.all(Array.from({ length: 50 }, () => getGuildMember('t', '10001', '20001')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(all.every((m) => m?.roles[0] === 'r')).toBe(true);
  });

  it('mit Cache gibt es für dieselbe Person keine zweite Anfrage; 404 („kein Mitglied“) wird ebenfalls gemerkt', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => (String(url).endsWith('/20003') ? json({ message: 'Unknown Member' }, 404) : json(member)));
    vi.stubGlobal('fetch', fetchMock);
    const cache = new TtlCache();
    await getGuildMember('t', '10002', '20002', cache);
    await getGuildMember('t', '10002', '20002', cache);
    expect(await getGuildMember('t', '10002', '20003', cache)).toBeNull();
    expect(await getGuildMember('t', '10002', '20003', cache)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429: wartet retry-after und wiederholt; Erfolg beim zweiten Versuch', async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => (n++ === 0 ? json({ message: 'rate limited', retry_after: 0.01 }, 429, { 'retry-after': '0.01' }) : json(member)));
    vi.stubGlobal('fetch', fetchMock);
    expect((await getGuildMember('t', '10003', '20004'))?.roles).toEqual(['r']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('dauerhaftes 429: gibt nach 3 Versuchen mit verständlichem Fehler auf; lange Sperren werden nicht ausgesessen und pausieren den Bereich', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'rate limited' }, 429, { 'retry-after': '0.01' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getGuildMember('t', '10004', '20005')).rejects.toSatisfy((e) => e instanceof DiscordApiError && e.status === 429);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const long = vi.fn(async () => json({ message: 'x' }, 429, { 'retry-after': '120' }));
    vi.stubGlobal('fetch', long);
    await expect(getGuildMember('t', '10005', '20006')).rejects.toMatchObject({ status: 429 });
    expect(long).toHaveBeenCalledTimes(1);
    // Bereich ist pausiert → keine weitere Anfrage an Discord
    await expect(getGuildMember('t', '10005', '20007')).rejects.toMatchObject({ status: 429 });
    expect(long).toHaveBeenCalledTimes(1);
  });
});
