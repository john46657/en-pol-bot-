import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ExternalLink, ImageUp } from 'lucide-react';
import { DEFAULT_MDT_CONFIG, WEAPON_STATUSES, type MdtConfig } from '@enrp/shared';
import { api, ApiError, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounced } from '../../components/DataTable';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, PriorityBadge, Select, SkeletonRows, StatusBadge, Textarea, fmt, type Tone } from '../../components/ui';

export interface Citizen {
  id: string; robloxUsername: string; robloxUserId: string | null; fullName: string | null; status: string; aliases: string[];
  dateOfBirth: string | null; age: number | null; gender: string | null; phone: string | null; job: string | null; nationality: string | null; address: string | null;
  appearance: { skinTone?: string; hairColor?: string; eyeColor?: string; height?: string; features?: string } | null;
  licenses: string[]; flags: string[]; photoUrl: string | null; activeWarrants: number; version: number;
  /** nur in der Bürgersuche: Roblox-Kopfbild (live von Roblox) */
  robloxHeadshotUrl?: string | null;
}
/** Roblox-Profil der Person, live von Roblox (null-Felder = gerade nicht abrufbar). */
export interface RobloxDetails {
  id: string; name: string; displayName: string; description: string; created: string | null; isBanned: boolean; verified: boolean; profileUrl: string;
  avatarUrl: string | null; headshotUrl: string | null; friends: number | null; followers: number | null; following: number | null;
  groups: { id: string; name: string; role: string | null; rank: number | null; memberCount: number | null }[] | null; previousNames: string[] | null; fetchedAt: string;
}
type RobloxResult = { status: 'ok' | 'not_found' | 'unreachable' | 'disabled'; profile: RobloxDetails | null };
interface Linked { id: string; ref: string; title: string; status: string; role: string; createdAt: string }
interface Profile {
  person: Citizen & { notes: string | null; createdAt: string };
  counts: Record<'activeWarrants' | 'vehicles' | 'weapons' | 'incidents' | 'reports' | 'investigations' | 'evidence', number | null>;
  vehicles: { id: string; plate: string; model: string | null; color: string | null; status: string }[] | null;
  weapons: Weapon[] | null;
  warrants: { id: string; reason: string; description: string | null; priority: string; status: string; createdAt: string }[] | null;
  incidents: Linked[] | null; reports: Linked[] | null; investigations: Linked[] | null; complaints: Linked[] | null; evidence: Linked[] | null;
  timeline: { id: string; summary: string; createdAt: string }[];
}
export interface Weapon { id: string; serial: string; type: string; model: string | null; status: string; notes: string | null; version: number; owner?: { id: string; robloxUsername: string; fullName: string | null } | null }

export const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');
export const nameOf = (p: { fullName: string | null; robloxUsername: string }) => p.fullName || p.robloxUsername;
export function useMdtConfig() {
  const q = useQuery({ queryKey: ['mdt-config'], queryFn: () => api<MdtConfig>('/mdt/config'), staleTime: 60_000 });
  return q.data ?? DEFAULT_MDT_CONFIG;
}
const toneOf = (cfg: MdtConfig, key: string): Tone => cfg.flags.find((f) => f.key === key)?.tone ?? 'neutral';
const labelOf = (list: { key: string; label: string }[], key: string) => list.find((x) => x.key === key)?.label ?? key;
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' }) : '—');

/** Kleine Kopfzeile mit Akzentlinie wie auf dem Streifen-Terminal. */
export function MdtCard({ children, onClick, label, className = '' }: { children: ReactNode; onClick?: () => void; label: string; className?: string }) {
  const cls = `card relative overflow-hidden border border-line p-3 text-left before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-primary before:to-primary/10 ${className}`;
  return onClick
    ? <button type="button" aria-label={label} onClick={onClick} className={`${cls} w-full transition hover:border-primary/60 hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-primary`}>{children}</button>
    : <div aria-label={label} className={cls}>{children}</div>;
}
export function Avatar({ url, name, size = 'h-9 w-9' }: { url: string | null; name: string; size?: string }) {
  return url ? <img src={url} alt="" className={`${size} shrink-0 rounded-full border border-line object-cover`} /> : <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-sm font-semibold`}>{name.slice(0, 1).toUpperCase()}</span>;
}
const Kv = ({ k, v }: { k: string; v: ReactNode }) => <div className="min-w-0 rounded bg-panel-2/60 px-2 py-1 text-xs"><span className="text-muted">{k}: </span><span className="break-words">{v || '—'}</span></div>;

export function CitizenBadges({ c, cfg }: { c: Pick<Citizen, 'activeWarrants' | 'flags'>; cfg: MdtConfig }) {
  return <>{c.activeWarrants > 0 && <Badge tone="danger">Haftbefehl</Badge>}{c.flags.map((f) => <Badge key={f} tone={toneOf(cfg, f)}>{labelOf(cfg.flags, f)}</Badge>)}</>;
}

/** Bürgersuche: Karten mit den wichtigsten Personalien, Klick öffnet die Akte. */
export function MdtCitizens() {
  const cfg = useMdtConfig();
  const [q, setQ] = useState('');
  const [flag, setFlag] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get('id'));
  const dq = useDebounced(q, 250);
  useEffect(() => setPage(1), [dq, flag]);
  const size = 9;
  const list = useQuery({ queryKey: ['mdt-citizens', dq, flag, page], queryFn: () => api<Page<Citizen>>('/mdt/citizens', { query: { q: dq, flag: flag || undefined, page, pageSize: size } }) });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Bürgersuche</h2><p className="text-xs text-muted">Bürgerdatenbank – Name, Roblox-Name/-ID oder Telefonnummer</p></div>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Input type="search" aria-label="Bürger suchen" placeholder="Bürger nach Name, ID oder Telefon suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Merkmal" value={flag} onChange={(e) => setFlag(e.target.value)}><option value="">Alle Merkmale</option>{cfg.flags.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</Select>
      </div>
      {list.isLoading ? <SkeletonRows /> : list.error || !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState text="Keine Bürger gefunden." hint="Neue Personen legst du im Dashboard unter „Personen“ an – oder sie kommen automatisch aus ER:LC." /> : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.data.items.map((c) => (
              <MdtCard key={c.id} label={`Akte ${nameOf(c)} öffnen`} onClick={() => setOpen(c.id)}>
                <div className="mb-2 flex min-h-5 flex-wrap gap-1"><CitizenBadges c={c} cfg={cfg} /></div>
                <div className="mb-2 flex items-center gap-2">
                  <Avatar url={c.robloxHeadshotUrl ?? c.photoUrl} name={nameOf(c)} />
                  <div className="min-w-0"><p className="truncate font-semibold">{nameOf(c)}</p><p className="truncate text-xs text-muted">#{c.robloxUserId ?? c.robloxUsername}{c.fullName ? ` · ${c.robloxUsername}` : ''}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Kv k="Nationalität" v={c.nationality} /><Kv k="Geburtsdatum" v={c.dateOfBirth ? fmtDate(c.dateOfBirth) : null} />
                  <Kv k="Beruf" v={c.job} /><Kv k="Telefon" v={c.phone} />
                </div>
                <div className="mt-2 flex min-h-5 flex-wrap gap-1 text-[11px]">{c.licenses.length ? c.licenses.map((l) => <span key={l} className="rounded border border-line px-1.5 py-0.5">{labelOf(cfg.licenses, l)}</span>) : <span className="text-muted">Keine Lizenzen</span>}</div>
              </MdtCard>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>Zeige {(page - 1) * size + 1} bis {(page - 1) * size + list.data.items.length} von {list.data.total} Bürgern</span>
            <span className="flex gap-1"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><Button size="sm" variant="secondary" disabled={page * size >= list.data.total} onClick={() => setPage(page + 1)}>Weiter</Button></span>
          </div>
        </>
      )}
      <CitizenProfile id={open} onClose={() => setOpen(null)} />
    </>
  );
}

const TABS = [
  ['overview', 'Übersicht'], ['roblox', 'Roblox'], ['licenses', 'Lizenzen'], ['warrants', 'Haftbefehle'], ['vehicles', 'Fahrzeuge'], ['weapons', 'Waffen'], ['incidents', 'Einsätze'],
  ['reports', 'Berichte'], ['investigations', 'Ermittlungen'], ['notes', 'Notizen'], ['flags', 'Merkmale'], ['history', 'Verlauf'],
] as const;
type TabKey = (typeof TABS)[number][0];
const LINK_PATH: Record<string, string> = { incidents: '/mdt/incidents', reports: '/mdt/reports', investigations: '/mdt/investigations' };

/** Bürgerakte im MDT: Foto, Warnhinweise, Kennzahlen und alle verknüpften Akten in Reitern. Bearbeiten nur mit `persons.edit`. */
export function CitizenProfile({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = useAuth();
  const cfg = useMdtConfig();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('overview');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const q = useQuery({ queryKey: ['mdt-citizen', id], queryFn: () => api<Profile>(`/mdt/citizens/${id}`), enabled: !!id });
  const rb = useQuery({ queryKey: ['mdt-citizen-roblox', id], queryFn: () => api<RobloxResult>(`/mdt/citizens/${id}/roblox`), enabled: !!id, staleTime: 5 * 60_000, retry: false });
  const [view, setView] = useState<'roblox' | 'photo'>('roblox');
  const rp = rb.data?.profile ?? null;
  useEffect(() => { setTab('overview'); setEditing(false); setMsg(undefined); setView('roblox'); }, [id]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['mdt-citizen', id] }); void qc.invalidateQueries({ queryKey: ['mdt-citizens'] }); };
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Citizen>(`/mdt/citizens/${id}`, { method: 'PATCH', body: { ...body, version: q.data!.person.version } }),
    onSuccess: () => { setEditing(false); setMsg({ ok: true, text: 'Gespeichert.' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const photo = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append('file', file); return api(`/mdt/citizens/${id}/photo`, { formData: fd }); },
    onSuccess: () => { setMsg({ ok: true, text: 'Foto gespeichert.' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const fileRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null);
  const d = q.data, p = d?.person;
  const edit = can('persons.edit');
  const visibleTabs = TABS.filter(([k]) => !d || !(k in d) || d[k as keyof Profile] !== null);
  return (
    <Modal open={!!id} title={p ? nameOf(p) : 'Bürgerakte'} onClose={onClose} wide>
      {q.isLoading || !id ? <SkeletonRows /> : q.error || !d || !p ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <div className="space-y-3">
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
          <section className="grid gap-3 rounded-lg border border-line bg-panel-2/40 p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="mx-auto w-36 space-y-1.5 sm:w-full">
              {/* Standard: Roblox-Avatar (live); ein hochgeladenes Foto lässt sich daneben umschalten */}
              {rp?.avatarUrl && (view === 'roblox' || !p.photoUrl)
                ? <a href={rp.profileUrl} target="_blank" rel="noreferrer" title="Roblox-Profil öffnen" className="block"><img src={rp.avatarUrl} alt={`Roblox-Avatar von ${rp.name}`} className="aspect-[3/4] w-full rounded-md border border-line bg-gradient-to-b from-panel-2 to-bg object-contain" /></a>
                : p.photoUrl ? <img src={p.photoUrl} alt={`Foto von ${nameOf(p)}`} className="aspect-[3/4] w-full rounded-md border border-line object-cover" />
                : <div className="grid aspect-[3/4] w-full place-items-center rounded-md border border-dashed border-line text-center text-muted" aria-label="Kein Bild">{rb.isLoading ? <span className="text-xs">Roblox wird geladen…</span> : <span className="text-4xl font-semibold">{nameOf(p).slice(0, 1)}</span>}</div>}
              {rp?.avatarUrl && p.photoUrl && (
                <div className="grid grid-cols-2 gap-1" role="group" aria-label="Bild">
                  <Button size="sm" variant={view === 'roblox' ? 'primary' : 'secondary'} aria-pressed={view === 'roblox'} onClick={() => setView('roblox')}>Roblox</Button>
                  <Button size="sm" variant={view === 'photo' ? 'primary' : 'secondary'} aria-pressed={view === 'photo'} onClick={() => setView('photo')}>Foto</Button>
                </div>
              )}
              {edit && <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = ''; }} />
                <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = ''; }} />
                <Button size="sm" variant="secondary" className="w-full" disabled={photo.isPending} onClick={() => fileRef.current?.click()}><ImageUp size={14} />Foto ändern</Button>
                <Button size="sm" variant="secondary" className="w-full" disabled={photo.isPending} onClick={() => camRef.current?.click()}><Camera size={14} />Foto aufnehmen</Button>
              </>}
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold">{nameOf(p)}</h3>
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">{p.robloxUserId ? `ID ${p.robloxUserId}` : p.robloxUsername}</span>
              </div>
              {rp ? (
                <a href={rp.profileUrl} target="_blank" rel="noreferrer" className="mb-2 flex w-fit items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 text-sm hover:bg-panel-2" title="Roblox-Profil öffnen">
                  {rp.headshotUrl && <img src={rp.headshotUrl} alt="" className="h-7 w-7 rounded-full bg-bg" />}
                  <span><b>{rp.displayName}</b> <span className="text-muted">@{rp.name}</span></span>
                  {rp.verified && <span title="Von Roblox verifiziert" className="text-info">✔</span>}
                  {rp.isBanned && <Badge tone="danger">Auf Roblox gesperrt</Badge>}
                  <ExternalLink size={12} className="text-muted" aria-hidden />
                </a>
              ) : rb.data && <p className="mb-2 text-xs text-muted">{rb.data.status === 'not_found' ? `Kein Roblox-Konto „${p.robloxUsername}“ gefunden.` : 'Roblox gerade nicht erreichbar.'}</p>}
              <div className="mb-2 flex flex-wrap gap-1">{p.activeWarrants > 0 && <Badge tone="danger">Aktiver Haftbefehl</Badge>}{p.flags.map((f) => <Badge key={f} tone={toneOf(cfg, f)}>{labelOf(cfg.flags, f)}</Badge>)}</div>
              <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                {([['Geburtsdatum', fmtDate(p.dateOfBirth)], ['Alter', p.age ?? '—'], ['Geschlecht', p.gender], ['Telefon', p.phone], ['Beruf', p.job], ['Adresse', p.address ?? 'Keine Adresse erfasst']] as [string, ReactNode][]).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-line bg-panel px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide text-muted">{k}</p><p className="truncate text-sm">{v || '—'}</p></div>
                ))}
              </div>
            </div>
          </section>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {([['Aktive Haftbefehle', d.counts.activeWarrants, 'warrants'], ['Fahrzeuge', d.counts.vehicles, 'vehicles'], ['Waffen', d.counts.weapons, 'weapons'], ['Einsätze', d.counts.incidents, 'incidents'], ['Berichte', d.counts.reports, 'reports']] as [string, number | null, TabKey][]).filter(([, v]) => v !== null).map(([k, v, t]) => (
              <button key={k} type="button" onClick={() => setTab(t)} className={`rounded-md border px-2 py-2 text-center ${t === 'warrants' && v ? 'border-danger/50' : 'border-line'} hover:bg-panel-2`}>
                <p className={`text-xl font-semibold tabular-nums ${t === 'warrants' && v ? 'text-danger' : 'text-primary'}`}>{v}</p><p className="text-[10px] uppercase tracking-wide text-muted">{k}</p>
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Akte" className="flex flex-wrap gap-1 border-b border-line pb-2">
            {visibleTabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded px-2 py-1 text-xs ${tab === k ? 'bg-primary text-primary-fg' : 'border border-line text-muted hover:text-fg'}`}>{l}</button>)}
          </div>
          <div role="tabpanel">
            {tab === 'overview' && (editing ? <DetailsForm p={p} cfg={cfg} busy={save.isPending} onCancel={() => setEditing(false)} onSave={(b) => save.mutate(b)} /> : <Overview p={p} onEdit={edit ? () => setEditing(true) : undefined} />)}
            {tab === 'roblox' && <RobloxTab r={rb.data} loading={rb.isLoading} onRetry={() => void rb.refetch()} />}
            {tab === 'licenses' && <Toggles title="Lizenzen" options={cfg.licenses} value={p.licenses} canEdit={edit} busy={save.isPending} onSave={(v) => save.mutate({ licenses: v })} empty="Keine Lizenzen." />}
            {tab === 'flags' && <Toggles title="Merkmale / Warnhinweise" options={cfg.flags} value={p.flags} canEdit={edit} busy={save.isPending} onSave={(v) => save.mutate({ flags: v })} empty="Keine Merkmale." />}
            {tab === 'notes' && <Notes value={p.notes} canEdit={edit} busy={save.isPending} onSave={(notes) => save.mutate({ notes })} />}
            {tab === 'warrants' && <Rows empty="Keine Haftbefehle/Fahndungen." items={d.warrants?.map((w) => ({ id: w.id, to: `/mdt/warrants`, main: w.reason, sub: w.description ?? '', right: <><PriorityBadge priority={w.priority} /><StatusBadge status={w.status} /></>, at: w.createdAt })) ?? []} />}
            {tab === 'vehicles' && <Rows empty="Keine Fahrzeuge." items={d.vehicles?.map((v) => ({ id: v.id, to: `/mdt/vehicles?id=${v.id}`, main: v.plate, sub: [v.model, v.color].filter(Boolean).join(' · '), right: <StatusBadge status={v.status} /> })) ?? []} />}
            {tab === 'weapons' && <PersonWeapons ownerId={p.id} weapons={d.weapons ?? []} onChanged={refresh} />}
            {(['incidents', 'reports', 'investigations'] as const).map((k) => tab === k && <Rows key={k} empty="Keine Einträge." items={(d[k] ?? []).map((r) => ({ id: r.id, to: `${LINK_PATH[k]}/${r.id}`, main: `${r.ref} · ${r.title}`, sub: r.role === 'SUBJECT' ? '' : r.role, right: <StatusBadge status={r.status} />, at: r.createdAt }))} />)}
            {tab === 'history' && (d.timeline.length ? <ul className="space-y-1 text-sm">{d.timeline.map((t) => <li key={t.id}><span className="text-xs text-muted">{fmt(t.createdAt)}</span> · {t.summary}</li>)}</ul> : <p className="text-sm text-muted">Kein Verlauf.</p>)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Overview({ p, onEdit }: { p: Profile['person']; onEdit?: () => void }) {
  const a = p.appearance ?? {};
  const nr = 'Nicht erfasst';
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <div className="rounded border border-line bg-panel-2/40 px-2 py-1.5 text-sm"><span className="text-muted">{k}: </span>{v || nr}</div>;
  return (
    <div className="space-y-3">
      {onEdit && <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={onEdit}>Personalien bearbeiten</Button></div>}
      <section><h4 className="mb-1 text-sm font-semibold">Personalien</h4><div className="grid gap-1.5 sm:grid-cols-2">
        <Row k="Vollständiger Name" v={p.fullName} /><Row k="Roblox" v={`${p.robloxUsername}${p.robloxUserId ? ` (ID ${p.robloxUserId})` : ''}`} />
        <Row k="Geburtsdatum" v={p.dateOfBirth ? fmtDate(p.dateOfBirth) : null} /><Row k="Alter" v={p.age} />
        <Row k="Geschlecht" v={p.gender} /><Row k="Nationalität" v={p.nationality} />
        <Row k="Telefon" v={p.phone} /><Row k="Beruf" v={p.job} />
        {p.aliases.length > 0 && <Row k="Aliasse" v={p.aliases.join(', ')} />}
      </div></section>
      <section><h4 className="mb-1 text-sm font-semibold">Äußere Merkmale</h4><div className="grid gap-1.5 sm:grid-cols-2">
        <Row k="Hautfarbe" v={a.skinTone} /><Row k="Haarfarbe" v={a.hairColor} /><Row k="Augenfarbe" v={a.eyeColor} /><Row k="Größe" v={a.height} />
        <div className="sm:col-span-2"><Row k="Besondere Merkmale" v={a.features} /></div>
      </div></section>
      <section><h4 className="mb-1 text-sm font-semibold">Adresse</h4><Row k="Anschrift" v={p.address ?? 'Keine Adresse erfasst'} /></section>
    </div>
  );
}

function DetailsForm({ p, cfg, busy, onSave, onCancel }: { p: Citizen; cfg: MdtConfig; busy: boolean; onSave: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ fullName: p.fullName ?? '', dateOfBirth: p.dateOfBirth ?? '', gender: p.gender ?? '', phone: p.phone ?? '', job: p.job ?? '', nationality: p.nationality ?? '', address: p.address ?? '', ...{ skinTone: p.appearance?.skinTone ?? '', hairColor: p.appearance?.hairColor ?? '', eyeColor: p.appearance?.eyeColor ?? '', height: p.appearance?.height ?? '', features: p.appearance?.features ?? '' } });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const f = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => <Field label={label}>{(id) => <Input id={id} value={v[k]} onChange={set(k)} {...extra} />}</Field>;
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const { skinTone, hairColor, eyeColor, height, features, ...rest } = v;
      const appearance = Object.fromEntries(Object.entries({ skinTone, hairColor, eyeColor, height, features }).filter(([, x]) => x.trim()));
      onSave({ ...Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, x.trim() || null])), appearance: Object.keys(appearance).length ? appearance : null });
    }}>
      <div className="grid gap-2 sm:grid-cols-2">
        {f('fullName', 'Vollständiger Name', { maxLength: 80 })}
        {f('dateOfBirth', 'Geburtsdatum', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
        <Field label="Geschlecht">{(id) => <Select id={id} value={v.gender} onChange={set('gender')}><option value="">—</option>{[...new Set([...cfg.genders, ...(v.gender ? [v.gender] : [])])].map((g) => <option key={g}>{g}</option>)}</Select>}</Field>
        {f('nationality', 'Nationalität', { maxLength: 60 })}
        {f('phone', 'Telefon', { maxLength: 30, inputMode: 'tel' })}
        {f('job', 'Beruf', { maxLength: 60 })}
        <div className="sm:col-span-2">{f('address', 'Adresse', { maxLength: 200 })}</div>
        {f('skinTone', 'Hautfarbe', { maxLength: 40 })}{f('hairColor', 'Haarfarbe', { maxLength: 40 })}
        {f('eyeColor', 'Augenfarbe', { maxLength: 40 })}{f('height', 'Größe', { maxLength: 20 })}
        <div className="sm:col-span-2">{f('features', 'Besondere Merkmale (Tattoos, Narben …)', { maxLength: 300 })}</div>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Abbrechen</Button><Button type="submit" disabled={busy}>Speichern</Button></div>
    </form>
  );
}

function Toggles({ title, options, value, canEdit, busy, onSave, empty }: { title: string; options: { key: string; label: string; tone?: Tone }[]; value: string[]; canEdit: boolean; busy: boolean; onSave: (v: string[]) => void; empty: string }) {
  const known = options.filter((o) => value.includes(o.key));
  if (!canEdit) return known.length ? <div className="flex flex-wrap gap-1">{known.map((o) => <Badge key={o.key} tone={o.tone ?? 'neutral'}>{o.label}</Badge>)}</div> : <p className="text-sm text-muted">{empty}</p>;
  return (
    <fieldset><legend className="mb-2 text-sm text-muted">{title} – anklicken zum Setzen/Entfernen</legend>
      <div className="flex flex-wrap gap-1.5">{options.map((o) => {
        const on = value.includes(o.key);
        return <Button key={o.key} size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={busy} onClick={() => onSave(on ? value.filter((x) => x !== o.key) : [...value, o.key])}>{on ? '✓ ' : ''}{o.label}</Button>;
      })}</div>
    </fieldset>
  );
}

function Notes({ value, canEdit, busy, onSave }: { value: string | null; canEdit: boolean; busy: boolean; onSave: (v: string | null) => void }) {
  const [v, setV] = useState(value ?? '');
  if (!canEdit) return <p className="whitespace-pre-wrap text-sm">{value || 'Keine Notizen.'}</p>;
  return <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onSave(v.trim() || null); }}><Textarea aria-label="Notizen" rows={6} maxLength={5000} value={v} onChange={(e) => setV(e.target.value)} /><div className="flex justify-end"><Button type="submit" disabled={busy || v === (value ?? '')}>Notizen speichern</Button></div></form>;
}

function Rows({ items, empty }: { items: { id: string; to: string; main: string; sub?: string; right?: ReactNode; at?: string }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-line">{items.map((i) => (
    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
      <Link to={i.to} className="min-w-0 hover:underline"><b>{i.main}</b>{i.sub && <span className="ml-1 text-xs text-muted">{i.sub}</span>}</Link>
      <span className="flex items-center gap-1.5 text-xs">{i.at && <span className="text-muted">{fmt(i.at)}</span>}{i.right}</span>
    </li>
  ))}</ul>;
}

/** Waffen einer Person – mit „Waffe registrieren“ (Recht weapons.create). */
function PersonWeapons({ ownerId, weapons, onChanged }: { ownerId: string; weapons: Weapon[]; onChanged: () => void }) {
  const { can } = useAuth();
  const cfg = useMdtConfig();
  const [v, setV] = useState({ serial: '', type: cfg.weaponTypes[0]?.key ?? '', model: '' });
  const [err, setErr] = useState<string>();
  const add = useMutation({ mutationFn: () => api('/mdt/weapons', { body: { ...v, model: v.model || null, ownerId } }), onSuccess: () => { setV({ ...v, serial: '', model: '' }); setErr(undefined); onChanged(); }, onError: (e) => setErr(errText(e)) });
  return (
    <div className="space-y-2">
      {weapons.length ? <ul className="divide-y divide-line text-sm">{weapons.map((w) => (
        <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span><b className="font-mono">{w.serial}</b> · {labelOf(cfg.weaponTypes, w.type)}{w.model ? ` · ${w.model}` : ''}</span><WeaponStatusBadge status={w.status} /></li>
      ))}</ul> : <p className="text-sm text-muted">Keine registrierten Waffen.</p>}
      {can('weapons.create') && (
        <form className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (v.serial.trim()) add.mutate(); }}>
          <Input aria-label="Seriennummer" placeholder="Seriennummer" maxLength={40} value={v.serial} onChange={(e) => setV({ ...v, serial: e.target.value })} />
          <Select aria-label="Waffenart" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{cfg.weaponTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
          <Input aria-label="Modell" placeholder="Modell (optional)" maxLength={60} value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
          <Button type="submit" disabled={!v.serial.trim() || add.isPending}>Registrieren</Button>
          {err && <p role="alert" className="text-sm text-danger sm:col-span-4">{err}</p>}
        </form>
      )}
    </div>
  );
}

export function WeaponStatusBadge({ status }: { status: string }) {
  const s = WEAPON_STATUSES.find((x) => x.key === status);
  return <Badge tone={(s?.tone ?? 'neutral') as Tone}>{s?.label ?? status}</Badge>;
}

const years = (iso: string) => { const d = new Date(iso); const y = (Date.now() - d.getTime()) / (365.25 * 86_400_000); return y >= 1 ? `${Math.floor(y)} Jahr${Math.floor(y) === 1 ? '' : 'e'}` : `${Math.max(1, Math.floor(y * 12))} Monat(e)`; };
const n = (v: number | null) => (v === null ? 'nicht abrufbar' : v.toLocaleString('de-DE'));

/** Reiter „Roblox“: alles, was Roblox öffentlich über das Konto zeigt – live abgefragt, nichts geraten. */
function RobloxTab({ r, loading, onRetry }: { r: RobloxResult | undefined; loading: boolean; onRetry: () => void }) {
  if (loading) return <SkeletonRows rows={4} />;
  if (!r?.profile) return (
    <div className="space-y-2 text-sm text-muted">
      <p>{r?.status === 'not_found' ? 'Zu diesem Roblox-Namen gibt es kein Konto.' : r?.status === 'disabled' ? 'Die Roblox-Abfrage ist auf diesem System abgeschaltet.' : 'Roblox ist gerade nicht erreichbar.'}</p>
      {r?.status !== 'not_found' && <Button size="sm" variant="secondary" onClick={onRetry}>Erneut versuchen</Button>}
    </div>
  );
  const p = r.profile;
  const Stat = ({ k, v }: { k: string; v: string }) => <div className="rounded-md border border-line px-2 py-1.5 text-center"><p className="text-lg font-semibold tabular-nums text-primary">{v}</p><p className="text-[10px] uppercase tracking-wide text-muted">{k}</p></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {p.headshotUrl && <img src={p.headshotUrl} alt="" className="h-16 w-16 rounded-full border border-line bg-bg" />}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{p.displayName} {p.verified && <span title="Von Roblox verifiziert" className="text-info">✔</span>}</p>
          <p className="text-sm text-muted">@{p.name} · ID <span className="font-mono">{p.id}</span></p>
          <div className="mt-1 flex flex-wrap gap-1">{p.isBanned ? <Badge tone="danger">Auf Roblox gesperrt</Badge> : <Badge tone="success">Konto aktiv</Badge>}{p.verified && <Badge tone="info">Verifiziert</Badge>}</div>
        </div>
        <a href={p.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-panel-2">Roblox-Profil öffnen<ExternalLink size={12} aria-hidden /></a>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k="Konto erstellt" v={p.created ? new Date(p.created).toLocaleDateString('de-DE') : 'unbekannt'} />
        <Stat k="Kontoalter" v={p.created ? years(p.created) : 'unbekannt'} />
        <Stat k="Freunde" v={n(p.friends)} />
        <Stat k="Follower / folgt" v={p.followers === null && p.following === null ? 'nicht abrufbar' : `${n(p.followers)} / ${n(p.following)}`} />
      </div>
      {p.description && <section><h4 className="mb-1 text-sm font-semibold">Über mich</h4><p className="whitespace-pre-wrap rounded border border-line bg-panel-2/40 p-2 text-sm">{p.description}</p></section>}
      <section><h4 className="mb-1 text-sm font-semibold">Gruppen{p.groups ? ` (${p.groups.length})` : ''}</h4>
        {p.groups === null ? <p className="text-sm text-muted">Gruppen gerade nicht abrufbar.</p> : !p.groups.length ? <p className="text-sm text-muted">In keiner Gruppe.</p> : (
          <ul className="divide-y divide-line text-sm">{p.groups.map((g) => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-1"><a className="hover:underline" href={`https://www.roblox.com/communities/${g.id}`} target="_blank" rel="noreferrer">{g.name}</a><span className="text-xs text-muted">{g.role ?? '—'}{g.rank !== null ? ` · Rang ${g.rank}` : ''}</span></li>)}</ul>
        )}
      </section>
      <section><h4 className="mb-1 text-sm font-semibold">Frühere Namen</h4>{p.previousNames === null ? <p className="text-sm text-muted">Gerade nicht abrufbar.</p> : p.previousNames.length ? <p className="text-sm">{p.previousNames.join(', ')}</p> : <p className="text-sm text-muted">Keine.</p>}</section>
      <p className="text-[11px] text-muted">Live von Roblox abgefragt (öffentliche Daten), Stand {fmt(p.fetchedAt)}.</p>
    </div>
  );
}
