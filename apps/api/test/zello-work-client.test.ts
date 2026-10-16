import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZelloError, ZelloWorkClient, zelloApiMac, zelloBaseUrl } from '../src/radio/zello-work.client';

/** Erwartet einen Fehler und liefert ihn. */
async function fail(p: Promise<unknown>): Promise<ZelloError> {
  try { await p; } catch (e) { return e as ZelloError; }
  throw new Error('Fehler erwartet');
}
const creds = { network: 'EnPolizei', username: 'admin', password: 'p@ss word', apiKey: 'KEY123' };
type Call = { url: string; method: string; body?: string; headers?: Record<string, string> };

/** Simulierter Zello-Work-Server nach der offiziellen Dokumentation (zellowork.com/api). */
function fakeServer(over: Partial<Record<string, (c: Call) => unknown>> = {}) {
  const calls: Call[] = [];
  const routes: Record<string, (c: Call) => unknown> = {
    'GET /user/gettoken': () => ({ status: 'OK', code: '200', token: 'tok123', sid: 'sid456' }),
    'POST /user/auth': () => ({ status: 'OK', code: '200' }),
    'GET /user/logout': () => ({ status: 'OK', code: '200' }),
    'GET /channel/get/name/Polizei Emden': () => ({ status: 'OK', code: '200', channels: [{ name: 'Polizei Emden' }] }),
    'GET /channel/get/name/Fehlt': () => ({ status: 'Not found', code: '404' }),
    'POST /user/addto/Polizei Emden': () => ({ status: 'OK', code: '200' }),
    'POST /user/removefrom/Polizei Emden': () => ({ status: 'OK', code: '200' }),
    ...over,
  };
  const doFetch = async (url: string, init: { method: string; body?: string; headers?: Record<string, string> }) => {
    const c = { url, method: init.method, body: init.body, headers: init.headers };
    calls.push(c);
    const u = new URL(url);
    const fn = routes[`${init.method} ${decodeURIComponent(u.pathname)}`];
    const json = fn ? fn(c) : { status: 'Not found', code: '404' };
    return { status: 200, text: async () => (typeof json === 'string' ? json : JSON.stringify(json)) };
  };
  return { calls, doFetch };
}

describe('Zello-Work-Client', () => {
  it('Basis-URL nur aus gültigem Netzwerknamen', () => {
    expect(zelloBaseUrl('EnPolizei')).toBe('https://enpolizei.zellowork.com');
    for (const bad of ['', 'a b', 'evil.com/x', '-abc', 'x'.repeat(70)]) expect(() => zelloBaseUrl(bad)).toThrow(ZelloError);
  });

  it('Anmeldung wie dokumentiert: gettoken → auth mit api_mac (HMAC-SHA256), API-Schlüssel wird nie gesendet', async () => {
    const s = fakeServer();
    const c = new ZelloWorkClient(creds, s.doFetch);
    await c.login();
    expect(s.calls[0]).toMatchObject({ method: 'GET', url: 'https://enpolizei.zellowork.com/user/gettoken' });
    const auth = s.calls[1]!;
    expect(auth.url).toBe('https://enpolizei.zellowork.com/user/auth?sid=sid456');
    expect(auth.headers?.['content-type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(auth.body);
    expect(form.get('username')).toBe('admin');
    expect(form.get('password')).toBe('p@ss word');
    expect(form.get('api_mac')).toBe(createHmac('sha256', 'KEY123').update('admin:tok123').digest('hex'));
    expect(zelloApiMac('KEY123', 'admin', 'tok123')).toBe(form.get('api_mac'));
    expect(JSON.stringify(s.calls)).not.toContain('KEY123');
    await c.logout();
    expect(s.calls.at(-1)!.url).toBe('https://enpolizei.zellowork.com/user/logout?sid=sid456');
  });

  it('Kanal prüfen, Benutzer hinzufügen/entfernen mit login[]', async () => {
    const s = fakeServer();
    const c = new ZelloWorkClient(creds, s.doFetch);
    await c.login();
    expect(await c.channelExists('Polizei Emden')).toBe(true);
    expect(await c.channelExists('Fehlt')).toBe(false);
    await c.addToChannel('Polizei Emden', ['anna', 'bernd']);
    const add = s.calls.at(-1)!;
    expect(add.url).toBe('https://enpolizei.zellowork.com/user/addto/Polizei%20Emden?sid=sid456');
    expect(new URLSearchParams(add.body).getAll('login[]')).toEqual(['anna', 'bernd']);
    await c.removeFromChannel('Polizei Emden', ['anna']);
    expect(s.calls.at(-1)!.url).toContain('/user/removefrom/Polizei%20Emden?sid=');
    const before = s.calls.length;
    await c.addToChannel('Polizei Emden', []); // nichts zu tun → kein Aufruf
    expect(s.calls.length).toBe(before);
  });

  it('Fehlercodes werden verständlich gemeldet – ohne Passwort, Schlüssel oder Sitzungs-ID', async () => {
    const bad = fakeServer({ 'POST /user/auth': () => ({ status: 'Invalid username or password', code: '303' }) });
    const e = await fail(new ZelloWorkClient(creds, bad.doFetch).login());
    expect(e).toBeInstanceOf(ZelloError);
    expect(e.code).toBe('303');
    expect(e.message).toContain('Passwort');
    for (const secret of ['p@ss word', 'KEY123', 'sid456', 'tok123']) expect(e.message).not.toContain(secret);

    const noAdmin = fakeServer({ 'POST /user/auth': () => ({ status: 'Unauthorized', code: '302' }) });
    expect((await fail(new ZelloWorkClient(creds, noAdmin.doFetch).login())).message).toContain('Administratorrechte');

    const garbage = fakeServer({ 'GET /user/gettoken': () => '<html>Wartung</html>' });
    expect((await fail(new ZelloWorkClient(creds, garbage.doFetch).login())).message).toContain('Unerwartete Antwort');

    const down = new ZelloWorkClient(creds, async () => { throw new Error('getaddrinfo ENOTFOUND enpolizei.zellowork.com sid456'); });
    const d = await fail(down.login());
    expect(d.message).toContain('nicht erreichbar');
    expect(d.message).not.toContain('sid456');

    const slow = new ZelloWorkClient(creds, (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))), 30);
    expect((await fail(slow.login())).message).toContain('Zeitüberschreitung');
  });
});
