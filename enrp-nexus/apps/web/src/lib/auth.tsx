import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthenticatedHandler } from './api';

export interface Profile { id: string; username: string; displayName: string; robloxUserId: string | null; robloxUsername: string | null; roles: string[]; permissions: string[]; lastLogin: string | null }
interface AuthCtx { user: Profile | null; loading: boolean; can: (p: string) => boolean; login: (u: string, p: string) => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx | null>(null);

/** Frontend-Checks dienen nur der UI. Die verbindliche Prüfung erfolgt immer im Backend. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<Profile>('/auth/me'), retry: false, staleTime: 60_000 });
  const user = q.data ?? null;
  useEffect(() => { setUnauthenticatedHandler(() => qc.setQueryData(['me'], null)); }, [qc]);
  const login = useCallback(async (username: string, password: string) => {
    const p = await api<Profile>('/auth/login', { body: { username, password } });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], p);
  }, [qc]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); qc.setQueryData(['me'], null); }, [qc]);
  const value = useMemo<AuthCtx>(() => {
    const set = new Set(user?.permissions ?? []);
    return { user, loading: q.isLoading, can: (p) => set.has(p), login, logout };
  }, [user, q.isLoading, login, logout]);
  if (q.error && !(q.error instanceof ApiError && q.error.status === 401)) return <div role="alert" className="p-8 text-danger">Server not reachable. Retry later.</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
