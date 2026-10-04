import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type AbsenceRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const ST = { PENDING: '🕓 offen', APPROVED: '✅ genehmigt', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen', ENDED: '🏁 vorzeitig beendet' } as const;
const CAT: Record<string, string> = { URLAUB: 'Urlaub', KRANK: 'Krankheit', BERUFLICH: 'Beruflich/Schule', SONSTIGES: 'Sonstiges' };
const day = (v: string) => new Date(v).toLocaleDateString('de-DE', { timeZone: 'UTC' });
const num = (n: number) => `A-${String(n).padStart(4, '0')}`;

/** Abmeldungen: Anträge entscheiden, wer ist abgemeldet, eigene Abmeldung beantragen. */
export function Absences() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/absences`;
  const [status, setStatus] = useState('PENDING');
  const list = useQuery({ queryKey: ['absences', guildId, status], queryFn: () => api<{ items: AbsenceRow[] }>(`${base}?limit=100${status ? `&status=${status}` : ''}`), refetchInterval: 20_000 });
  const active = useQuery({ queryKey: ['absences-active', guildId], queryFn: () => api<AbsenceRow[]>(`${base}/active`) });
  const call = useMutation({
    mutationFn: (v: { path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: 'POST', body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['absences', guildId] });
      void qc.invalidateQueries({ queryKey: ['absences-active', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [why, setWhy] = useState<Record<string, string>>({});
  const [f, setF] = useState({ start: '', end: '', category: 'URLAUB', reason: '' });
  return (
    <>
      <h1>Abmeldungen</h1>
      <h2>Aktuell abgemeldet</h2>
      <QueryState query={active}>
        {(rows) => rows.length === 0 ? <p className="muted">Niemand ist abgemeldet.</p> : (
          <ul className="list">{rows.map((a) => <li key={a.id} className="row"><code>{a.userId}</code> · bis {day(a.endDate)} · {CAT[a.category] ?? a.category}</li>)}</ul>
        )}
      </QueryState>
      <h2>Anträge</h2>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="PENDING">Offen</option><option value="">Alle</option><option value="APPROVED">Genehmigt</option><option value="REJECTED">Abgelehnt</option><option value="WITHDRAWN">Zurückgezogen</option><option value="ENDED">Vorzeitig beendet</option></select>
      <QueryState query={list}>
        {(d) => d.items.length === 0 ? <p className="muted">Keine Abmeldungen.</p> : (
          <ul className="list">
            {d.items.map((a) => (
              <li key={a.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <strong>{num(a.number)}</strong> <code>{a.userId}</code> · {day(a.startDate)} – {day(a.endDate)} · {CAT[a.category] ?? a.category} · {ST[a.status]}
                  <br /><small className="muted">{a.reason}{a.decisionReason ? ` · Entscheidung: ${a.decisionReason}` : ''}</small>
                  {a.status === 'PENDING' && (
                    <div>
                      <input className="inline-input" placeholder="Anmerkung / Ablehnungsgrund" value={why[a.id] ?? ''} onChange={(e) => setWhy({ ...why, [a.id]: e.target.value })} />
                      <button className="btn primary" onClick={() => call.mutate({ path: `/${a.id}/approve`, body: { reason: why[a.id] }, msg: 'Genehmigt.' })}>Genehmigen</button>
                      <button className="btn danger" disabled={(why[a.id] ?? '').trim().length < 3} onClick={() => call.mutate({ path: `/${a.id}/reject`, body: { reason: why[a.id] }, msg: 'Abgelehnt.' })}>Ablehnen</button>
                    </div>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <h3>Eigene Abmeldung beantragen</h3>
        <div className="two">
          <label className="fld"><span>Erster Tag</span><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="fld"><span>Letzter Tag</span><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Kategorie</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="fld"><span>Begründung</span><input value={f.reason} maxLength={500} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        </div>
        <button className="btn primary" disabled={!f.start || !f.end || f.reason.trim().length < 3} onClick={() => call.mutate({ path: '', body: f, msg: 'Abmeldung beantragt.' })}>Beantragen</button>
      </div>
    </>
  );
}
