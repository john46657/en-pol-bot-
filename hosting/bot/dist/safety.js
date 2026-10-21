"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTransient = void 0;
exports.withRetry = withRetry;
exports.registerSecrets = registerSecrets;
exports.redact = redact;
exports.scrubSecrets = scrubSecrets;
exports.containsSecret = containsSecret;
exports.installLogRedaction = installLogRedaction;
const api_1 = require("./api");
/** Vorübergehende Fehler: API nicht erreichbar, Rate-Limit, Gateway/Proxy kurz weg. */
const isTransient = (e) => e instanceof api_1.BotApiError && (e.status === 0 || e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504);
exports.isTransient = isTransient;
/**
 * Wiederholt einen Aufruf bei vorübergehenden Fehlern (exponentiell: 400 ms, 800 ms …).
 * Nur für idempotente Aufrufe (GET, PUT eines festen Werts) verwenden – nie für POST, die etwas anlegen.
 */
async function withRetry(fn, o = {}) {
    const attempts = Math.max(1, o.attempts ?? 3);
    const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    for (let n = 1;; n++) {
        try {
            return await fn();
        }
        catch (e) {
            if (n >= attempts || !(0, exports.isTransient)(e))
                throw e;
            await sleep((o.baseMs ?? 400) * 2 ** (n - 1));
        }
    }
}
/** Discord-Bot-Token (drei Base64-Teile mit Punkten) und typische Schlüssel-Zuweisungen. */
const DISCORD_TOKEN = /[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,}/g;
const AUTH_HEADER = /\b(Bot|Bearer)\s+(?=[\w.-]*\d)[\w.-]{24,}/g;
const ASSIGNMENT = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|APIKEY)[A-Z0-9_]*)\s*[=:]\s*\S+/gi;
const known = new Set();
/** Werte, die nie in Nachrichten, Logs oder Sicherungen auftauchen dürfen (z. B. DISCORD_TOKEN, BOT_API_TOKEN). */
function registerSecrets(values) { for (const v of values)
    if (v && v.length >= 8)
        known.add(v); }
/** Geheimnisse in einem Text durch „[geschwärzt]“ ersetzen. */
function redact(text) {
    let out = text;
    for (const v of known)
        out = out.split(v).join('[geschwärzt]');
    return out.replace(DISCORD_TOKEN, '[geschwärzt]').replace(AUTH_HEADER, '$1 [geschwärzt]').replace(ASSIGNMENT, '$1=[geschwärzt]');
}
/** Feldnamen, deren Werte nicht in eine Sicherung gehören. */
const SECRET_KEY = /token|secret|password|passwort|apikey|api_key|authorization|webhook|credential/i;
/** Kopie ohne Geheimnisse: geheime Felder fallen weg, Texte werden geschwärzt. */
function scrubSecrets(value) {
    const walk = (v) => {
        if (typeof v === 'string')
            return redact(v);
        if (Array.isArray(v))
            return v.map(walk);
        if (v && typeof v === 'object')
            return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, walk(x)]));
        return v;
    };
    return walk(value);
}
/** Enthält ein (serialisierter) Wert noch etwas, das wie ein Geheimnis aussieht? */
function containsSecret(value) {
    const json = JSON.stringify(value ?? null);
    return redact(json) !== json || /"[^"]*(token|secret|password|apikey|api_key|authorization|credential)[^"]*"\s*:/i.test(json);
}
/** console.log/warn/error schwärzen – auch Fehlermeldungen von Bibliotheken enthalten sonst evtl. Tokens. */
function installLogRedaction(c = console) {
    for (const k of ['log', 'warn', 'error']) {
        const orig = c[k].bind(c);
        c[k] = (...args) => orig(...args.map((a) => (typeof a === 'string' ? redact(a) : a instanceof Error ? redact(a.stack ?? a.message) : a)));
    }
}
//# sourceMappingURL=safety.js.map