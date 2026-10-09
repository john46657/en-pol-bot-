import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Car, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_FLEET_CONFIG, DRIVER_HINT, type FleetConfig } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAutosaveDraft } from '../../lib/autosave';
import { usePrefs, type Preferences } from '../../lib/prefs';
import { ago, type CadIncidentRow, type CadUnitRow } from '../../lib/cad';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, fmt } from '../../components/ui';

export interface FleetVehicle {
  id: string; erlcServerId: string; serverName: string; key: string; active: boolean; uncertain: boolean; stale: boolean;
  api: { name: string; owner: string; ownerRobloxId: string | null; ownerTeam: string | null; plate: string | null; texture: string | null; colorHex: string | null; colorName: string | null; policeReason: string; firstSeenAt: string; lastSeenAt: string; apiChangedAt: string };
  driver: { state: string; label: string; hint: string };
  ownerOnline: boolean;
  ownerPosition: { x: number; z: number; street: string | null; postal: string | null; hint: string } | null;
  discord: { discordId: string | null; name: string | null } | null;
  model: { id: string; name: string; category: string; imageUrl: string | null; internalCode: string | null; department: string | null } | null;
  internal: { unitId: string | null; unit: { id: string; callsign: string; name: string | null } | null; status: string; internalCode: string | null; notes: string | null; tags: string[]; version: number; updatedAt: string };
}
interface Detail extends FleetVehicle {
  raw: Record<string, unknown>[];
  incidents: { id: string; number: string; title: string; status: string }[];
  events: { id: string; kind: string; text: string; createdAt: string; actorName: string | null }[];
}
interface Server { id: string; name: string; status: string; lastSyncAt: string | null; lastError: string | null; vehiclesEnabled: boolean }
interface Model { id: string; name: string; erlcName: string; category: string; description: string | null; internalCode: string | null; imageUrl: string | null; active: boolean; tags: string[]; department: string | null; liveCount: number }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');
const U = 'Unbekannt';
export function useFleetConfig() {
  const q = useQuery({ queryKey: ['fleet-config'], queryFn: () => api<FleetConfig>('/fleet/config'), staleTime: 60_000 });
  return q.data ?? DEFAULT_FLEET_CONFIG;
}
const catIcon = (cfg: FleetConfig, key: string | null | undefined) => cfg.categories.find((c) => c.key === key)?.icon ?? null;
export function VehicleIcon({ v, cfg, size = 'h-9 w-9' }: { v: Pick<FleetVehicle, 'model'>; cfg: FleetConfig; size?: string }) {
  // echtes Bild nur, wenn im Katalog hinterlegt – sonst neutrales Symbol
  if (v.model?.imageUrl) return <img src={v.model.imageUrl} alt="" className={`${size} shrink-0 rounded object-cover`} />;
  const icon = catIcon(cfg, v.model?.category);
  return <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded bg-panel-2 text-lg`}>{icon ?? <Car size={18} />}</span>;
}
const Swatch = ({ hex, name }: { hex: string | null; name: string | null }) => <span className="inline-flex items-center gap-1.5">{hex && <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: hex }} />}{name ?? hex ?? U}</span>;
export function InternalStatus({ cfg, status }: { cfg: FleetConfig; status: string }) {
  const s = cfg.internalStatuses.find((x) => x.key === status);
  return <span className="inline-flex items-center gap-1.5 text-xs"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s?.color ?? '#64748b' }} />{s?.label ?? status}</span>;
}

/** Polizeifahrzeuge: Live aus ER:LC (getrennt vom Katalog), interne Zuordnung im CAD. */
export function FleetPage() {
  const { can } = useAuth();
  const tabs = ['Live (ER:LC)', 'Modellkatalog', ...(can('fleet.manage') ? ['Einstellungen'] : [])];
  const [tab, setTab] = useState(tabs[0]!);
  return (
    <>
      <PageHeader title="🚓 Polizeifahrzeuge" subtitle="Gerade in ER:LC gespawnte Polizeifahrzeuge und der gepflegte Modellkatalog – API-Daten und interne CAD-Daten getrennt" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-3">{tab === tabs[0] ? <LiveFleet /> : tab === 'Modellkatalog' ? <Catalog /> : <FleetSettings />}</div>
    </>
  );
}

type SortKey = 'vehicle' | 'model' | 'color' | 'owner' | 'discord' | 'unit' | 'status' | 'updated';
const COLS: [SortKey | null, string][] = [['vehicle', 'Fahrzeug'], ['model', 'Modell (Katalog)'], ['color', 'Farbe'], [null, 'Fahrer'], ['owner', 'Roblox-Spieler (Besitzer)'], ['discord', 'Discord-Mitglied'], ['unit', 'Einheit (intern)'], ['status', 'Status'], ['updated', 'Letzte Aktualisierung']];
const sortVal = (v: FleetVehicle, k: SortKey): string => ({
  vehicle: v.api.name, model: v.model?.name ?? '', color: v.api.colorName ?? '', owner: v.api.owner, discord: v.discord?.name ?? '', unit: v.internal.unit?.callsign ?? '', status: `${v.active ? 0 : 1}${v.internal.status}`, updated: v.api.lastSeenAt,
}[k]);

function LiveFleet() {
  const cfg = useFleetConfig();
  const { prefs, update } = usePrefs();
  const fp = prefs.fleet ?? {};
  const f = fp.filters ?? {};
  const sort = fp.sort ?? { key: 'vehicle', dir: 'asc' as const };
  const set = (patch: NonNullable<Preferences['fleet']>) => update({ fleet: { ...fp, ...patch } });
  const setF = (patch: NonNullable<NonNullable<Preferences['fleet']>['filters']>) => set({ filters: { ...f, ...patch } });
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get('id'));
  const q = useQuery({ queryKey: ['fleet-vehicles', f.active ?? 'active'], queryFn: () => api<{ items: FleetVehicle[]; servers: Server[] }>('/fleet/vehicles', { query: { active: f.active ?? 'active' } }), refetchInterval: 10_000 });
  const items = q.data?.items ?? [];
  const opts = (fn: (v: FleetVehicle) => string | null | undefined) => [...new Set(items.map(fn).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  const search = (fp.search ?? '').trim().toLowerCase();
  const rows = useMemo(() => items
    .filter((v) => !f.model || v.api.name === f.model)
    .filter((v) => !f.color || v.api.colorName === f.color)
    .filter((v) => !f.owner || v.api.owner === f.owner)
    .filter((v) => !f.unit || (f.unit === '—' ? !v.internal.unit : v.internal.unit?.callsign === f.unit))
    .filter((v) => !f.online || f.online === 'all' || (f.online === 'yes') === v.ownerOnline)
    .filter((v) => !search || [v.api.name, v.api.owner, v.api.plate, v.internal.internalCode, v.model?.name, v.model?.internalCode, v.internal.unit?.callsign].some((x) => x?.toLowerCase().includes(search)))
    .sort((a, b) => sortVal(a, sort.key as SortKey).localeCompare(sortVal(b, sort.key as SortKey)) * (sort.dir === 'asc' ? 1 : -1)),
  [items, f, search, sort]);
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const servers = q.data.servers;
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {!servers.length && <p className="text-warning">Kein ER:LC-Server verbunden (CAD → Einstellungen → ER:LC) – es gibt keine Live-Fahrzeugdaten.</p>}
        {servers.map((s) => (
          <span key={s.id} className={`rounded border px-2 py-1 ${s.status === 'CONNECTED' && s.vehiclesEnabled ? 'border-line' : 'border-warning/60 text-warning'}`}>
            <b>{s.name}</b> · {s.status === 'CONNECTED' ? '🟢 verbunden' : `⚠️ ${s.status}`} · letzte Synchronisierung {s.lastSyncAt ? ago(s.lastSyncAt) : 'noch nie'}
            {!s.vehiclesEnabled && ' · Datenart „Fahrzeuge“ ist aus'}{s.status !== 'CONNECTED' && ' – angezeigt wird der letzte gespeicherte Stand (veraltet)'}
          </span>
        ))}
      </div>
      <p className="mb-3 rounded border border-line bg-panel-2/40 px-3 py-2 text-xs text-muted">ℹ️ {DRIVER_HINT} Eine Fahrzeugposition liefert ER:LC ebenfalls nicht. Gezeigt wird höchstens die Position des Besitzers.</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Input type="search" aria-label="Suche" className="xl:col-span-2" placeholder="Modell, Spieler, Kennung…" value={fp.search ?? ''} onChange={(e) => set({ search: e.target.value })} />
        <Select aria-label="Modell" value={f.model ?? ''} onChange={(e) => setF({ model: e.target.value || undefined })}><option value="">Alle Modelle</option>{opts((v) => v.api.name).map((x) => <option key={x}>{x}</option>)}</Select>
        <Select aria-label="Farbe" value={f.color ?? ''} onChange={(e) => setF({ color: e.target.value || undefined })}><option value="">Alle Farben</option>{opts((v) => v.api.colorName).map((x) => <option key={x}>{x}</option>)}</Select>
        <Select aria-label="Besitzer" value={f.owner ?? ''} onChange={(e) => setF({ owner: e.target.value || undefined })}><option value="">Alle Besitzer</option>{opts((v) => v.api.owner).map((x) => <option key={x}>{x}</option>)}</Select>
        <Select aria-label="Einheit" value={f.unit ?? ''} onChange={(e) => setF({ unit: e.target.value || undefined })}><option value="">Alle Einheiten</option><option value="—">ohne Einheit</option>{opts((v) => v.internal.unit?.callsign).map((x) => <option key={x}>{x}</option>)}</Select>
        <Select aria-label="Aktiv" value={f.active ?? 'active'} onChange={(e) => setF({ active: e.target.value as 'active' })}><option value="active">Gerade gemeldet</option><option value="inactive">Nicht mehr gemeldet</option><option value="all">Alle</option></Select>
        <Select aria-label="Besitzer im Spiel" value={f.online ?? 'all'} onChange={(e) => setF({ online: e.target.value as 'all' })}><option value="all">Besitzer: alle</option><option value="yes">Besitzer im Spiel</option><option value="no">Besitzer nicht im Spiel</option></Select>
      </div>
      {!rows.length ? <EmptyState text={items.length ? 'Kein Fahrzeug passt zu den Filtern.' : 'Gerade meldet ER:LC keine Polizeifahrzeuge.'} hint="Polizeifahrzeug = Besitzer im Team Police oder (Besitzer nicht im Spiel) Modell im Katalog." /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted">{COLS.map(([k, l]) => (
                <th key={l} className="py-1.5 pr-3 font-medium" aria-sort={k && sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {k ? <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => set({ sort: { key: k, dir: sort.key === k && sort.dir === 'asc' ? 'desc' : 'asc' } })}>{l}{sort.key === k && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button> : l}
                </th>
              ))}</tr></thead>
              <tbody className="divide-y divide-line">{rows.map((v) => (
                <tr key={v.id} className={`cursor-pointer hover:bg-panel-2 ${v.active ? '' : 'opacity-60'}`} onClick={() => setOpen(v.id)}>
                  <td className="py-1.5 pr-3"><button type="button" className="flex items-center gap-2 text-left" onClick={(e) => { e.stopPropagation(); setOpen(v.id); }}><VehicleIcon v={v} cfg={cfg} /><span><b>{v.api.name}</b><span className="block text-xs text-muted">{[v.api.plate, v.internal.internalCode ?? v.model?.internalCode].filter(Boolean).join(' · ') || '—'}{v.uncertain && ' · ⚠️ unsicher'}</span></span></button></td>
                  <td className="pr-3">{v.model?.name ?? <span className="text-muted">nicht im Katalog</span>}</td>
                  <td className="pr-3"><Swatch hex={v.api.colorHex} name={v.api.colorName} /></td>
                  <td className="pr-3 text-xs text-muted" title={v.driver.hint}>{v.driver.label}</td>
                  <td className="pr-3">{v.api.owner}<span className="block text-xs text-muted">{v.api.ownerRobloxId ? `ID ${v.api.ownerRobloxId}` : 'ID unbekannt'}{v.ownerOnline ? ' · im Spiel' : ' · nicht im Spiel'}</span></td>
                  <td className="pr-3">{v.discord?.name ?? (v.discord?.discordId ? `<@${v.discord.discordId}>` : <span className="text-muted">nicht verknüpft</span>)}</td>
                  <td className="pr-3">{v.internal.unit?.callsign ?? <span className="text-muted">—</span>}</td>
                  <td className="pr-3"><InternalStatus cfg={cfg} status={v.internal.status} /><span className="block text-[11px] text-muted">{v.active ? (v.stale ? 'ER:LC: veraltet' : 'ER:LC: gemeldet') : 'ER:LC: nicht mehr gemeldet'}</span></td>
                  <td className="text-xs text-muted">{ago(v.api.lastSeenAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">{rows.length} von {items.length} Fahrzeugen</p>
        </Card>
      )}
      <VehicleDetail id={open} onClose={() => setOpen(null)} />
    </>
  );
}

const Kv = ({ k, v, hint }: { k: string; v: ReactNode; hint?: string }) => <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 border-b border-line/50 py-1 text-sm last:border-0"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words">{v ?? U}{hint && <span className="block text-[11px] text-muted">{hint}</span>}</dd></div>;

/** Detailansicht: ER:LC-Daten und interne CAD-Daten klar getrennt; interne Felder werden automatisch gespeichert. */
export function VehicleDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const cfg = useFleetConfig();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['fleet-vehicle', id], queryFn: () => api<Detail>(`/fleet/vehicles/${id}`), enabled: !!id && can('fleet.view_details') });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units'), enabled: !!id && can('fleet.assign') });
  const d = q.data;
  const [draft, setDraft] = useState<{ unitId: string | null; internalStatus: string; internalCode: string; notes: string; tags: string }>();
  const loaded = useRef<string | null>(null);
  useEffect(() => { if (d && loaded.current !== d.id) { loaded.current = d.id; setDraft({ unitId: d.internal.unitId, internalStatus: d.internal.status, internalCode: d.internal.internalCode ?? '', notes: d.internal.notes ?? '', tags: d.internal.tags.join(', ') }); } }, [d]);
  useEffect(() => { if (!id) { loaded.current = null; setDraft(undefined); } }, [id]);
  const canEdit = can('fleet.edit'), canAssign = can('fleet.assign');
  useAutosaveDraft(id && draft ? `fleet:vehicle:${id}` : null, draft, (v) => (canEdit || canAssign ? {
    method: 'PATCH', path: `/fleet/vehicles/${id}`, guildId: null, label: 'Polizeifahrzeug',
    body: { ...(canAssign ? { unitId: v.unitId } : {}), ...(canEdit ? { internalStatus: v.internalStatus, internalCode: v.internalCode.trim() || null, notes: v.notes.trim() || null, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20) } : {}) },
  } : null));
  const [incident, setIncident] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const incidents = useQuery({ queryKey: ['cad-incidents', 'active-fleet'], queryFn: () => api<CadIncidentRow[]>('/cad/incidents', { query: { active: 'true', take: 100 } }), enabled: !!id && canEdit });
  const doc = useMutation({
    mutationFn: () => api<{ number: string }>(`/fleet/vehicles/${id}/incidents`, { body: { incidentId: incident, note: note.trim() || null } }),
    onSuccess: (r) => { setMsg({ ok: true, text: `Bei Einsatz ${r.number} dokumentiert.` }); setNote(''); void qc.invalidateQueries({ queryKey: ['fleet-vehicle', id] }); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  return (
    <Modal open={!!id} title={d ? `${d.api.name}${d.api.plate ? ` · ${d.api.plate}` : ''}` : 'Fahrzeug'} onClose={onClose} wide>
      {!can('fleet.view_details') ? <p className="text-sm text-muted">Für Fahrzeugdetails fehlt dir das Recht.</p> : q.isLoading || !d ? (q.error ? <ErrorState error={q.error} /> : <SkeletonRows />) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <VehicleIcon v={d} cfg={cfg} size="h-14 w-14" />
            <div><p className="text-lg font-semibold">{d.api.name}</p><p className="text-xs text-muted">{d.model ? `Katalog: ${d.model.name}` : 'Nicht im Modellkatalog'} · {d.serverName}</p></div>
            <span className="ml-auto flex flex-wrap gap-1">{d.active ? <Badge tone={d.stale ? 'warning' : 'success'}>{d.stale ? 'ER:LC: veraltet' : 'ER:LC: gemeldet'}</Badge> : <Badge>nicht mehr gemeldet</Badge>}{d.uncertain && <Badge tone="warning">Zuordnung unsicher</Badge>}</span>
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-md border border-info/40 p-3" aria-label="Daten laut ER:LC-API">
              <h3 className="mb-1 text-sm font-semibold text-info">📡 Laut ER:LC-API</h3>
              <dl>
                <Kv k="Modell" v={d.api.name} />
                <Kv k="Farbe" v={<Swatch hex={d.api.colorHex} name={d.api.colorName} />} />
                <Kv k="Lackierung" v={d.api.texture} />
                <Kv k="Kennzeichen" v={d.api.plate} />
                <Kv k="Fahrer" v={d.driver.label} hint={d.driver.hint} />
                <Kv k="Besitzer (gespawnt von)" v={d.api.owner} />
                <Kv k="Roblox-ID" v={d.api.ownerRobloxId} />
                <Kv k="Team des Besitzers" v={d.api.ownerTeam} />
                <Kv k="Discord-Mitglied" v={d.discord?.name ?? d.discord?.discordId ?? 'nicht verknüpft'} />
                <Kv k="Position" v={d.ownerPosition ? <>{[d.ownerPosition.street, d.ownerPosition.postal].filter(Boolean).join(' · ') || `${Math.round(d.ownerPosition.x)}, ${Math.round(d.ownerPosition.z)}`} · <Link className="underline" to={`/cad/map`}>Karte</Link></> : 'Nicht verfügbar'} hint={d.ownerPosition?.hint ?? (d.ownerOnline ? undefined : 'Besitzer ist gerade nicht im Spiel.')} />
                <Kv k="Als Polizei erkannt" v={d.api.policeReason === 'team' ? 'Besitzer im Team Police' : 'Modell im Polizei-Katalog (Besitzer nicht im Spiel)'} />
                <Kv k="Zuerst gemeldet" v={fmt(d.api.firstSeenAt)} />
                <Kv k="Zuletzt gemeldet" v={`${fmt(d.api.lastSeenAt)} (${ago(d.api.lastSeenAt)})`} />
              </dl>
              {d.uncertain && <p className="mt-1 text-xs text-warning">Der Besitzer hat mehrere gleiche Fahrzeuge gespawnt. ER:LC liefert keine Fahrzeug-ID, darum ist die Zuordnung zu diesem Eintrag unsicher.</p>}
              <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">Rohdaten des letzten Abrufs</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-bg p-2 text-[11px]">{d.raw.length ? JSON.stringify(d.raw, null, 2) : 'Nicht im letzten Abruf enthalten.'}</pre></details>
            </section>
            <section className="rounded-md border border-primary/40 p-3" aria-label="Interne CAD-Daten">
              <h3 className="mb-1 text-sm font-semibold text-primary">🗂️ Intern (CAD) – keine Live-Daten</h3>
              {!draft ? <SkeletonRows rows={3} /> : (
                <div className="space-y-2">
                  <Field label="Einheit" hint="Interne Zuweisung – bestätigt nicht, dass die Einheit das Fahrzeug gerade nutzt.">{(fid) => (
                    <Select id={fid} disabled={!canAssign} value={draft.unitId ?? ''} onChange={(e) => setDraft({ ...draft, unitId: e.target.value || null })}>
                      <option value="">— keine —</option>
                      {(units.data ?? (d.internal.unit ? [d.internal.unit as CadUnitRow] : [])).map((u) => <option key={u.id} value={u.id}>{u.callsign}{u.name ? ` · ${u.name}` : ''}</option>)}
                    </Select>
                  )}</Field>
                  <Field label="Status">{(fid) => <Select id={fid} disabled={!canEdit} value={draft.internalStatus} onChange={(e) => setDraft({ ...draft, internalStatus: e.target.value })}>{cfg.internalStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>}</Field>
                  <Field label="Interne Kennung">{(fid) => <Input id={fid} disabled={!canEdit} maxLength={40} placeholder="z. B. EN 1-21" value={draft.internalCode} onChange={(e) => setDraft({ ...draft, internalCode: e.target.value })} />}</Field>
                  <Field label="Tags (mit Komma)">{(fid) => <Input id={fid} disabled={!canEdit} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />}</Field>
                  <Field label="Notizen">{(fid) => <Textarea id={fid} disabled={!canEdit} rows={3} maxLength={3000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />}</Field>
                  {(canEdit || canAssign) && <p className="text-[11px] text-muted">Änderungen werden automatisch gespeichert.</p>}
                </div>
              )}
            </section>
          </div>
          {canEdit && (
            <section aria-label="Bei Einsatz dokumentieren">
              <h3 className="mb-1 text-sm font-semibold">Bei Einsatz dokumentieren</h3>
              <form className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); if (incident) doc.mutate(); }}>
                <Select aria-label="Einsatz" value={incident} onChange={(e) => setIncident(e.target.value)}><option value="">Einsatz wählen…</option>{(incidents.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.number} · {i.title}</option>)}</Select>
                <Input aria-label="Notiz" placeholder="Notiz (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button type="submit" disabled={!incident || doc.isPending}>Dokumentieren</Button>
              </form>
            </section>
          )}
          {d.incidents.length > 0 && <section><h3 className="mb-1 text-sm font-semibold">Einsätze</h3><ul className="space-y-0.5 text-sm">{d.incidents.map((i) => <li key={i.id}><Link className="hover:underline" to={`/cad/incidents?id=${i.id}`}><b>{i.number}</b> · {i.title}</Link></li>)}</ul></section>}
          <section><h3 className="mb-1 text-sm font-semibold">Verlauf</h3>
            {d.events.length ? <ul className="max-h-60 space-y-0.5 overflow-auto text-xs">{d.events.map((e) => <li key={e.id}><span className="text-muted">{fmt(e.createdAt)}</span> · <Badge tone={e.kind === 'INTERNAL' || e.kind === 'INCIDENT' ? 'primary' : 'info'}>{e.kind === 'INTERNAL' || e.kind === 'INCIDENT' ? 'intern' : 'ER:LC'}</Badge> {e.text}{e.actorName && <span className="text-muted"> – {e.actorName}</span>}</li>)}</ul> : <p className="text-sm text-muted">Kein Verlauf.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Modellkatalog (getrennt von den Live-Fahrzeugen): Pflege nur mit fleet.manage_catalog, Änderungen werden automatisch gespeichert. */
function Catalog() {
  const { can } = useAuth();
  const cfg = useFleetConfig();
  const qc = useQueryClient();
  const manage = can('fleet.manage_catalog');
  const q = useQuery({ queryKey: ['fleet-catalog'], queryFn: () => api<Model[]>('/fleet/catalog') });
  const sug = useQuery({ queryKey: ['fleet-suggestions'], queryFn: () => api<{ erlcName: string; seen: number }[]>('/fleet/catalog/suggestions'), enabled: manage });
  const [edit, setEdit] = useState<Model | 'new' | null>(null);
  const [prefill, setPrefill] = useState('');
  const [err, setErr] = useState<string>();
  const del = useMutation({ mutationFn: (id: string) => api(`/fleet/catalog/${id}`, { method: 'DELETE' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['fleet-catalog'] }), onError: (e) => setErr(errText(e)) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Die ER:LC-API meldet nur gerade gespawnte Fahrzeuge, keine vollständige Modellliste. Den Katalog pflegt ihr hier selbst. Das Feld „ER:LC-Modellname“ muss genau so lauten, wie ER:LC das Modell meldet.</p>
        {manage && <Button onClick={() => { setPrefill(''); setEdit('new'); }}><Plus size={14} />Modell anlegen</Button>}
      </div>
      {err && <p role="alert" className="mb-2 text-sm text-danger">{err}</p>}
      {!q.data.length ? <EmptyState text="Noch keine Modelle im Katalog." hint={manage ? 'Unten stehen Modelle, die ER:LC schon gemeldet hat – mit „Übernehmen“ anlegen.' : undefined} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((m) => (
            <Card key={m.id} className={m.active ? '' : 'opacity-60'}>
              <div className="flex gap-3">
                {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-16 w-24 shrink-0 rounded object-cover" /> : <span aria-hidden className="grid h-16 w-24 shrink-0 place-items-center rounded bg-panel-2 text-3xl">{catIcon(cfg, m.category) ?? '🚗'}</span>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name}{!m.active && <span className="ml-1 text-xs text-muted">(inaktiv)</span>}</p>
                  <p className="truncate text-xs text-muted">ER:LC: {m.erlcName}</p>
                  <p className="text-xs">{cfg.categories.find((c) => c.key === m.category)?.label ?? m.category}{m.department ? ` · ${m.department}` : ''}{m.internalCode ? ` · ${m.internalCode}` : ''}</p>
                  <p className="text-xs text-muted">{m.liveCount} gerade gemeldet</p>
                </div>
              </div>
              {m.description && <p className="mt-2 text-sm">{m.description}</p>}
              {m.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
              {manage && <div className="mt-2 flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => setEdit(m)}>Bearbeiten</Button><Button size="sm" variant="ghost" aria-label={`${m.name} löschen`} onClick={() => { if (confirm(`„${m.name}“ aus dem Katalog löschen?`)) del.mutate(m.id); }}><Trash2 size={14} /></Button></div>}
            </Card>
          ))}
        </div>
      )}
      {manage && !!sug.data?.length && (
        <Card className="mt-3" title="Von ER:LC gemeldet, noch nicht im Katalog">
          <ul className="divide-y divide-line text-sm">{sug.data.map((s) => <li key={s.erlcName} className="flex items-center justify-between gap-2 py-1.5"><span>{s.erlcName} <span className="text-xs text-muted">({s.seen}× gesehen)</span></span><Button size="sm" variant="secondary" onClick={() => { setPrefill(s.erlcName); setEdit('new'); }}>Übernehmen</Button></li>)}</ul>
        </Card>
      )}
      <ModelEditor model={edit} prefill={prefill} cfg={cfg} onClose={() => setEdit(null)} onSaved={() => { void qc.invalidateQueries({ queryKey: ['fleet-catalog'] }); void qc.invalidateQueries({ queryKey: ['fleet-suggestions'] }); }} />
    </>
  );
}

function ModelEditor({ model, prefill, cfg, onClose, onSaved }: { model: Model | 'new' | null; prefill: string; cfg: FleetConfig; onClose: () => void; onSaved: () => void }) {
  const isNew = model === 'new';
  const m = model && model !== 'new' ? model : null;
  const blank = { name: prefill, erlcName: prefill, category: cfg.categories[0]?.key ?? 'OTHER', description: '', internalCode: '', active: true, tags: '', department: '' };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState<string>();
  const imgRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  useEffect(() => { setErr(undefined); setV(m ? { name: m.name, erlcName: m.erlcName, category: m.category, description: m.description ?? '', internalCode: m.internalCode ?? '', active: m.active, tags: m.tags.join(', '), department: m.department ?? '' } : blank); }, [model, prefill]);
  const body = (x: typeof v) => ({ name: x.name.trim(), erlcName: x.erlcName.trim(), category: x.category, description: x.description.trim() || null, internalCode: x.internalCode.trim() || null, active: x.active, tags: x.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20), department: x.department.trim() || null });
  // Bestehende Modelle: automatisch speichern; neue: einmal „Anlegen“
  useAutosaveDraft(m ? `fleet:model:${m.id}` : null, m ? v : undefined, (x) => (x.name.trim() && x.erlcName.trim() ? { method: 'PATCH', path: `/fleet/catalog/${m!.id}`, body: body(x), guildId: null, label: 'Fahrzeugkatalog' } : null));
  const create = useMutation({ mutationFn: () => api('/fleet/catalog', { body: body(v) }), onSuccess: () => { onSaved(); onClose(); }, onError: (e) => setErr(errText(e)) });
  const image = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append('file', file); return api(`/fleet/catalog/${m!.id}/image`, { formData: fd }); }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['fleet-catalog'] }), onError: (e) => setErr(errText(e)) });
  const f = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => <Field label={label}>{(id) => <Input id={id} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} />}</Field>;
  return (
    <Modal open={!!model} title={isNew ? 'Modell anlegen' : `Modell: ${m?.name ?? ''}`} onClose={() => { if (m) onSaved(); onClose(); }}>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (isNew) create.mutate(); else { onSaved(); onClose(); } }}>
        {f('name', 'Fahrzeugname *', { maxLength: 80, required: true })}
        {f('erlcName', 'ER:LC-Modellname * (genau wie ER:LC ihn meldet)', { maxLength: 120, required: true })}
        <Field label="Kategorie">{(id) => <Select id={id} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{cfg.categories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}</Select>}</Field>
        {f('internalCode', 'Interne Kennung', { maxLength: 40 })}
        {f('department', 'Abteilung (optional)', { maxLength: 60 })}
        {f('tags', 'Tags (mit Komma)')}
        <Field label="Beschreibung">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Aktiv (zählt zur Polizei-Erkennung)</label>
        {m && <div className="flex items-center gap-2"><input ref={imgRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { const x = e.target.files?.[0]; if (x) image.mutate(x); e.target.value = ''; }} /><Button type="button" size="sm" variant="secondary" disabled={image.isPending} onClick={() => imgRef.current?.click()}>Bild hochladen</Button><span className="text-xs text-muted">Nur echte Modellbilder – sonst bleibt das Symbol.</span></div>}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">{isNew ? <><Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!v.name.trim() || !v.erlcName.trim() || create.isPending}>Anlegen</Button></> : <><span className="mr-auto self-center text-xs text-muted">Wird automatisch gespeichert.</span><Button type="submit">Fertig</Button></>}</div>
      </form>
    </Modal>
  );
}

/** Kategorien, interne Status und Abgleich-Einstellungen (automatisch gespeichert). */
function FleetSettings() {
  const q = useQuery({ queryKey: ['fleet-config'], queryFn: () => api<FleetConfig>('/fleet/config') });
  const [d, setD] = useState<FleetConfig>();
  useEffect(() => { if (q.data && !d) setD(q.data); }, [q.data, d]);
  const ok = (c: FleetConfig) => [c.categories, c.internalStatuses].every((l) => l.length && l.every((o) => /^[A-Z0-9_]+$/.test(o.key) && o.label.trim()) && new Set(l.map((o) => o.key)).size === l.length) && c.internalStatuses.every((s) => /^#[0-9a-fA-F]{6}$/.test(s.color)) && c.categories.every((x) => x.icon.trim());
  useAutosaveDraft(d ? 'fleet:config' : null, d, (c) => (ok(c) ? { method: 'PUT', path: '/fleet/config', body: c, guildId: null, label: 'Fahrzeug-Einstellungen' } : null));
  if (!d) return <SkeletonRows />;
  const upd = <K extends 'categories' | 'internalStatuses'>(k: K, i: number, patch: Partial<FleetConfig[K][number]>) => setD({ ...d, [k]: d[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {!ok(d) && <p role="alert" className="text-sm text-warning lg:col-span-2">Schlüssel nur A–Z, 0–9 und _, jeder nur einmal, Farbe als #RRGGBB – sonst wird nicht gespeichert.</p>}
      <Card title="Fahrzeugkategorien" actions={<Button size="sm" variant="secondary" onClick={() => setD({ ...d, categories: [...d.categories, { key: `KAT_${d.categories.length + 1}`, label: 'Neu', icon: '🚗' }] })}><Plus size={14} />Hinzufügen</Button>}>
        <ul className="space-y-1.5">{d.categories.map((c, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)_8rem_auto] gap-1.5">
            <Input aria-label="Symbol" maxLength={8} value={c.icon} onChange={(e) => upd('categories', i, { icon: e.target.value })} />
            <Input aria-label="Bezeichnung" maxLength={40} value={c.label} onChange={(e) => upd('categories', i, { label: e.target.value })} />
            <Input aria-label="Schlüssel" className="font-mono text-xs" maxLength={32} value={c.key} onChange={(e) => upd('categories', i, { key: e.target.value.toUpperCase() })} />
            <Button size="sm" variant="ghost" aria-label={`${c.label} entfernen`} disabled={d.categories.length <= 1} onClick={() => setD({ ...d, categories: d.categories.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
          </li>
        ))}</ul>
      </Card>
      <Card title="Interne Fahrzeugstatus" actions={<Button size="sm" variant="secondary" onClick={() => setD({ ...d, internalStatuses: [...d.internalStatuses, { key: `STATUS_${d.internalStatuses.length + 1}`, label: 'Neu', color: '#64748b' }] })}><Plus size={14} />Hinzufügen</Button>}>
        <p className="mb-2 text-xs text-muted">Der erste Status gilt für „keine Einheit“, der zweite wird beim Zuweisen einer Einheit gesetzt.</p>
        <ul className="space-y-1.5">{d.internalStatuses.map((s, i) => (
          <li key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_auto] gap-1.5">
            <input type="color" aria-label="Farbe" className="h-9 w-full rounded border border-line bg-bg" value={s.color} onChange={(e) => upd('internalStatuses', i, { color: e.target.value })} />
            <Input aria-label="Bezeichnung" maxLength={40} value={s.label} onChange={(e) => upd('internalStatuses', i, { label: e.target.value })} />
            <Input aria-label="Schlüssel" className="font-mono text-xs" maxLength={32} value={s.key} onChange={(e) => upd('internalStatuses', i, { key: e.target.value.toUpperCase() })} />
            <Button size="sm" variant="ghost" aria-label={`${s.label} entfernen`} disabled={d.internalStatuses.length <= 1} onClick={() => setD({ ...d, internalStatuses: d.internalStatuses.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
          </li>
        ))}</ul>
      </Card>
      <Card title="Abgleich mit ER:LC">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Mindestabstand zwischen Abgleichen (Sekunden)" hint="Der ER:LC-Abruf selbst läuft im Intervall des Servers (CAD → Einstellungen → ER:LC).">{(id) => <Input id={id} type="number" min={5} max={600} value={d.syncSeconds} onChange={(e) => setD({ ...d, syncSeconds: Math.max(5, Math.min(600, Number(e.target.value) || 5)) })} />}</Field>
          <Field label="Nicht mehr gemeldete Fahrzeuge löschen nach (Tagen)" hint="Nur Einträge ohne interne Daten (Einheit, Notizen, Kennung, Tags).">{(id) => <Input id={id} type="number" min={1} max={90} value={d.keepInactiveDays} onChange={(e) => setD({ ...d, keepInactiveDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })} />}</Field>
        </div>
      </Card>
    </div>
  );
}
