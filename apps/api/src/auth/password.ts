import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;

/** Format: scrypt$N$r$p$saltB64$hashB64 — niemals Klartext speichern. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !rr || !pp || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +rr, p: +pp, maxmem: 128 * +n * +rr * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Konstanter Dummy-Hash, damit Login für unbekannte Benutzer gleich lange dauert. */
export const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
