import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, STATUS_TEXT, type StatusLabels } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

/** Status, deren Name/Farbe sich je Bewerbungsart anpassen lässt (Reihenfolge wie im Ablauf). */
const STATUSES = ['STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD', 'ACCEPTED', 'DENIED', 'CANCELLED', 'EXPIRED', 'WITHDRAWN'] as const;

/** Eigene Statusnamen und -farben (Discord-Prüfnachricht, Bot-Meldungen, Dashboard). Leer = Standard. */
export function StatusSettings({ guildId, applicationId }: { guildId: string; applicationId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const base = `/guilds/${guildId}/applications/${applicationId}`;
  const app = useQuery({ queryKey: ['application-config', applicationId], queryFn: () => api<{ config: { statusLabels?: StatusLabels } | null }>(base) });
  const [draft, setDraft] = useState<StatusLabels | null>(null);
  const labels = draft ?? app.data?.config?.statusLabels ?? {};
  const save = useMutation({
    mutationFn: () => {
      const clean: StatusLabels = {};
      for (const [k, v] of Object.entries(labels)) {
        const label = v?.label?.trim();
        if (label || v?.color) clean[k] = { ...(label ? { label } : {}), ...(v?.color ? { color: v.color } : {}) };
      }
      return api(base, { method: 'PATCH', body: { config: { statusLabels: clean } } });
    },
    onSuccess: () => {
      toast.success('Statusnamen gespeichert.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['application-config', applicationId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const set = (status: string, patch: { label?: string; color?: string | undefined }) => {
    const next = { ...(labels[status] ?? {}), ...patch };
    if (next.color === undefined) delete next.color;
    setDraft({ ...labels, [status]: next });
  };
  if (!app.data) return null;
  return (
    <div className="card comp">
      <h3>Statusnamen und Farben</h3>
      <p className="muted">Eigene Bezeichnungen (gern mit Emoji, z. B. „🟣 Wird geprüft“) und Farben für diese Bewerbungsart. Sie erscheinen in der Prüf-Nachricht im Discord, in Bot-Meldungen und im Dashboard. Leer lassen = Standard.</p>
      <table>
        <thead>
          <tr><th>Status</th><th>Eigener Name</th><th>Farbe</th></tr>
        </thead>
        <tbody>
          {STATUSES.map((st) => (
            <tr key={st}>
              <td>{STATUS_TEXT[st] ?? st}</td>
              <td>
                <input className="inline-input" aria-label={`Name für ${STATUS_TEXT[st] ?? st}`} placeholder={STATUS_TEXT[st]} maxLength={40} value={labels[st]?.label ?? ''} onChange={(e) => set(st, { label: e.target.value })} />
              </td>
              <td>
                <input type="color" aria-label={`Farbe für ${STATUS_TEXT[st] ?? st}`} value={labels[st]?.color ?? '#5865f2'} onChange={(e) => set(st, { color: e.target.value })} />
                {labels[st]?.color && (
                  <button className="linklike" onClick={() => set(st, { color: undefined })}>Standard</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button className="btn primary" disabled={!draft || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichere …' : 'Statusnamen speichern'}</button>
      </div>
    </div>
  );
}
