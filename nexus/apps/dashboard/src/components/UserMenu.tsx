import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, userAvatar, type Me } from '../api';
import { useTheme } from '../theme';

/** Theme-Umschalter, Benutzername und Abmelden – in Kopfzeile und Serverauswahl. */
export function UserMenu() {
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.assign('/login');
  };
  const avatar = me.data && userAvatar(me.data);
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
      {avatar && <img src={avatar} alt="" width={24} height={24} />}
      <span className="hide-sm">{me.data?.globalName ?? me.data?.username ?? ''}</span>
      <button className="btn" onClick={() => void logout()}>
        Abmelden
      </button>
    </span>
  );
}
