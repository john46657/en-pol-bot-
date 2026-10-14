import { useCallback, useEffect, useRef, useState } from 'react';
import type { MbDocumentData } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';

export interface MbDoc { id: string; kind: 'DRAFT' | 'TEMPLATE'; name: string; categoryId: string | null; channelId: string | null; version: number; updatedAt: string; data: MbDocumentData }
export type DocSaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

const editable = (d: MbDoc) => ({ name: d.name, categoryId: d.categoryId, channelId: d.channelId, data: d.data });
const json = (d: MbDoc) => JSON.stringify(editable(d));
const backupKey = (id: string) => `enrp.mb.backup.${id}`;
interface Backup { at: number; version: number; doc: MbDoc }
function readBackup(id: string): Backup | null { try { return JSON.parse(localStorage.getItem(backupKey(id)) ?? 'null') as Backup | null; } catch { return null; } }
function writeBackup(d: MbDoc, version: number) { try { localStorage.setItem(backupKey(d.id), JSON.stringify({ at: Date.now(), version, doc: d } satisfies Backup)); } catch { /* privater Modus */ } }
function dropBackup(id: string) { try { localStorage.removeItem(backupKey(id)); } catch { /* egal */ } }

/**
 * Automatisches Speichern eines Entwurfs/einer Vorlage:
 * - jede Änderung wird nach 1 s gespeichert (PUT mit Versionsnummer); Status „Speichert …“, „Gespeichert“, „Speichern fehlgeschlagen“
 * - bis zur Bestätigung liegt der Stand zusätzlich im Browser (Absturz, Neuladen, Verbindungsabbruch) und kann wiederhergestellt werden
 * - Netzwerk-/Serverfehler: Wiederholung mit wachsender Pause; abgelehnte Änderungen werden als Fehler gezeigt, nie als gespeichert
 * - neuere Fassung von anderswo (409): nichts wird überschrieben – die Person entscheidet
 */
export function useDocAutosave(loaded: MbDoc | null, readOnly: boolean) {
  const [doc, setDocState] = useState<MbDoc | null>(loaded);
  const [status, setStatus] = useState<DocSaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<MbDoc | null>(null);
  const [restorable, setRestorable] = useState<Backup | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saved = useRef(''), version = useRef(0), current = useRef<MbDoc | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined), flying = useRef(false), attempts = useRef(0);
  const conflictOpen = useRef(false);
  conflictOpen.current = !!conflict;

  // neues Dokument geladen
  useEffect(() => {
    clearTimeout(timer.current);
    setDocState(loaded); current.current = loaded;
    setStatus('saved'); setError(null); setConflict(null); attempts.current = 0;
    if (!loaded) { setRestorable(null); return; }
    saved.current = json(loaded); version.current = loaded.version;
    const b = readBackup(loaded.id);
    // nur anbieten, wenn der lokale Stand auf der aktuellen Fassung beruht und sich unterscheidet
    if (b && !readOnly && json(b.doc) !== saved.current) setRestorable(b); else { setRestorable(null); if (b) dropBackup(loaded.id); }
  }, [loaded?.id, loaded?.version]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const d = current.current;
    if (!d || readOnly) return;
    if (flying.current) { timer.current = setTimeout(() => void save(), 300); return; }
    const body = json(d);
    if (body === saved.current) { setStatus('saved'); dropBackup(d.id); return; }
    flying.current = true; setStatus('saving');
    try {
      const r = await api<MbDoc>(`/message-builder/documents/${d.id}`, { method: 'PUT', body: { ...editable(d), version: version.current } });
      if (current.current?.id !== d.id) { dropBackup(d.id); return; } // inzwischen anderes Dokument geöffnet
      version.current = r.version; saved.current = body; attempts.current = 0;
      setError(null); setSavedAt(Date.now());
      if (current.current && json(current.current) === body) { setStatus('saved'); dropBackup(d.id); }
      else { setStatus('pending'); timer.current = setTimeout(() => void save(), 600); }
    } catch (e) {
      if (current.current?.id !== d.id) return; // lokale Sicherung des alten Dokuments bleibt erhalten
      if (e instanceof ApiError && e.status === 409) {
        const cur = (e.details as { current?: MbDoc } | undefined)?.current ?? null;
        setConflict(cur); setStatus('conflict'); setError(e.message);
      } else if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        setStatus('error'); setError(e.message); // abgelehnt (Rechte, ungültig) – nicht endlos wiederholen
      } else {
        attempts.current++;
        setStatus('error'); setError('Keine Verbindung zum Server – neuer Versuch läuft automatisch. Deine Änderungen sind lokal im Browser gesichert.');
        timer.current = setTimeout(() => void save(), Math.min(30_000, 2000 * 2 ** (attempts.current - 1)));
      }
    } finally { flying.current = false; }
  }, [readOnly]);

  const setDoc = useCallback((fn: (d: MbDoc) => MbDoc) => {
    const d = current.current;
    if (!d || readOnly) return;
    const next = fn(d);
    current.current = next; setDocState(next);
    if (json(next) === saved.current) return;
    writeBackup(next, version.current);
    setStatus((s) => (s === 'conflict' ? s : 'pending'));
    clearTimeout(timer.current);
    if (!conflictOpen.current) timer.current = setTimeout(() => void save(), 1000);
  }, [readOnly, save]);
  /** Konflikt lösen: „theirs“ = neuere Fassung laden (eigene Änderungen verwerfen), „mine“ = eigene Fassung darüber speichern. */
  const resolveConflict = useCallback((how: 'theirs' | 'mine') => {
    if (!conflict) return;
    if (how === 'theirs') {
      current.current = conflict; setDocState(conflict);
      saved.current = json(conflict); version.current = conflict.version;
      dropBackup(conflict.id); setStatus('saved'); setError(null);
    } else {
      version.current = conflict.version;
      setStatus('pending'); setError(null);
      setTimeout(() => void save(), 0);
    }
    setConflict(null);
  }, [conflict, save]);

  const restore = useCallback(() => {
    if (!restorable) return;
    const b = restorable;
    setRestorable(null);
    setDoc((d) => ({ ...d, name: b.doc.name, categoryId: b.doc.categoryId, channelId: b.doc.channelId, data: b.doc.data }));
  }, [restorable, setDoc]);
  const discardBackup = useCallback(() => { if (doc) dropBackup(doc.id); setRestorable(null); }, [doc]);

  // Seite verlassen mit ungespeicherten Änderungen: Browser fragt nach; sofort zu speichern versuchen
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status !== 'saved') { void save(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status, save]);
  // beim Wechsel des Dokuments/Verlassen der Seite: ausstehende Änderung sofort speichern
  useEffect(() => () => { if (current.current && json(current.current) !== saved.current) void save(); }, [loaded?.id, save]);

  return { doc, setDoc, status, error, conflict, resolveConflict, restorable, restore, discardBackup, saveNow: save, savedAt };
}
