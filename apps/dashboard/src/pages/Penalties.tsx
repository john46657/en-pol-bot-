import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type PenaltyRegister, type PenaltyRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const KIND = { FINE: 'Bußgeld', WARNING: 'Verwarnung', POINTS: 'Strafpunkte', LICENSE_REVOCATION: 'Führerscheinentzug', VEHICLE_SEIZURE: 'Fahrzeugbeschlagnahmung' } as const;
const detail = (p: PenaltyRow) => (p.kind === 'FINE' ? `${p.amount} $` : p.kind === 'POINTS' ? `${p.points} Punkt(e)` : p.kind === 'LICENSE_REVOCATION' ? `${p.durationDays} Tage` : p.kind === 'VEHICLE_SEIZURE' ? p.plate : '');
const num = (n: number) => `S-${String(n).padStart(4, '0')}`;

/** Strafen: suchen, Strafenregister je Person, ausstellen, aufheben. */
export function Penalties() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/penalties`;
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const list = useQuery({ queryKey: ['penalties', guildId, query], queryFn: () => api<{ items: PenaltyRow[] }>(`${base}?limit=100${query ? `&query=${encodeURIComponent(query)}` : ''}`) });
  const [reg, setReg] = useState('');
  const register = useQuery({ queryKey: ['penalty-register', guildId, reg], enabled: reg.length > 0, queryFn: () => api<PenaltyRegister>(`${base}/register?name=${encodeURIComponent(reg)}`) });
  const call = useMutation({
    mutationFn: (v: { path: string; body: unknown; msg: string }) => api(`${base}${v.path}`, { method: 'POST', body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['penalties', guildId] });
      void qc.invalidateQueries({ queryKey: ['penalty-register', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [f, setF] = useState({ kind: 'FINE', subjectName: '', reason: '', amount: 100, points: 1, durationDays: 7, plate: '' });
  const [why, setWhy] = useState<Record<string, string>>({});
  const body = () => ({ kind: f.kind, subjectName: f.subjectName, reason: f.reason, ...(f.kind === 'FINE' ? { amount: f.amount } : {}), ...(f.kind === 'POINTS' ? { points: f.points } : {}), ...(f.kind === 'LICENSE_REVOCATION' ? { durationDays: f.durationDays } : {}), ...(f.kind === 'VEHICLE_SEIZURE' ? { plate: f.plate } : {}) });
  return (
    <>
      <h1>Strafen</h1>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
        <input className="inline-input" placeholder="Name, Nummer, Kennzeichen, Grund …" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? <p className="muted">Keine Strafen gefunden.</p> : (
            <ul className="list">
              {d.items.map((p) => (
                <li key={p.id} className="row" style={{ opacity: p.status === 'REVOKED' ? 0.6 : 1 }}>
                  <span className="grow">
                    <strong>{num(p.number)} · {KIND[p.kind]} {detail(p)}</strong> · <button className="btn" onClick={() => setReg(p.subjectName)}>{p.subjectName}</button>
                    {p.status === 'REVOKED' && <em> · aufgehoben: {p.revokeReason}</em>}
                    <br /><small className="muted">{p.reason} · von <code>{p.issuedBy}</code></small>
                    {p.status === 'ACTIVE' && (
                      <>
                        <br />
                        <input className="inline-input" placeholder="Grund zum Aufheben" value={why[p.id] ?? ''} onChange={(e) => setWhy({ ...why, [p.id]: e.target.value })} />
                        <button className="btn danger" disabled={(why[p.id] ?? '').trim().length < 3} onClick={() => call.mutate({ path: `/${p.id}/revoke`, body: { reason: why[p.id] }, msg: 'Strafe aufgehoben.' })}>Aufheben</button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {reg && (
        <QueryState query={register}>
          {(r) => (
            <div className="card comp">
              <h3>📒 Strafenregister – {r.subjectName}</h3>
              <p>Bußgelder: <strong>{r.finesTotal} $</strong> · Verwarnungen: <strong>{r.warnings}</strong> · Punkte: <strong>{r.points}</strong>{r.pointsLimitReached ? ' ⚠️ Grenze erreicht' : ''}<br />
                Führerschein: {r.licenseRevokedUntil ? `entzogen bis ${new Date(r.licenseRevokedUntil).toLocaleDateString('de-DE')}` : 'nicht entzogen'} · Beschlagnahmt: {r.seizedPlates.join(', ') || '–'}</p>
              <button className="btn" onClick={() => setReg('')}>Schließen</button>
            </div>
          )}
        </QueryState>
      )}
      <div className="card comp">
        <h3>Strafe ausstellen</h3>
        <div className="two">
          <label className="fld"><span>Art</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="fld"><span>Name der Person</span><input value={f.subjectName} maxLength={80} onChange={(e) => setF({ ...f, subjectName: e.target.value })} /></label>
        </div>
        {f.kind === 'FINE' && <label className="fld"><span>Betrag ($)</span><input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></label>}
        {f.kind === 'POINTS' && <label className="fld"><span>Strafpunkte</span><input type="number" min={1} max={20} value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} /></label>}
        {f.kind === 'LICENSE_REVOCATION' && <label className="fld"><span>Dauer (Tage)</span><input type="number" min={1} max={3650} value={f.durationDays} onChange={(e) => setF({ ...f, durationDays: Number(e.target.value) })} /></label>}
        {f.kind === 'VEHICLE_SEIZURE' && <label className="fld"><span>Kennzeichen</span><input value={f.plate} maxLength={15} onChange={(e) => setF({ ...f, plate: e.target.value })} /></label>}
        <label className="fld"><span>Grund</span><input value={f.reason} maxLength={500} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        <button className="btn primary" disabled={call.isPending || !f.subjectName.trim() || f.reason.trim().length < 3} onClick={() => call.mutate({ path: '', body: body(), msg: 'Strafe ausgestellt.' })}>Ausstellen</button>
      </div>
    </>
  );
}
