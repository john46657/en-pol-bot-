import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { api, apiHeaders, ApiError } from './api';
import { onRealtime } from './realtime';
import { Button } from '../components/ui';

export type LockType = 'person' | 'incident' | 'report' | 'personnel';
export interface LockState { ok?: boolean; locked: boolean; mine: boolean; holder?: { id: string; displayName: string }; since?: string; expiresAt?: string }

const HEARTBEAT_MS = 30_000;

/**
 * Datensatz-Sperre beim Bearbeiten: sperrt beim Öffnen, hält die Sperre mit Lebenszeichen und gibt sie beim Schließen frei.
 * `blocked` = jemand anderes bearbeitet gerade (Speichern lehnt der Server dann ab).
 */
export function useEditLock(type: LockType, id: string | undefined, active: boolean) {
  const [state, setState] = useState<LockState>();
  const [error, setError] = useState<string>();
  const live = useRef(false);
  const acquire = useCallback(async (force = false) => {
    if (!id) return;
    try { const r = await api<LockState>(`/locks/${type}/${id}`, { body: { force } }); if (live.current) { setState(r); setError(undefined); } }
    catch (e) { if (live.current) setError(e instanceof ApiError ? e.message : 'Sperre nicht möglich'); }
  }, [type, id]);
  useEffect(() => {
    if (!active || !id) { setState(undefined); return; }
    live.current = true;
    void acquire();
    const t = setInterval(() => void acquire(), HEARTBEAT_MS);
    const off = onRealtime('lock.taken', (p) => { const x = p as { entityType?: string; entityId?: string }; if (x.entityType === type && x.entityId === id) void acquire(); });
    const release = () => { void fetch(`/api/v1/locks/${type}/${id}`, { method: 'DELETE', credentials: 'same-origin', keepalive: true, headers: apiHeaders() }).catch(() => undefined); };
    window.addEventListener('pagehide', release);
    return () => { live.current = false; clearInterval(t); off(); window.removeEventListener('pagehide', release); release(); };
  }, [active, id, type, acquire]);
  const blocked = !!state && state.locked && !state.mine;
  return { state, blocked, error, takeOver: () => acquire(true) };
}

/** Hinweis im Formular: wer gerade bearbeitet, mit „Übernehmen“. */
export function LockBanner({ lock }: { lock: ReturnType<typeof useEditLock> }) {
  const [confirm, setConfirm] = useState(false);
  if (!lock.blocked) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded border border-warning/40 bg-warning/10 p-2 text-sm">
      <Lock size={14} aria-hidden className="text-warning" />
      <span className="flex-1">Wird gerade von <b>{lock.state?.holder?.displayName}</b> bearbeitet – Speichern ist erst möglich, wenn die Person fertig ist.</span>
      {confirm
        ? <><span className="text-xs">Deren ungespeicherte Änderungen können verloren gehen.</span><Button size="sm" variant="danger" type="button" onClick={() => { setConfirm(false); void lock.takeOver(); }}>Trotzdem übernehmen</Button><Button size="sm" variant="ghost" type="button" onClick={() => setConfirm(false)}>Abbrechen</Button></>
        : <Button size="sm" variant="secondary" type="button" onClick={() => setConfirm(true)}>Bearbeitung übernehmen</Button>}
    </div>
  );
}
