import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, optColor, optLabel, useCadConfig, type CadCallRow, type CadConfig, type CadIncidentRow, type CadMapData, type CadRadioRow, type CadUnitRow } from '../../lib/cad';
import { useGuilds } from '../../lib/guilds';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';
import { MapView } from './MapView';
import { IncidentForm, OptChip, type IncidentDraft } from './CadIncidents';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');
const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => { for (const k of ['cad-overview', 'cad-incidents', 'cad-incident', 'cad-units', 'cad-calls', 'cad-map', 'cad-radio', 'cad-members']) void qc.invalidateQueries({ queryKey: [k] }); };

/** Aktionen für Notrufe (Liste, Karte): Übernehmen, Einsatz erstellen, Einheit zuweisen, Schließen, Auf Karte anzeigen. */
function CallActions({ call, cfg, units, onIncident, showMap = true }: { call: CadCallRow; cfg: CadConfig; units: CadUnitRow[]; onIncident: (c: CadCallRow) => void; showMap?: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [err, setErr] = useState<string>();
  const act = useMutation({ mutationFn: (a: string) => api(`/cad/calls/${call.id}/${a}`, { method: 'POST' }), onSuccess: () => invalidateAll(qc), onError: (e) => setErr(errText(e)) });
  const assign = useMutation({ mutationFn: (unitId: string) => api<{ incidentId: string }>(`/cad/calls/${call.id}/assign`, { body: { unitId } }), onSuccess: () => invalidateAll(qc), onError: (e) => setErr(errText(e)) });
  const free = units.filter((u) => u.operational && !['OFF_DUTY', 'UNAVAILABLE'].includes(u.status));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {can('cad.edit_incident') && call.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={() => act.mutate('claim')}>✋ Übernehmen</Button>}
      {can('cad.create_incident') && !call.incidentId && <Button size="sm" onClick={() => onIncident(call)}>🚨 Einsatz erstellen</Button>}
      {call.incident && <Link to={`/cad/incidents?id=${call.incident.id}`}><Button size="sm" variant="secondary">→ {call.incident.number}</Button></Link>}
      {can('cad.assign_unit') && call.status !== 'CLOSED' && free.length > 0 && <Select aria-label="Einheit zuweisen" className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && assign.mutate(e.target.value)}><option value="">🚓 Einheit zuweisen…</option>{free.map((u) => <option key={u.id} value={u.id}>{u.callsign} – {optLabel(cfg.unitStatuses, u.status)}</option>)}</Select>}
      {can('cad.edit_incident') && call.status !== 'CLOSED' && <Button size="sm" variant="danger" onClick={() => act.mutate('close')}>Schließen</Button>}
      {can('cad.edit_incident') && call.status === 'CLOSED' && <Button size="sm" variant="ghost" onClick={() => act.mutate('reopen')}>Wieder öffnen</Button>}
      {showMap && call.mapX !== null && <Button size="sm" variant="ghost" onClick={() => nav(`/cad/map?call=${call.id}`)}>🗺️ Auf Karte</Button>}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

const callDraft = (c: CadCallRow): IncidentDraft => ({ title: c.description ?? `Notruf #${c.callNumber}`, location: c.positionDescriptor ?? '', description: c.description ?? '', mapX: c.mapX, mapZ: c.mapZ });

// ───────── Einsatzkarte ─────────
export function CadMapPage() {
  const { cfg } = useCadConfig();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [draft, setDraft] = useState<{ init: IncidentDraft; callId?: string } | null>(null);
  const map = useQuery({ queryKey: ['cad-map'], queryFn: () => api<CadMapData>('/cad/map'), refetchInterval: 5_000 });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const callId = sp.get('call'), incId = sp.get('incident'), placeId = sp.get('placeUnit'), unitFocus = sp.get('unit'), objFocus = sp.get('object'), placeObjId = sp.get('placeObject');
  const place = placeId ? units.data?.find((u) => u.id === placeId) : undefined;
  const call = callId ? map.data?.calls.find((c) => c.id === callId) : undefined;
  const inc = incId ? map.data?.incidents.find((i) => i.id === incId) : undefined;
  const unitPos = unitFocus ? map.data?.units.find((u) => u.id === unitFocus && u.position) : undefined;
  const obj = objFocus ? map.data?.objects.find((o) => o.id === objFocus && o.x !== null) : undefined;
  const placeObj = placeObjId ? map.data?.objects.find((o) => o.id === placeObjId) : undefined;
  const focus = call ? { x: call.mapX!, z: call.mapZ!, id: `call:${call.id}` } : inc ? { x: inc.mapX!, z: inc.mapZ!, id: `incident:${inc.id}` } : unitPos ? { x: unitPos.position!.x, z: unitPos.position!.z, id: `unit:${unitPos.id}` } : obj ? { x: obj.x!, z: obj.z!, id: `poi:${obj.id}` } : null;
  const { can } = useAuth();
  const located = new Set((map.data?.units ?? []).map((u) => u.id));
  const Row = ({ active, onClick, children, sub, dot }: { active?: boolean; onClick?: () => void; children: ReactNode; sub?: ReactNode; dot?: string }) => (
    <li><button type="button" disabled={!onClick} onClick={onClick} className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left text-sm ${active ? 'bg-primary/15' : onClick ? 'hover:bg-panel-2' : 'opacity-70'}`}>
      {dot && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1"><span className="block truncate">{children}</span>{sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}</span>
    </button></li>
  );
  const actionsFor = (m: { kind: string; id: string }): ReactNode => {
    if (m.kind === 'call') { const c = map.data?.calls.find((x) => x.id === m.id); return c ? <CallActions call={c} cfg={cfg} units={units.data ?? []} showMap={false} onIncident={(cc) => setDraft({ init: callDraft(cc), callId: cc.id })} /> : null; }
    if (m.kind === 'incident') return <Button size="sm" variant="secondary" onClick={() => nav(`/cad/incidents?id=${m.id}`)}>Details</Button>;
    if (m.kind === 'unit') return <Button size="sm" variant="secondary" onClick={() => nav(`/cad/units?id=${m.id}`)}>Details</Button>;
    return null;
  };
  return (
    <>
      <PageHeader title="Einsatzkarte" subtitle="Mausrad/Schaltflächen zum Zoomen, Ziehen zum Verschieben · Ebenen rechts oben" />
      {map.error && <ErrorState error={map.error} />}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <MapView cfg={cfg} data={map.data} height="calc(100dvh - 13rem)" focus={focus} placeUnit={place ? { id: place.id, callsign: place.callsign, done: () => nav('/cad/map', { replace: true }) } : null} placeObject={placeObj ? { id: placeObj.id, name: placeObj.name, done: () => nav(`/cad/map?object=${placeObj.id}`, { replace: true }) } : null} actionsFor={actionsFor} onCreateIncidentAt={(x, z) => setDraft({ init: { mapX: x, mapZ: z } })} />
      {/* Lage neben der Karte: Klick zentriert die Karte auf den Marker */}
      <aside className="card max-h-[calc(100dvh-13rem)] space-y-3 overflow-auto border border-line p-2" aria-label="Lage">
        <section><h3 className="px-2 text-xs font-semibold uppercase text-muted">🚨 Notrufe ({map.data?.calls.length ?? 0})</h3>
          <ul>{(map.data?.calls ?? []).map((c) => <Row key={c.id} dot="#ef4444" active={callId === c.id} onClick={() => nav(`/cad/map?call=${c.id}`)} sub={`${c.positionDescriptor ?? '—'} · ${ago(c.startedAt)}`}>#{c.callNumber} · {c.description ?? 'Notruf'}</Row>)}{!map.data?.calls.length && <li className="px-2 text-xs text-muted">keine offenen</li>}</ul></section>
        <section><h3 className="px-2 text-xs font-semibold uppercase text-muted">📋 Einsätze ({map.data?.incidents.length ?? 0})</h3>
          <ul>{(map.data?.incidents ?? []).map((i) => <Row key={i.id} dot={optColor(cfg.priorities, i.priority) ?? '#64748b'} active={incId === i.id} onClick={() => nav(`/cad/map?incident=${i.id}`)} sub={`${optLabel(cfg.incidentStatuses, i.status)} · ${i.location ?? 'ohne Ort'}`}>{i.number} · {i.title}</Row>)}{!map.data?.incidents.length && <li className="px-2 text-xs text-muted">keine mit Position</li>}</ul>
          {can('cad.create_incident') && <p className="px-2 pt-1 text-[11px] text-muted">Neuer Einsatz: „Einsatz hier“ oben links, dann auf die Karte klicken.</p>}</section>
        <section><h3 className="px-2 text-xs font-semibold uppercase text-muted">🚓 Einheiten ({units.data?.length ?? 0})</h3>
          <ul>{(units.data ?? []).map((u) => located.has(u.id)
            ? <Row key={u.id} dot={optColor(cfg.unitStatuses, u.status) ?? '#64748b'} active={unitFocus === u.id} onClick={() => nav(`/cad/map?unit=${u.id}`)} sub={`${optLabel(cfg.unitStatuses, u.status)}${u.current ? ` · ${u.current.number}` : ''}`}>{u.callsign}</Row>
            : <Row key={u.id} dot={optColor(cfg.unitStatuses, u.status) ?? '#64748b'} onClick={can('cad.manage_units') ? () => nav(`/cad/map?placeUnit=${u.id}`) : undefined} sub={can('cad.manage_units') ? '📍 ohne Position – klicken zum Platzieren' : 'ohne Position'}>{u.callsign}</Row>)}</ul></section>
      </aside>
      </div>
      {draft && <IncidentForm cfg={cfg} initial={draft.init} callId={draft.callId} onClose={() => setDraft(null)} onSaved={(i) => nav(`/cad/incidents?id=${i.id}`)} />}
    </>
  );
}

// ───────── Notrufe ─────────
export function CadCalls() {
  const { cfg } = useCadConfig();
  const [status, setStatus] = useState('OPEN');
  const [draft, setDraft] = useState<CadCallRow | null>(null);
  const q = useQuery({ queryKey: ['cad-calls', status], queryFn: () => api<CadCallRow[]>('/cad/calls', { query: { status } }), refetchInterval: 5_000 });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const [sp] = useSearchParams();
  const hl = sp.get('id');
  return (
    <>
      <PageHeader title="Notrufe" subtitle="ER:LC-Notrufe – werden automatisch erkannt" actions={<Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Offen</option><option value="CLAIMED">Übernommen</option><option value="CLOSED">Geschlossen</option><option value="ALL">Alle</option></Select>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState text="Keine Notrufe." hint="Sobald ER:LC Notrufe meldet, erscheinen sie hier und auf der Karte." /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => (
          <Card key={c.id} className={hl === c.id ? 'ring-2 ring-primary' : undefined} title={<span>🚨 NOTRUF #{c.callNumber}</span>} actions={<Badge tone={c.status === 'OPEN' ? 'danger' : c.status === 'CLAIMED' ? 'warning' : 'neutral'}>{c.status === 'OPEN' ? 'Offen' : c.status === 'CLAIMED' ? 'Übernommen' : 'Geschlossen'}</Badge>}>
            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted">Typ</dt><dd>{c.description ?? '—'}</dd><dt className="text-muted">Ort</dt><dd>{c.positionDescriptor ?? '—'}</dd>
              <dt className="text-muted">Zeit</dt><dd>{new Date(c.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} ({ago(c.startedAt)})</dd>
              {c.team && <><dt className="text-muted">Team</dt><dd>{c.team}</dd></>}<dt className="text-muted">Server</dt><dd>{c.server?.name ?? '—'}{c.source === 'WEBHOOK' ? ' · Webhook' : ''}</dd>
            </dl>
            <CallActions call={c} cfg={cfg} units={units.data ?? []} onIncident={setDraft} />
          </Card>))}</div>
      )}
      {draft && <IncidentForm cfg={cfg} initial={callDraft(draft)} callId={draft.id} onClose={() => setDraft(null)} />}
    </>
  );
}

// ───────── Einheiten ─────────
interface UnitDraft { id?: string; callsign: string; name?: string | null; type?: string | null; color?: string | null; icon?: string | null; status?: string; discordRoleId?: string | null; guildId?: string | null; erlcTeam?: string | null; operational?: boolean; vehicle?: string | null; notes?: string | null; mapX?: number | null; mapZ?: number | null; statusRoleIds?: string[] }

export function CadUnits() {
  const { can } = useAuth();
  const { cfg } = useCadConfig();
  const qc = useQueryClient();
  const guilds = useGuilds();
  const [sp] = useSearchParams();
  const [edit, setEdit] = useState<UnitDraft | null>(null);
  const [err, setErr] = useState<string>();
  const q = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units'), refetchInterval: 5_000 });
  const status = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/cad/units/${v.id}/status`, { body: { status: v.status } }), onSuccess: () => invalidateAll(qc), onError: (e) => setErr(errText(e)) });
  const save = useMutation({
    mutationFn: (u: UnitDraft) => { const { id, ...body } = u; const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === '' ? null : v])); return id ? api(`/cad/units/${id}`, { method: 'PATCH', body: clean }) : api('/cad/units', { body: Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== null && v !== undefined)) }); },
    onSuccess: () => { setEdit(null); invalidateAll(qc); }, onError: (e) => setErr(errText(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/cad/units/${id}`, { method: 'DELETE' }), onSuccess: () => { setEdit(null); invalidateAll(qc); }, onError: (e) => setErr(errText(e)) });
  const types = [...cfg.unitTypes.map((t) => t.key), null];
  const [filter, setFilter] = useState<string>('');
  const [term, setTerm] = useState('');
  const all = q.data ?? [];
  const shown = all.filter((u) => (!filter || u.status === filter) && (!term || `${u.callsign} ${u.name ?? ''} ${u.vehicle ?? ''} ${u.crew.map((c) => `${c.callsign ?? ''} ${c.discordName ?? ''} ${c.erlcName ?? ''}`).join(' ')} ${u.memberNames.join(' ')}`.toLowerCase().includes(term.toLowerCase())));
  return (
    <>
      <PageHeader title="Einheiten" subtitle="Status, Besatzung, aktuelle Einsätze und Position" actions={can('cad.manage_units') ? <Button onClick={() => setEdit({ callsign: '', type: cfg.unitTypes[0]?.key ?? null, operational: true })}>Neue Einheit</Button> : undefined} />
      {err && <div role="alert" className="mb-2 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      {!!all.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Lage der Einheiten: Anzahl je Status – Klick filtert */}
          <button type="button" aria-pressed={!filter} onClick={() => setFilter('')} className={`rounded-full border px-3 py-1 text-xs ${!filter ? 'border-primary bg-primary/15' : 'border-line hover:bg-panel-2'}`}>Alle <b>{all.length}</b></button>
          {cfg.unitStatuses.map((st) => { const n = all.filter((u) => u.status === st.key).length; return n ? (
            <button key={st.key} type="button" aria-pressed={filter === st.key} onClick={() => setFilter(filter === st.key ? '' : st.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${filter === st.key ? 'border-primary bg-primary/15' : 'border-line hover:bg-panel-2'}`}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: st.color ?? '#64748b' }} />{st.label} <b>{n}</b>
            </button>) : null; })}
          <div className="ml-auto w-full sm:w-64"><Input aria-label="Einheiten durchsuchen" className="py-1 text-xs" placeholder="🔍 Rufname, Besatzung, Fahrzeug…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
        </div>
      )}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState text="Noch keine Einheiten." hint="z. B. SEK-01, K9-01 – Typen, Farben und Symbole unter Einstellungen." /></Card> : !shown.length ? <Card><EmptyState text="Keine Einheit passt zum Filter." /></Card> : types.map((t) => {
        const list = shown.filter((u) => (u.type ?? null) === t || (t === null && u.type && !cfg.unitTypes.some((x) => x.key === u.type)));
        if (!list.length) return null;
        const ty = cfg.unitTypes.find((x) => x.key === t);
        return (
          <section key={t ?? 'other'} className="mb-4">
            <h2 className="mb-2 text-sm font-semibold">{ty ? `${ty.emoji ?? ''} ${ty.label}` : 'Weitere'}</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{list.map((u) => (
              <div key={u.id} className={`card border p-3 ${sp.get('id') === u.id ? 'border-primary' : 'border-line'}`} style={{ borderLeft: `4px solid ${u.color ?? ty?.color ?? '#64748b'}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{u.icon ?? ty?.emoji ?? '🚔'} {u.callsign}{u.name ? <span className="font-normal text-muted"> · {u.name}</span> : null}</p>
                    <p className="text-xs text-muted">{u.operational ? '' : '⛔ nicht einsatzfähig · '}{guilds.data?.find((g) => g.id === u.guildId)?.name ?? ''}{u.erlcTeam ? ` · ER:LC ${u.erlcTeam}` : ''}</p></div>
                  {can('cad.manage_units') && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...u })}>Bearbeiten</Button>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <OptChip list={cfg.unitStatuses} value={u.status} />
                  {u.current && <Link className="text-xs font-medium text-primary hover:underline" to={`/cad/incidents?id=${u.current.id}`}>🚨 {u.current.number}</Link>}
                </div>
                {/* Status mit einem Klick (Symbol = Status, Name beim Drüberfahren) */}
                {can('cad.assign_unit') && <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Status ${u.callsign}`}>{cfg.unitStatuses.map((st) => {
                  const cur = st.key === u.status;
                  return <button key={st.key} type="button" title={st.label} aria-label={`${u.callsign}: ${st.label}`} aria-pressed={cur} disabled={cur || status.isPending} onClick={() => status.mutate({ id: u.id, status: st.key })}
                    className={`rounded border px-1.5 py-0.5 text-xs ${cur ? 'border-transparent font-semibold' : 'border-line hover:bg-panel-2'}`} style={cur ? { background: `${optColor(cfg.unitStatuses, st.key) ?? '#64748b'}33` } : undefined}>{st.emoji ?? st.label.slice(0, 2)}</button>;
                })}</div>}
                <p className="mt-1 text-xs text-muted">Besatzung: {u.crew.length ? u.crew.map((c) => `${c.callsign ?? c.discordName ?? c.erlcName}${c.inGame ? ' 🟢' : ''}`).join(', ') : u.memberNames.join(', ') || '—'}</p>
                <p className="text-xs text-muted">Position: {u.position ? `${u.position.source === 'erlc' ? 'live aus ER:LC' : 'manuell'}${u.position.street ? ` · ${u.position.street}` : ''}` : 'unbekannt'}{can('cad.manage_units') && u.position?.source !== 'erlc' && <Link className="ml-2 text-primary hover:underline" to={`/cad/map?placeUnit=${u.id}`}>📍 auf Karte platzieren</Link>}</p>
              </div>))}</div>
          </section>
        );
      })}
      {edit && (
        <Modal open wide title={edit.id ? `Einheit ${edit.callsign} bearbeiten` : 'Neue Einheit'} onClose={() => setEdit(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <Field label="Kürzel / Rufname">{(id) => <Input id={id} required minLength={2} maxLength={16} value={edit.callsign} onChange={(e) => setEdit({ ...edit, callsign: e.target.value })} />}</Field>
            <Field label="Name">{(id) => <Input id={id} maxLength={60} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
            <Field label="Einheitentyp">{(id) => <Select id={id} value={edit.type ?? ''} onChange={(e) => setEdit({ ...edit, type: e.target.value || null })}><option value="">—</option>{cfg.unitTypes.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}</Select>}</Field>
            <Field label="Status">{(id) => <Select id={id} value={edit.status ?? cfg.unitStatuses[0]?.key} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{cfg.unitStatuses.map((s) => <option key={s.key} value={s.key}>{optLabel(cfg.unitStatuses, s.key)}</option>)}</Select>}</Field>
            <Field label="Farbe">{(id) => <Input id={id} type="color" value={edit.color ?? cfg.unitTypes.find((t) => t.key === edit.type)?.color ?? '#0891b2'} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />}</Field>
            <Field label="Symbol (Emoji)">{(id) => <Input id={id} maxLength={4} value={edit.icon ?? ''} placeholder={cfg.unitTypes.find((t) => t.key === edit.type)?.emoji ?? '🚔'} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} />}</Field>
            <Field label="Discord-Server">{(id) => <Select id={id} value={edit.guildId ?? ''} onChange={(e) => setEdit({ ...edit, guildId: e.target.value || null })}><option value="">—</option>{(guilds.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
            <Field label="Discord-Rolle (wird bei Zuweisung erwähnt)">{(id) => <Select id={id} value={edit.discordRoleId ?? ''} onChange={(e) => setEdit({ ...edit, discordRoleId: e.target.value || null })}><option value="">—</option>{(guilds.data ?? []).filter((g) => !edit.guildId || g.id === edit.guildId).map((g) => <optgroup key={g.id} label={g.name}>{g.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}</Select>}</Field>
            <Field label="ER:LC-Team">{(id) => <Input id={id} maxLength={40} placeholder="z. B. Police, Sheriff" value={edit.erlcTeam ?? ''} onChange={(e) => setEdit({ ...edit, erlcTeam: e.target.value })} />}</Field>
            <Field label="Fahrzeug">{(id) => <Input id={id} maxLength={64} value={edit.vehicle ?? ''} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })} />}</Field>
            <Field label="Weitere Discord-Rollen, die den Status melden dürfen">{(id) => <Select id={id} multiple className="h-20" value={edit.statusRoleIds ?? []} onChange={(e) => setEdit({ ...edit, statusRoleIds: [...e.target.selectedOptions].map((o) => o.value) })}>{(guilds.data ?? []).filter((g) => !edit.guildId || g.id === edit.guildId).map((g) => <optgroup key={g.id} label={g.name}>{g.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}</Select>}</Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.operational !== false} onChange={(e) => setEdit({ ...edit, operational: e.target.checked })} />Einsatzfähig</label>
            <div className="sm:col-span-2"><Field label="Notizen">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />}</Field></div>
            <div className="flex justify-between gap-2 sm:col-span-2">{edit.id ? <Button variant="danger" onClick={() => del.mutate(edit.id!)}>Löschen</Button> : <span />}<div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>Speichern</Button></div></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ───────── Funk ─────────
export function CadRadio() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [code, setCode] = useState<string>();
  const [announce, setAnnounce] = useState('');
  const [msg, setMsg] = useState<string>();
  const [feedInc, setFeedInc] = useState('');
  const [feedTerm, setFeedTerm] = useState('');
  const q = useQuery({ queryKey: ['cad-radio'], queryFn: () => api<CadRadioRow[]>('/cad/radio', { query: { take: 100 } }), refetchInterval: 5_000 });
  const inc = useQuery({ queryKey: ['cad-incidents', 'active', ''], queryFn: () => api<CadIncidentRow[]>('/cad/incidents', { query: { active: 'true' } }) });
  const codes = useQuery({ queryKey: ['radio-codes-cad'], queryFn: () => api<{ id: string; code: string; meaning: string; category: string | null }[]>('/radio-codes'), enabled: can('radio.view'), staleTime: 300_000 });
  const myUnits = useQuery({ queryKey: ['cad-radio-units'], queryFn: () => api<{ units: { id: string; callsign: string; name: string | null }[]; mine: string | null; dispatcher: boolean }>('/cad/radio/units'), enabled: can('cad.radio') });
  // Standard: eigene Einheit (bzw. die einzige, als die man funken darf)
  useEffect(() => { const d = myUnits.data; if (d && !unitId) setUnitId(d.mine ?? (d.units.length === 1 ? d.units[0]!.id : '')); }, [myUnits.data, unitId]);
  const send = useMutation({ mutationFn: () => api('/cad/radio', { body: { text, unitId, ...(incidentId ? { incidentId } : {}) } }), onSuccess: () => { setText(''); setCode(undefined); invalidateAll(qc); }, onError: (e) => setMsg(errText(e)) });
  const ann = useMutation({ mutationFn: () => api<{ channels: number }>('/cad/announcements', { body: { text: announce } }), onSuccess: (r) => { setAnnounce(''); setMsg(`Leitstellenmeldung an ${r.channels} Kanal/Kanäle gesendet.`); }, onError: (e) => setMsg(errText(e)) });
  return (
    <>
      <PageHeader title="Funk" subtitle="Funkmeldungen – mit Einsatz landen sie in der Einsatzchronik (auch aus Discord: /cad funk)" />
      {msg && <p role="status" className="mb-2 text-sm text-muted">{msg}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Funkverkehr">
          {can('cad.radio') && <form className="mb-3 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_12rem_auto]" onSubmit={(e) => { e.preventDefault(); if (text.trim() && unitId) send.mutate(); }}>
            <Select aria-label="Einheit" required value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">{myUnits.data && !myUnits.data.units.length ? 'Keine Einheit' : 'Als Einheit…'}</option>
              {(myUnits.data?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.callsign}{u.name ? ` · ${u.name}` : ''}</option>)}
            </Select>
            <Input aria-label="Funkmeldung" maxLength={500} placeholder="📻 Funkmeldung – Enter sendet" value={text} onChange={(e) => { setText(e.target.value); setCode(undefined); }} />
            <Select aria-label="Einsatz" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}><option value="">Einsatz meiner Einheit</option>{(inc.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.title}</option>)}</Select>
            <Button type="submit" disabled={!text.trim() || !unitId || send.isPending}>Senden</Button>
          </form>}
          {can('cad.radio') && myUnits.data && !myUnits.data.units.length && <p className="-mt-1 mb-3 text-xs text-muted">Du bist keiner Einheit zugeordnet – Zuordnung unter Teamübersicht.</p>}
          {can('cad.radio') && !!codes.data?.length && <div role="radiogroup" className="mb-3 flex flex-wrap gap-1" aria-label="Funk-Codes">{codes.data.slice(0, 40).map((c) => <button key={c.id} type="button" role="radio" aria-checked={code === c.id} title={c.meaning} className={`rounded border px-1.5 py-0.5 text-xs ${code === c.id ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:bg-panel-2'}`}
                // immer nur ein Code: Klick ersetzt den Text, erneuter Klick hebt die Auswahl auf
                onClick={() => { if (code === c.id) { setCode(undefined); setText(''); } else { setCode(c.id); setText(`${c.code} (${c.meaning})`.slice(0, 500)); } }}>{c.code}</button>)}</div>}
          {!!q.data?.length && (
            <div className="mb-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <div className="w-40 shrink-0"><Select aria-label="Funk nach Einsatz filtern" className="py-1 text-xs" value={feedInc} onChange={(e) => setFeedInc(e.target.value)}><option value="">Alle Meldungen</option><option value="-">ohne Einsatz</option>{[...new Set(q.data.map((r) => r.incidentNumber).filter(Boolean))].map((n) => <option key={n} value={n!}>{n}</option>)}</Select></div>
              <div className="min-w-0 flex-1"><Input aria-label="Funk durchsuchen" className="py-1 text-xs" placeholder="🔍 Rufname oder Text…" value={feedTerm} onChange={(e) => setFeedTerm(e.target.value)} /></div>
            </div>
          )}
          {q.isLoading ? <SkeletonRows /> : !q.data?.length ? <EmptyState text="Noch keine Funkmeldungen." /> : (
            <ul className="space-y-1 text-sm">{q.data.filter((r) => (!feedInc || (feedInc === '-' ? !r.incidentNumber : r.incidentNumber === feedInc)) && (!feedTerm || `${r.callsign ?? ''} ${r.authorName ?? ''} ${r.text}`.toLowerCase().includes(feedTerm.toLowerCase()))).map((r) => (
              <li key={r.id} className="flex gap-2 rounded px-1 py-1 hover:bg-panel-2/50">
                <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted" title={new Date(r.createdAt).toLocaleString('de-DE')}>{new Date(r.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">{r.callsign ?? r.authorName ?? 'Funk'}</span>
                <span className="min-w-0 flex-1">„{r.text}“<span className="block text-[11px] text-muted">{ago(r.createdAt)}{r.incidentNumber ? <> · <Link className="hover:underline" to={`/cad/incidents?id=${r.incidentId}`}>{r.incidentNumber}</Link></> : ''}{r.authorName && r.callsign ? ` · ${r.authorName}` : ''}{r.guildId ? ' · über Discord' : ''}</span></span>
              </li>))}</ul>
          )}
        </Card>
        {can('cad.create_incident') && <Card title="Wichtige Leitstellenmeldung">
          <p className="mb-2 text-xs text-muted">Geht an alle Discord-Kanäle, die unter Einstellungen → Discord für „Wichtige Leitstellenmeldung“ eingetragen sind (inkl. verbundener Server).</p>
          <Textarea aria-label="Meldung" rows={4} maxLength={1500} value={announce} onChange={(e) => setAnnounce(e.target.value)} />
          <Button className="mt-2" disabled={announce.trim().length < 3 || ann.isPending} onClick={() => ann.mutate()}>Senden</Button>
        </Card>}
      </div>
    </>
  );
}
