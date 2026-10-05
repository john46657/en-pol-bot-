import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

interface Field {
  id: string;
  label: string;
  max: number;
}
const slug = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'feld';

/** Bewertungsfelder einer Bewerbungsart (z. B. „Kommunikation“, 1–5 Sterne). Ohne Felder ist die interne Bewertung aus. */
export function RatingSettings({ guildId, applicationId }: { guildId: string; applicationId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const base = `/guilds/${guildId}/applications/${applicationId}`;
  const app = useQuery({ queryKey: ['application-config', applicationId], queryFn: () => api<{ config: { rating?: { fields?: Field[] } } | null }>(base) });
  const [draft, setDraft] = useState<Field[] | null>(null);
  const fields = draft ?? app.data?.config?.rating?.fields ?? [];
  const save = useMutation({
    mutationFn: () => api(base, { method: 'PATCH', body: { config: { rating: { fields } } } }),
    onSuccess: () => {
      toast.success('Bewertungsfelder gespeichert.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['application-config', applicationId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const edit = (i: number, patch: Partial<Field>) => setDraft(fields.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const add = () => {
    const taken = new Set(fields.map((f) => f.id));
    let id = 'feld';
    for (let n = 2; taken.has(id); n++) id = `feld-${n}`;
    setDraft([...fields, { id, label: '', max: 5 }]);
  };
  if (!app.data) return null;
  const invalid = fields.some((f) => !f.label.trim());
  return (
    <div className="card comp">
      <h3>Interne Bewertung</h3>
      <p className="muted">Bewertungsfelder, die das Team bei jeder eingereichten Bewerbung mit Sternen belegt (nur intern sichtbar). Ohne Felder ist die Bewertung ausgeschaltet.</p>
      <ul className="list">
        {fields.map((f, i) => (
          <li key={f.id} className="row">
            <input className="inline-input" aria-label="Bezeichnung des Bewertungsfelds" placeholder="z. B. Kommunikation" value={f.label} maxLength={60} onChange={(e) => edit(i, { label: e.target.value, ...(draft === null || /^feld(-\d+)?$/.test(f.id) ? { id: slug(e.target.value) } : {}) })} />
            <label>
              Sterne <input type="number" min={2} max={10} value={f.max} onChange={(e) => edit(i, { max: Math.min(10, Math.max(2, Number(e.target.value) || 5)) })} style={{ width: '4em' }} />
            </label>
            <button className="btn" onClick={() => setDraft(fields.filter((_, k) => k !== i))}>Entfernen</button>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="btn" onClick={add} disabled={fields.length >= 20}>+ Bewertungsfeld</button>
        <button className="btn primary" disabled={!draft || save.isPending || invalid} onClick={() => save.mutate()}>{save.isPending ? 'Speichere …' : 'Speichern'}</button>
      </div>
    </div>
  );
}
