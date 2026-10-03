import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { api, ApiError, type Me } from '../api';
import { errorText } from '../components/QueryState';

/** Schützt alle Unterseiten: ohne Session → Login. */
export function RequireAuth() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
  if (me.isLoading)
    return (
      <main className="center">
        <p className="muted">Lade …</p>
      </main>
    );
  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.error || !me.data)
    return (
      <main className="center">
        <p className="error">{errorText(me.error)}</p>
        <button className="btn" onClick={() => void me.refetch()}>
          Erneut versuchen
        </button>
      </main>
    );
  return <Outlet />;
}
