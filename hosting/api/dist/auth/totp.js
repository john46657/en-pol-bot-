"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRecovery = exports.otpauthUrl = exports.totpNow = exports.newSecret = exports.STEP_SECONDS = void 0;
exports.base32Encode = base32Encode;
exports.base32Decode = base32Decode;
exports.hotp = hotp;
exports.verifyTotp = verifyTotp;
exports.newRecoveryCodes = newRecoveryCodes;
const node_crypto_1 = require("node:crypto");
/** TOTP nach RFC 6238 (SHA-1, 6 Stellen, 30 s) – kompatibel mit Google Authenticator, Authy, 1Password, Microsoft Authenticator. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
exports.STEP_SECONDS = 30;
function base32Encode(buf) {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0)
        out += B32[(value << (5 - bits)) & 31];
    return out;
}
function base32Decode(s) {
    const clean = s.toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0, value = 0;
    const out = [];
    for (const ch of clean) {
        const i = B32.indexOf(ch);
        if (i < 0)
            throw new Error('invalid base32');
        value = (value << 5) | i;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}
const newSecret = () => base32Encode((0, node_crypto_1.randomBytes)(20));
exports.newSecret = newSecret;
function hotp(secret, counter) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const h = (0, node_crypto_1.createHmac)('sha1', base32Decode(secret)).update(buf).digest();
    const o = h[h.length - 1] & 15;
    const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(code % 1_000_000).padStart(6, '0');
}
const totpNow = (secret, now = Date.now()) => hotp(secret, Math.floor(now / 1000 / exports.STEP_SECONDS));
exports.totpNow = totpNow;
/** Prüft einen Code mit ±1 Zeitfenster. Gibt den verwendeten Zeitschritt zurück (gegen Wiederverwendung) oder `null`. */
function verifyTotp(secret, code, now = Date.now(), lastStep) {
    const c = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(c))
        return null;
    const step = Math.floor(now / 1000 / exports.STEP_SECONDS);
    for (const s of [step - 1, step, step + 1]) {
        if (lastStep !== null && lastStep !== undefined && s <= lastStep)
            continue; // derselbe Code darf nicht zweimal gelten
        if ((0, node_crypto_1.timingSafeEqual)(Buffer.from(hotp(secret, s)), Buffer.from(c)))
            return s;
    }
    return null;
}
const otpauthUrl = (secret, account, issuer) => `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${exports.STEP_SECONDS}`;
exports.otpauthUrl = otpauthUrl;
/** Wiederherstellungscodes: 10 × „xxxxx-xxxxx“, gespeichert nur als SHA-256. */
function newRecoveryCodes(n = 10) {
    return Array.from({ length: n }, () => { const s = base32Encode((0, node_crypto_1.randomBytes)(7)).slice(0, 10).toLowerCase(); return `${s.slice(0, 5)}-${s.slice(5)}`; });
}
const normalizeRecovery = (code) => code.toLowerCase().replace(/[^a-z2-7]/g, '');
exports.normalizeRecovery = normalizeRecovery;
//# sourceMappingURL=totp.js.map