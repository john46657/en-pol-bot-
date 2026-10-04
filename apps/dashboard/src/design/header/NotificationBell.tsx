import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api';

interface Item {
  id: string;
  type: string;
  icon: string;
  title: string;
  text: string;
  at: string;
  path: string;
}
const key = (guildId: string) => `nexus-notif-seen:${guildId}`;
const readSeen = (guildId: string): number => {
  try {
    return Number(localStorage.getItem(key(guildId))) || 0;
  } catch {
    return 0; // z. B. Privatmodus: dann gilt alles als ungelesen, die Glocke funktioniert trotzdem
  }
};
const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Glocke im Header: aktuelle Ereignisse (vom Server nach Recht und gewählten Arten). „Gelesen“ merkt sich der Browser je
 * Server; abgefragt wird nur bei sichtbarem Tab (alle 60 s).
 */
export function NotificationBell({ guildId }: { guildId: string }) {
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(guildId));
  const q = useQuery({
    queryKey: ['notifications', guildId],
    queryFn: () => api<{ items: Item[] }>(`/guilds/${guildId}/design/notifications`),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: false,
  });
  const items = q.data?.items ?? [];
  const unread = items.filter((i) => new Date(i.at).getTime() > seen).length;
  const markRead = () => {
    const latest = items.reduce((m, i) => Math.max(m, new Date(i.at).getTime()), seen);
    setSeen(latest);
    try {
      localStorage.setItem(key(guildId), String(latest));
    } catch {
      /* ohne Speicherung weiter nutzbar */
    }
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) =>
      box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="nb" ref={box}>
      <button
        type="button"
        className="btn icon-btn nb-btn"
        aria-label={unread ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="nb-badge" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="nb-panel" role="region" aria-label="Benachrichtigungen">
          <div className="nb-head">
            <strong>Benachrichtigungen</strong>
            <button type="button" className="btn" disabled={unread === 0} onClick={markRead}>
              Alle gelesen
            </button>
          </div>
          {q.error && <p className="error nb-note">Konnten nicht geladen werden.</p>}
          {!q.error && items.length === 0 && (
            <p className="muted nb-note">Keine neuen Ereignisse in den letzten 14 Tagen.</p>
          )}
          <ul className="plain nb-list">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`nb-item ${new Date(i.at).getTime() > seen ? 'new' : ''}`}
                  onClick={() => {
                    markRead();
                    setOpen(false);
                    nav(`/guilds/${guildId}${i.path}`);
                  }}
                >
                  <span aria-hidden>{i.icon}</span>
                  <span className="grow">
                    <b>{i.title}</b>
                    {i.text && (
                      <>
                        <br />
                        {i.text}
                      </>
                    )}
                    <br />
                    <small className="muted">{when(i.at)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
