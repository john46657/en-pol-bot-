"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
const node_crypto_1 = require("node:crypto");
/**
 * Verschlüsselung der ER:LC-Server-Keys (AES-256-GCM). Schlüssel: `ERLC_SECRET_KEY` (empfohlen, mind. 32 Zeichen),
 * sonst abgeleitet aus `SESSION_SECRET`. Wird das Geheimnis geändert, lassen sich gespeicherte Keys nicht mehr lesen –
 * die Verbindung meldet dann einen Fehler und der Key muss im Dashboard neu eingegeben werden.
 */
let cached;
function key() {
    const secret = process.env.ERLC_SECRET_KEY || process.env.SESSION_SECRET || 'dev-only-insecure-session-secret';
    if (cached?.secret !== secret)
        cached = { secret, key: (0, node_crypto_1.scryptSync)(secret, 'enrp-erlc-server-key-v1', 32) };
    return cached.key;
}
function encryptSecret(plain) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const c = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key(), iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
/** `null`, wenn der Wert nicht (mehr) entschlüsselt werden kann. Wirft nie – damit der Key nie in Fehlermeldungen landet. */
function decryptSecret(stored) {
    try {
        const [v, iv, tag, ct] = stored.split(':');
        if (v !== 'v1' || !iv || !tag || !ct)
            return null;
        const d = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
        d.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=erlc-crypto.js.map