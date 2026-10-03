import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/**
 * Die API hängt den Token zusätzlich an die URL (für Nicht-Browser-Clients). Der Browser nutzt das
 * httpOnly-Cookie – der Token wird deshalb sofort aus der Adresszeile/History entfernt und nie gespeichert.
 */
export function AuthCallback() {
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    window.history.replaceState(null, '', '/auth/callback');
    void qc.invalidateQueries({ queryKey: ['me'] });
    nav('/servers', { replace: true });
  }, [nav, qc]);
  return <main className="center"><p className="muted">Anmeldung wird abgeschlossen …</p></main>;
}
