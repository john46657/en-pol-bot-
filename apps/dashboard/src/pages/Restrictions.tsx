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
  userId: string;
  type: string;
  reason: string;
  note: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  revokeReason: string | null;
}
const STATUS = { ACTIVE: '🔴 Aktiv', EXPIRED: '⚪ Abgelaufen', REVOKED: '🟢 Aufgehoben' } as const;
const when = (d: string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const empty = { userId: '', type: 'APPLICATION', reason: '', note: '', startsAt: '', endsAt: '' };

/** Sperren: Bewerbungs-, Ticket-, Fraktions- und Funksperren verhängen, befristen und aufheben. */
export function Restrictions() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/restrictions`;
  const [status, setStatus] = useState('ACTIVE');
  const [type, setType] = useState('');
  const [f, setF] = useState(empty);
  const [revoke, setRevoke] = useState<Record<string, string>>({});
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(type ? { type } : {}) }).toString();
  const types = useQuery({ queryKey: ['restriction-types', guildId], queryFn: () => api<{ type: string; label: string }[]>(`${base}/types`) });
  const list = useQuery({ queryKey: ['restrictions', guildId, qs], queryFn: () => api<Row[]>(`${base}?${qs}`) });
  const label = (t: string) => types.data?.find((x) => x.type === t)?.label ?? t;
  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['restrictions', guildId] });
  };
  const create = useMutation({
    mutationFn: () => api(base, { method: 'POST', body: { userId: f.userId.trim(), type: f.type, reason: f.reason, note: f.note, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : '', endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : '' } }),
    onSuccess: () => {
      done('Sperre verhängt.');
      setF(empty);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const lift = useMutation({
    mutationFn: (id: string) => api(`${base}/${id}/revoke`, { method: 'POST', body: { reason: revoke[id] } }),
    onSuccess: () => done('Sperre aufgehoben.'),
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Sperren</h1>
      <div className="actions">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Aktiv</option>
          <option value="EXPIRED">Abgelaufen</option>
          <option value="REVOKED">Aufgehoben</option>
          <option value="">Alle</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Art">
          <option value="">Alle Arten</option>
          {types.data?.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
      </div>
      <QueryState query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="muted">Keine Sperren gefunden.</p>
          ) : (
            <ul className="list" aria-label="Sperren">
              {rows.map((r) => (
                <li key={r.id} className="row" style={{ opacity: r.status === 'ACTIVE' ? 1 : 0.6 }}>
                  <span className="grow">
                    <strong>{label(r.type)}</strong> · <UserName id={r.userId} /> · {STATUS[r.status]}
                    <br />
                    <small className="muted">
                      {r.reason} · {when(r.startsAt)} bis {r.endsAt ? when(r.endsAt) : 'unbefristet'}
                      {r.note ? ` · Notiz: ${r.note}` : ''}
                      {r.revokeReason ? ` · aufgehoben: ${r.revokeReason}` : ''}
                    </small>
                    {r.status === 'ACTIVE' && (
                      <>
                        <br />
                        <input className="inline-input" placeholder="Grund zum Aufheben" value={revoke[r.id] ?? ''} onChange={(e) => setRevoke({ ...revoke, [r.id]: e.target.value })} />
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
        <h3>Sperre verhängen</h3>
        <div className="two">
          <div className="fld"><span>Betroffene Person</span><UserPicker label="Betroffene Person" value={f.userId} onChange={(id) => setF((x) => ({ ...x, userId: id }))} /></div>
          <label className="fld"><span>Art der Sperre</span>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {types.data?.map((t) => (<option key={t.type} value={t.type}>{t.label}</option>))}
            </select>
          </label>
        </div>
        <label className="fld"><span>Grund</span><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        <div className="two">
          <label className="fld"><span>Start (leer = sofort)</span><input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
          <label className="fld"><span>Ende (leer = unbefristet)</span><input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
        </div>
        <label className="fld"><span>Interne Notiz</span><input value={f.note} maxLength={1000} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button className="btn primary" disabled={create.isPending || !/^\d{5,25}$/.test(f.userId.trim()) || f.reason.trim().length < 3} onClick={() => create.mutate()}>Sperre verhängen</button>
      </div>
    </>
  );
}
