import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Nach einem Update fehlen die alten Seiten-Dateien im offenen Tab – dann einmal neu laden statt Fehler zeigen. */
const isStaleChunk = (e: unknown) => /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(e instanceof Error ? e.message : String(e));
const RELOAD_KEY = 'enrp.chunk-reload';

/**
 * Fängt Fehler beim Anzeigen einer Seite ab: Statt einer weißen Seite (ganzes Dashboard weg) erscheint nur an dieser
 * Stelle eine Meldung mit „Erneut versuchen“. `resetKey` (z. B. der Pfad) setzt den Fehler beim Seitenwechsel zurück.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Seite abgestürzt:', error, info.componentStack);
    if (isStaleChunk(error)) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* privater Modus */ }
      // höchstens einmal pro Minute automatisch neu laden (sonst Endlosschleife, wenn der Server wirklich weg ist)
      if (Date.now() - last > 60_000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* privater Modus */ }
        window.location.reload();
      }
    }
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunk(error);
    return (
      <div role="alert" className="m-4 grid max-w-2xl gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-danger" aria-hidden />{stale ? 'Das Dashboard wurde aktualisiert.' : 'Diese Seite konnte nicht angezeigt werden.'}</p>
        <p className="text-sm">{stale ? 'Bitte lade die Seite neu, um die neue Version zu laden.' : 'Der Rest des Dashboards funktioniert weiter. Versuch es erneut – bleibt der Fehler, gib diese Meldung an einen Admin weiter.'}</p>
        {!stale && <p className="break-all font-mono text-xs text-muted">{error.message}</p>}
        <div className="flex flex-wrap gap-2">
          {!stale && <button type="button" className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm hover:bg-panel-2" onClick={() => this.setState({ error: null })}>Erneut versuchen</button>}
          <button type="button" className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm hover:bg-panel-2" onClick={() => window.location.reload()}>Seite neu laden</button>
        </div>
      </div>
    );
  }
}
