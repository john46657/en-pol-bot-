import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';
import { UserPicker } from '../components/UserPicker';

interface Row {
  id: string;
  number: number;
  type: 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN';
  userId: string;
  moderatorId: string;
  reason: string;
  durationMin: number | null;
  expiresAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'DONE';
  revokeReason: string | null;
  dmDelivered: boolean;
  createdAt: string;
}
const STATUS = { ACTIVE: '🔴 Aktiv', EXPIRED: '⚪ Abgelaufen', REVOKED: '🟢 Aufgehoben', DONE: '⚫ Erledigt' } as const;
const when = (d: string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const empty = { userId: '', type: 'WARN', reason: '', durationMin: '60', deleteDays: '0', banDays: '' };

/** Moderation: Verwarnungen, Timeouts, Kicks und Banns verhängen und aufheben; jeder Fall ist nummeriert und protokolliert. */
export function Moderation() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/moderation`;
  const [status, setStatus] = useState('ACTIVE');
  const [type, setType] = useState('');
  const [user, setUser] = useState('');
  const [f, setF] = useState(empty);
  const [revoke, setRevoke] = useState<Record<string, string>>({});
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(type ? { type } : {}), ...(/^\d{5,25}$/.test(user.trim()) ? { userId: user.trim() } : {}) }).toString();
  const types = useQuery({ queryKey: ['moderation-types', guildId], queryFn: () => api<{ type: string; label: string }[]>(`${base}/types`) });
  const list = useQuery({ queryKey: ['moderation', guildId, qs], queryFn: () => api<Row[]>(`${base}/cases?${qs}`) });
  const label = (t: string) => types.data?.find((x) => x.type === t)?.label ?? t;
  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['moderation', guildId] });
  };
  const create = useMutation({
    mutationFn: () =>
      api<Row>(`${base}/cases`, {
        method: 'POST',
        body: { userId: f.userId.trim(), type: f.type, reason: f.reason, ...(f.type === 'TIMEOUT' ? { durationMin: Number(f.durationMin) } : {}), ...(f.type === 'BAN' ? { deleteDays: Number(f.deleteDays), ...(f.banDays ? { durationMin: Number(f.banDays) * 1440 } : {}) } : {}) },
      }),
    onSuccess: (c) => {
      done(`${label(c.type)} verhängt (Fall #${c.number})${c.dmDelivered ? '.' : ' – der Benutzer konnte nicht per DM informiert werden.'}`);
      setF(empty);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const lift = useMutation({
    mutationFn: (id: string) => api(`${base}/cases/${id}/revoke`, { method: 'POST', body: { reason: revoke[id] } }),
    onSuccess: () => done('Maßnahme aufgehoben.'),
    onError: (e) => toast.error(errorText(e)),
  });
  const valid = /^\d{5,25}$/.test(f.userId.trim()) && f.reason.trim().length >= 3 && (f.type !== 'TIMEOUT' || Number(f.durationMin) >= 1);
  return (
    <>
      <h1>Moderation</h1>
      <p className="muted">Verwarnen, stummschalten, entfernen und bannen. Du kannst nur Mitglieder moderieren, deren höchste Rolle unter deiner liegt; Serverbesitzer, Bot und du selbst sind ausgenommen. Jeder Fall wird im Audit-Log festgehalten.</p>
      <div className="actions">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Aktiv</option>
          <option value="EXPIRED">Abgelaufen</option>
          <option value="REVOKED">Aufgehoben</option>
          <option value="DONE">Erledigt (Kicks)</option>
          <option value="">Alle</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Maßnahme">
          <option value="">Alle Maßnahmen</option>
          {types.data?.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        <UserPicker inline label="Nur Fälle von" placeholder="Nur Fälle von …" value={user} onChange={setUser} />
      </div>
      <QueryState query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="muted">Keine Fälle gefunden.</p>
          ) : (
            <ul className="list" aria-label="Moderationsfälle">
              {rows.map((r) => (
                <li key={r.id} className="row" style={{ opacity: r.status === 'ACTIVE' || r.status === 'DONE' ? 1 : 0.6 }}>
                  <span className="grow">
                    <strong>#{r.number} {label(r.type)}</strong> · <UserName id={r.userId} /> · {STATUS[r.status]}
                    <br />
                    <small className="muted">
                      {r.reason} · {when(r.createdAt)} · von <UserName id={r.moderatorId} />
                      {r.durationMin ? ` · ${r.type === 'BAN' ? `${Math.round(r.durationMin / 1440)} Tage` : `${r.durationMin} Min.`}${r.expiresAt ? ` (bis ${when(r.expiresAt)})` : ''}` : ''}
                      {r.dmDelivered ? '' : ' · keine DM zugestellt'}
                      {r.revokeReason ? ` · aufgehoben: ${r.revokeReason}` : ''}
                    </small>
                    {r.status === 'ACTIVE' && (
                      <>
                        <br />
                        <input className="inline-input" placeholder="Grund zum Aufheben" aria-label={`Grund zum Aufheben von Fall ${r.number}`} value={revoke[r.id] ?? ''} onChange={(e) => setRevoke({ ...revoke, [r.id]: e.target.value })} />
                        <button className="btn danger" disabled={(revoke[r.id] ?? '').trim().length < 3 || lift.isPending} onClick={() => lift.mutate(r.id)}>Aufheben</button>
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
        <h3>Maßnahme verhängen</h3>
        <div className="two">
          <div className="fld"><span>Betroffene Person</span><UserPicker label="Betroffene Person" value={f.userId} onChange={(id) => setF((x) => ({ ...x, userId: id }))} /></div>
          <label className="fld"><span>Maßnahme</span>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {types.data?.map((t) => (<option key={t.type} value={t.type}>{t.label}</option>))}
            </select>
          </label>
        </div>
        <label className="fld"><span>Grund (Pflicht)</span><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        {f.type === 'TIMEOUT' && (
          <label className="fld"><span>Dauer in Minuten (1 bis 40320 = 28 Tage)</span><input type="number" min={1} max={40320} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} /></label>
        )}
        {f.type === 'BAN' && (
          <>
            <label className="fld"><span>Nachrichten der letzten Tage löschen (0–7)</span><input type="number" min={0} max={7} value={f.deleteDays} onChange={(e) => setF({ ...f, deleteDays: e.target.value })} /></label>
            <label className="fld"><span>Befristet: Dauer in Tagen (leer = dauerhaft)</span><input type="number" min={1} max={365} value={f.banDays} onChange={(e) => setF({ ...f, banDays: e.target.value })} /></label>
          </>
        )}
        <button
          className="btn primary"
          disabled={create.isPending || !valid}
          onClick={() => (f.type === 'KICK' || f.type === 'BAN' ? window.confirm(`${label(f.type)} für ${f.userId.trim()} wirklich verhängen?`) : true) && create.mutate()}
        >
          {label(f.type)} verhängen
        </button>
      </div>
    </>
  );
}
