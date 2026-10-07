import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** TOTP nach RFC 6238 (SHA-1, 6 Stellen, 30 s) – kompatibel mit Google Authenticator, Authy, 1Password, Microsoft Authenticator. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1]! & 15;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

export const totpNow = (secret: string, now = Date.now()) => hotp(secret, Math.floor(now / 1000 / STEP_SECONDS));

/** Prüft einen Code mit ±1 Zeitfenster. Gibt den verwendeten Zeitschritt zurück (gegen Wiederverwendung) oder `null`. */
export function verifyTotp(secret: string, code: string, now = Date.now(), lastStep?: number | null): number | null {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && lastStep !== undefined && s <= lastStep) continue; // derselbe Code darf nicht zweimal gelten
    if (timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

/** Wiederherstellungscodes: 10 × „xxxxx-xxxxx“, gespeichert nur als SHA-256. */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => { const s = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase(); return `${s.slice(0, 5)}-${s.slice(5)}`; });
}
export const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z2-7]/g, '');
