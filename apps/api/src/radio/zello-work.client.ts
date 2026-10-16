import { createHmac } from 'node:crypto';

/**
 * Client für die offizielle Zello-Work-Server-API (https://zellowork.com/api, Version 1.1.0, geprüft am 16.10.2026).
 * Verwendet NUR dort dokumentierte Endpunkte:
 *   GET  /user/gettoken                       → token + sid
 *   POST /user/auth?sid=…                     → username, password (Klartext über TLS), api_mac = HMAC-SHA256(api_key, username + ":" + token)
 *   GET  /user/logout?sid=…
 *   GET  /channel/get/name/{name}?sid=…       → Kanal prüfen (Verbindungstest)
 *   POST /user/addto/{channel}?sid=…          → login[] (Benutzer in den Kanal)
 *   POST /user/removefrom/{channel}?sid=…     → login[] (Benutzer aus dem Kanal)
 * Antworten: JSON mit `status` und `code` ("200" = OK). Der API-Schlüssel wird nie gesendet, Zugangsdaten und Sitzungs-ID
 * erscheinen nie in Fehlermeldungen. Die kostenlose Zello-App (Consumer-Kanäle) hat KEINE solche API.
 * Hinweis: gegen ein echtes Zello-Work-Netzwerk ist dieser Client nicht getestet (keine Zugangsdaten vorhanden).
 */
export interface ZelloCredentials { network: string; username: string; password: string; apiKey: string }
type FetchFn = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

/** Fehlercodes laut Dokumentation (Auszug) → verständlicher Text. */
export const ZELLO_ERRORS: Record<string, string> = {
  '301': 'Nicht angemeldet (Zugangsdaten fehlen).',
  '302': 'Angemeldet, aber das Konto hat keine Administratorrechte im Zello-Work-Netzwerk.',
  '303': 'Benutzername oder Passwort ist falsch (oder der API-Schlüssel passt nicht).',
  '404': 'Benutzer oder Kanal existiert im Zello-Work-Netzwerk nicht.',
  '405': 'Eintrag existiert bereits.',
  '605': 'Pflichtangaben fehlen.',
};

export class ZelloError extends Error {
  constructor(message: string, public readonly code: string | null = null) { super(message); }
}

const NETWORK = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Basis-URL laut Dokumentation: https://<netzwerk>.zellowork.com (Netzwerkname = Subdomain der Web-Konsole). */
export function zelloBaseUrl(network: string): string {
  const n = network.trim().toLowerCase();
  if (!NETWORK.test(n)) throw new ZelloError('Ungültiger Netzwerkname (nur Buchstaben, Ziffern und Bindestriche, wie in https://<netzwerk>.zellowork.com).');
  return `https://${n}.zellowork.com`;
}
export const zelloApiMac = (apiKey: string, username: string, token: string) => createHmac('sha256', apiKey).update(`${username}:${token}`).digest('hex');

const form = (fields: [string, string][]) => fields.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export class ZelloWorkClient {
  private sid: string | null = null;
  private readonly base: string;
  constructor(private readonly creds: ZelloCredentials, private readonly doFetch: FetchFn = fetch as never, private readonly timeoutMs = 10_000) {
    this.base = zelloBaseUrl(creds.network);
  }

  private async call(method: 'GET' | 'POST', path: string, fields?: [string, string][]): Promise<Record<string, unknown>> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    const url = `${this.base}${path}${this.sid ? `${path.includes('?') ? '&' : '?'}sid=${encodeURIComponent(this.sid)}` : ''}`;
    let res: { status: number; text(): Promise<string> };
    try {
      res = await this.doFetch(url, { method, signal: ctl.signal, ...(fields ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(fields) } : {}) });
    } catch {
      throw new ZelloError(ctl.signal.aborted ? 'Zeitüberschreitung – der Funkdienst hat nicht rechtzeitig geantwortet.' : 'Der Funkdienst ist nicht erreichbar (Netzwerkname prüfen).');
    } finally { clearTimeout(timer); }
    const text = await res.text().catch(() => '');
    let json: Record<string, unknown> | null = null;
    try { json = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { json = null; }
    if (!json) throw new ZelloError(`Unerwartete Antwort des Funkdienstes (HTTP ${res.status}).`);
    const code = json.code === undefined ? null : String(json.code);
    if (code !== '200') throw new ZelloError(ZELLO_ERRORS[code ?? ''] ?? `Der Funkdienst meldet einen Fehler (Code ${code ?? '?'}${typeof json.status === 'string' ? `: ${json.status.slice(0, 80)}` : ''}).`, code);
    return json;
  }

  /** Anmeldung in zwei Schritten (gettoken → auth). Nach einem Fehlversuch ist das Token laut Doku verbraucht. */
  async login(): Promise<void> {
    this.sid = null;
    const t = await this.call('GET', '/user/gettoken');
    const token = typeof t.token === 'string' ? t.token : '', sid = typeof t.sid === 'string' ? t.sid : '';
    if (!token || !sid) throw new ZelloError('Der Funkdienst hat kein Anmelde-Token geliefert.');
    this.sid = sid;
    await this.call('POST', '/user/auth', [['username', this.creds.username], ['password', this.creds.password], ['api_mac', zelloApiMac(this.creds.apiKey, this.creds.username, token)]]);
  }

  async logout(): Promise<void> {
    if (!this.sid) return;
    await this.call('GET', '/user/logout').catch(() => undefined);
    this.sid = null;
  }

  /** Prüft, ob der Kanal existiert (Code 404 → false). */
  async channelExists(channel: string): Promise<boolean> {
    try { await this.call('GET', `/channel/get/name/${encodeURIComponent(channel)}`); return true; }
    catch (e) { if (e instanceof ZelloError && e.code === '404') return false; throw e; }
  }

  async addToChannel(channel: string, logins: string[]): Promise<void> {
    if (logins.length) await this.call('POST', `/user/addto/${encodeURIComponent(channel)}`, logins.map((l) => ['login[]', l] as [string, string]));
  }

  async removeFromChannel(channel: string, logins: string[]): Promise<void> {
    if (logins.length) await this.call('POST', `/user/removefrom/${encodeURIComponent(channel)}`, logins.map((l) => ['login[]', l] as [string, string]));
  }
}
