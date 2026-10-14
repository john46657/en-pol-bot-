import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ApiError, apiHeaders } from './api';

/**
 * Automatisches Speichern für alle Einstellungen.
 * - Änderungen werden je Schlüssel gesammelt (letzte gewinnt) und nach kurzer Pause gemeinsam gesendet.
 * - Vor dem Senden liegen sie im Browser (localStorage): Neuladen, Schließen, Seitenwechsel oder kurzer
 *   Verbindungsabbruch verlieren nichts – ausstehende Änderungen werden beim nächsten Start/online nachgesendet.
 * - Netzwerk-/Serverfehler: automatische Wiederholung mit wachsender Pause. Abgelehnte Änderungen (fehlende Rechte,
 *   ungültige Werte) werden nicht endlos wiederholt, sondern als Fehler gemeldet.
 * Die Datenbank bleibt die Quelle der Wahrheit; der Browser ist nur Zwischenspeicher.
 */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error';
export interface SaveRequest { method: 'PUT' | 'PATCH' | 'POST'; path: string; body: unknown; guildId?: string | null; label?: string }
interface Entry extends SaveRequest { key: string; attempts: number; at: number }

const STORE_KEY = 'enrp.autosave.v1';
const DEBOUNCE_MS = 800;
const listeners = new Set<() => void>();
const savedHooks = new Map<string, Set<(data: unknown) => void>>();
let owner = '';
let queue = new Map<string, Entry>();
let state: { status: SaveState; error?: string; lastSavedAt?: number } = { status: 'saved' };
let timer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | null = null;

const emit = () => listeners.forEach((l) => l());
function setState(s: typeof state) { state = s; emit(); }

function persist() {
  try {
    if (queue.size) localStorage.setItem(STORE_KEY, JSON.stringify({ owner, entries: [...queue.values()] }));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* privater Modus: dann nur im Speicher */ }
}

/** Nach der Anmeldung: ausstehende Änderungen dieses Benutzers (z. B. nach Neuladen) übernehmen und senden. Fremde verwerfen. */
export function initAutosave(userId: string) {
  if (owner === userId) return;
  owner = userId;
  queue = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { owner: string; entries: Entry[] } | null;
    if (raw?.owner === userId) for (const e of raw.entries) queue.set(e.key, { ...e, attempts: 0 });
    else localStorage.removeItem(STORE_KEY);
  } catch { /* defekter Eintrag */ }
  if (queue.size) { setState({ status: 'pending' }); void flush(); }
}
export function resetAutosave() { owner = ''; queue.clear(); clearTimeout(timer); clearTimeout(retryTimer); persist(); setState({ status: 'saved' }); }

/** Ausstehender (noch nicht gespeicherter) Wert – z. B. um nach dem Neuladen die lokale Änderung anzuzeigen. */
export function pendingBody<T>(key: string): T | undefined { return queue.get(key)?.body as T | undefined; }
export const hasPending = (prefix = '') => [...queue.keys()].some((k) => k.startsWith(prefix));

/** Änderung vormerken. Gleicher Schlüssel = ersetzt die vorige (z. B. dieselbe Einstellung mehrfach geändert). */
export function queueSave(key: string, req: SaveRequest, delay = DEBOUNCE_MS) {
  queue.set(key, { ...req, key, attempts: 0, at: Date.now() });
  persist();
  setState({ status: state.status === 'saving' ? 'saving' : 'pending', lastSavedAt: state.lastSavedAt });
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

/** Nach erfolgreichem Speichern eines Schlüssels (Präfix) benachrichtigen, z. B. um Server-Antworten zu übernehmen. */
export function onSaved(prefix: string, fn: (data: unknown) => void) {
  const set = savedHooks.get(prefix) ?? new Set();
  set.add(fn); savedHooks.set(prefix, set);
  return () => { set.delete(fn); };
}

async function send(e: Entry, keepalive = false) {
  const res = await fetch(`/api/v1${e.path}`, { method: e.method, credentials: 'same-origin', keepalive, headers: { 'content-type': 'application/json', ...apiHeaders(e.guildId) }, body: JSON.stringify(e.body) });
  const text = await res.text();
  let data: unknown; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) { const d = (data ?? {}) as { code?: string; message?: string; requestId?: string }; throw new ApiError(res.status, d.code ?? 'ERROR', d.message ?? `Anfrage fehlgeschlagen (${res.status})`, d.requestId); }
  return data;
}

/** Sofort speichern (auch „Speichern“-Knopf, Seitenwechsel). Läuft nie doppelt. */
export function flush(): Promise<void> {
  clearTimeout(timer);
  if (flushing) return flushing.then(() => (queue.size ? flush() : undefined));
  if (!queue.size) return Promise.resolve();
  flushing = (async () => {
    setState({ status: 'saving', lastSavedAt: state.lastSavedAt });
    let failed: string | undefined, retry = false;
    for (const e of [...queue.values()].sort((a, b) => a.at - b.at)) {
      try {
        const data = await send(e);
        if (queue.get(e.key)?.at === e.at) queue.delete(e.key); // nur entfernen, wenn nicht inzwischen neu geändert
        for (const [p, fns] of savedHooks) if (e.key.startsWith(p)) fns.forEach((f) => f(data));
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 401) { retry = true; failed = 'Nicht angemeldet – Änderungen werden nach der Anmeldung gespeichert.'; break; }
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          // vom Server abgelehnt: Wiederholen hilft nicht
          queue.delete(e.key);
          failed = `${e.label ?? 'Änderung'}: ${err instanceof ApiError ? err.message : 'abgelehnt'}`;
        } else {
          e.attempts++; retry = true;
          failed = 'Deine Änderungen konnten nicht gespeichert werden. Wir versuchen es automatisch erneut.';
        }
      }
    }
    persist();
    if (failed) {
      setState({ status: 'error', error: failed, lastSavedAt: state.lastSavedAt });
      if (retry) {
        const attempts = Math.max(...[...queue.values()].map((e) => e.attempts), 1);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void flush(), Math.min(30_000, 2000 * 2 ** (attempts - 1)));
      }
    } else setState({ status: queue.size ? 'pending' : 'saved', lastSavedAt: Date.now() });
  })().finally(() => { flushing = null; });
  return flushing;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush());
  // Tab schließen / in den Hintergrund: sofort senden (keepalive überlebt das Schließen); der lokale Zwischenspeicher bleibt bis zur Bestätigung
  const leave = () => { for (const e of queue.values()) void send(e, true).then(() => { if (queue.get(e.key)?.at === e.at) { queue.delete(e.key); persist(); } }, () => undefined); };
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
}

export function useSaveState() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

/**
 * Formular-Entwurf automatisch speichern: jede Änderung am Entwurf (nicht das erste Laden) wird gesammelt gesendet.
 * `draft` ist `undefined`, solange (neu) geladen wird – der erste Stand danach gilt als gespeichert.
 * `request(draft)` liefert die Anfrage – oder `null`, solange der Entwurf unvollständig/ungültig ist (dann bleibt er lokal).
 */
export function useAutosaveDraft<T>(key: string | null, draft: T | undefined, request: (d: T) => SaveRequest | null, delay = 1000) {
  const last = useRef<string | undefined>(undefined);
  const k = useRef(key);
  useEffect(() => {
    // lädt (neu), z. B. nach dem Server-Wechsel: der nächste Stand ist wieder der gespeicherte – nicht als Änderung senden
    if (!key || draft === undefined) { last.current = undefined; return; }
    const json = JSON.stringify(draft);
    if (k.current !== key || last.current === undefined) { k.current = key; last.current = json; return; } // erster Stand = gespeicherter Stand
    if (json === last.current) return;
    last.current = json;
    const req = request(draft);
    if (req) queueSave(key, req, delay);
  }, [key, draft]);
}
