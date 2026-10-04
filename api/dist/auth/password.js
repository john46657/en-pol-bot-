"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUMMY_HASH = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const scrypt = (0, node_util_1.promisify)(node_crypto_1.scrypt);
const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;
/** Format: scrypt$N$r$p$saltB64$hashB64 — niemals Klartext speichern. */
async function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16);
    const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 });
    return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(password, stored) {
    const [alg, n, rr, pp, salt, hash] = stored.split('$');
    if (alg !== 'scrypt' || !n || !rr || !pp || !salt || !hash)
        return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +rr, p: +pp, maxmem: 128 * +n * +rr * 2 });
    return key.length === expected.length && (0, node_crypto_1.timingSafeEqual)(key, expected);
}
/** Konstanter Dummy-Hash, damit Login für unbekannte Benutzer gleich lange dauert. */
exports.DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
//# sourceMappingURL=password.js.map