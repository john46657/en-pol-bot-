import { getServer } from './server';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly requestId?: string, public readonly details?: unknown) {
    super(message);
  }
}

/** Server-Kontext: Rechte, Rollen, Teamliste und Einstellungen gelten je Discord-Server (Server laufen getrennt). */
export const apiHeaders = (guildId: string | null = getServer()): Record<string, string> => (guildId ? { 'x-guild-id': guildId } : {});

let onUnauthenticated: ((reason?: string) => void) | undefined;
export const setUnauthenticatedHandler = (fn: (reason?: string) => void) => { onUnauthenticated = fn; };

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; formData?: FormData; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
  const qs = init.query ? '?' + new URLSearchParams(Object.entries(init.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const res = await fetch(`/api/v1${path}${qs}`, {
    method: init.method ?? (init.body || init.formData ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { ...apiHeaders(), ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.formData ?? (init.body ? JSON.stringify(init.body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const e = (data ?? {}) as { code?: string; message?: string; requestId?: string; details?: { reason?: string } };
    if (res.status === 401 && !path.startsWith('/auth/login') && (path !== '/auth/me' || e.details?.reason === 'NO_ACCESS')) onUnauthenticated?.(e.details?.reason);
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Anfrage fehlgeschlagen (${res.status})`, e.requestId, e.details);
  }
  return data as T;
}
const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return undefined; } };

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
