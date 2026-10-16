"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZelloWorkClient = exports.zelloApiMac = exports.ZelloError = exports.ZELLO_ERRORS = void 0;
exports.zelloBaseUrl = zelloBaseUrl;
const node_crypto_1 = require("node:crypto");
/** Fehlercodes laut Dokumentation (Auszug) → verständlicher Text. */
exports.ZELLO_ERRORS = {
    '301': 'Nicht angemeldet (Zugangsdaten fehlen).',
    '302': 'Angemeldet, aber das Konto hat keine Administratorrechte im Zello-Work-Netzwerk.',
    '303': 'Benutzername oder Passwort ist falsch (oder der API-Schlüssel passt nicht).',
    '404': 'Benutzer oder Kanal existiert im Zello-Work-Netzwerk nicht.',
    '405': 'Eintrag existiert bereits.',
    '605': 'Pflichtangaben fehlen.',
};
class ZelloError extends Error {
    code;
    constructor(message, code = null) {
        super(message);
        this.code = code;
    }
}
exports.ZelloError = ZelloError;
const NETWORK = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** Basis-URL laut Dokumentation: https://<netzwerk>.zellowork.com (Netzwerkname = Subdomain der Web-Konsole). */
function zelloBaseUrl(network) {
    const n = network.trim().toLowerCase();
    if (!NETWORK.test(n))
        throw new ZelloError('Ungültiger Netzwerkname (nur Buchstaben, Ziffern und Bindestriche, wie in https://<netzwerk>.zellowork.com).');
    return `https://${n}.zellowork.com`;
}
const zelloApiMac = (apiKey, username, token) => (0, node_crypto_1.createHmac)('sha256', apiKey).update(`${username}:${token}`).digest('hex');
exports.zelloApiMac = zelloApiMac;
const form = (fields) => fields.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
class ZelloWorkClient {
    creds;
    doFetch;
    timeoutMs;
    sid = null;
    base;
    constructor(creds, doFetch = fetch, timeoutMs = 10_000) {
        this.creds = creds;
        this.doFetch = doFetch;
        this.timeoutMs = timeoutMs;
        this.base = zelloBaseUrl(creds.network);
    }
    async call(method, path, fields) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
        const url = `${this.base}${path}${this.sid ? `${path.includes('?') ? '&' : '?'}sid=${encodeURIComponent(this.sid)}` : ''}`;
        let res;
        try {
            res = await this.doFetch(url, { method, signal: ctl.signal, ...(fields ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(fields) } : {}) });
        }
        catch {
            throw new ZelloError(ctl.signal.aborted ? 'Zeitüberschreitung – der Funkdienst hat nicht rechtzeitig geantwortet.' : 'Der Funkdienst ist nicht erreichbar (Netzwerkname prüfen).');
        }
        finally {
            clearTimeout(timer);
        }
        const text = await res.text().catch(() => '');
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        }
        catch {
            json = null;
        }
        if (!json)
            throw new ZelloError(`Unerwartete Antwort des Funkdienstes (HTTP ${res.status}).`);
        const code = json.code === undefined ? null : String(json.code);
        if (code !== '200')
            throw new ZelloError(exports.ZELLO_ERRORS[code ?? ''] ?? `Der Funkdienst meldet einen Fehler (Code ${code ?? '?'}${typeof json.status === 'string' ? `: ${json.status.slice(0, 80)}` : ''}).`, code);
        return json;
    }
    /** Anmeldung in zwei Schritten (gettoken → auth). Nach einem Fehlversuch ist das Token laut Doku verbraucht. */
    async login() {
        this.sid = null;
        const t = await this.call('GET', '/user/gettoken');
        const token = typeof t.token === 'string' ? t.token : '', sid = typeof t.sid === 'string' ? t.sid : '';
        if (!token || !sid)
            throw new ZelloError('Der Funkdienst hat kein Anmelde-Token geliefert.');
        this.sid = sid;
        await this.call('POST', '/user/auth', [['username', this.creds.username], ['password', this.creds.password], ['api_mac', (0, exports.zelloApiMac)(this.creds.apiKey, this.creds.username, token)]]);
    }
    async logout() {
        if (!this.sid)
            return;
        await this.call('GET', '/user/logout').catch(() => undefined);
        this.sid = null;
    }
    /** Prüft, ob der Kanal existiert (Code 404 → false). */
    async channelExists(channel) {
        try {
            await this.call('GET', `/channel/get/name/${encodeURIComponent(channel)}`);
            return true;
        }
        catch (e) {
            if (e instanceof ZelloError && e.code === '404')
                return false;
            throw e;
        }
    }
    async addToChannel(channel, logins) {
        if (logins.length)
            await this.call('POST', `/user/addto/${encodeURIComponent(channel)}`, logins.map((l) => ['login[]', l]));
    }
    async removeFromChannel(channel, logins) {
        if (logins.length)
            await this.call('POST', `/user/removefrom/${encodeURIComponent(channel)}`, logins.map((l) => ['login[]', l]));
    }
}
exports.ZelloWorkClient = ZelloWorkClient;
//# sourceMappingURL=zello-work.client.js.map