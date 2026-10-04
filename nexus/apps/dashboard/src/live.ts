import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { API_URL } from './api';

/**
 * Live-Aktualisierung: eine WebSocket-Verbindung je Server. Ereignisse enthalten nur „Bereich + Aktion + ID“;
 * betroffene Abfragen werden gezielt neu geladen (nicht die ganze Seite, nicht alles). Mehrere Ereignisse kurz
 * hintereinander werden gebündelt (250 ms). Bei Abbruch wird mit Backoff neu verbunden; währenddessen laufen die
 * normalen Abfragen (Aktualisieren beim Öffnen) unverändert weiter.
 */
export const LIVE_KEYS: Record<string, string[]> = {
  applications: ['submissions', 'submission', 'submission-history', 'applications'],
  personnel: ['personnel', 'personnel-record'],
  promotions: ['promotions', 'promo-candidates'],
  training: ['trainings', 'courses', 'quals'],
  shifts: ['shifts', 'shift-stats', 'shift-overview', 'shift-board', 'duty', 'sek-members', 'sek-stats'],
  operations: ['operations', 'duty', 'sek-stats'],
  wanted: ['wanted'],
  penalties: ['penalties', 'penalty-register', 'fleet'],
  danger: ['danger'],
  tickets: ['tickets', 'ticket'],
  absences: ['absences', 'absences-active'],
  sek: ['sek-config', 'sek-members', 'sek-squads', 'sek-stats'],
  radio: ['radio', 'radio-channels'],
  reports: ['reports'],
  roles: ['members', 'roles'],
};

/** Lädt nur die zum Bereich gehörenden **aktiven** Abfragen neu (Schlüssel-Präfix; inaktive werden nur als veraltet markiert). */
export function invalidateArea(qc: QueryClient, area: string): void {
  for (const key of LIVE_KEYS[area] ?? []) void qc.invalidateQueries({ queryKey: [key] });
  void qc.invalidateQueries({ queryKey: ['audit-log'] });
}

export type LiveState = 'connecting' | 'live' | 'offline';

export function useLive(guildId: string): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  useEffect(() => {
    if (!guildId || typeof WebSocket === 'undefined') return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = new Set<string>();
    let flush: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      setState('connecting');
      ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/api/v1/live?guildId=${encodeURIComponent(guildId)}`);
      ws.onmessage = (m) => {
        try {
          const d = JSON.parse(String(m.data)) as { type: string; area?: string };
          if (d.type === 'hello') {
            retry = 0;
            setState('live');
          } else if (d.type === 'event' && d.area) {
            pending.add(d.area);
            flush ??= setTimeout(() => {
              for (const a of pending) invalidateArea(qc, a);
              pending = new Set();
              flush = undefined;
            }, 250);
          }
        } catch {
          /* ignorieren */
        }
      };
      ws.onclose = () => {
        setState('offline');
        if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(flush);
      ws?.close();
    };
  }, [guildId, qc]);
  return state;
}
