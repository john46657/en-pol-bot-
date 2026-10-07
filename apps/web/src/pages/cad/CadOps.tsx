import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, optLabel, useCadConfig, type CadCallRow, type CadConfig, type CadIncidentRow, type CadMapData, type CadRadioRow, type CadUnitRow } from '../../lib/cad';
import { useGuilds } from '../../lib/guilds';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';
import { MapView } from './MapView';
import { IncidentForm, type IncidentDraft } from './CadIncidents';

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
  const map = useQuery({ queryKey: ['cad-map'], queryFn: () => api<CadMapData>('/cad/map'), refetchInterval: 10_000 });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const callId = sp.get('call'), incId = sp.get('incident');
  const call = callId ? map.data?.calls.find((c) => c.id === callId) : undefined;
  const inc = incId ? map.data?.incidents.find((i) => i.id === incId) : undefined;
  const focus = call ? { x: call.mapX!, z: call.mapZ!, id: `call:${call.id}` } : inc ? { x: inc.mapX!, z: inc.mapZ!, id: `incident:${inc.id}` } : null;
  const actionsFor = (m: { kind: string; id: string }): ReactNode => {
    if (m.kind === 'call') { const c = map.data?.calls.find((x) => x.id === m.id); return c ? <CallActions call={c} cfg={cfg} units={units.data ?? []} showMap={false} onIncident={(cc) => setDraft({ init: callDraft(cc), callId: cc.id })} /> : null; }
    if (m.kind === 'incident') return <Button size="sm" variant="secondary" onClick={() => nav(`/cad/incidents?id=${m.id}`)}>Details</Button>;
    if (m.kind === 'unit') return <Button size="sm" variant="secondary" onClick={() => nav(`/cad/units?id=${m.id}`)}>Details</Button>;
    return null;
  };
  return (
    <>
      <PageHeader title="Einsatzkarte" subtitle="Mausrad/Buttons zum Zoomen, Ziehen zum Verschieben · Layer rechts oben" />
      {map.error && <ErrorState error={map.error} />}
      <MapView cfg={cfg} data={map.data} height="calc(100dvh - 13rem)" focus={focus} actionsFor={actionsFor} onCreateIncidentAt={(x, z) => setDraft({ init: { mapX: x, mapZ: z } })} />
      {draft && <IncidentForm cfg={cfg} initial={draft.init} callId={draft.callId} onClose={() => setDraft(null)} onSaved={(i) => nav(`/cad/incidents?id=${i.id}`)} />}
    </>
  );
}

// ───────── Notrufe ─────────
export function CadCalls() {
  const { cfg } = useCadConfig();
  const [status, setStatus] = useState('OPEN');
  const [draft, setDraft] = useState<CadCallRow | null>(null);
  const q = useQuery({ queryKey: ['cad-calls', status], queryFn: () => api<CadCallRow[]>('/cad/calls', { query: { status } }), refetchInterval: 15_000 });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const [sp] = useSearchParams();
  const hl = sp.get('id');
  return (
    <>
      <PageHeader title="Notrufe" subtitle="ER:LC Emergency Calls – werden automatisch erkannt" actions={<Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Offen</option><option value="CLAIMED">Übernommen</option><option value="CLOSED">Geschlossen</option><option value="ALL">Alle</option></Select>} />
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
interface UnitDraft { id?: string; callsign: string; name?: string | null; type?: string | null; color?: string | null; icon?: string | null; status?: string; discordRoleId?: string | null; guildId?: string | null; erlcTeam?: string | null; operational?: boolean; vehicle?: string | null; notes?: string | null; mapX?: number | null; mapZ?: number | null }

export function CadUnits() {
  const { can } = useAuth();
  const { cfg } = useCadConfig();
  const qc = useQueryClient();
  const guilds = useGuilds();
  const [sp] = useSearchParams();
  const [edit, setEdit] = useState<UnitDraft | null>(null);
  const [err, setErr] = useState<string>();
  const q = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units'), refetchInterval: 20_000 });
  const status = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/cad/units/${v.id}/status`, { body: { status: v.status } }), onSuccess: () => invalidateAll(qc), onError: (e) => setErr(errText(e)) });
  const save = useMutation({
    mutationFn: (u: UnitDraft) => { const { id, ...body } = u; const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === '' ? null : v])); return id ? api(`/cad/units/${id}`, { method: 'PATCH', body: clean }) : api('/cad/units', { body: Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== null && v !== undefined)) }); },
    onSuccess: () => { setEdit(null); invalidateAll(qc); }, onError: (e) => setErr(errText(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/cad/units/${id}`, { method: 'DELETE' }), onSuccess: () => { setEdit(null); invalidateAll(qc); }, onError: (e) => setErr(errText(e)) });
  const types = [...cfg.unitTypes.map((t) => t.key), null];
  return (
    <>
      <PageHeader title="Einheiten" subtitle="Status, Besatzung, aktuelle Einsätze und Position" actions={can('cad.manage_units') ? <Button onClick={() => setEdit({ callsign: '', type: cfg.unitTypes[0]?.key ?? null, operational: true })}>Neue Einheit</Button> : undefined} />
      {err && <div role="alert" className="mb-2 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState text="Noch keine Einheiten." hint="z. B. SEK-01, K9-01 – Typen, Farben und Icons unter Einstellungen." /></Card> : types.map((t) => {
        const list = q.data!.filter((u) => (u.type ?? null) === t || (t === null && u.type && !cfg.unitTypes.some((x) => x.key === u.type)));
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
                  {can('cad.assign_unit') ? <Select aria-label={`Status ${u.callsign}`} className="w-auto py-1 text-xs" value={u.status} onChange={(e) => status.mutate({ id: u.id, status: e.target.value })}>{cfg.unitStatuses.map((s) => <option key={s.key} value={s.key}>{optLabel(cfg.unitStatuses, s.key)}</option>)}</Select> : <span>{optLabel(cfg.unitStatuses, u.status)}</span>}
                  {u.current && <Link className="text-xs hover:underline" to={`/cad/incidents?id=${u.current.id}`}>Einsatz {u.current.number}</Link>}
                </div>
                <p className="mt-1 text-xs text-muted">Besatzung: {u.crew.length ? u.crew.map((c) => `${c.callsign ?? c.discordName ?? c.erlcName}${c.inGame ? ' 🟢' : ''}`).join(', ') : u.memberNames.join(', ') || '—'}</p>
                <p className="text-xs text-muted">Position: {u.position ? `${u.position.source === 'erlc' ? 'live aus ER:LC' : 'manuell'}${u.position.street ? ` · ${u.position.street}` : ''}` : 'unbekannt'}</p>
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
            <Field label="Icon (Emoji)">{(id) => <Input id={id} maxLength={4} value={edit.icon ?? ''} placeholder={cfg.unitTypes.find((t) => t.key === edit.type)?.emoji ?? '🚔'} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} />}</Field>
            <Field label="Discord-Server">{(id) => <Select id={id} value={edit.guildId ?? ''} onChange={(e) => setEdit({ ...edit, guildId: e.target.value || null })}><option value="">—</option>{(guilds.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>
            <Field label="Discord-Rolle (wird bei Zuweisung erwähnt)">{(id) => <Select id={id} value={edit.discordRoleId ?? ''} onChange={(e) => setEdit({ ...edit, discordRoleId: e.target.value || null })}><option value="">—</option>{(guilds.data ?? []).filter((g) => !edit.guildId || g.id === edit.guildId).map((g) => <optgroup key={g.id} label={g.name}>{g.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}</Select>}</Field>
            <Field label="ER:LC-Team">{(id) => <Input id={id} maxLength={40} placeholder="z. B. Police, Sheriff" value={edit.erlcTeam ?? ''} onChange={(e) => setEdit({ ...edit, erlcTeam: e.target.value })} />}</Field>
            <Field label="Fahrzeug">{(id) => <Input id={id} maxLength={64} value={edit.vehicle ?? ''} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })} />}</Field>
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
  const [announce, setAnnounce] = useState('');
  const [msg, setMsg] = useState<string>();
  const q = useQuery({ queryKey: ['cad-radio'], queryFn: () => api<CadRadioRow[]>('/cad/radio', { query: { take: 100 } }), refetchInterval: 15_000 });
  const inc = useQuery({ queryKey: ['cad-incidents', 'active', ''], queryFn: () => api<CadIncidentRow[]>('/cad/incidents', { query: { active: 'true' } }) });
  const send = useMutation({ mutationFn: () => api('/cad/radio', { body: { text, ...(incidentId ? { incidentId } : {}) } }), onSuccess: () => { setText(''); invalidateAll(qc); }, onError: (e) => setMsg(errText(e)) });
  const ann = useMutation({ mutationFn: () => api<{ channels: number }>('/cad/announcements', { body: { text: announce } }), onSuccess: (r) => { setAnnounce(''); setMsg(`Leitstellenmeldung an ${r.channels} Kanal/Kanäle gesendet.`); }, onError: (e) => setMsg(errText(e)) });
  return (
    <>
      <PageHeader title="Funk" subtitle="Funkmeldungen – mit Einsatz landen sie in der Einsatzchronik (auch aus Discord: /cad funk)" />
      {msg && <p role="status" className="mb-2 text-sm text-muted">{msg}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Funkverkehr">
          {can('cad.radio') && <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
            <Input aria-label="Funkmeldung" className="min-w-48 flex-1" maxLength={500} placeholder="z. B. „Am Einsatzort.“" value={text} onChange={(e) => setText(e.target.value)} />
            <Select aria-label="Einsatz" className="w-auto" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}><option value="">Einsatz meiner Einheit / keiner</option>{(inc.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.title}</option>)}</Select>
            <Button type="submit" disabled={!text.trim() || send.isPending}>Senden</Button>
          </form>}
          {q.isLoading ? <SkeletonRows /> : !q.data?.length ? <EmptyState text="Noch keine Funkmeldungen." /> : (
            <ul className="divide-y divide-line text-sm">{q.data.map((r) => <li key={r.id} className="py-1.5"><b>{r.callsign ?? r.authorName ?? 'Funk'}:</b> „{r.text}“<span className="block text-xs text-muted">{new Date(r.createdAt).toLocaleString('de-DE')}{r.incidentNumber ? ` · ${r.incidentNumber}` : ''}{r.authorName && r.callsign ? ` · ${r.authorName}` : ''}{r.guildId ? ' · Discord' : ''}</span></li>)}</ul>
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
