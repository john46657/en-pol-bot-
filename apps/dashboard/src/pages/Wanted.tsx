import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type WantedRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const PRIO = { LOW: '⚪ Niedrig', NORMAL: '🔵 Normal', HIGH: '🟠 Hoch', URGENT: '🔴 Dringend' } as const;
const num = (n: number) => `F-${String(n).padStart(4, '0')}`;
const empty = { name: '', plate: '', reason: '', priority: 'NORMAL', appearance: '', vehicleModel: '', vehicleColor: '', ownerName: '', lastSeen: '' };

/** Fahndungen: Personen und Fahrzeuge in getrennten Reitern; suchen, anlegen, Letzten Standort ändern, aufheben. */
export function Wanted() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/wanted`;
  const [kind, setKind] = useState<'PERSON' | 'VEHICLE'>('PERSON');
  const [status, setStatus] = useState('ACTIVE');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const qs = new URLSearchParams({ kind, limit: '100', ...(status ? { status } : {}), ...(query ? { query } : {}) }).toString();
  const list = useQuery({ queryKey: ['wanted', guildId, qs], queryFn: () => api<{ items: WantedRow[] }>(`${base}?${qs}`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PATCH'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['wanted', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [f, setF] = useState(empty);
  const [revoke, setRevoke] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<Record<string, string>>({});
  const person = kind === 'PERSON';
  return (
    <>
      <h1>Fahndungen</h1>
      <div className="actions">
        <button className={`btn${person ? ' primary' : ''}`} onClick={() => setKind('PERSON')}>👤 Personen</button>
        <button className={`btn${!person ? ' primary' : ''}`} onClick={() => setKind('VEHICLE')}>🚗 Fahrzeuge</button>
      </div>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
        <input className="inline-input" placeholder={person ? 'Name, Nummer, Grund …' : 'Kennzeichen, Modell, Halter …'} value={input} onChange={(e) => setInput(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Aktiv</option><option value="REVOKED">Aufgehoben</option><option value="">Alle</option>
        </select>
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? <p className="muted">Keine Fahndungen gefunden.</p> : (
            <ul className="list">
              {d.items.map((n) => (
                <li key={n.id} className="row" style={{ opacity: n.status === 'REVOKED' ? 0.6 : 1 }}>
                  <span className="grow">
                    <strong>{num(n.number)} · {person ? n.subjectName : `${n.plate}${n.vehicleModel ? ` (${n.vehicleModel}${n.vehicleColor ? `, ${n.vehicleColor}` : ''})` : ''}`}</strong> · {PRIO[n.priority]}
                    {n.status === 'REVOKED' && <em> · aufgehoben: {n.revokeReason}</em>}
                    <br /><small className="muted">{n.reason}{n.appearance ? ` · ${n.appearance}` : ''}{n.ownerName ? ` · Halter: ${n.ownerName}` : ''}{n.lastSeen ? ` · zuletzt: ${n.lastSeen}` : ''}</small>
                    {n.status === 'ACTIVE' && (
                      <>
                        <br />
                        <input className="inline-input" placeholder="Zuletzt gesehen …" value={seen[n.id] ?? ''} onChange={(e) => setSeen({ ...seen, [n.id]: e.target.value })} />
                        <button className="btn" disabled={!(seen[n.id] ?? '').trim()} onClick={() => call.mutate({ method: 'PATCH', path: `/${n.id}`, body: { lastSeen: seen[n.id] }, msg: 'Aktualisiert.' })}>Speichern</button>
                        <input className="inline-input" placeholder="Grund zum Aufheben" value={revoke[n.id] ?? ''} onChange={(e) => setRevoke({ ...revoke, [n.id]: e.target.value })} />
                        <button className="btn danger" disabled={(revoke[n.id] ?? '').trim().length < 3} onClick={() => call.mutate({ method: 'POST', path: `/${n.id}/revoke`, body: { reason: revoke[n.id] }, msg: 'Fahndung aufgehoben.' })}>Aufheben</button>
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
        <h3>{person ? 'Personenfahndung erstellen' : 'Fahrzeugfahndung erstellen'}</h3>
        <div className="two">
          {person ? (
            <label className="fld"><span>Name</span><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          ) : (
            <label className="fld"><span>Kennzeichen</span><input value={f.plate} maxLength={15} onChange={(e) => setF({ ...f, plate: e.target.value })} /></label>
          )}
          <label className="fld"><span>Priorität</span>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
        </div>
        <label className="fld"><span>Fahndungsgrund</span><input value={f.reason} maxLength={500} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        {person ? (
          <label className="fld"><span>Beschreibung / Merkmale</span><input value={f.appearance} maxLength={500} onChange={(e) => setF({ ...f, appearance: e.target.value })} /></label>
        ) : (
          <div className="two">
            <label className="fld"><span>Modell</span><input value={f.vehicleModel} maxLength={60} onChange={(e) => setF({ ...f, vehicleModel: e.target.value })} /></label>
            <label className="fld"><span>Farbe</span><input value={f.vehicleColor} maxLength={30} onChange={(e) => setF({ ...f, vehicleColor: e.target.value })} /></label>
          </div>
        )}
        {!person && <label className="fld"><span>Halter</span><input value={f.ownerName} maxLength={80} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></label>}
        <label className="fld"><span>Zuletzt gesehen</span><input value={f.lastSeen} maxLength={150} onChange={(e) => setF({ ...f, lastSeen: e.target.value })} /></label>
        <button className="btn primary" disabled={call.isPending || f.reason.trim().length < 3 || !(person ? f.name.trim() : f.plate.trim())}
          onClick={() => call.mutate({ method: 'POST', path: person ? '/persons' : '/vehicles', body: person ? { subjectName: f.name, reason: f.reason, priority: f.priority, appearance: f.appearance, lastSeen: f.lastSeen } : { plate: f.plate, reason: f.reason, priority: f.priority, vehicleModel: f.vehicleModel, vehicleColor: f.vehicleColor, ownerName: f.ownerName, lastSeen: f.lastSeen }, msg: 'Fahndung erstellt.' }, { onSuccess: () => setF(empty) })}>Erstellen</button>
      </div>
    </>
  );
}
