import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type CourseRow, type PromotionCandidate, type PromotionRow, type PromotionRuleRow, type QualificationRow, type RankRow, type RequirementRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const ST = { PENDING: '🕓 offen', APPROVED: '✅ genehmigt', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen' } as const;
const num = (n: number) => `B-${String(n).padStart(4, '0')}`;

/** Beförderungen: Anträge entscheiden, Kandidaten (Voraussetzungen erfüllt), Regeln je Dienstgrad. */
export function Promotions() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/promotions`;
  const [status, setStatus] = useState('PENDING');
  const list = useQuery({ queryKey: ['promotions', guildId, status], queryFn: () => api<{ items: PromotionRow[] }>(`${base}?limit=100${status ? `&status=${status}` : ''}`), refetchInterval: 20_000 });
  const cands = useQuery({ queryKey: ['promo-candidates', guildId], queryFn: () => api<PromotionCandidate[]>(`${base}/candidates`) });
  const ranks = useQuery({ queryKey: ['ranks', guildId], queryFn: () => api<RankRow[]>(`/guilds/${guildId}/personnel-structure/ranks`) });
  const rules = useQuery({ queryKey: ['promo-rules', guildId], queryFn: () => api<PromotionRuleRow[]>(`${base}/rules`) });
  const courses = useQuery({ queryKey: ['courses', guildId], queryFn: () => api<CourseRow[]>(`/guilds/${guildId}/training/courses`) });
  const quals = useQuery({ queryKey: ['quals', guildId], queryFn: () => api<QualificationRow[]>(`/guilds/${guildId}/qualifications`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      for (const k of ['promotions', 'promo-candidates', 'promo-rules']) void qc.invalidateQueries({ queryKey: [k, guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [why, setWhy] = useState<Record<string, string>>({});
  const [ruleRank, setRuleRank] = useState('');
  const [reqs, setReqs] = useState<RequirementRow[]>([]);
  const [nr, setNr] = useState({ type: 'SERVICE_DAYS', value: '' });
  const label = (r: RequirementRow) => r.type === 'COURSE' ? `Ausbildung: ${courses.data?.find((c) => c.id === r.courseId)?.name ?? '?'}` : r.type === 'QUALIFICATION' ? `Qualifikation: ${quals.data?.find((q) => q.id === r.qualificationId)?.name ?? '?'}` : r.type === 'RANK' ? `Mind. Dienstgrad: ${ranks.data?.find((x) => x.id === r.rankId)?.name ?? '?'}` : r.type === 'SERVICE_DAYS' ? `${r.days} Tage im Dienst` : r.type === 'RANK_DAYS' ? `${r.days} Tage im Dienstgrad` : r.type === 'NO_DISCIPLINE' ? `keine Disziplin seit ${r.days} Tagen` : `${r.hours} Dienststunden`;
  const addReq = () => {
    const v = nr.value;
    if (!v) return;
    const r: RequirementRow = nr.type === 'COURSE' ? { type: 'COURSE', courseId: v } : nr.type === 'QUALIFICATION' ? { type: 'QUALIFICATION', qualificationId: v } : nr.type === 'RANK' ? { type: 'RANK', rankId: v } : nr.type === 'SERVICE_DAYS' ? { type: 'SERVICE_DAYS', days: Number(v) } : nr.type === 'RANK_DAYS' ? { type: 'RANK_DAYS', days: Number(v) } : nr.type === 'NO_DISCIPLINE' ? { type: 'NO_DISCIPLINE', days: Number(v) } : { type: 'SHIFT_HOURS', hours: Number(v) };
    setReqs([...reqs, r]);
    setNr({ ...nr, value: '' });
  };
  const options = nr.type === 'COURSE' ? courses.data?.map((c) => [c.id, c.name]) : nr.type === 'QUALIFICATION' ? quals.data?.map((q) => [q.id, q.name]) : nr.type === 'RANK' ? ranks.data?.map((r) => [r.id, r.name]) : null;
  return (
    <>
      <h1>Beförderungen</h1>
      <p className="muted">Anträge stellen Beamte mit Berechtigung im Bot (<code>/befoerderung antrag</code>) oder hier über „Kandidaten“. Genehmigt wird der Dienstgrad <strong>inklusive Rollenwechsel</strong>; Antragsteller und Beförderte genehmigen nicht selbst.</p>
      <h2>Kandidaten – Voraussetzungen erfüllt</h2>
      <QueryState query={cands}>
        {(rows) => rows.length === 0 ? <p className="muted">Niemand erfüllt aktuell die Voraussetzungen des nächsten Dienstgrads.</p> : (
          <ul className="list">
            {rows.map((c) => (
              <li key={c.userId} className="row">
                <span className="grow"><strong>{c.rpName}</strong> <code>{c.userId}</code> · {c.fromRank ?? '–'} → <strong>{c.toRank}</strong></span>
                <button className="btn primary" disabled={c.hasOpenRequest || call.isPending} onClick={() => call.mutate({ method: 'POST', path: '', body: { userId: c.userId, toRankId: c.toRankId }, msg: 'Antrag gestellt.' })}>{c.hasOpenRequest ? 'Antrag offen' : 'Antrag stellen'}</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <h2>Anträge</h2>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="PENDING">Offen</option><option value="">Alle</option><option value="APPROVED">Genehmigt</option><option value="REJECTED">Abgelehnt</option><option value="WITHDRAWN">Zurückgezogen</option></select>
      <QueryState query={list}>
        {(d) => d.items.length === 0 ? <p className="muted">Keine Anträge.</p> : (
          <ul className="list">
            {d.items.map((r) => (
              <li key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <strong>{num(r.number)}</strong> <code>{r.userId}</code>: {r.fromRankName ?? '–'} → <strong>{r.toRankName}</strong> · {ST[r.status]}{r.override ? ' · ⚠️ Ausnahme' : ''}
                  <br /><small className="muted">von <code>{r.requestedBy}</code>{r.reason ? ` · ${r.reason}` : ''}{r.decisionReason ? ` · Entscheidung: ${r.decisionReason}` : ''}{r.roleResult && r.roleResult !== 'success' ? ` · ⚠️ Rollen: ${r.roleResult}` : ''}</small>
                  <ul className="plain">{(r.checks ?? []).map((c, i) => <li key={i}><small>{c.met ? '✅' : '❌'} {c.label} – {c.detail}</small></li>)}</ul>
                  {r.status === 'PENDING' && (
                    <>
                      <input className="inline-input" placeholder="Anmerkung / Ablehnungsgrund" value={why[r.id] ?? ''} onChange={(e) => setWhy({ ...why, [r.id]: e.target.value })} />
                      <button className="btn primary" onClick={() => call.mutate({ method: 'POST', path: `/${r.id}/approve`, body: { reason: why[r.id] }, msg: 'Genehmigt – Dienstgrad gesetzt.' })}>Genehmigen</button>
                      <button className="btn danger" disabled={(why[r.id] ?? '').trim().length < 3} onClick={() => call.mutate({ method: 'POST', path: `/${r.id}/reject`, body: { reason: why[r.id] }, msg: 'Abgelehnt.' })}>Ablehnen</button>
                      <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/${r.id}/withdraw`, msg: 'Zurückgezogen.' })}>Zurückziehen</button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <h2>Voraussetzungen je Dienstgrad</h2>
      <QueryState query={rules}>
        {(rows) => (
          <ul className="list">
            {ranks.data?.slice().sort((a, b) => a.order - b.order).map((k) => {
              const rule = rows.find((x) => x.rankId === k.id);
              return (
                <li key={k.id} className="row">
                  <span className="grow"><strong>{k.name}</strong><br /><small className="muted">{rule?.requirements.length ? rule.requirements.map(label).join(' · ') : 'nur Genehmigung'}</small></span>
                  <button className="btn" onClick={() => { setRuleRank(k.id); setReqs(rule?.requirements ?? []); }}>Bearbeiten</button>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {ruleRank && (
        <div className="card comp">
          <h3>Voraussetzungen für „{ranks.data?.find((k) => k.id === ruleRank)?.name}“</h3>
          <ul className="plain">{reqs.map((r, i) => <li key={i}>{label(r)} <button className="btn" onClick={() => setReqs(reqs.filter((_, j) => j !== i))}>✕</button></li>)}{reqs.length === 0 && <li className="muted">keine – nur Genehmigung</li>}</ul>
          <div className="actions">
            <select value={nr.type} onChange={(e) => setNr({ type: e.target.value, value: '' })} aria-label="Art">
              <option value="SERVICE_DAYS">Dienstzeit (Tage)</option><option value="RANK_DAYS">Tage im Dienstgrad</option><option value="SHIFT_HOURS">Dienststunden</option><option value="NO_DISCIPLINE">Keine Disziplin (Tage)</option><option value="COURSE">Ausbildung bestanden</option><option value="QUALIFICATION">Qualifikation</option><option value="RANK">Mindest-Dienstgrad</option>
            </select>
            {options ? <select value={nr.value} onChange={(e) => setNr({ ...nr, value: e.target.value })} aria-label="Wert"><option value="">Wählen …</option>{options.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select> : <input type="number" min={1} value={nr.value} onChange={(e) => setNr({ ...nr, value: e.target.value })} aria-label="Wert" />}
            <button className="btn" onClick={addReq}>Hinzufügen</button>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => call.mutate({ method: 'PUT', path: `/rules/${ruleRank}`, body: { requirements: reqs }, msg: 'Regel gespeichert.' }, { onSuccess: () => setRuleRank('') })}>Speichern</button>
            <button className="btn" onClick={() => setRuleRank('')}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}
