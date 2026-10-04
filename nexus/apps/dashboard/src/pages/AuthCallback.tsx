import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/** Die Session liegt als httpOnly-Cookie; hier wird nur die Benutzer-Abfrage aufgefrischt und weitergeleitet. */
export function AuthCallback() {
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    window.history.replaceState(null, '', '/auth/callback');
    void qc.invalidateQueries({ queryKey: ['me'] });
    nav('/servers', { replace: true });
  }, [nav, qc]);
  return (
    <main className="center">
      <p className="muted">Anmeldung wird abgeschlossen …</p>
    </main>
  );
}
