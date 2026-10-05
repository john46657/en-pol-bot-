import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type CourseRow, type DiscordRole, type TrainingRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';

const STATUS = { PLANNED: '🗓️ Geplant', RUNNING: '▶️ Läuft', FINISHED: '✅ Beendet', CANCELLED: '❌ Abgesagt' } as const;
const PART = { THEORY: 'Theorie', PRACTICE: 'Praxis', EXAM: 'Prüfung' } as const;
const emptyCourse = { id: '', name: '', description: '', theoryMax: 50, practiceMax: 30, examMax: 20, passPercent: 60, grantRoleId: '', maxParticipants: 10, active: true };

/** Ausbildung: Ausbildungen (Vorlagen), Termine, Ausbilder, Teilnehmer bewerten. */
export function Training() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/training`;
  const courses = useQuery({ queryKey: ['courses', guildId], queryFn: () => api<CourseRow[]>(`${base}/courses`) });
  const trainings = useQuery({ queryKey: ['trainings', guildId], queryFn: () => api<TrainingRow[]>(`${base}?limit=50`), refetchInterval: 20_000 });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['courses', guildId] });
      void qc.invalidateQueries({ queryKey: ['trainings', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [c, setC] = useState(emptyCourse);
  const [t, setT] = useState({ courseId: '', scheduledAt: '', location: '', trainer: '' });
  const [pts, setPts] = useState<Record<string, string>>({});
  const [add, setAdd] = useState<Record<string, string>>({});
  const [cancelWhy, setCancelWhy] = useState<Record<string, string>>({});
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name ?? id;
  return (
    <>
      <h1>Ausbildung</h1>
      <h2>Termine</h2>
      <QueryState query={trainings}>
        {(rows) =>
          rows.length === 0 ? <p className="muted">Keine Termine.</p> : (
            <ul className="list">
              {rows.map((x) => (
                <li key={x.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>T-{String(x.number).padStart(4, '0')} · {x.course.name}</strong> · {STATUS[x.status]} · {new Date(x.scheduledAt).toLocaleString('de-DE')}{x.location ? ` · ${x.location}` : ''}
                    <br /><small className="muted">Ausbilder: {x.trainerIds.length ? x.trainerIds.map((u, i) => <span key={u}>{i > 0 ? ', ' : ''}<UserName id={u} /></span>) : '–'} · Plätze {x.participants.filter((p) => ['ENROLLED', 'PASSED', 'FAILED'].includes(p.status)).length}/{x.maxParticipants}</small>
                    <ul className="plain">
                      {x.participants.filter((p) => ['ENROLLED', 'PASSED', 'FAILED'].includes(p.status)).map((p) => (
                        <li key={p.id}>
                          <UserName id={p.userId} /> {p.status === 'PASSED' ? `✅ ${p.percent} %` : p.status === 'FAILED' ? `❌ ${p.percent} %` : ''}{p.roleResult?.endsWith('failed') ? ' ⚠️ Rolle fehlgeschlagen' : ''}
                          {' · '}T {p.theoryPoints ?? '–'}/{x.course.theoryMax} · P {p.practicePoints ?? '–'}/{x.course.practiceMax} · Prüf. {p.examPoints ?? '–'}/{x.course.examMax}
                          {x.status === 'RUNNING' && (['THEORY', 'PRACTICE', 'EXAM'] as const).filter((k) => ({ THEORY: x.course.theoryMax, PRACTICE: x.course.practiceMax, EXAM: x.course.examMax })[k] > 0).map((k) => (
                            <span key={k}> <input type="number" min={0} style={{ width: 60 }} placeholder={PART[k]} value={pts[`${p.id}${k}`] ?? ''} onChange={(e) => setPts({ ...pts, [`${p.id}${k}`]: e.target.value })} aria-label={PART[k]} />
                              <button className="btn" disabled={(pts[`${p.id}${k}`] ?? '') === ''} onClick={() => call.mutate({ method: 'POST', path: `/${x.id}/grade`, body: { userId: p.userId, part: k, points: Number(pts[`${p.id}${k}`]) }, msg: `${PART[k]} bewertet.` })}>{PART[k][0]}✔</button></span>
                          ))}
                        </li>
                      ))}
                    </ul>
                    {x.status === 'PLANNED' && (
                      <>
                        <input className="inline-input" placeholder="Discord-ID anmelden" value={add[x.id] ?? ''} onChange={(e) => setAdd({ ...add, [x.id]: e.target.value })} />
                        <button className="btn" disabled={!(add[x.id] ?? '').trim()} onClick={() => call.mutate({ method: 'POST', path: `/${x.id}/enroll`, body: { userId: add[x.id]!.trim() }, msg: 'Angemeldet.' })}>Anmelden</button>
                        <button className="btn primary" onClick={() => call.mutate({ method: 'POST', path: `/${x.id}/start`, msg: 'Termin gestartet.' })}>Starten</button>
                      </>
                    )}
                    {x.status === 'RUNNING' && <button className="btn primary" onClick={() => call.mutate({ method: 'POST', path: `/${x.id}/finish`, msg: 'Termin beendet.' })}>Beenden</button>}
                    {(x.status === 'PLANNED' || x.status === 'RUNNING') && (
                      <>
                        <input className="inline-input" placeholder="Grund zum Absagen" value={cancelWhy[x.id] ?? ''} onChange={(e) => setCancelWhy({ ...cancelWhy, [x.id]: e.target.value })} />
                        <button className="btn danger" disabled={(cancelWhy[x.id] ?? '').trim().length < 3} onClick={() => call.mutate({ method: 'POST', path: `/${x.id}/cancel`, body: { reason: cancelWhy[x.id] }, msg: 'Abgesagt.' })}>Absagen</button>
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
        <h3>Termin anlegen</h3>
        <div className="two">
          <label className="fld"><span>Ausbildung</span>
            <select value={t.courseId} onChange={(e) => setT({ ...t, courseId: e.target.value })}>
              <option value="">Wählen …</option>
              {courses.data?.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>Termin</span><input type="datetime-local" value={t.scheduledAt} onChange={(e) => setT({ ...t, scheduledAt: e.target.value })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Ort</span><input value={t.location} maxLength={100} onChange={(e) => setT({ ...t, location: e.target.value })} /></label>
          <label className="fld"><span>Ausbilder (Discord-ID)</span><input value={t.trainer} onChange={(e) => setT({ ...t, trainer: e.target.value })} /></label>
        </div>
        <button className="btn primary" disabled={!t.courseId || !t.scheduledAt} onClick={() => call.mutate({ method: 'POST', path: '', body: { courseId: t.courseId, scheduledAt: new Date(t.scheduledAt).toISOString(), location: t.location, trainerIds: t.trainer.trim() ? [t.trainer.trim()] : [] }, msg: 'Termin angelegt.' })}>Anlegen</button>
      </div>

      <h2>Ausbildungen</h2>
      <QueryState query={courses}>
        {(rows) => (
          <ul className="list">
            {rows.map((x) => (
              <li key={x.id} className="row">
                <span className="grow"><strong>{x.name}</strong> {!x.active && <em>(deaktiviert)</em>}<br /><small className="muted">Theorie {x.theoryMax} · Praxis {x.practiceMax} · Prüfung {x.examMax} · bestanden ab {x.passPercent} % · Rolle: {x.grantRoleId ? roleName(x.grantRoleId) : '–'} · max. {x.maxParticipants}</small></span>
                <button className="btn" onClick={() => setC({ ...emptyCourse, ...x, description: x.description ?? '', grantRoleId: x.grantRoleId ?? '' })}>Bearbeiten</button>
                <button className="btn danger" onClick={() => confirm(`„${x.name}“ löschen?`) && call.mutate({ method: 'DELETE', path: `/courses/${x.id}`, msg: 'Gelöscht.' })}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <h3>{c.id ? 'Ausbildung bearbeiten' : 'Ausbildung erstellen'}</h3>
        <div className="two">
          <label className="fld"><span>Name</span><input value={c.name} maxLength={60} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
          <label className="fld"><span>Rolle bei Bestehen</span>
            <select value={c.grantRoleId} onChange={(e) => setC({ ...c, grantRoleId: e.target.value })}>
              <option value="">Keine</option>
              {roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="fld"><span>Theorie (max. Punkte)</span><input type="number" min={0} value={c.theoryMax} onChange={(e) => setC({ ...c, theoryMax: Number(e.target.value) })} /></label>
          <label className="fld"><span>Praxis (max. Punkte)</span><input type="number" min={0} value={c.practiceMax} onChange={(e) => setC({ ...c, practiceMax: Number(e.target.value) })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Prüfung (max. Punkte)</span><input type="number" min={0} value={c.examMax} onChange={(e) => setC({ ...c, examMax: Number(e.target.value) })} /></label>
          <label className="fld"><span>Bestehensgrenze (%)</span><input type="number" min={1} max={100} value={c.passPercent} onChange={(e) => setC({ ...c, passPercent: Number(e.target.value) })} /></label>
        </div>
        <label className="fld"><span>Max. Teilnehmer</span><input type="number" min={1} value={c.maxParticipants} onChange={(e) => setC({ ...c, maxParticipants: Number(e.target.value) })} /></label>
        <label><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> aktiv</label>
        <div className="actions">
          <button className="btn primary" disabled={!c.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: '/courses', body: { ...c, id: c.id || undefined, grantRoleId: c.grantRoleId || undefined, description: c.description || undefined }, msg: 'Gespeichert.' }, { onSuccess: () => setC(emptyCourse) })}>Speichern</button>
          {c.id && <button className="btn" onClick={() => setC(emptyCourse)}>Neu</button>}
        </div>
      </div>
    </>
  );
}
