import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type CourseRow, type DiscordRole, type QualificationCheck, type QualificationRow, type RankRow, type RequirementRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const empty = { id: '', name: '', description: '', active: true, autoGrant: false, grantRoleId: '', validDays: '' };

/** Qualifikationen: definieren (Voraussetzungen frei kombinierbar), prüfen, vergeben, entziehen. */
export function Qualifications() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/qualifications`;
  const list = useQuery({ queryKey: ['quals', guildId], queryFn: () => api<QualificationRow[]>(base) });
  const courses = useQuery({ queryKey: ['courses', guildId], queryFn: () => api<CourseRow[]>(`/guilds/${guildId}/training/courses`) });
  const ranks = useQuery({ queryKey: ['ranks', guildId], queryFn: () => api<RankRow[]>(`/guilds/${guildId}/personnel-structure/ranks`) });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['quals', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [f, setF] = useState(empty);
  const [reqs, setReqs] = useState<RequirementRow[]>([]);
  const [newReq, setNewReq] = useState({ type: 'COURSE', value: '' });
  const [who, setWho] = useState<Record<string, string>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<{ id: string; data: QualificationCheck } | null>(null);
  const label = (r: RequirementRow) =>
    r.type === 'COURSE' ? `Ausbildung: ${courses.data?.find((c) => c.id === r.courseId)?.name ?? r.courseId}` : r.type === 'QUALIFICATION' ? `Qualifikation: ${list.data?.find((q) => q.id === r.qualificationId)?.name ?? r.qualificationId}` : r.type === 'RANK' ? `Mind. Dienstgrad: ${ranks.data?.find((x) => x.id === r.rankId)?.name ?? r.rankId}` : r.type === 'SERVICE_DAYS' ? `${r.days} Tage im Dienst` : `${r.hours} Dienststunden`;
  const addReq = () => {
    const v = newReq.value;
    if (!v) return;
    const r: RequirementRow = newReq.type === 'COURSE' ? { type: 'COURSE', courseId: v } : newReq.type === 'QUALIFICATION' ? { type: 'QUALIFICATION', qualificationId: v } : newReq.type === 'RANK' ? { type: 'RANK', rankId: v } : newReq.type === 'SERVICE_DAYS' ? { type: 'SERVICE_DAYS', days: Number(v) } : { type: 'SHIFT_HOURS', hours: Number(v) };
    setReqs([...reqs, r]);
    setNewReq({ ...newReq, value: '' });
  };
  const options = newReq.type === 'COURSE' ? courses.data?.map((c) => [c.id, c.name]) : newReq.type === 'QUALIFICATION' ? list.data?.filter((q) => q.id !== f.id).map((q) => [q.id, q.name]) : newReq.type === 'RANK' ? ranks.data?.map((r) => [r.id, r.name]) : null;
  return (
    <>
      <h1>Qualifikationen</h1>
      <QueryState query={list}>
        {(rows) => (
          <ul className="list">
            {rows.map((q) => (
              <li key={q.id} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <strong>{q.name}</strong> {!q.active && <em>(deaktiviert)</em>}{q.autoGrant && ' · automatisch'}{q.validDays ? ` · ${q.validDays} Tage gültig` : ''}
                  <br /><small className="muted">{q.requirements.map(label).join(' · ') || 'keine Voraussetzungen'}</small>
                  <br />
                  <input className="inline-input" placeholder="Discord-ID" value={who[q.id] ?? ''} onChange={(e) => setWho({ ...who, [q.id]: e.target.value })} />
                  <button className="btn" disabled={!(who[q.id] ?? '').trim()} onClick={() => api<QualificationCheck>(`${base}/${q.id}/check?userId=${who[q.id]!.trim()}`).then((d) => setCheck({ id: q.id, data: d })).catch((e) => toast.error(errorText(e)))}>Prüfen</button>
                  <button className="btn primary" disabled={!(who[q.id] ?? '').trim()} onClick={() => call.mutate({ method: 'POST', path: `/${q.id}/award`, body: { userId: who[q.id]!.trim(), override: (why[q.id] ?? '').trim().length > 0, reason: why[q.id] }, msg: 'Vergeben.' })}>Vergeben</button>
                  <input className="inline-input" placeholder="Begründung (nur für Ausnahme)" value={why[q.id] ?? ''} onChange={(e) => setWhy({ ...why, [q.id]: e.target.value })} />
                  {check?.id === q.id && (
                    <ul className="plain">{check.data.checks.map((c, i) => <li key={i}>{c.met ? '✅' : '❌'} {c.label} – {c.detail}</li>)}<li><strong>{check.data.eligible ? 'Voraussetzungen erfüllt' : 'Noch nicht erfüllt'}</strong></li></ul>
                  )}
                </span>
                <button className="btn" onClick={() => { setF({ ...empty, id: q.id, name: q.name, description: q.description ?? '', active: q.active, autoGrant: q.autoGrant, grantRoleId: q.grantRoleId ?? '', validDays: q.validDays ? String(q.validDays) : '' }); setReqs(q.requirements); }}>Bearbeiten</button>
                <button className="btn danger" onClick={() => confirm(`„${q.name}“ löschen?`) && call.mutate({ method: 'DELETE', path: `/${q.id}`, msg: 'Gelöscht.' })}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <h3>{f.id ? 'Qualifikation bearbeiten' : 'Qualifikation erstellen'}</h3>
        <div className="two">
          <label className="fld"><span>Name</span><input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="fld"><span>Rolle bei Vergabe</span>
            <select value={f.grantRoleId} onChange={(e) => setF({ ...f, grantRoleId: e.target.value })}>
              <option value="">Keine</option>
              {roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <label className="fld"><span>Beschreibung</span><input value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="two">
          <label className="fld"><span>Gültigkeit in Tagen (leer = unbegrenzt)</span><input type="number" min={1} value={f.validDays} onChange={(e) => setF({ ...f, validDays: e.target.value })} /></label>
          <span><label><input type="checkbox" checked={f.autoGrant} onChange={(e) => setF({ ...f, autoGrant: e.target.checked })} /> automatisch vergeben</label><br /><label><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> aktiv</label></span>
        </div>
        <strong>Voraussetzungen</strong>
        <ul className="plain">{reqs.map((r, i) => <li key={i}>{label(r)} <button className="btn" onClick={() => setReqs(reqs.filter((_, j) => j !== i))}>✕</button></li>)}{reqs.length === 0 && <li className="muted">keine</li>}</ul>
        <div className="actions">
          <select value={newReq.type} onChange={(e) => setNewReq({ type: e.target.value, value: '' })} aria-label="Art">
            <option value="COURSE">Ausbildung bestanden</option><option value="QUALIFICATION">Andere Qualifikation</option><option value="RANK">Mindest-Dienstgrad</option><option value="SERVICE_DAYS">Dienstzeit (Tage)</option><option value="SHIFT_HOURS">Dienststunden</option>
          </select>
          {options ? (
            <select value={newReq.value} onChange={(e) => setNewReq({ ...newReq, value: e.target.value })} aria-label="Wert"><option value="">Wählen …</option>{options.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          ) : (
            <input type="number" min={1} value={newReq.value} onChange={(e) => setNewReq({ ...newReq, value: e.target.value })} aria-label="Wert" />
          )}
          <button className="btn" onClick={addReq}>Hinzufügen</button>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: '', body: { id: f.id || undefined, name: f.name, description: f.description || undefined, active: f.active, autoGrant: f.autoGrant, grantRoleId: f.grantRoleId || undefined, validDays: f.validDays ? Number(f.validDays) : undefined, requirements: reqs }, msg: 'Gespeichert.' }, { onSuccess: () => { setF(empty); setReqs([]); } })}>Speichern</button>
          {f.id && <button className="btn" onClick={() => { setF(empty); setReqs([]); }}>Neu</button>}
        </div>
      </div>
    </>
  );
}
