import { createHmac, timingSafeEqual } from 'node:crypto';

/** Länge der Signatur (HMAC-SHA256, base64url). */
const SIG = 43;

/**
 * Signierte Werte: persönliche Bewerbungslinks (Art „Browser“) und Login-Sitzungen des Dashboards.
 * Format: base64url(JSON) + Signatur – ohne Trennzeichen, damit der Link als Pfad funktioniert.
 */
export function createSigner(secret, purpose) {
  const sign = (body) => createHmac('sha256', secret).update(`${purpose}:${body}`).digest('base64url');
  return {
    encode(payload) { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}${sign(body)}`; },
    /** Inhalt oder null (ungültig/abgelaufen; `e` = Ablaufzeit in ms). */
    decode(token, now = Date.now()) {
      if (typeof token !== 'string' || token.length <= SIG || token.length > 4000 || !/^[\w-]+$/.test(token)) return null;
      const body = token.slice(0, -SIG), sig = token.slice(-SIG), expected = sign(body);
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
      try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        return p && typeof p === 'object' && (!p.e || p.e > now) ? p : null;
      } catch { return null; }
    },
  };
}
