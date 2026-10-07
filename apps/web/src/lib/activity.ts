import { useEffect } from 'react';
import { api } from './api';

/**
 * Echte Aktivität im Dashboard/MDT (Klicks, Tippen, Scrollen) höchstens einmal pro Minute melden – für die Inaktivitäts-Erinnerung
 * und die Anzeige „inaktiv seit“ in der Leitstelle. Nur ein offener Tab ohne Bedienung zählt nicht.
 */
export function useActivityHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let active = true; // Seite gerade geöffnet = aktiv
    const mark = () => { active = true; };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    const ping = () => {
      if (!active || document.visibilityState !== 'visible') return;
      active = false;
      void api('/team/me/active', { method: 'POST' }).catch(() => undefined);
    };
    const t = setInterval(ping, 60_000);
    ping();
    return () => { clearInterval(t); for (const e of events) window.removeEventListener(e, mark); };
  }, [enabled]);
}
