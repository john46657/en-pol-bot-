import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, userAvatar, type Me } from '../api';
import { useTheme } from '../theme';

/** Abmelden: Sitzung beenden, Zwischenspeicher leeren, zur Anmeldeseite. */
export function useLogout(): () => Promise<void> {
  const qc = useQueryClient();
  return async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.assign('/login');
  };
}

/** Theme-Umschalter, Benutzername und Abmelden – in Kopfzeile und Serverauswahl. */
export function UserMenu() {
  const { theme, toggle } = useTheme();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
  const logout = useLogout();
  const avatar = me.data && userAvatar(me.data);
  const name = me.data?.globalName ?? me.data?.username ?? '';
  return (
    <span className="who">
      <button
        className="btn icon-btn"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
        title="Design wechseln"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <span className="me">
        {avatar ? (
          <img src={avatar} alt="" width={28} height={28} />
        ) : (
          <span className="me-fallback" aria-hidden>
            {name.slice(0, 1).toUpperCase() || '?'}
          </span>
        )}
        <span className="me-name hide-sm">{name}</span>
        <button className="btn me-logout" onClick={() => void logout()}>
          Abmelden
        </button>
      </span>
    </span>
  );
}
