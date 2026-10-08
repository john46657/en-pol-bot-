import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAutosaveDraft } from './autosave';
import { useServer } from './guilds';

/**
 * Liste von Einstellungs-Dokumenten (Panels, Staff-Listen, Vorlagen …) mit lokaler Bearbeitung und automatischem Speichern.
 * Serverfelder (`serverKeys`, z. B. „posted“) kommen immer frisch vom Server; alles andere hat lokal Vorrang, solange bearbeitet wird.
 */
export function useDocList<T extends { id: string; name: string }>(o: { path: string; key: string; manage: boolean; valid: (d: T) => boolean; serverKeys?: (keyof T)[]; strip?: (d: T) => unknown; label: string }) {
  const qc = useQueryClient();
  const [server] = useServer();
  const key = [o.key, server];
  const q = useQuery({ queryKey: key, queryFn: () => api<T[]>(o.path) });
  const [docs, setDocs] = useState<T[]>();
  const [open, setOpen] = useState<string>();
  // Serverwechsel: lokale Bearbeitung verwerfen. Nur bei echtem Wechsel – beim ersten Rendern würde das die schon
  // aus dem Cache übernommene Liste wieder leeren (ohne neue Daten bliebe die Seite dann beim Laden stehen).
  const lastServer = useRef(server);
  useEffect(() => {
    if (lastServer.current !== server) { lastServer.current = server; setDocs(undefined); setOpen(undefined); }
    if (!q.data) return;
    setDocs((cur) => {
      const local = new Map((cur ?? []).map((c) => [c.id, c]));
      const fresh = (d: T) => { const l = local.get(d.id); if (!l) return d; const merged = { ...l }; for (const k of o.serverKeys ?? []) merged[k] = d[k]; return merged; };
      return [...q.data.map(fresh), ...(cur ?? []).filter((c) => !q.data.some((d) => d.id === c.id))];
    });
  }, [q.data, server]);
  const current = docs?.find((d) => d.id === open);
  const body = (d: T) => (o.strip ? o.strip(d) : d);
  useAutosaveDraft(o.manage && current ? `${o.key}:${current.id}` : null, current, (d) => (o.valid(d) ? { method: 'PUT', path: `${o.path}/${d.id}`, body: body(d), label: `${o.label} „${d.name}“` } : null));
  const remove = useMutation({
    mutationFn: (id: string) => (q.data?.some((d) => d.id === id) ? api(`${o.path}/${id}`, { method: 'DELETE' }) : Promise.resolve()),
    onSuccess: (_r, id) => { setDocs((l) => l?.filter((d) => d.id !== id)); setOpen(undefined); void qc.invalidateQueries({ queryKey: key }); },
  });
  return {
    q, docs, current, open, setOpen, server,
    add: (d: T) => { setDocs([...(docs ?? []), d]); setOpen(d.id); },
    update: (d: T) => setDocs((l) => l?.map((x) => (x.id === d.id ? d : x))),
    remove,
    /** vor dem Senden sicher speichern */
    saveNow: (d: T) => api(`${o.path}/${d.id}`, { method: 'PUT', body: body(d) }),
    refetchSoon: () => setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 4000),
  };
}
