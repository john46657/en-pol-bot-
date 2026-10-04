import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../api';
import { QueryState } from '../components/QueryState';

interface Status {
  jobs: { name: string; label: string; everyMs: number; lastRun: { at: string; ok: boolean; error: string | null; summary: unknown } | null; failedRecently: number }[];
  notifications: Record<string, number>;
  failedNotifications: { id: string; kind: string; targetKind: string; targetId: string; lastError: string | null; attempts: number; createdAt: string }[];
}
const every = (ms: number) => (ms >= 3_600_000 ? `${ms / 3_600_000} Std` : `${ms / 60_000} Min`);

/** Automatisierung: Zustand der Hintergrund-Jobs und der Benachrichtigungen. */
export function Automation() {
  const { guildId = '' } = useParams();
  const q = useQuery({ queryKey: ['automation', guildId], queryFn: () => api<Status>(`/guilds/${guildId}/automation`), refetchInterval: 30_000 });
  return (
    <>
      <h1>Automatisierung</h1>
      <p className="muted">Hintergrund-Jobs laufen im Worker. Ein ❌ bedeutet: der letzte Lauf ist fehlgeschlagen (z. B. fehlender Discord-Zugang) – die anderen Jobs laufen trotzdem weiter.</p>
      <QueryState query={q}>
        {(d) => (
          <>
            <ul className="list">
              {d.jobs.map((j) => (
                <li key={j.name} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{j.lastRun ? (j.lastRun.ok ? '✅' : '❌') : '⏳'} {j.label}</strong> <small className="muted">alle {every(j.everyMs)}</small>
                    <br /><small className="muted">{j.lastRun ? `Letzter Lauf ${new Date(j.lastRun.at).toLocaleString('de-DE')}${j.lastRun.error ? ` – ${j.lastRun.error}` : ''}` : 'Noch kein Lauf (läuft der Worker?)'}{j.failedRecently > 1 ? ` · ${j.failedRecently} der letzten 5 Läufe fehlgeschlagen` : ''}</small>
                  </span>
                </li>
              ))}
            </ul>
            <h2>Benachrichtigungen</h2>
            <p>Gesendet: <strong>{d.notifications['SENT'] ?? 0}</strong> · Wartend/Wiederholung: <strong>{d.notifications['PENDING'] ?? 0}</strong> · Fehlgeschlagen: <strong>{d.notifications['FAILED'] ?? 0}</strong></p>
            {d.failedNotifications.length > 0 && (
              <ul className="list">
                {d.failedNotifications.map((n) => <li key={n.id} className="row"><span className="grow"><strong>{n.kind}</strong> an {n.targetKind === 'USER' ? 'Benutzer' : 'Kanal'} <code>{n.targetId}</code> · {n.attempts} Versuche<br /><small className="muted">{n.lastError}</small></span></li>)}
              </ul>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
