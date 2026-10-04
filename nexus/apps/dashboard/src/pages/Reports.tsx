import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type ReportRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const when = (v: string) => new Date(v).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Berichte: Tages-/Wochenberichte berechnen, ansehen, im Kanal veröffentlichen. */
export function Reports() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/reports`;
  const list = useQuery({ queryKey: ['reports', guildId], queryFn: () => api<ReportRow[]>(base) });
  const [open, setOpen] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['report', guildId, open], enabled: !!open, queryFn: () => api<{ text: string }>(`${base}/${open}`) });
  const [date, setDate] = useState('');
  const call = useMutation({
    mutationFn: (v: { path: string; body?: unknown; msg: string }) => api<{ status?: string; reason?: string; id?: string }>(`${base}${v.path}`, { method: 'POST', body: v.body }).then((r) => ({ r, msg: v.msg })),
    onSuccess: ({ r, msg }) => {
      if (r.status === 'no-channel' || r.status === 'failed') toast.error(r.reason ?? 'Veröffentlichen nicht möglich.');
      else toast.success(msg);
      void qc.invalidateQueries({ queryKey: ['reports', guildId] });
      if (r.id) setOpen(r.id);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Berichte</h1>
      <div className="actions">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Datum (leer = heute)" />
        <button className="btn primary" onClick={() => call.mutate({ path: '', body: { kind: 'DAY', date }, msg: 'Tagesbericht berechnet.' })}>Tagesbericht</button>
        <button className="btn primary" onClick={() => call.mutate({ path: '', body: { kind: 'WEEK', date }, msg: 'Wochenbericht berechnet.' })}>Wochenbericht</button>
      </div>
      <p className="muted">Die Zahlen werden beim Berechnen direkt aus Schichten, Einsätzen, Fahndungen, Strafen, Tickets und Ausbildungen gelesen. Automatische Erstellung folgt mit den Hintergrund-Jobs.</p>
      <QueryState query={list}>
        {(rows) => rows.length === 0 ? <p className="muted">Noch keine Berichte.</p> : (
          <ul className="list">
            {rows.map((r) => (
              <li key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <strong>{r.kind === 'DAY' ? '📊 Tagesbericht' : '📈 Wochenbericht'} {when(r.periodStart)}{r.kind === 'WEEK' ? ` – ${when(new Date(new Date(r.periodEnd).getTime() - 1).toISOString())}` : ''}</strong>{r.messageId && <em> · veröffentlicht</em>}
                  {open === r.id && <QueryState query={detail}>{(d) => <pre style={{ whiteSpace: 'pre-wrap' }}>{d.text}</pre>}</QueryState>}
                </span>
                <button className="btn" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Schließen' : 'Ansehen'}</button>
                <button className="btn" onClick={() => call.mutate({ path: `/${r.id}/publish`, msg: 'Bericht veröffentlicht.' })}>Veröffentlichen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
