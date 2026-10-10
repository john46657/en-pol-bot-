import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

const RELOAD_KEY = 'enrp.chunkReloadAt';

/** Nach einem Update fehlen die alten Seiten-Dateien (neue Hash-Namen) – ein offener Tab kann sie dann nicht mehr nachladen. */
export const isChunkLoadError = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(String((e as Error)?.message ?? e));

/** Lädt die Seite einmal neu (höchstens alle 30 s, damit keine Neuladeschleife entsteht). Gibt false zurück, wenn gerade erst neu geladen wurde. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* sessionStorage gesperrt – trotzdem einmal neu laden */ }
  window.location.reload();
  return true;
}

/** Fängt Fehler beim Rendern einer Seite ab, damit nicht die komplette Oberfläche verschwindet (leerer Bildschirm). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: unknown }> {
  override state = { error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) { return { error }; }

  /** Nach einem Fehler wieder normal anzeigen, sobald man woanders hin navigiert. */
  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error !== undefined && prev.resetKey !== this.props.resetKey) this.setState({ error: undefined });
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Seite abgestürzt:', error, info.componentStack);
    if (isChunkLoadError(error)) reloadOnceForNewVersion();
  }

  override render() {
    const { error } = this.state;
    if (error === undefined) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div role="alert" className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold">{chunk ? 'Neue Version verfügbar' : 'Diese Seite konnte nicht angezeigt werden'}</h1>
        <p className="mt-1 text-sm text-muted">{chunk ? 'Die Oberfläche wurde aktualisiert. Bitte lade die Seite neu.' : 'Beim Anzeigen ist ein Fehler aufgetreten. Lade die Seite neu – wenn es wieder passiert, schicke die Meldung unten an die Administration.'}</p>
        {!chunk && <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-3 text-left text-xs text-muted">{String((error as Error)?.message ?? error)}</pre>}
        <Button className="mt-4" onClick={() => window.location.reload()}>Neu laden</Button>
      </div>
    );
  }
}
