import type { UseQueryResult } from '@tanstack/react-query';
import { Component, type ReactNode } from 'react';
import { ApiError } from '../api';

export function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) return 'Dafür fehlt dir die Berechtigung.';
  if (e instanceof ApiError && e.status === 401)
    return 'Deine Sitzung ist abgelaufen – bitte neu anmelden.';
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Einheitlicher Lade-/Fehlerzustand für Abfragen; rendert `children` erst, wenn Daten da sind. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading)
    return (
      <div className="skeleton" aria-busy="true">
        Lade …
      </div>
    );
  if (query.error)
    return (
      <div className="alert error" role="alert">
        <span>{errorText(query.error)}</span>
        <button className="btn" onClick={() => void query.refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

/** Fängt Render-Fehler ab, damit nicht die ganze App weiß wird. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="center">
        <h1>Etwas ist schiefgelaufen</h1>
        <p className="error">{this.state.error.message}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Seite neu laden
        </button>
      </main>
    );
  }
}
