import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AIR_MODES, AIR_SERVER_COOLDOWN_MIN, AIR_STATUS, type AirMode } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, type CadAirRow, type CadIncidentRow, type CadMapObject } from '../../lib/cad';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');
const TONE = { OPEN: 'danger', ACCEPTED: 'warning', DONE: 'success', CANCELLED: 'neutral' } as const;

/**
 * 🚁 Luftunterstützung: Hubschrauber bei der Leitstelle anfordern („Spieler suchen“ oder „Patrouille“).
 * ER:LC bietet dafür keine API – gerufen wird der Hubschrauber im Spiel (Polizei-Tablet), hier wird koordiniert.
 */
export function CadAir() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cad-air'], queryFn: () => api<CadAirRow[]>('/cad/air'), refetchInterval: 5_000 });
  const incidents = useQuery({ queryKey: ['cad-incidents', 'active'], queryFn: () => api<CadIncidentRow[]>('/cad/incidents', { query: { active: 'true' } }) });
  const [mode, setMode] = useState<AirMode>('SEARCH');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['cad-air'] }); void qc.invalidateQueries({ queryKey: ['cad-incident'] }); };
  const request = useMutation({
    mutationFn: () => api<CadAirRow>('/cad/air', { body: { mode, target: target.trim() || null, note: note.trim() || null, incidentId: incidentId || null } }),
    onSuccess: (r) => { setMsg({ ok: true, text: `Luftunterstützung #${r.number} angefordert – die Leitstelle ist informiert.` }); setTarget(''); setNote(''); refresh(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const status = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/cad/air/${v.id}/status`, { body: { status: v.status } }), onSuccess: refresh, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const open = (q.data ?? []).filter((r) => r.status === 'OPEN' || r.status === 'ACCEPTED');
  const done = (q.data ?? []).filter((r) => r.status === 'DONE' || r.status === 'CANCELLED');
  const lastFlight = (q.data ?? []).filter((r) => r.status === 'ACCEPTED' || r.status === 'DONE').map((r) => Date.parse(r.updatedAt)).sort((a, b) => b - a)[0];
  const cooldownLeft = lastFlight ? Math.ceil((lastFlight + AIR_SERVER_COOLDOWN_MIN * 60_000 - Date.now()) / 60_000) : 0;
  const row = (r: CadAirRow) => (
    <li key={r.id} className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>#{r.number}</b><span>🚁 {AIR_MODES[r.mode]}{r.target ? `: ${r.target}` : ''}</span><Badge tone={TONE[r.status]}>{AIR_STATUS[r.status]}</Badge>
        {r.incident && <Link to={`/cad/incidents?id=${r.incident.id}`} className="text-xs text-primary hover:underline">{r.incident.number}</Link>}
      </div>
      {r.note && <p className="text-xs">{r.note}</p>}
      <p className="text-xs text-muted">angefordert von {r.requestedBy ?? '—'} · {ago(r.createdAt)}{r.handledBy ? ` · ${r.handledBy}` : ''}</p>
      {(r.status === 'OPEN' || r.status === 'ACCEPTED') && <div className="flex flex-wrap gap-1">
        {can('cad.assign_unit') && r.status === 'OPEN' && <Button size="sm" onClick={() => status.mutate({ id: r.id, status: 'ACCEPTED' })}>✋ Übernehmen (Hubschrauber gerufen)</Button>}
        {can('cad.assign_unit') && <Button size="sm" variant="secondary" onClick={() => status.mutate({ id: r.id, status: 'DONE' })}>✅ Erledigt</Button>}
        <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: r.id, status: 'CANCELLED' })}>Abbrechen</Button>
      </div>}
    </li>
  );
  return (
    <>
      <PageHeader title="🚁 Luftunterstützung" subtitle="Hubschrauber bei der Leitstelle anfordern – gerufen wird er im Spiel über das Polizei-Tablet." />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {can('cad.radio') && <Card title="Anfordern">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
            <div role="radiogroup" aria-label="Modus" className="grid grid-cols-2 gap-2">
              {(Object.keys(AIR_MODES) as AirMode[]).map((k) => <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${mode === k ? 'border-warning bg-warning/20 text-fg' : 'border-line text-muted hover:text-fg'}`}>{k === 'SEARCH' ? '🔎' : '🛰️'} {AIR_MODES[k]}</button>)}
            </div>
            <p className="text-xs text-muted">{mode === 'SEARCH' ? 'Der Hubschrauber sucht 5 Minuten nach einem bestimmten Spieler und zeigt dessen Standort.' : 'Der Hubschrauber fliegt 5 Minuten Patrouille über die ganze Karte und verfolgt jeden Verdächtigen, den er sieht.'}</p>
            <Field label={mode === 'SEARCH' ? 'Gesuchter Spieler *' : 'Gebiet (optional)'}>{(id) => <Input id={id} value={target} maxLength={80} required={mode === 'SEARCH'} placeholder={mode === 'SEARCH' ? 'Roblox-Name' : 'z. B. Springfield'} onChange={(e) => setTarget(e.target.value)} />}</Field>
            <Field label="Einsatz (optional)">{(id) => <Select id={id} value={incidentId} onChange={(e) => setIncidentId(e.target.value)}><option value="">—</option>{(incidents.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.title}</option>)}</Select>}</Field>
            <Field label="Hinweis (optional)">{(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Button type="submit" disabled={request.isPending || (mode === 'SEARCH' && !target.trim())}>🚁 Luftunterstützung anfordern</Button>
            {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
          </form>
          <p className="mt-3 text-xs text-muted">Im Spiel: kostenlos ab Rang 4 alle 60 Minuten, sonst gegen Robux; danach {AIR_SERVER_COOLDOWN_MIN} Minuten Server-Abklingzeit.{cooldownLeft > 0 ? ` Letzter Flug vor Kurzem – voraussichtlich noch ca. ${cooldownLeft} Min. Abklingzeit.` : ''}</p>
        </Card>}
        <div className="space-y-3">
          <Card title={`Offene Anforderungen (${open.length})`}>
            {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : open.length ? <ul className="divide-y divide-line">{open.map(row)}</ul> : <EmptyState text="Keine offenen Anforderungen." />}
          </Card>
          {done.length > 0 && <Card title="Letzte 24 Stunden"><ul className="divide-y divide-line">{done.map(row)}</ul></Card>}
        </div>
      </div>
    </>
  );
}

/** 📹 Gebäudekameras aus ER:LC: Übersicht für die Leitstelle, Position einmal auf der Karte setzen. */
export function CadCameras() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['cad-map-objects'], queryFn: () => api<CadMapObject[]>('/cad/map/objects') });
  const [msg, setMsg] = useState<string>();
  const add = useMutation({ mutationFn: () => api<{ added: number }>('/cad/cameras/defaults', { method: 'POST' }), onSuccess: (r) => { setMsg(r.added ? `${r.added} Kameras angelegt.` : 'Alle Kameras sind schon vorhanden.'); void qc.invalidateQueries({ queryKey: ['cad-map-objects'] }); void qc.invalidateQueries({ queryKey: ['cad-map'] }); }, onError: (e) => setMsg(errText(e)) });
  const [filter, setFilter] = useState('');
  const cams = (q.data ?? []).filter((o) => o.layer === 'cameras' && o.kind === 'POI').filter((o) => !filter || `${o.name} ${o.category ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const areas = [...new Set(cams.map((c) => c.category ?? 'Ohne Gebiet'))].sort();
  return (
    <>
      <PageHeader title="📹 Gebäudekameras" subtitle="Kameras aus dem Polizei-Tablet in ER:LC. Ansehen kann man sie nur im Spiel – hier sieht die Leitstelle, wo welche Kamera hängt."
        actions={can('cad.manage_map') ? <Button variant="secondary" disabled={add.isPending} onClick={() => add.mutate()}>Kameras aus ER:LC einfügen</Button> : undefined} />
      {msg && <p role="status" className="mb-2 text-sm">{msg}</p>}
      <Input aria-label="Kameras filtern" className="mb-3 max-w-xs" placeholder="Kamera oder Gebiet…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !cams.length ? <Card><EmptyState text="Noch keine Kameras." hint={can('cad.manage_map') ? '„Kameras aus ER:LC einfügen“ legt die Kameraliste an – danach die Position auf der Karte setzen.' : 'Ein Administrator muss die Kameras anlegen.'} /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{areas.map((a) => (
          <Card key={a} title={`📍 ${a}`}>
            <ul className="divide-y divide-line">{cams.filter((c) => (c.category ?? 'Ohne Gebiet') === a).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span>📹 {c.name}</span>
                <span className="flex gap-1">
                  {c.x !== null && <Button size="sm" variant="ghost" onClick={() => nav(`/cad/map?object=${c.id}`)}>🗺️ Auf Karte</Button>}
                  {can('cad.manage_map') && <Button size="sm" variant={c.x === null ? 'secondary' : 'ghost'} onClick={() => nav(`/cad/map?placeObject=${c.id}`)}>📍 {c.x === null ? 'Position setzen' : 'Verschieben'}</Button>}
                </span>
              </li>))}</ul>
          </Card>))}</div>
      )}
    </>
  );
}
