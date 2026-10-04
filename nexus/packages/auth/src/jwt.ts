import { SignJWT, jwtVerify } from 'jose';
import type { NexusSessionPayload } from './types.js';

/**
 * NEXUS Session-JWTs (§114).
 *
 * Signiert mit HS256 + AUTH_SECRET, Issuer aus JWT_ISSUER. Kurz gehalten:
 * nur Sub (Discord-User-ID) + Anzeige-Infos – keine Permissions, da diese
 * serverseitig pro Request authoritativ geprüft werden.
 */

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience?: string;
  /** Session-Gültigkeit in Sekunden (Standard 7 Tage). */
  ttlSeconds?: number;
}

export interface VerifyOptions {
  secret: string;
  issuer: string;
  audience?: string;
}

function encode(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: NexusSessionPayload, opts: JwtOptions): Promise<string> {
  const ttl = opts.ttlSeconds ?? 7 * 24 * 60 * 60;
  // SignJWT erwartet jose-intern JWTPayload (Index-Signatur); der Cast ist
  // sicher, da NexusSessionPayload JSON-kompatibel ist.
  const builder = new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(opts.issuer)
    .setExpirationTime(`${ttl}s`);

  if (opts.audience) builder.setAudience(opts.audience);

  return builder.sign(encode(opts.secret));
}

/**
 * Verifiziert einen Session-JWT.
 *
 * Wirft bei ungültiger Signatur, falschem Issuer oder Ablauf – Aufrufer
 * müssen das auf 401 mappen.
 */
export async function verifySession(
  token: string,
  opts: VerifyOptions,
): Promise<NexusSessionPayload> {
  const { payload } = await jwtVerify(token, encode(opts.secret), {
    issuer: opts.issuer,
    ...(opts.audience ? { audience: opts.audience } : {}),
  });
  return payload as unknown as NexusSessionPayload;
}
