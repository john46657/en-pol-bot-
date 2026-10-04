import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DangerCurrent, type DangerLevelRow, type DiscordRole } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

/** Gefahrenstatus: aktuelle Stufe, Stufe setzen (mit Grund), Stufen konfigurieren (Name, Farbe, Emoji, Beschreibung, berechtigte Rollen). */
export function Danger() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/danger`;
  const cur = useQuery({ queryKey: ['danger', guildId], queryFn: () => api<DangerCurrent>(base), refetchInterval: 15_000 });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['danger', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<(DangerLevelRow & { isNew?: boolean }) | null>(null);
  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? id;
  return (
    <>
      <h1>Gefahrenstatus</h1>
      <QueryState query={cur}>
        {(d) => (
          <>
            <div className="card comp" style={{ borderLeft: `6px solid ${d.level.color}` }}>
              <h2 style={{ margin: 0 }}>{d.level.emoji} Stufe {d.level.level} – {d.level.name}</h2>
              <p>{d.level.description}</p>
              <small className="muted">{d.state ? `Gesetzt von ${d.state.setBy} am ${new Date(d.state.setAt).toLocaleString('de-DE')}${d.state.reason ? ` – ${d.state.reason}` : ''}` : 'Standardstufe (noch nie geändert)'}</small>
            </div>
            <h2>Stufe setzen</h2>
            <input className="inline-input" placeholder="Grund (optional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            <ul className="list">
              {d.levels.map((l) => (
                <li key={l.id} className="row">
                  <span className="grow">
                    <span style={{ color: l.color }}>●</span> <strong>{l.emoji} {l.level} – {l.name}</strong>
                    {l.allowedRoleIds.length > 0 && <small className="muted"> · nur: {l.allowedRoleIds.map(roleName).join(', ')}</small>}
                    <br /><small className="muted">{l.description}</small>
                  </span>
                  <button className="btn primary" disabled={l.level === d.level.level} onClick={() => call.mutate({ method: 'POST', path: '/set', body: { level: l.level, reason }, msg: `Stufe ${l.level} gesetzt.` })}>Setzen</button>
                  <button className="btn" onClick={() => setEdit(l)}>Bearbeiten</button>
                  <button className="btn danger" onClick={() => confirm(`Stufe ${l.level} löschen?`) && call.mutate({ method: 'DELETE', path: `/levels/${l.level}`, msg: 'Gelöscht.' })}>Löschen</button>
                </li>
              ))}
            </ul>
            <button className="btn" onClick={() => setEdit({ id: '', level: Math.max(...d.levels.map((x) => x.level)) + 1, name: '', color: '#808080', emoji: '', description: '', allowedRoleIds: [], isNew: true })}>Neue Stufe</button>
          </>
        )}
      </QueryState>
      {edit && (
        <div className="card comp">
          <h3>{edit.isNew ? 'Neue Stufe' : `Stufe ${edit.level} bearbeiten`}</h3>
          <div className="two">
            <label className="fld"><span>Stufe (0–20)</span><input type="number" min={0} max={20} value={edit.level} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, level: Number(e.target.value) })} /></label>
            <label className="fld"><span>Name</span><input value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          </div>
          <div className="two">
            <label className="fld"><span>Farbe</span><input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></label>
            <label className="fld"><span>Emoji</span><input value={edit.emoji ?? ''} maxLength={16} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} /></label>
          </div>
          <label className="fld"><span>Beschreibung</span><input value={edit.description ?? ''} maxLength={300} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
          <label className="fld">
            <span>Berechtigte Rollen (leer = jeder mit dem Recht „Gefahrenstufe setzen“)</span>
            <select multiple size={5} value={edit.allowedRoleIds} onChange={(e) => setEdit({ ...edit, allowedRoleIds: [...e.target.selectedOptions].map((o) => o.value) })}>
              {roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div className="actions">
            <button className="btn primary" disabled={!edit.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: `/levels/${edit.level}`, body: edit, msg: 'Gespeichert.' }, { onSuccess: () => setEdit(null) })}>Speichern</button>
            <button className="btn" onClick={() => setEdit(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}
