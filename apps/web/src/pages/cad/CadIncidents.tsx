import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Star } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, optColor, optLabel, useCadConfig, useCadPrefs, type CadConfig, type CadIncidentDetail, type CadIncidentRow, type CadRadioRow, type CadUnitRow } from '../../lib/cad';
import { LockBanner, useEditLock } from '../../lib/locks';
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';

export interface IncidentDraft { restrictRoleIds?: string[]; title?: string; type?: string; keyword?: string; priority?: string; status?: string; location?: string; description?: string; involved?: string; requiredUnits?: string; internalNotes?: string; mapX?: number | null; mapZ?: number | null }

const errText = (e: unknown) => (e instanceof ApiError ? `${e.message}${Array.isArray(e.details) ? `: ${(e.details as { path: string; message: string }[]).map((d) => `${d.path} ${d.message}`).join(', ')}` : ''}` : 'Fehlgeschlagen');

/** Einsatz anlegen/bearbeiten. `callId`: aus einem ER:LC-Notruf erstellen (Verknüpfung bleibt gespeichert). */
export function IncidentForm({ cfg, initial, id, callId, onClose, onSaved }: { cfg: CadConfig; initial?: IncidentDraft; id?: string; callId?: string; onClose: () => void; onSaved?: (inc: CadIncidentRow) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<IncidentDraft>({ priority: cfg.priorities[Math.floor(cfg.priorities.length / 2)]?.key, ...initial });
  const [err, setErr] = useState<string>();
  const editLock = useEditLock('incident', id, !!id);
  const roles = useQuery({ queryKey: ['roles-list'], queryFn: () => api<{ id: string; name: string }[]>('/roles').catch(() => []) });
  const m = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x])) as Record<string, unknown>;
      if (!id) { for (const k of Object.keys(body)) if (body[k] === null) delete body[k]; }
      return id ? api<CadIncidentRow>(`/cad/incidents/${id}`, { method: 'PATCH', body }) : callId ? api<CadIncidentRow>(`/cad/calls/${callId}/incident`, { body }) : api<CadIncidentRow>('/cad/incidents', { body });
    },
    onSuccess: (inc) => { for (const k of ['cad-incidents', 'cad-incident', 'cad-overview', 'cad-map', 'cad-calls']) void qc.invalidateQueries({ queryKey: [k] }); onSaved?.(inc); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const upd = (p: IncidentDraft) => setV({ ...v, ...p });
  return (
    <Modal open wide title={id ? 'Einsatz bearbeiten' : callId ? 'Einsatz aus Notruf erstellen' : 'Neuer Einsatz'} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="sm:col-span-2 empty:hidden"><LockBanner lock={editLock} /></div>
        <div className="sm:col-span-2"><Field label="Titel / Meldebild">{(fid) => <Input id={fid} required={!callId} minLength={2} maxLength={200} value={v.title ?? ''} onChange={(e) => upd({ title: e.target.value })} />}</Field></div>
        <Field label="Einsatzart">{(fid) => <Select id={fid} value={v.type ?? ''} onChange={(e) => upd({ type: e.target.value })}><option value="">—</option>{cfg.incidentTypes.map((t) => <option key={t.key} value={t.key}>{optLabel(cfg.incidentTypes, t.key)}</option>)}</Select>}</Field>
        <Field label="Stichwort">{(fid) => <Input id={fid} maxLength={80} value={v.keyword ?? ''} onChange={(e) => upd({ keyword: e.target.value })} />}</Field>
        <Field label="Priorität">{(fid) => <Select id={fid} value={v.priority ?? ''} onChange={(e) => upd({ priority: e.target.value })}>{cfg.priorities.map((p) => <option key={p.key} value={p.key}>{optLabel(cfg.priorities, p.key)}</option>)}</Select>}</Field>
        {!id && <Field label="Status">{(fid) => <Select id={fid} value={v.status ?? ''} onChange={(e) => upd({ status: e.target.value || undefined })}><option value="">Standard ({optLabel(cfg.incidentStatuses, cfg.incidentStatuses.find((s) => !s.closed)?.key)})</option>{cfg.incidentStatuses.filter((s) => !s.closed).map((s) => <option key={s.key} value={s.key}>{optLabel(cfg.incidentStatuses, s.key)}</option>)}</Select>}</Field>}
        <Field label="Ort">{(fid) => <Input id={fid} maxLength={200} value={v.location ?? ''} onChange={(e) => upd({ location: e.target.value })} />}</Field>
        <Field label="Kartenposition (X / Z)" hint="Spielkoordinaten – am einfachsten über „Einsatz hier“ auf der Karte">{(fid) => (
          <div className="flex gap-1"><Input id={fid} type="number" step="any" placeholder="X" value={v.mapX ?? ''} onChange={(e) => upd({ mapX: e.target.value === '' ? null : Number(e.target.value) })} /><Input aria-label="Z" type="number" step="any" placeholder="Z" value={v.mapZ ?? ''} onChange={(e) => upd({ mapZ: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        )}</Field>
        <div className="sm:col-span-2"><Field label="Beschreibung">{(fid) => <Textarea id={fid} rows={3} maxLength={5000} value={v.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />}</Field></div>
        <Field label="Beteiligte Personen">{(fid) => <Textarea id={fid} rows={2} maxLength={2000} value={v.involved ?? ''} onChange={(e) => upd({ involved: e.target.value })} />}</Field>
        <Field label="Benötigte Einheiten">{(fid) => <Textarea id={fid} rows={2} maxLength={500} value={v.requiredUnits ?? ''} onChange={(e) => upd({ requiredUnits: e.target.value })} />}</Field>
        <div className="sm:col-span-2"><Field label="Vertraulich – nur diese Rollen sehen den Einsatz (leer = alle mit CAD-Zugriff; wird dann nicht nach Discord gemeldet)">{(fid) => (
          <Select id={fid} multiple className="h-20" value={v.restrictRoleIds ?? []} onChange={(e) => upd({ restrictRoleIds: [...e.target.selectedOptions].map((o) => o.value) })}>{(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        )}</Field></div>
        <div className="sm:col-span-2"><Field label="Interne Notizen (nur im CAD)">{(fid) => <Textarea id={fid} rows={2} maxLength={5000} value={v.internalNotes ?? ''} onChange={(e) => upd({ internalNotes: e.target.value })} />}</Field></div>
        {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={m.isPending || editLock.blocked}>{id ? 'Speichern' : 'Einsatz anlegen'}</Button></div>
      </form>
    </Modal>
  );
}

export function CadIncidents() {
  const { can } = useAuth();
  const { cfg } = useCadConfig();
  const { cad, set } = useCadPrefs();
  const [sp, setSp] = useSearchParams();
  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['cad-incidents', scope, q], queryFn: () => api<CadIncidentRow[]>('/cad/incidents', { query: { active: scope === 'active' ? 'true' : undefined, q: q || undefined } }) });
  const selected = sp.get('id');
  const fav = new Set(cad.favoriteIncidents ?? []);
  const toggleFav = (id: string) => set({ favoriteIncidents: fav.has(id) ? [...fav].filter((x) => x !== id) : [...fav, id].slice(-50) });
  const rows = [...(list.data ?? [])].sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)));
  return (
    <>
      <PageHeader title="Einsätze" actions={can('cad.create_incident') ? <Button onClick={() => setCreating(true)}>Neuer Einsatz</Button> : undefined} />
      <div className="grid gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <div className="mb-2 flex w-full items-center gap-2"><Select aria-label="Filter" className="w-auto py-1 text-xs" value={scope} onChange={(e) => setScope(e.target.value as 'active' | 'all')}><option value="active">Aktive</option><option value="all">Alle</option></Select><Input aria-label="Suche" className="min-w-0 flex-1 py-1 text-xs" placeholder="Nummer, Titel, Stichwort, Ort…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !rows.length ? <EmptyState text="Keine Einsätze." /> : (
            <ul className="divide-y divide-line">{rows.map((i) => (
              <li key={i.id} className={`flex items-start gap-2 py-2 ${selected === i.id ? 'bg-primary/10' : ''}`}>
                <button aria-label={fav.has(i.id) ? 'Favorit entfernen' : 'Als Favorit merken'} onClick={() => toggleFav(i.id)} className={fav.has(i.id) ? 'text-warning' : 'text-muted'}><Star size={14} fill={fav.has(i.id) ? 'currentColor' : 'none'} /></button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setSp({ id: i.id })}>
                  <p className="truncate text-sm font-medium"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: optColor(cfg.priorities, i.priority) ?? "#64748b" }} />{i.restrictRoleIds?.length ? "🔒 " : ""}{i.number} · {i.title}</p>
                  <p className="truncate text-xs text-muted">{optLabel(cfg.incidentStatuses, i.status)} · {i.keyword ?? optLabel(cfg.incidentTypes, i.type)} · {i.location ?? 'ohne Ort'} · {ago(i.createdAt)}</p>
                </button>
              </li>))}</ul>
          )}
        </Card>
        <div className="xl:col-span-3">{selected ? <IncidentDetail id={selected} cfg={cfg} /> : <Card><EmptyState text="Einsatz links auswählen." /></Card>}</div>
      </div>
      {creating && <IncidentForm cfg={cfg} onClose={() => setCreating(false)} onSaved={(inc) => setSp({ id: inc.id })} />}
    </>
  );
}

const KIND: Record<string, string> = { CREATED: '🆕', STATUS: '🔄', ASSIGN: '🚓', RADIO: '📻', NOTE: '📝', CALL: '🚨' };

export function IncidentDetail({ id, cfg }: { id: string; cfg: CadConfig }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState('');
  const [radio, setRadio] = useState('');
  const [err, setErr] = useState<string>();
  const q = useQuery({ queryKey: ['cad-incident', id], queryFn: () => api<CadIncidentDetail>(`/cad/incidents/${id}`) });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const done = () => { setErr(undefined); for (const k of ['cad-incident', 'cad-incidents', 'cad-units', 'cad-overview', 'cad-map', 'cad-radio']) void qc.invalidateQueries({ queryKey: [k] }); };
  const onError = (e: unknown) => setErr(errText(e));
  const status = useMutation({ mutationFn: (s: string) => api(`/cad/incidents/${id}/status`, { body: { status: s } }), onSuccess: done, onError });
  const assign = useMutation({ mutationFn: (unitId: string) => api(`/cad/incidents/${id}/units`, { body: { unitId } }), onSuccess: done, onError });
  const clear = useMutation({ mutationFn: (unitId: string) => api(`/cad/incidents/${id}/units/${unitId}`, { method: 'DELETE' }), onSuccess: done, onError });
  const addNote = useMutation({ mutationFn: () => api(`/cad/incidents/${id}/notes`, { body: { text: note } }), onSuccess: () => { setNote(''); done(); }, onError });
  const sendRadio = useMutation({ mutationFn: () => api<CadRadioRow>('/cad/radio', { body: { text: radio, incidentId: id } }), onSuccess: () => { setRadio(''); done(); }, onError });
  if (q.isLoading) return <Card><SkeletonRows /></Card>;
  if (q.error || !q.data) return <Card><ErrorState error={q.error} /></Card>;
  const i = q.data;
  const st = cfg.incidentStatuses.find((s) => s.key === i.status);
  const active = i.units.filter((u) => !u.clearedAt);
  const free = (units.data ?? []).filter((u) => u.operational && !['OFF_DUTY', 'UNAVAILABLE'].includes(u.status) && !active.some((a) => a.unitId === u.id));
  const row = (label: string, value: React.ReactNode) => value ? <><dt className="text-muted">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></> : null;
  return (
    <Card title={<span>{i.number} · {i.title}</span>} actions={<div className="flex flex-wrap gap-1">
      {i.mapX !== null && <Link to={`/cad/map?incident=${i.id}`}><Button size="sm" variant="secondary"><MapPin size={12} /> Karte</Button></Link>}
      {can('cad.edit_incident') && <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Bearbeiten</Button>}
    </div>}>
      {err && <div role="alert" className="mb-2 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {row('Priorität', optLabel(cfg.priorities, i.priority))}{row('Status', optLabel(cfg.incidentStatuses, i.status))}{row('Einsatzart', i.type ? optLabel(cfg.incidentTypes, i.type) : null)}
          {row('Stichwort', i.keyword)}{row('Ort', i.location)}{row('Beschreibung', i.description)}{row('Beteiligte', i.involved)}{row('Benötigt', i.requiredUnits)}
          {row('Disponent', i.dispatcherId ? i.names[i.dispatcherId] ?? '—' : null)}{row('Erstellt', new Date(i.createdAt).toLocaleString('de-DE'))}{row('Aktualisiert', new Date(i.updatedAt).toLocaleString('de-DE'))}
          {row('Abgeschlossen', i.closedAt ? new Date(i.closedAt).toLocaleString('de-DE') : null)}{row('Notrufe', i.calls.length ? i.calls.map((c) => `#${c.callNumber}`).join(', ') : null)}
          {row('Interne Notizen', i.internalNotes)}
        </dl>
        <div className="space-y-3">
          {can('cad.edit_incident') && !st?.closed && (
            <div><p className="mb-1 text-xs font-medium text-muted">Status setzen</p><div className="flex flex-wrap gap-1">{cfg.incidentStatuses.filter((s) => s.key !== i.status && (!s.closed || can('cad.close_incident'))).map((s) => <Button key={s.key} size="sm" variant={s.closed ? 'danger' : 'secondary'} disabled={status.isPending} onClick={() => status.mutate(s.key)}>{optLabel(cfg.incidentStatuses, s.key)}</Button>)}</div></div>
          )}
          <div><p className="mb-1 text-xs font-medium text-muted">Einheiten</p>
            <ul className="space-y-1 text-sm">{active.map((u) => <li key={u.unitId} className="flex items-center justify-between gap-2"><span>{u.unit.callsign} · {optLabel(cfg.unitStatuses, u.unit.status)}</span>{can('cad.assign_unit') && <Button size="sm" variant="ghost" onClick={() => clear.mutate(u.unitId)}>lösen</Button>}</li>)}{!active.length && <li className="text-muted">keine</li>}</ul>
            {can('cad.assign_unit') && !st?.closed && free.length > 0 && <Select aria-label="Einheit zuweisen" className="mt-1 py-1 text-xs" value="" onChange={(e) => e.target.value && assign.mutate(e.target.value)}><option value="">Einheit zuweisen…</option>{free.map((u) => <option key={u.id} value={u.id}>{u.callsign}{u.current ? ` (in ${u.current.number})` : ''} – {optLabel(cfg.unitStatuses, u.status)}</option>)}</Select>}
          </div>
        </div>
      </div>
      <h3 className="mb-1 mt-4 text-sm font-semibold">Einsatzchronik</h3>
      <ol className="max-h-80 space-y-1 overflow-auto text-sm">{i.log.map((l) => <li key={l.id} className="flex gap-2"><span className="w-12 shrink-0 text-xs text-muted">{new Date(l.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span><span aria-hidden>{KIND[l.kind] ?? '•'}</span><span className="min-w-0 flex-1">{l.text}{l.authorId && i.names[l.authorId] ? <span className="text-xs text-muted"> – {i.names[l.authorId]}</span> : null}</span></li>)}</ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {can('cad.radio') && <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (radio.trim()) sendRadio.mutate(); }}><Input aria-label="Funkmeldung" placeholder="📻 Funkmeldung zum Einsatz…" maxLength={500} value={radio} onChange={(e) => setRadio(e.target.value)} /><Button type="submit" size="sm" disabled={!radio.trim()}>Senden</Button></form>}
        {can('cad.edit_incident') && <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}><Input aria-label="Notiz" placeholder="📝 Notiz zur Chronik…" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /><Button type="submit" size="sm" variant="secondary" disabled={!note.trim()}>Notiz</Button></form>}
      </div>
      {edit && <IncidentForm cfg={cfg} id={i.id} initial={{ restrictRoleIds: i.restrictRoleIds ?? [], title: i.title, type: i.type ?? '', keyword: i.keyword ?? '', priority: i.priority, location: i.location ?? '', description: i.description ?? '', involved: i.involved ?? '', requiredUnits: i.requiredUnits ?? '', internalNotes: i.internalNotes ?? '', mapX: i.mapX, mapZ: i.mapZ }} onClose={() => setEdit(false)} />}
    </Card>
  );
}
