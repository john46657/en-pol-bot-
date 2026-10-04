import { randomBytes, timingSafeEqual } from 'node:crypto';

/** OAuth2-`state` gegen Login-CSRF: zufälliger Wert, im httpOnly-Cookie hinterlegt und im Callback verglichen. */
export const OAUTH_STATE_COOKIE = 'nexus_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const generateState = (): string => randomBytes(32).toString('hex');

export function verifyState(cookieValue: unknown, queryValue: unknown): boolean {
  if (typeof cookieValue !== 'string' || typeof queryValue !== 'string') return false;
  if (cookieValue.length === 0 || cookieValue.length !== queryValue.length) return false;
  return timingSafeEqual(Buffer.from(cookieValue), Buffer.from(queryValue));
}
