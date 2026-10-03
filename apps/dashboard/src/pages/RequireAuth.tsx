import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { api, ApiError, userAvatar, type Me } from '../api';

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
        <p className="error">{me.error?.message ?? 'Unbekannter Fehler'}</p>
        <button className="btn" onClick={() => void me.refetch()}>
          Erneut versuchen
        </button>
      </main>
    );
  const avatar = userAvatar(me.data);
  return (
    <>
      <header className="bar">
        <strong>NEXUS</strong>
        <span className="who">
          {avatar && <img src={avatar} alt="" width={24} height={24} />}
          {me.data.globalName ?? me.data.username ?? me.data.id}
        </span>
      </header>
      <Outlet />
    </>
  );
}
