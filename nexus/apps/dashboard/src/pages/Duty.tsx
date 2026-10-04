import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DutyOverviewData, type UnitRow, type UnitStatusKey } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const LABEL: Record<UnitStatusKey, string> = { AVAILABLE: 'Verfügbar', BUSY: 'Im Einsatz', BREAK: 'Pause', UNAVAILABLE: 'Nicht verfügbar' };
const ICON: Record<UnitStatusKey, string> = { AVAILABLE: '🟢', BUSY: '🔴', BREAK: '🟡', UNAVAILABLE: '⚫' };

/** Dienstübersicht: Einheiten mit Besetzung/Verfügbarkeit, Beamte ohne Einheit; Führung kann Status ändern, zuteilen, auflösen. */
export function Duty() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/duty`;
  const q = useQuery({ queryKey: ['duty', guildId], queryFn: () => api<DutyOverviewData>(base), refetchInterval: 15_000 });
  const [assign, setAssign] = useState<Record<string, string>>({});
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['duty', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const card = (u: UnitRow) => (
    <li key={u.id} className="row">
      <span className="grow">
        <strong>{ICON[u.availability]} {u.callsign}</strong> <small className="muted">({u.kind})</small> – {LABEL[u.availability]}
        {u.availability !== u.status && <small className="muted"> (gesetzt: {LABEL[u.status]})</small>}
        <br />
        <small className="muted">
          {u.staffing.active}/{u.staffing.total} einsatzbereit{u.vehicle ? ` · 🚓 ${u.vehicle}` : ''}{u.location ? ` · 📍 ${u.location}` : ''}{u.note ? ` · ${u.note}` : ''}
        </small>
        <br />
        {u.members.map((m) => (
          <span key={m.userId} style={{ marginRight: 8 }}>
            {m.role === 'LEADER' ? '⭐' : ''}<code>{m.userId}</code>{m.onBreak ? ' ☕' : ''}{' '}
            <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/units/${u.id}/remove`, body: { userId: m.userId }, msg: 'Entfernt.' })}>✕</button>
          </span>
        ))}
        <br />
        <input className="inline-input" placeholder="Discord-ID zuteilen" value={assign[u.id] ?? ''} onChange={(e) => setAssign({ ...assign, [u.id]: e.target.value })} />
        <button className="btn" disabled={!(assign[u.id] ?? '').trim()} onClick={() => call.mutate({ method: 'POST', path: `/units/${u.id}/assign`, body: { userId: assign[u.id]!.trim() }, msg: 'Zugeteilt.' })}>Zuteilen</button>
      </span>
      <select value={u.status} aria-label="Status" onChange={(e) => call.mutate({ method: 'PATCH', path: `/units/${u.id}`, body: { status: e.target.value }, msg: 'Status geändert.' })}>
        {(Object.keys(LABEL) as UnitStatusKey[]).map((k) => (
          <option key={k} value={k}>{LABEL[k]}</option>
        ))}
      </select>
      <button className="btn danger" onClick={() => confirm(`Einheit ${u.callsign} auflösen?`) && call.mutate({ method: 'DELETE', path: `/units/${u.id}`, msg: 'Aufgelöst.' })}>Auflösen</button>
    </li>
  );
  return (
    <>
      <h1>Dienst & Streifen</h1>
      <p className="muted">Einheiten bilden die Beamten im Bot mit <code>/streife</code>. Die Übersicht aktualisiert sich alle 15 Sekunden.</p>
      <QueryState query={q}>
        {(d) => (
          <>
            <p>
              <strong>{d.counts.onDuty}</strong> im Dienst · <strong>{d.counts.onBreak}</strong> Pause · {d.counts.units} Einheiten: 🟢 {d.counts.available} verfügbar · 🔴 {d.counts.busy} im Einsatz · ⚫ {d.counts.unavailable} nicht verfügbar
            </p>
            {d.units.length === 0 ? <p className="muted">Keine Einheiten im Dienst.</p> : <ul className="list">{d.units.map(card)}</ul>}
            <h2>Im Dienst ohne Einheit</h2>
            {d.unassigned.length === 0 ? (
              <p className="muted">Niemand.</p>
            ) : (
              <ul className="list">
                {d.unassigned.map((x) => (
                  <li key={x.userId} className="row">
                    <code>{x.userId}</code> · {x.type} · seit {new Date(x.since).toLocaleTimeString('de-DE')}{x.paused ? ' · ☕ Pause' : ''}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
