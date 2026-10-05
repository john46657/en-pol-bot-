import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DiscordRole, type LeaderboardRow, type ShiftPeriodRow, type ShiftRow, type ShiftStatsRow, type ShiftTypeRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';

const fmtDur = (s: number | null) => {
  if (s === null) return '–';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} Std ${String(m).padStart(2, '0')} Min`;
};
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString('de-DE') : '–');
/** `datetime-local` erwartet lokale Zeit ohne Zone. */
const toLocalInput = (v: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const STATUS = { ACTIVE: '🟢 im Dienst', PAUSED: '⏸️ Pause', ENDED: 'beendet' } as const;

/** Schichten: Verlauf, Statistik, Beenden/Korrigieren (mit Begründung), Rohdaten-Export, Typen. */
export function Shifts() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/shifts`;
  const [status, setStatus] = useState('');
  const [typeId, setTypeId] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const qs = new URLSearchParams({
    limit: '100',
    ...(status ? { status } : {}),
    ...(typeId ? { typeId } : {}),
    ...(/^\d{5,25}$/.test(userId.trim()) ? { userId: userId.trim() } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  }).toString();
  const list = useQuery({ queryKey: ['shifts', guildId, qs], queryFn: () => api<{ items: ShiftRow[] }>(`${base}?${qs}`) });
  const stats = useQuery({ queryKey: ['shift-stats', guildId, qs], queryFn: () => api<ShiftStatsRow>(`${base}/stats?${qs}`) });
  const [period, setPeriod] = useState('week');
  const overview = useQuery({ queryKey: ['shift-overview', guildId], queryFn: () => api<ShiftPeriodRow[]>(`${base}/overview`) });
  const board = useQuery({ queryKey: ['shift-board', guildId, period], queryFn: () => api<{ items: LeaderboardRow[] }>(`${base}/leaderboard?period=${period}&limit=10`) });
  const types = useQuery({ queryKey: ['shift-types', guildId], queryFn: () => api<ShiftTypeRow[]>(`${base}/types`) });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const refresh = () => {
    for (const k of ['shifts', 'shift-stats', 'shift-types', 'shift-overview', 'shift-board']) void qc.invalidateQueries({ queryKey: [k, guildId] });
  };

  const [edit, setEdit] = useState<{ shift: ShiftRow; mode: 'end' | 'correct' } | null>(null);
  const [reason, setReason] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [pausedMin, setPausedMin] = useState(0);
  const open = (shift: ShiftRow, mode: 'end' | 'correct') => {
    setEdit({ shift, mode });
    setReason('');
    setStartedAt(toLocalInput(shift.startedAt));
    setEndedAt(mode === 'correct' ? toLocalInput(shift.endedAt) : '');
    setPausedMin(Math.round(shift.pausedSeconds / 60));
  };
  const act = useMutation({
    mutationFn: () => {
      const s = edit!.shift;
      return edit!.mode === 'end'
        ? api(`${base}/${s.id}/end`, { method: 'POST', body: { reason, ...(endedAt ? { endedAt: new Date(endedAt).toISOString() } : {}) } })
        : api(`${base}/${s.id}/correct`, { method: 'POST', body: { reason, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), pausedSeconds: pausedMin * 60 } });
    },
    onSuccess: () => {
      toast.success('Gespeichert (mit Begründung protokolliert).');
      setEdit(null);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const exportCsv = useMutation({
    mutationFn: () => api<{ csv: string }>(`${base}/export?${qs}`),
    onSuccess: ({ csv }) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schichten.csv';
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const [t, setT] = useState({ name: '', emoji: '', maxDurationMinutes: 480, requiredRoleIds: [] as string[] });
  const typeCall = useMutation({
    mutationFn: (v: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? id;

  return (
    <>
      <h1>Schichten</h1>
      <p className="muted">Gestartet und beendet wird im Bot mit <code>/schicht</code>. Hier siehst du den Verlauf und kannst vergessene Schichten mit Begründung korrigieren.</p>

      <h2>Auswertung</h2>
      <QueryState query={overview}>
        {(rows) => (
          <div className="two">
            {rows.map((p) => (
              <div key={p.period} className="card comp">
                <strong>{{ day: 'Heute', week: 'Diese Woche', month: 'Dieser Monat', all: 'Gesamt' }[p.period]}</strong>
                <div>{fmtDur(p.totalSeconds)}</div>
                <small className="muted">{p.count} Schichten · Ø {fmtDur(p.averageSeconds)}</small>
              </div>
            ))}
          </div>
        )}
      </QueryState>
      <h3>🏆 Rangliste</h3>
      <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Zeitraum">
        <option value="day">Heute</option>
        <option value="week">Diese Woche</option>
        <option value="month">Dieser Monat</option>
        <option value="all">Gesamt</option>
      </select>
      <QueryState query={board}>
        {(d) =>
          d.items.length === 0 ? (
            <p className="muted">Noch keine beendeten Schichten in diesem Zeitraum.</p>
          ) : (
            <ol className="list">
              {d.items.map((e) => (
                <li key={e.userId} className="row">
                  <span className="grow"><strong>{e.rank}.</strong> <UserName id={e.userId} /></span>
                  <span>{fmtDur(e.totalSeconds)} · {e.count} Schichten · Ø {fmtDur(e.averageSeconds)}</span>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>

      <h2>Verlauf</h2>
      <form className="actions" onSubmit={(e) => e.preventDefault()}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle Status</option>
          <option value="ACTIVE">Im Dienst</option>
          <option value="PAUSED">Pause</option>
          <option value="ENDED">Beendet</option>
        </select>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Typ">
          <option value="">Alle Typen</option>
          {types.data?.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <input className="inline-input" placeholder="Discord-ID des Mitglieds" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Von" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bis" />
        <button type="button" className="btn" onClick={() => exportCsv.mutate()}>CSV-Export</button>
      </form>

      <QueryState query={stats}>
        {(s) => (
          <p>
            <strong>{s.count}</strong> beendete Schichten · gesamt <strong>{fmtDur(s.totalSeconds)}</strong> · Ø <strong>{fmtDur(s.averageSeconds)}</strong> · aktuell im Dienst: <strong>{s.running}</strong>
          </p>
        )}
      </QueryState>

      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? (
            <p className="muted">Keine Schichten gefunden.</p>
          ) : (
            <ul className="list">
              {d.items.map((s) => (
                <li key={s.id} className="row">
                  <span className="grow">
                    <strong>{s.type.emoji} {s.type.name}</strong> · <UserName id={s.userId} /> · {STATUS[s.status]}
                    {s.flaggedLongAt && s.status !== 'ENDED' ? ' · ⏰ ungewöhnlich lang' : ''}
                    {s.endReason === 'corrected' ? ' · korrigiert' : s.endReason === 'supervisor' ? ' · durch Führung beendet' : ''}
                    <br />
                    <small className="muted">{fmtDate(s.startedAt)} → {fmtDate(s.endedAt)} · netto {fmtDur(s.durationSeconds)}</small>
                  </span>
                  {s.status !== 'ENDED' ? (
                    <button className="btn" onClick={() => open(s, 'end')}>Beenden</button>
                  ) : (
                    <button className="btn" onClick={() => open(s, 'correct')}>Korrigieren</button>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      {edit && (
        <div className="card comp">
          <h3>{edit.mode === 'end' ? 'Schicht beenden' : 'Schicht korrigieren'}</h3>
          {edit.mode === 'correct' && (
            <div className="two">
              <label className="fld"><span>Beginn</span><input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></label>
              <label className="fld"><span>Pausen (Minuten)</span><input type="number" min={0} value={pausedMin} onChange={(e) => setPausedMin(Number(e.target.value))} /></label>
            </div>
          )}
          <label className="fld">
            <span>{edit.mode === 'end' ? 'Tatsächliches Ende (leer = jetzt)' : 'Ende'}</span>
            <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </label>
          <label className="fld">
            <span>Begründung (Pflicht, wird protokolliert)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </label>
          <div className="actions">
            <button className="btn primary" disabled={act.isPending || reason.trim().length < 3} onClick={() => act.mutate()}>Speichern</button>
            <button className="btn" onClick={() => setEdit(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      <h2>Shift-Typen</h2>
      <QueryState query={types}>
        {(rows) => (
          <ul className="list">
            {rows.map((x) => (
              <li key={x.id} className="row">
                <span className="grow">
                  <strong>{x.emoji} {x.name}</strong> {!x.active && <em>(deaktiviert)</em>}
                  <br />
                  <small className="muted">
                    max. {x.maxDurationMinutes} Min · {x.requiredRoleIds.length ? `Rolle: ${x.requiredRoleIds.map(roleName).join(', ')}` : 'keine Rollenanforderung'}
                  </small>
                </span>
                <button className="btn" onClick={() => typeCall.mutate({ method: 'PATCH', path: `/types/${x.id}`, body: { ...x, active: !x.active }, msg: x.active ? 'Deaktiviert.' : 'Aktiviert.' })}>
                  {x.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button className="btn danger" onClick={() => confirm(`„${x.name}“ löschen?`) && typeCall.mutate({ method: 'DELETE', path: `/types/${x.id}`, msg: 'Gelöscht.' })}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <div className="two">
          <label className="fld"><span>Name</span><input value={t.name} maxLength={50} onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
          <label className="fld"><span>Emoji</span><input value={t.emoji} maxLength={8} onChange={(e) => setT({ ...t, emoji: e.target.value })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Höchstdauer (Minuten, danach Hinweis)</span><input type="number" min={10} value={t.maxDurationMinutes} onChange={(e) => setT({ ...t, maxDurationMinutes: Number(e.target.value) })} /></label>
          <label className="fld">
            <span>Benötigte Rolle (optional)</span>
            <select value={t.requiredRoleIds[0] ?? ''} onChange={(e) => setT({ ...t, requiredRoleIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">Keine Anforderung</option>
              {(roles.data ?? []).filter((r) => r.blockedReason !== 'everyone').map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary" disabled={!t.name.trim() || typeCall.isPending} onClick={() => typeCall.mutate({ method: 'POST', path: '/types', body: t, msg: 'Typ angelegt.' })}>Typ anlegen</button>
      </div>
    </>
  );
}
