import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type CourseRow, type QualificationRow, type SekConfigRow, type SekMemberRow, type SekSquadRow, type SekStats, type ShiftTypeRow, type TeamRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const DUTY = { ON: '🟢 im Dienst', PAUSED: '🟡 Pause', OFF: '⚫ nicht im Dienst' } as const;
const hrs = (s: number) => `${Math.floor(s / 3600)} Std ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} Min`;

/** SEK: Personal, Einsatzteams, Statistik und Konfiguration (verknüpft Team, Qualifikation, Shift-Typ und Ausbildungen). */
export function Sek() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/sek`;
  const cfg = useQuery({ queryKey: ['sek-config', guildId], queryFn: () => api<SekConfigRow | null>(`${base}/config`) });
  const members = useQuery({ queryKey: ['sek-members', guildId], enabled: !!cfg.data?.teamId, queryFn: () => api<SekMemberRow[]>(`${base}/members`) });
  const squads = useQuery({ queryKey: ['sek-squads', guildId], queryFn: () => api<SekSquadRow[]>(`${base}/squads`) });
  const stats = useQuery({ queryKey: ['sek-stats', guildId], enabled: !!cfg.data?.teamId, queryFn: () => api<SekStats>(`${base}/stats?period=month`) });
  const teams = useQuery({ queryKey: ['teams', guildId], queryFn: () => api<TeamRow[]>(`/guilds/${guildId}/personnel-structure/teams`) });
  const quals = useQuery({ queryKey: ['quals', guildId], queryFn: () => api<QualificationRow[]>(`/guilds/${guildId}/qualifications`) });
  const types = useQuery({ queryKey: ['shift-types', guildId], queryFn: () => api<ShiftTypeRow[]>(`/guilds/${guildId}/shifts/types`) });
  const courses = useQuery({ queryKey: ['courses', guildId], queryFn: () => api<CourseRow[]>(`/guilds/${guildId}/training/courses`) });
  const refresh = () => {
    for (const k of ['sek-config', 'sek-members', 'sek-squads', 'sek-stats']) void qc.invalidateQueries({ queryKey: [k, guildId] });
  };
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api<unknown>(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [c, setC] = useState<SekConfigRow | null>(null);
  const conf = c ?? cfg.data ?? { teamId: null, qualificationId: null, shiftTypeId: null, courseIds: [], applicationId: null };
  const [add, setAdd] = useState({ userId: '', reason: '', override: false });
  const [sq, setSq] = useState({ name: '', leaderId: '' });
  const [sm, setSm] = useState<Record<string, { userId: string; role: string }>>({});
  return (
    <>
      <h1>SEK</h1>
      <h2>Konfiguration</h2>
      <QueryState query={cfg}>
        {() => (
          <div className="card comp">
            <div className="two">
              <label className="fld"><span>SEK-Team (Personalverwaltung)</span><select value={conf.teamId ?? ''} onChange={(e) => setC({ ...conf, teamId: e.target.value || null })}><option value="">–</option>{teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="fld"><span>SEK-Qualifikation</span><select value={conf.qualificationId ?? ''} onChange={(e) => setC({ ...conf, qualificationId: e.target.value || null })}><option value="">–</option>{quals.data?.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
            </div>
            <div className="two">
              <label className="fld"><span>SEK-Shift-Typ</span><select value={conf.shiftTypeId ?? ''} onChange={(e) => setC({ ...conf, shiftTypeId: e.target.value || null })}><option value="">–</option>{types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="fld"><span>SEK-Ausbildungen</span><select multiple size={4} value={conf.courseIds} onChange={(e) => setC({ ...conf, courseIds: [...e.target.selectedOptions].map((o) => o.value) })}>{courses.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            </div>
            <button className="btn primary" onClick={() => call.mutate({ method: 'PUT', path: '/config', body: conf, msg: 'Konfiguration gespeichert.' })}>Speichern</button>
          </div>
        )}
      </QueryState>

      {cfg.data?.teamId && (
        <>
          <h2>Übersicht</h2>
          <QueryState query={stats}>
            {(s) => (
              <p>
                <strong>{s.members.total}</strong> Mitglieder · <strong>{s.members.qualified}</strong> qualifiziert · <strong>{s.members.onDuty}</strong> im Dienst · Einsätze: {Object.entries(s.operations).map(([k, v]) => `${k} ${v}`).join(', ') || '–'} · Ausbildungen: {s.trainings.passed} bestanden
                {s.shifts && s.shifts.leaderboard.length > 0 && <><br /><small>🏆 {s.shifts.leaderboard.map((e) => `${e.rank}. ${e.userId} ${hrs(e.totalSeconds)}`).join(' · ')}</small></>}
              </p>
            )}
          </QueryState>
          <h2>Personal</h2>
          <QueryState query={members}>
            {(rows) => (
              <ul className="list">
                {rows.map((m) => (
                  <li key={m.userId} className="row">
                    <span className="grow"><strong>{m.rpName}</strong> <code>{m.userId}</code> · {m.rank ?? '–'} · {DUTY[m.onDuty]}{!m.hasQualification && ' · ⚠️ Qualifikation fehlt'}{m.squads.length > 0 && ` · ${m.squads.join(', ')}`}</span>
                    <button className="btn danger" onClick={() => { const r = prompt('Grund für das Entfernen?'); if (r) call.mutate({ method: 'DELETE', path: `/members/${m.userId}?reason=${encodeURIComponent(r)}`, msg: 'Aus dem SEK entfernt.' }); }}>Entfernen</button>
                  </li>
                ))}
                {rows.length === 0 && <li className="muted">Keine Mitglieder.</li>}
              </ul>
            )}
          </QueryState>
          <div className="card comp">
            <h3>Mitglied aufnehmen</h3>
            <div className="two">
              <label className="fld"><span>Discord-ID</span><input value={add.userId} onChange={(e) => setAdd({ ...add, userId: e.target.value })} /></label>
              <label className="fld"><span>Begründung (nur für Ausnahme)</span><input value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></label>
            </div>
            <label><input type="checkbox" checked={add.override} onChange={(e) => setAdd({ ...add, override: e.target.checked })} /> Voraussetzungen übergehen</label>
            <div className="actions">
              <button className="btn primary" disabled={!add.userId.trim()} onClick={() => call.mutate({ method: 'POST', path: '/members', body: { userId: add.userId.trim(), override: add.override, reason: add.reason }, msg: 'Aufgenommen.' })}>Aufnehmen</button>
              <button className="btn" onClick={() => call.mutate({ method: 'POST', path: '/radio-sync', msg: 'Spezialfunk für das SEK synchronisiert.' })}>Spezialfunk synchronisieren</button>
            </div>
          </div>
          <h2>Einsatzteams</h2>
          <QueryState query={squads}>
            {(rows) => (
              <ul className="list">
                {rows.map((s) => (
                  <li key={s.id} className="row" style={{ alignItems: 'flex-start' }}>
                    <span className="grow">
                      <strong>{s.name}</strong> {!s.active && <em>(deaktiviert)</em>}
                      <br />{s.members.map((m) => <span key={m.userId} style={{ marginRight: 8 }}><code>{m.userId}</code> ({m.role}) <button className="btn" onClick={() => call.mutate({ method: 'DELETE', path: `/squads/${s.id}/members/${m.userId}`, msg: 'Entfernt.' })}>✕</button></span>)}
                      <br />
                      <input className="inline-input" placeholder="Discord-ID" value={sm[s.id]?.userId ?? ''} onChange={(e) => setSm({ ...sm, [s.id]: { userId: e.target.value, role: sm[s.id]?.role ?? '' } })} />
                      <input className="inline-input" placeholder="Funktion (z. B. Scharfschütze)" value={sm[s.id]?.role ?? ''} onChange={(e) => setSm({ ...sm, [s.id]: { userId: sm[s.id]?.userId ?? '', role: e.target.value } })} />
                      <button className="btn" disabled={!(sm[s.id]?.userId ?? '').trim()} onClick={() => call.mutate({ method: 'POST', path: `/squads/${s.id}/members`, body: { userId: sm[s.id]!.userId.trim(), role: sm[s.id]!.role }, msg: 'Eingetragen.' })}>Eintragen</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
          <div className="actions">
            <input className="inline-input" placeholder="Name (z. B. Alpha)" value={sq.name} onChange={(e) => setSq({ ...sq, name: e.target.value })} />
            <input className="inline-input" placeholder="Leiter (Discord-ID, optional)" value={sq.leaderId} onChange={(e) => setSq({ ...sq, leaderId: e.target.value })} />
            <button className="btn primary" disabled={!sq.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: '/squads', body: { name: sq.name, leaderId: sq.leaderId.trim() || undefined }, msg: 'Einsatzteam gespeichert.' }, { onSuccess: () => setSq({ name: '', leaderId: '' }) })}>Einsatzteam anlegen</button>
          </div>
        </>
      )}
    </>
  );
}
