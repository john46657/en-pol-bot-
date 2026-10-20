import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { MdtConfig } from '@enrp/shared';
import { api, type Page } from '../../lib/api';
import { useAutosaveDraft } from '../../lib/autosave';
import { useDebounced } from '../../components/DataTable';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PriorityBadge, Select, SkeletonRows, StatusBadge, fmt, type Tone } from '../../components/ui';
import { Avatar, CitizenBadges, CitizenProfile, MdtCard, nameOf, useMdtConfig } from './Citizens';

interface VehicleRow { id: string; plate: string; model: string | null; color: string | null; status: string; activeBolos: number; owner: { id: string; robloxUsername: string; fullName: string | null } | null }
interface VehicleDetail {
  vehicle: VehicleRow & { notes: string | null; erlcReference: string | null; createdAt: string; owner: (VehicleRow['owner'] & { flags: string[]; photoUrl: string | null }) | null };
  wanted: { id: string; reason: string; priority: string; status: string; createdAt: string }[] | null;
  incidents: { id: string; number: string; title: string; status: string; createdAt: string }[];
  timeline: { id: string; summary: string; createdAt: string }[];
}

const qsId = () => new URLSearchParams(location.search).get('id');

function Pager({ page, size, total, shown, label, onPage }: { page: number; size: number; total: number; shown: number; label: string; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted">
      <span>Zeige {total ? (page - 1) * size + 1 : 0} bis {(page - 1) * size + shown} von {total} {label}</span>
      <span className="flex gap-1"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Zurück</Button><Button size="sm" variant="secondary" disabled={page * size >= total} onClick={() => onPage(page + 1)}>Weiter</Button></span>
    </div>
  );
}

/** Fahrzeugabfrage: Kennzeichen, Modell oder Halter. */
export function MdtVehicles() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(qsId);
  const [person, setPerson] = useState<string | null>(null);
  const dq = useDebounced(q, 250);
  useEffect(() => setPage(1), [dq]);
  const size = 12;
  const list = useQuery({ queryKey: ['mdt-vehicles', dq, page], queryFn: () => api<Page<VehicleRow>>('/mdt/vehicles', { query: { q: dq, page, pageSize: size } }) });
  const detail = useQuery({ queryKey: ['mdt-vehicle', open], queryFn: () => api<VehicleDetail>(`/mdt/vehicles/${open}`), enabled: !!open });
  const v = detail.data?.vehicle;
  return (
    <>
      <div className="mb-3"><h2 className="text-lg font-semibold">Fahrzeugabfrage</h2><p className="text-xs text-muted">Fahrzeugregister – Kennzeichen, Modell oder Halter</p></div>
      <Input type="search" className="mb-3" aria-label="Fahrzeug suchen" placeholder="Kennzeichen, Modell oder Halter…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.isLoading ? <SkeletonRows /> : list.error || !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState text="Keine Fahrzeuge gefunden." /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {list.data.items.map((r) => (
              <MdtCard key={r.id} label={`Fahrzeug ${r.plate} öffnen`} onClick={() => setOpen(r.id)}>
                <div className="mb-1 flex min-h-5 flex-wrap gap-1">{r.activeBolos > 0 && <Badge tone="danger">Fahndung</Badge>}{r.status !== 'ACTIVE' && <StatusBadge status={r.status} />}</div>
                <p className="font-mono text-lg font-bold tracking-wider">{r.plate}</p>
                <p className="truncate text-sm">{[r.model, r.color].filter(Boolean).join(' · ') || '—'}</p>
                <p className="truncate text-xs text-muted">Halter: {r.owner ? nameOf(r.owner) : 'unbekannt'}</p>
              </MdtCard>
            ))}
          </div>
          <Pager page={page} size={size} total={list.data.total} shown={list.data.items.length} label="Fahrzeugen" onPage={setPage} />
        </>
      )}
      <Modal open={!!open} title={v ? `Fahrzeug ${v.plate}` : 'Fahrzeug'} onClose={() => setOpen(null)} wide>
        {detail.isLoading ? <SkeletonRows /> : detail.error || !detail.data || !v ? <ErrorState error={detail.error} /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-md border-2 border-line bg-panel-2 px-3 py-1 font-mono text-2xl font-bold tracking-widest">{v.plate}</span>{(detail.data.wanted ?? []).some((w) => w.status === 'ACTIVE') && <Badge tone="danger">Aktive Fahndung</Badge>}<StatusBadge status={v.status} /></div>
            <div className="grid gap-1.5 sm:grid-cols-2 text-sm">
              {[['Modell', v.model], ['Farbe', v.color], ['ER:LC', v.erlcReference], ['Erfasst', fmt(v.createdAt)]].map(([k, x]) => <div key={k} className="rounded border border-line bg-panel-2/40 px-2 py-1.5"><span className="text-muted">{k}: </span>{x || '—'}</div>)}
            </div>
            <section><h4 className="mb-1 text-sm font-semibold">Halter</h4>
              {v.owner ? <button type="button" onClick={() => setPerson(v.owner!.id)} className="flex w-full items-center gap-2 rounded-md border border-line p-2 text-left hover:bg-panel-2">
                <Avatar url={v.owner.photoUrl} name={nameOf(v.owner)} /><span className="min-w-0 flex-1"><b>{nameOf(v.owner)}</b><span className="ml-1 text-xs text-muted">Akte öffnen</span></span>
              </button> : <p className="text-sm text-muted">Kein Halter erfasst.</p>}
            </section>
            {detail.data.wanted && <section><h4 className="mb-1 text-sm font-semibold">Fahndungen</h4>{detail.data.wanted.length ? <ul className="space-y-1 text-sm">{detail.data.wanted.map((w) => <li key={w.id} className="flex flex-wrap items-center gap-2">{w.reason}<PriorityBadge priority={w.priority} /><StatusBadge status={w.status} /></li>)}</ul> : <p className="text-sm text-muted">Keine.</p>}</section>}
            <section><h4 className="mb-1 text-sm font-semibold">Einsätze</h4>{detail.data.incidents.length ? <ul className="space-y-1 text-sm">{detail.data.incidents.map((i) => <li key={i.id}><Link className="hover:underline" to={`/mdt/incidents/${i.id}`}><b>{i.number}</b> · {i.title}</Link></li>)}</ul> : <p className="text-sm text-muted">Keine.</p>}</section>
            {v.notes && <section><h4 className="mb-1 text-sm font-semibold">Notizen</h4><p className="whitespace-pre-wrap text-sm">{v.notes}</p></section>}
          </div>
        )}
      </Modal>
      <CitizenProfile id={person} onClose={() => setPerson(null)} />
    </>
  );
}

interface Warrant { id: string; reason: string; description: string | null; priority: string; status: string; createdAt: string; person: { id: string; robloxUsername: string; fullName: string | null; photoUrl: string | null; flags: string[] } | null; vehicle: { id: string; plate: string; model: string | null; color: string | null } | null }

/** Aktive Haftbefehle und Fahndungen (Personen und Fahrzeuge). */
export function MdtWarrants() {
  const cfg = useMdtConfig();
  const [all, setAll] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['mdt-warrants', all], queryFn: () => api<Warrant[]>('/mdt/warrants', { query: { status: all ? 'ALL' : 'ACTIVE' } }), refetchInterval: 30_000 });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Haftbefehle & Fahndungen</h2><p className="text-xs text-muted">Neue Fahndungen legst du unter „Übersicht → Fahndung anlegen“ an.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />auch erledigte</label>
      </div>
      {q.isLoading ? <SkeletonRows /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data.length ? <EmptyState text="Keine aktiven Haftbefehle." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((w) => (
            <MdtCard key={w.id} label={`Fahndung ${w.reason}`} onClick={w.person ? () => setPerson(w.person!.id) : undefined}>
              <div className="mb-2 flex flex-wrap gap-1"><PriorityBadge priority={w.priority} /><StatusBadge status={w.status} />{w.person && <CitizenBadges c={{ activeWarrants: 0, flags: w.person.flags }} cfg={cfg} />}</div>
              {w.person && <div className="mb-2 flex items-center gap-2"><Avatar url={w.person.photoUrl} name={nameOf(w.person)} /><b className="truncate">{nameOf(w.person)}</b></div>}
              {w.vehicle && <p className="mb-1"><span className="font-mono font-bold tracking-wider">{w.vehicle.plate}</span> <span className="text-xs text-muted">{[w.vehicle.model, w.vehicle.color].filter(Boolean).join(' · ')}</span></p>}
              <p className="text-sm font-medium">{w.reason}</p>
              {w.description && <p className="line-clamp-2 text-xs text-muted">{w.description}</p>}
              <p className="mt-1 text-[11px] text-muted">seit {fmt(w.createdAt)}</p>
            </MdtCard>
          ))}
        </div>
      )}
      <CitizenProfile id={person} onClose={() => setPerson(null)} />
    </>
  );
}

/** Lizenzen, Merkmale und Geschlechter fürs MDT – werden automatisch gespeichert. */
export function MdtSettings() {
  const q = useQuery({ queryKey: ['mdt-config'], queryFn: () => api<MdtConfig>('/mdt/config') });
  const [d, setD] = useState<MdtConfig>();
  useEffect(() => { if (q.data && !d) setD(q.data); }, [q.data, d]);
  const valid = (c: MdtConfig) => [c.licenses, c.flags].every((l) => l.every((o) => /^[A-Z0-9_]+$/.test(o.key) && o.label.trim()) && new Set(l.map((o) => o.key)).size === l.length);
  useAutosaveDraft(d ? 'mdt:config' : null, d, (c) => (valid(c) ? { method: 'PUT', path: '/mdt/config', body: c, guildId: null, label: 'MDT-Einstellungen' } : null));
  if (q.isLoading || !d) return <SkeletonRows />;
  return (
    <>
      <div className="mb-3"><h2 className="text-lg font-semibold">MDT-Einstellungen</h2><p className="text-xs text-muted">Änderungen werden automatisch gespeichert. Der Schlüssel wird in den Akten gespeichert – beim Umbenennen nur die Bezeichnung ändern.</p></div>
      {!valid(d) && <p role="alert" className="mb-2 text-sm text-warning">Schlüssel nur aus A–Z, 0–9 und _, jeder nur einmal – sonst wird nicht gespeichert.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <OptionList title="Lizenzen" items={d.licenses} onChange={(licenses) => setD({ ...d, licenses })} />
        <OptionList title="Merkmale / Warnhinweise" items={d.flags} withTone onChange={(flags) => setD({ ...d, flags: flags as MdtConfig['flags'] })} />
        <Card title="Geschlechter (Auswahl)"><Input aria-label="Geschlechter, durch Komma getrennt" value={d.genders.join(', ')} onChange={(e) => setD({ ...d, genders: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) })} /></Card>
      </div>
    </>
  );
}

const keyOf = (label: string) => label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'X';
type Opt = { key: string; label: string; tone?: Tone };
/** Liste aus Bezeichnung + Schlüssel (+ Farbe bei Merkmalen). Neue Einträge bekommen den Schlüssel aus der Bezeichnung. */
function OptionList({ title, items, onChange, withTone }: { title: string; items: Opt[]; onChange: (v: Opt[]) => void; withTone?: boolean }) {
  // Schlüssel, die schon gespeichert waren, folgen der Bezeichnung nicht mehr (sie stehen in den Akten)
  const [saved] = useState(() => new Set(items.map((x) => x.key)));
  const set = (i: number, patch: Partial<Opt>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card title={title} actions={<Button size="sm" variant="secondary" onClick={() => onChange([...items, { key: `NEU_${items.length + 1}`, label: 'Neu', ...(withTone ? { tone: 'warning' as Tone } : {}) }])}><Plus size={14} />Hinzufügen</Button>}>
      <ul className="space-y-1.5">{items.map((o, i) => (
        <li key={i} className={`grid gap-1.5 ${withTone ? 'grid-cols-[minmax(0,1fr)_6rem_auto] sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]' : 'grid-cols-[minmax(0,1fr)_8rem_auto]'}`}>
          {/* Handy: Bezeichnung in eigener Zeile, sonst wird sie neben Schlüssel und Farbe unlesbar schmal */}
          <Input aria-label="Bezeichnung" className={withTone ? 'col-span-3 sm:col-span-1' : undefined} maxLength={40} value={o.label} onChange={(e) => set(i, { label: e.target.value, ...(o.key.startsWith('NEU_') || (!saved.has(o.key) && o.key === keyOf(o.label)) ? { key: keyOf(e.target.value) } : {}) })} />
          <Input aria-label="Schlüssel" className="font-mono text-xs" maxLength={32} value={o.key} onChange={(e) => set(i, { key: e.target.value.toUpperCase() })} />
          {withTone && <Select aria-label="Farbe" value={o.tone} onChange={(e) => set(i, { tone: e.target.value as Tone })}><option value="danger">Rot</option><option value="warning">Orange</option><option value="info">Blau</option><option value="neutral">Grau</option></Select>}
          <Button size="sm" variant="ghost" aria-label={`${o.label} entfernen`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
        </li>
      ))}</ul>
    </Card>
  );
}
