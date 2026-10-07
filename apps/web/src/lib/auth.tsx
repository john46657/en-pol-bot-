import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthenticatedHandler } from './api';
import { initAutosave, resetAutosave } from './autosave';
import { useRealtimeEvent } from './realtime';
import { getServer, setServer, subscribeServer } from './server';

export interface Profile { id: string; username: string; displayName: string; robloxUserId: string | null; robloxUsername: string | null; roles: string[]; permissions: string[]; lastLogin: string | null; twoFactor?: boolean; guildId?: string | null; servers?: string[] }
interface AuthCtx { user: Profile | null; loading: boolean; can: (p: string) => boolean; login: (u: string, p: string) => Promise<{ ticket: string } | void>; loginTwoFactor: (ticket: string, code: string) => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx | null>(null);

/**
 * Frontend-Checks dienen nur der UI. Die verbindliche Prüfung erfolgt immer im Backend.
 * Rechte gelten je Discord-Server: beim Serverwechsel wird alles neu geladen. Geänderte Rechte (Rollen-Editor,
 * Discord-Rollenabgleich) kommen per Echtzeit-Ereignis und spätestens nach 60 Sekunden an.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const server = useSyncExternalStore(subscribeServer, getServer, getServer);
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<Profile>('/auth/me'), retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  const user = q.data ?? null;
  useEffect(() => {
    setUnauthenticatedHandler((reason) => {
      qc.setQueryData(['me'], null);
      if (reason === 'NO_ACCESS' && !location.pathname.startsWith('/login')) location.assign('/login?discord=no_access');
    });
  }, [qc]);
  // Serverwechsel: alle Daten des anderen Servers verwerfen und neu laden
  useEffect(() => { void qc.invalidateQueries(); }, [server, qc]);
  useEffect(() => { if (user) initAutosave(user.id); }, [user?.id]);
  // Nur Rollen auf einem Server (keine serverübergreifenden): direkt diesen Server wählen
  useEffect(() => {
    if (user && !server && !user.permissions.includes('dashboard.view') && user.servers?.length) setServer(user.servers[0]!);
  }, [user, server]);
  useRealtimeEvent('permissions.changed', () => void qc.invalidateQueries({ queryKey: ['me'] }), !!user);
  useRealtimeEvent('session.revoked', () => location.assign('/login?discord=no_access'), !!user);
  const login = useCallback(async (username: string, password: string) => {
    const p = await api<Profile | { twoFactorRequired: true; ticket: string }>('/auth/login', { body: { username, password } });
    if ('twoFactorRequired' in p) return { ticket: p.ticket }; // zweiter Schritt: Code aus der Authenticator-App
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], p);
  }, [qc]);
  const loginTwoFactor = useCallback(async (ticket: string, code: string) => {
    const p = await api<Profile>('/auth/login/2fa', { body: { ticket, code } });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], p);
  }, [qc]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); resetAutosave(); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); qc.setQueryData(['me'], null); }, [qc]);
  const value = useMemo<AuthCtx>(() => {
    const set = new Set(user?.permissions ?? []);
    return { user, loading: q.isLoading, can: (p) => set.has(p), login, loginTwoFactor, logout };
  }, [user, q.isLoading, login, loginTwoFactor, logout]);
  if (q.error && !(q.error instanceof ApiError && q.error.status === 401)) return <div role="alert" className="p-8 text-danger">Server nicht erreichbar. Bitte versuch es später erneut.</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

/** Wie useAuth, aber ohne Fehler außerhalb des Providers (z. B. eigenständig getestete Bausteine). */
export function useOptionalAuth() { return useContext(Ctx); }
