import { flush, useSaveState } from '../lib/autosave';
import { Button } from './ui';

/** Kleiner Speicherstatus oben im Dashboard – aktualisiert sich selbst. */
export function SaveStatus() {
  const s = useSaveState();
  const view = {
    saved: { icon: '✅', text: 'Alle Änderungen gespeichert', cls: 'text-muted' },
    saving: { icon: '🔄', text: 'Änderungen werden gespeichert …', cls: 'text-muted' },
    pending: { icon: '⚠️', text: 'Ungespeicherte Änderungen', cls: 'text-warning' },
    error: { icon: '❌', text: 'Speichern fehlgeschlagen', cls: 'text-danger' },
  }[s.status];
  return (
    <div className="flex items-center gap-1.5 text-xs" role="status" aria-live="polite" title={s.error ?? (s.lastSavedAt ? `Zuletzt gespeichert: ${new Date(s.lastSavedAt).toLocaleTimeString()}` : undefined)}>
      <span aria-hidden className={s.status === 'saving' ? 'inline-block animate-spin' : undefined}>{view.icon}</span>
      <span className={`hidden whitespace-nowrap md:inline ${view.cls}`}>{view.text}</span>
      {s.status === 'error' && <span className="hidden max-w-xs truncate text-danger xl:inline">{s.error}</span>}
      {(s.status === 'pending' || s.status === 'error') && <Button size="sm" variant="ghost" onClick={() => void flush()}>Jetzt speichern</Button>}
    </div>
  );
}
