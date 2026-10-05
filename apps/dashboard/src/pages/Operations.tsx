import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DutyOverviewData, type OpStatusKey, type OperationRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';

const STATUS: Record<OpStatusKey, string> = { REQUESTED: 'Angefordert', EN_ROUTE: 'Angefahren', ACTIVE: 'Aktiv', COMPLETED: 'Abgeschlossen', CANCELLED: 'Abgebrochen' };
const PRIO = { LOW: '⚪ Niedrig', NORMAL: '🔵 Normal', HIGH: '🟠 Hoch', URGENT: '🔴 Dringend' } as const;
const NEXT: Record<OpStatusKey, OpStatusKey[]> = { REQUESTED: ['EN_ROUTE', 'ACTIVE', 'CANCELLED'], EN_ROUTE: ['ACTIVE', 'COMPLETED', 'CANCELLED'], ACTIVE: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [] };
const num = (n: number) => `E-${String(n).padStart(4, '0')}`;

/** Einsätze: Liste, anlegen, Einheiten zuweisen, Einsatzleiter, Status, Abschlussbericht. */
export function Operations() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/operations`;
  const [filter, setFilter] = useState('open');
  const qs = filter === 'open' ? 'open=true' : filter ? `status=${filter}` : '';
  const list = useQuery({ queryKey: ['operations', guildId, qs], queryFn: () => api<{ items: OperationRow[] }>(`${base}?limit=100&${qs}`), refetchInterval: 15_000 });
  const duty = useQuery({ queryKey: ['duty', guildId], queryFn: () => api<DutyOverviewData>(`/guilds/${guildId}/duty`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['operations', guildId] });
      void qc.invalidateQueries({ queryKey: ['duty', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [form, setForm] = useState({ kind: '', location: '', priority: 'NORMAL', description: '' });
  const [text, setText] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<Record<string, string>>({});

  return (
    <>
      <h1>Einsätze</h1>
      <p className="muted">Beamte fordern Einsätze im Bot mit <code>/einsatz neu</code> an. Beim Abschluss wird jeder Beteiligte in seiner Personalakte vermerkt.</p>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
        <option value="open">Offene</option>
        <option value="">Alle</option>
        {(Object.keys(STATUS) as OpStatusKey[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
      </select>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? <p className="muted">Keine Einsätze.</p> : (
            <ul className="list">
              {d.items.map((o) => (
                <li key={o.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{num(o.number)} · {o.kind}</strong> · {PRIO[o.priority]} · {STATUS[o.status]}
                    <br /><small className="muted">📍 {o.location}{o.description ? ` · ${o.description}` : ''}</small>
                    <br />
                    <small>Einheiten: {o.units.map((u) => (
                      <span key={u.id}>{u.callsign}{(o.status !== 'COMPLETED' && o.status !== 'CANCELLED') && <button className="btn" onClick={() => call.mutate({ method: 'DELETE', path: `/${o.id}/units/${u.unitId}`, msg: 'Einheit abgezogen.' })}>✕</button>} </span>
                    ))}{o.units.length === 0 && '–'} · Leiter: {o.leaderId ? <UserName id={o.leaderId} /> : '–'}</small>
                    {o.report && <><br /><small>{o.status === 'CANCELLED' ? 'Abbruchgrund' : 'Bericht'}: {o.report}</small></>}
                    {NEXT[o.status].length > 0 && (
                      <>
                        <br />
                        <select value={unit[o.id] ?? ''} onChange={(e) => setUnit({ ...unit, [o.id]: e.target.value })} aria-label="Einheit">
                          <option value="">Einheit wählen …</option>
                          {duty.data?.units.filter((u) => !o.units.some((x) => x.unitId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.callsign} ({u.staffing.active}/{u.staffing.total})</option>)}
                        </select>
                        <button className="btn" disabled={!unit[o.id]} onClick={() => call.mutate({ method: 'POST', path: `/${o.id}/units`, body: { unitId: unit[o.id] }, msg: 'Einheit zugewiesen.' })}>Zuweisen</button>
                        <br />
                        <input className="inline-input" placeholder="Abschlussbericht / Abbruchgrund" value={text[o.id] ?? ''} onChange={(e) => setText({ ...text, [o.id]: e.target.value })} />
                        {NEXT[o.status].map((s) => (
                          <button key={s} className={`btn${s === 'CANCELLED' ? ' danger' : ''}`} onClick={() => call.mutate({ method: 'POST', path: `/${o.id}/status`, body: { status: s, report: text[o.id] }, msg: `Status: ${STATUS[s]}` })}>{STATUS[s]}</button>
                        ))}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <div className="card comp">
        <h3>Einsatz anlegen</h3>
        <div className="two">
          <label className="fld"><span>Art</span><input value={form.kind} maxLength={60} onChange={(e) => setForm({ ...form, kind: e.target.value })} /></label>
          <label className="fld"><span>Ort</span><input value={form.location} maxLength={100} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Priorität</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="fld"><span>Beschreibung</span><input value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
        <button className="btn primary" disabled={!form.kind.trim() || !form.location.trim()} onClick={() => call.mutate({ method: 'POST', path: '', body: form, msg: 'Einsatz angelegt.' }, { onSuccess: () => setForm({ kind: '', location: '', priority: 'NORMAL', description: '' }) })}>Anlegen</button>
      </div>
    </>
  );
}
