import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DutyOverviewData, type VehicleRow, type VehicleStatusKey } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const STATUS: Record<VehicleStatusKey, string> = { AVAILABLE: '🟢 Verfügbar', IN_USE: '🔵 Im Dienst', MAINTENANCE: '🟠 Werkstatt', OUT_OF_SERVICE: '⚫ Außer Dienst' };
const SEV = { MINOR: 'Leicht', MAJOR: 'Schwer', TOTAL: 'Totalschaden' } as const;

/** Fuhrpark: Fahrzeuge anlegen, Status, Einheit/Fahrer, Schäden melden und reparieren, ausmustern. */
export function Fleet() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/fleet`;
  const list = useQuery({ queryKey: ['fleet', guildId], queryFn: () => api<VehicleRow[]>(base), refetchInterval: 20_000 });
  const duty = useQuery({ queryKey: ['duty', guildId], queryFn: () => api<DutyOverviewData>(`/guilds/${guildId}/duty`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['fleet', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [n, setN] = useState({ plate: '', type: '' });
  const [unit, setUnit] = useState<Record<string, string>>({});
  const [dmg, setDmg] = useState<Record<string, { description: string; severity: string }>>({});
  const callsign = (id: string | null) => duty.data?.units.find((u) => u.id === id)?.callsign;
  return (
    <>
      <h1>Fuhrpark</h1>
      <QueryState query={list}>
        {(rows) =>
          rows.length === 0 ? <p className="muted">Noch keine Fahrzeuge.</p> : (
            <ul className="list">
              {rows.map((v) => (
                <li key={v.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{v.plate}</strong> ({v.type}) · {STATUS[v.status]}
                    {v.unitId && <> · Einheit: {callsign(v.unitId) ?? '–'}</>}{v.driverId && <> · Fahrer: <code>{v.driverId}</code></>}
                    {v.damages.map((d) => (
                      <div key={d.id}><small>🔧 {SEV[d.severity]}: {d.description}</small> <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/damages/${d.id}/repair`, msg: 'Als repariert markiert.' })}>Repariert</button></div>
                    ))}
                    <div>
                      <select value={unit[v.id] ?? ''} onChange={(e) => setUnit({ ...unit, [v.id]: e.target.value })} aria-label="Einheit">
                        <option value="">Einheit wählen …</option>
                        {duty.data?.units.map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}
                      </select>
                      <button className="btn" disabled={!unit[v.id]} onClick={() => call.mutate({ method: 'POST', path: `/${v.id}/assign`, body: { unitId: unit[v.id] }, msg: 'Zugewiesen.' })}>Zuweisen</button>
                      {v.unitId && <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/${v.id}/release`, msg: 'Freigegeben.' })}>Freigeben</button>}
                      <select value={v.status} aria-label="Status" onChange={(e) => call.mutate({ method: 'POST', path: `/${v.id}/status`, body: { status: e.target.value }, msg: 'Status geändert.' })}>
                        {(Object.keys(STATUS) as VehicleStatusKey[]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                      </select>
                    </div>
                    <div>
                      <input className="inline-input" placeholder="Schaden beschreiben …" value={dmg[v.id]?.description ?? ''} onChange={(e) => setDmg({ ...dmg, [v.id]: { description: e.target.value, severity: dmg[v.id]?.severity ?? 'MINOR' } })} />
                      <select value={dmg[v.id]?.severity ?? 'MINOR'} onChange={(e) => setDmg({ ...dmg, [v.id]: { description: dmg[v.id]?.description ?? '', severity: e.target.value } })} aria-label="Schwere">
                        {Object.entries(SEV).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <button className="btn" disabled={(dmg[v.id]?.description ?? '').trim().length < 3} onClick={() => call.mutate({ method: 'POST', path: `/${v.id}/damages`, body: dmg[v.id], msg: 'Schaden gemeldet.' }, { onSuccess: () => setDmg({ ...dmg, [v.id]: { description: '', severity: 'MINOR' } }) })}>Melden</button>
                      <button className="btn danger" onClick={() => confirm(`${v.plate} ausmustern?`) && call.mutate({ method: 'DELETE', path: `/${v.id}`, msg: 'Ausgemustert.' })}>Ausmustern</button>
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <div className="card comp">
        <h3>Fahrzeug aufnehmen</h3>
        <div className="two">
          <label className="fld"><span>Kennzeichen</span><input value={n.plate} maxLength={15} onChange={(e) => setN({ ...n, plate: e.target.value })} /></label>
          <label className="fld"><span>Typ</span><input value={n.type} maxLength={60} placeholder="z. B. Streifenwagen" onChange={(e) => setN({ ...n, type: e.target.value })} /></label>
        </div>
        <button className="btn primary" disabled={!n.plate.trim() || !n.type.trim()} onClick={() => call.mutate({ method: 'POST', path: '', body: n, msg: 'Fahrzeug aufgenommen.' }, { onSuccess: () => setN({ plate: '', type: '' }) })}>Aufnehmen</button>
      </div>
    </>
  );
}
