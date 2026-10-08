import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Link2, Trash2, Upload } from 'lucide-react';
import { type DangerConfig, CAD_WIDGET_LABELS, CAD_WIDGETS, CAD_EVENT_LABELS, CAD_EVENTS, CAD_LINK_ACTIONS, CAD_LINK_LABELS, CAD_LINK_SEND_TYPES, ERLC_FEATURE_LABELS, ERLC_FEATURES, ERLC_POLL_OPTIONS, ERLC_MAP_SIZE, type CadConfig, type CadRoute } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAutosaveDraft } from '../../lib/autosave';
import { useGuilds } from '../../lib/guilds';
import { ChannelPicker } from '../../components/DiscordPickers';
import { ago, ERLC_STATUS_TONE, optLabel, useCadConfig, type CadUnitRow, type ErlcServerView } from '../../lib/cad';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';

const errText = (e: unknown) => (e instanceof ApiError ? `${e.message}${Array.isArray(e.details) ? `: ${(e.details as { path: string; message: string }[]).map((d) => `${d.path} ${d.message}`).join(', ')}` : ''}` : 'Fehlgeschlagen');
const GuildSelect = ({ value, onChange, label, allowEmpty = true }: { value: string | null | undefined; onChange: (v: string | null) => void; label: string; allowEmpty?: boolean }) => {
  const g = useGuilds();
  if (!g.data?.length) return <Input aria-label={label} inputMode="numeric" placeholder="Discord-Server-ID" value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() || null)} />;
  return <Select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>{allowEmpty && <option value="">—</option>}{g.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}{value && !g.data.some((x) => x.id === value) && <option value={value}>{value}</option>}</Select>;
};
/** Kanäle eines bestimmten Servers (Mehrfachauswahl). */
function GuildChannels({ guildId, value, onChange, label }: { guildId: string | null; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const g = useGuilds().data?.find((x) => x.id === guildId);
  const name = (id: string) => g?.channels.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs"># {name(id)}<button type="button" aria-label={`${name(id)} entfernen`} onClick={() => onChange(value.filter((x) => x !== id))}>×</button></span>)}
      {g ? <Select aria-label={label} className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && onChange([...new Set([...value, e.target.value])])}><option value="">+ Kanal…</option>{g.channels.filter((c) => c.type === 'text' && !value.includes(c.id)).map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}</Select>
        : <Input aria-label={label} className="w-44 py-1 text-xs" placeholder="Kanal-ID + Enter" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = (e.target as HTMLInputElement).value.match(/\d{15,25}/)?.[0]; if (v) onChange([...new Set([...value, v])]); (e.target as HTMLInputElement).value = ''; } }} />}
    </div>
  );
}
function GuildRoles({ guildId, value, onChange, label }: { guildId: string | null; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const g = useGuilds().data?.find((x) => x.id === guildId);
  const name = (id: string) => g?.roles.find((r) => r.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs">@{name(id)}<button type="button" aria-label={`${name(id)} entfernen`} onClick={() => onChange(value.filter((x) => x !== id))}>×</button></span>)}
      {g && <Select aria-label={label} className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && onChange([...new Set([...value, e.target.value])])}><option value="">+ Rolle…</option>{g.roles.filter((r) => !value.includes(r.id)).map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</Select>}
    </div>
  );
}

// ───────── Optionslisten (Prioritäten, Status, Typen …) ─────────
type Opt = { key: string; label: string; emoji?: string; color?: string; closed?: boolean; layer?: string; enabledByDefault?: boolean; builtin?: boolean; type?: string; options?: string[] };
function OptionListEditor({ title, value, onChange, extra, noColor, noEmoji }: { title: string; value: Opt[]; onChange: (v: Opt[]) => void; extra?: (o: Opt, set: (p: Partial<Opt>) => void) => React.ReactNode; noColor?: boolean; noEmoji?: boolean }) {
  const set = (i: number, p: Partial<Opt>) => onChange(value.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const move = (i: number, d: number) => { const n = [...value]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); };
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1">{value.map((o, i) => (
        <li key={i} className="flex flex-wrap items-center gap-1">
          {!noEmoji && <Input aria-label="Emoji" className="w-14 py-1 text-center" maxLength={4} value={o.emoji ?? ''} onChange={(e) => set(i, { emoji: e.target.value || undefined })} />}
          <Input aria-label="Bezeichnung" className="w-40 py-1" maxLength={60} value={o.label} onChange={(e) => set(i, { label: e.target.value })} />
          <Input aria-label="Schlüssel" className="w-32 py-1 font-mono text-xs" maxLength={32} value={o.key} disabled={o.builtin} title="Interner Schlüssel (nach dem Anlegen möglichst nicht mehr ändern)" onChange={(e) => set(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
          {!noColor && <Input aria-label="Farbe" type="color" className="h-8 w-12 p-0.5" value={o.color ?? '#64748b'} onChange={(e) => set(i, { color: e.target.value })} />}
          {extra?.(o, (p) => set(i, p))}
          <Button size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></Button>
          <Button size="sm" variant="ghost" aria-label="nach unten" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></Button>
          {!o.builtin && <Button size="sm" variant="ghost" aria-label="Entfernen" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={12} /></Button>}
        </li>))}</ul>
      <Button size="sm" variant="secondary" className="mt-1" onClick={() => onChange([...value, { key: `NEU${value.length + 1}`, label: 'Neu' }])}>+ hinzufügen</Button>
    </div>
  );
}

// ───────── Einstellungen ─────────
export function CadSettings() {
  const { can } = useAuth();
  const q = useCadConfig();
  const tabs = [
    ...(can('cad.manage_settings') ? ['Allgemein', 'Einsätze', 'Einheiten', 'Discord-Kanäle', 'Zusatzfelder'] : []),
    ...(can('cad.manage_map') ? ['Karte & Ebenen'] : []),
    ...(can('cad.manage_erlc') ? ['ER:LC Integration'] : []),
    ...(can('settings.manage') ? ['Gefahrenstatus'] : []),
  ];
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(tabs.includes(sp.get('tab') ?? '') ? sp.get('tab')! : tabs[0] ?? '');
  const [draft, setDraft] = useState<CadConfig | null>(null);
  useEffect(() => { if (q.data && !draft) setDraft(q.data); }, [q.data, draft]);
  const { map: mapDraft, ...rest } = draft ?? ({} as CadConfig);
  useAutosaveDraft(draft ? 'cad:config' : null, draft ? rest : undefined, (d) => (can('cad.manage_settings') ? { method: 'PUT', path: '/cad/config', body: d, guildId: null, label: 'CAD-Einstellungen' } : null));
  useAutosaveDraft(draft ? 'cad:map' : null, mapDraft, (d) => (can('cad.manage_map') ? { method: 'PUT', path: '/cad/config/map', body: d, guildId: null, label: 'CAD-Karte' } : null));
  if (!tabs.length) return <EmptyState text="Keine Einstellungen für dich." />;
  if (q.isLoading || !draft) return <SkeletonRows />;
  const upd = (p: Partial<CadConfig>) => setDraft({ ...draft, ...p });
  // Was steckt in welchem Bereich – und ist er schon eingerichtet? (Klick öffnet den Bereich)
  const AREAS: Record<string, { desc: string; ok?: boolean }> = {
    Allgemein: { desc: 'Heimat-Server, Einsatznummern, Startseite', ok: !!draft.homeGuildId },
    'Einsätze': { desc: 'Prioritäten, Status, Einsatzarten', ok: draft.priorities.length > 0 && draft.incidentStatuses.length > 0 },
    Einheiten: { desc: 'Einheitenstatus und -typen', ok: draft.unitStatuses.length > 0 && draft.unitTypes.length > 0 },
    'Discord-Kanäle': { desc: 'Welche Meldung in welchen Kanal', ok: draft.routes.some((r) => r.enabled && r.channelIds.length) },
    Zusatzfelder: { desc: 'Eigene Felder in der Teamübersicht' },
    'Karte & Ebenen': { desc: 'ER:LC-Karte, Ebenen, Marker', ok: !!draft.map.imageUrl },
    'ER:LC Integration': { desc: 'Server-Key, Abgleich, Notrufe' },
    Gefahrenstatus: { desc: 'Stufen, Texte, Discord-Panel' },
  };
  return (
    <>
      <PageHeader title="CAD-Einstellungen" subtitle="Änderungen werden automatisch gespeichert" />
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">{tabs.map((t) => {
        const a = AREAS[t];
        return (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`card border px-3 py-2 text-left transition ${tab === t ? 'border-primary bg-primary/10' : 'border-line hover:bg-panel-2/60'}`}>
            <span className="flex items-center justify-between gap-2 text-sm font-medium">{t}{a?.ok === true ? <span className="text-xs text-success">✓ eingerichtet</span> : a?.ok === false ? <span className="text-xs text-warning">offen</span> : null}</span>
            {a && <span className="block truncate text-[11px] text-muted">{a.desc}</span>}
          </button>
        );
      })}</div>
      <div className="mt-3">
        {tab === 'Allgemein' && <div className="grid gap-3 lg:grid-cols-2">
          <Card title="🏢 Leitstelle">
            <div className="grid gap-3">
              <Field label="Discord-Server der Leitstelle (Heimat der Einsätze)" hint="Von anderen Servern (z. B. SEK/K9) geht nur, was eine Server-Verbindung freigibt.">{() => <GuildSelect label="Leitstelle" value={draft.homeGuildId} onChange={(v) => upd({ homeGuildId: v })} />}</Field>
              <Field label="Präfix der Einsatznummer" hint={`Beispiel: ${draft.incidentNumberPrefix || 'E'}-${new Date().getFullYear()}-00421`}>{(id) => <Input id={id} maxLength={6} value={draft.incidentNumberPrefix} onChange={(e) => upd({ incidentNumberPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />}</Field>
            </div>
          </Card>
          <Card title="🧩 Startseite der Leitstelle" actions={<Button size="sm" variant="ghost" onClick={() => upd({ widgets: [...CAD_WIDGETS] })}>Alle an</Button>}>
            <p className="mb-2 text-xs text-muted">Standard-Kacheln für alle. Jeder kann seine eigene Ansicht über „Ansicht anpassen“ ändern.</p>
            <div className="grid gap-1 sm:grid-cols-2">{CAD_WIDGETS.map((w) => <label key={w} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.widgets.includes(w)} onChange={(e) => upd({ widgets: e.target.checked ? [...draft.widgets, w] : draft.widgets.filter((x) => x !== w) })} />{CAD_WIDGET_LABELS[w]}</label>)}</div>
          </Card>
        </div>}
        {tab === 'Einsätze' && <Card>
          <OptionListEditor title="Prioritäten (Reihenfolge = Wichtigkeit)" value={draft.priorities} onChange={(v) => upd({ priorities: v })} />
          <OptionListEditor title="Einsatzstatus" value={draft.incidentStatuses} onChange={(v) => upd({ incidentStatuses: v })} extra={(o, set) => <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!o.closed} onChange={(e) => set({ closed: e.target.checked })} />schließt ab</label>} />
          <OptionListEditor title="Einsatzarten" value={draft.incidentTypes} onChange={(v) => upd({ incidentTypes: v })} noColor />
        </Card>}
        {tab === 'Einheiten' && <Card>
          <OptionListEditor title="Einheitenstatus (erster = verfügbar)" value={draft.unitStatuses} onChange={(v) => upd({ unitStatuses: v })} />
          <OptionListEditor title="Einheitentypen" value={draft.unitTypes} onChange={(v) => upd({ unitTypes: v })} extra={(o, set) => <Select aria-label="Ebene" className="w-auto py-1 text-xs" value={o.layer ?? 'units'} onChange={(e) => set({ layer: e.target.value })}>{draft.layers.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select>} />
        </Card>}
        {tab === 'Discord-Kanäle' && <RoutesEditor routes={draft.routes} onChange={(routes) => upd({ routes })} />}
        {tab === 'Zusatzfelder' && <Card>
          <p className="mb-2 text-xs text-muted">Weitere Felder für die Teamübersicht (Funk-Benutzerdaten), z. B. „Dienstnummer“. Zello-Name, Roblox, Discord, Funkrufname, Abteilung und Rang sind immer vorhanden.</p>
          <OptionListEditor title="Zusatzfelder" value={draft.memberFields} noColor noEmoji onChange={(v) => upd({ memberFields: v.map((f) => ({ key: f.key, label: f.label, type: (f.type as 'text') ?? 'text', ...(f.options ? { options: f.options } : {}) })) })}
            extra={(o, set) => <Select aria-label="Typ" className="w-auto py-1 text-xs" value={o.type ?? 'text'} onChange={(e) => set({ type: e.target.value })}><option value="text">Text</option><option value="number">Zahl</option><option value="select">Auswahl</option></Select>} />
        </Card>}
        {tab === 'Karte & Ebenen' && <MapSettings draft={draft} upd={upd} />}
        {tab === 'ER:LC Integration' && <ErlcIntegration />}
        {tab === 'Gefahrenstatus' && <DangerSettings />}
      </div>
    </>
  );
}

function RoutesEditor({ routes, onChange }: { routes: CadRoute[]; onChange: (r: CadRoute[]) => void }) {
  const set = (i: number, p: Partial<CadRoute>) => onChange(routes.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const guilds = useGuilds();
  return (
    <Card title="CAD → Discord">
      <p className="mb-3 text-xs text-muted">Welche CAD-Ereignisse in welche Kanäle gehen – je Discord-Server. Verbundene Server (Cross-Server) bekommen zusätzlich die dort freigegebenen Datenarten.</p>
      {!routes.length && <EmptyState text="Noch keine Kanalzuordnung." />}
      <ul className="space-y-2">{routes.map((r, i) => (
        <li key={r.id} className="grid gap-2 rounded border border-line p-2 md:grid-cols-[1fr_1fr_2fr_2fr_auto]">
          <GuildSelect label="Server" allowEmpty={false} value={r.guildId} onChange={(v) => v && set(i, { guildId: v, channelIds: [], pingRoleIds: [] })} />
          <Select aria-label="Ereignis" value={r.event} onChange={(e) => set(i, { event: e.target.value as CadRoute['event'] })}>{CAD_EVENTS.map((ev) => <option key={ev} value={ev}>{CAD_EVENT_LABELS[ev]}</option>)}</Select>
          <GuildChannels label="Kanäle" guildId={r.guildId} value={r.channelIds} onChange={(v) => set(i, { channelIds: v })} />
          <GuildRoles label="Rollen pingen" guildId={r.guildId} value={r.pingRoleIds} onChange={(v) => set(i, { pingRoleIds: v })} />
          <div className="flex items-center gap-1"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} />aktiv</label><Button size="sm" variant="ghost" aria-label="Entfernen" onClick={() => onChange(routes.filter((_, j) => j !== i))}><Trash2 size={12} /></Button></div>
        </li>))}</ul>
      <Button size="sm" variant="secondary" className="mt-2" disabled={!guilds.data?.length && routes.length > 0 && !routes[0]?.guildId} onClick={() => onChange([...routes, { id: Math.random().toString(36).slice(2, 10), guildId: guilds.data?.[0]?.id ?? '', event: 'incident.created', channelIds: [], pingRoleIds: [], enabled: true }])}>+ Zuordnung</Button>
    </Card>
  );
}

function MapSettings({ draft, upd }: { draft: CadConfig; upd: (p: Partial<CadConfig>) => void }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string>();
  const m = draft.map;
  const setMap = (p: Partial<CadConfig['map']>) => upd({ map: { ...m, ...p } });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dims = await new Promise<{ w: number; h: number }>((res) => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ w: ERLC_MAP_SIZE, h: ERLC_MAP_SIZE }); img.src = URL.createObjectURL(file); });
      const fd = new FormData(); fd.append('file', file); fd.append('width', String(dims.w)); fd.append('height', String(dims.h));
      return api<CadConfig>('/cad/map/image', { formData: fd });
    },
    onSuccess: (cfg) => { upd({ map: cfg.map }); void qc.invalidateQueries({ queryKey: ['cad-config'] }); setMsg('Karte hochgeladen.'); },
    onError: (e) => setMsg(errText(e)),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  // Bild-Adresse: der Server lädt das Bild herunter und speichert es wie einen Upload
  const fromUrl = useMutation({
    mutationFn: (u: string) => api<CadConfig>('/cad/map/image-url', { body: { url: u } }),
    onSuccess: (cfg) => { upd({ map: cfg.map }); void qc.invalidateQueries({ queryKey: ['cad-config'] }); setUrl(''); setMsg('Karte von der Adresse übernommen.'); },
    onError: (e) => setMsg(errText(e)),
  });
  const busy = upload.isPending || fromUrl.isPending;
  const [broken, setBroken] = useState<string | null>(null);
  const num = (label: string, k: 'width' | 'height' | 'originX' | 'originY' | 'scale', hint?: string) => <Field label={label} hint={hint}>{(id) => <Input id={id} type="number" step="any" value={m[k]} onChange={(e) => e.target.value !== '' && setMap({ [k]: Number(e.target.value) })} />}</Field>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Kartenbild">
        <p className="mb-2 text-xs text-muted">Lade hier deine ER:LC-Map hoch (PNG/JPG/WebP, bis 40 MB). Sie ist der Hintergrund der CAD-Karte – Marker, POIs und Zonen liegen als Ebenen darüber.</p>
        {m.imageUrl && (broken === m.imageUrl
          ? <p className="mb-2 rounded border border-danger/50 bg-danger/10 px-2 py-1 text-xs">Das aktuelle Kartenbild lässt sich nicht anzeigen ({m.imageUrl.startsWith('/api/') ? 'Datei fehlt' : 'keine Bilddatei oder fremder Server'}). Bitte eine Datei hochladen oder die Bildadresse unten laden.</p>
          : <img src={m.imageUrl} alt="Aktuelle Karte" onError={() => setBroken(m.imageUrl ?? null)} className="mb-2 max-h-48 rounded border border-line" />)}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Karte hochladen" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> Datei auswählen</Button>
        <Field label="oder Bild-Adresse (https, direkt zur Bilddatei)" hint="z. B. https://erlc.one/maps/2026/erlc-map-9-26-26.png – keine Webseite, sondern die Bilddatei selbst">{(id) => (
          <div className="flex gap-2"><Input id={id} value={url} placeholder="https://…/karte.png" onChange={(e) => setUrl(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy || !/^https:\/\/\S+$/.test(url.trim())} onClick={() => fromUrl.mutate(url.trim())}><Link2 size={14} /> Laden</Button></div>
        )}</Field>
        {busy && <p className="text-xs text-muted">{upload.isPending ? 'Wird hochgeladen …' : 'Bild wird geladen – große Karten brauchen einen Moment …'}</p>}
        {msg && <p role="status" className="mt-1 text-xs">{msg}</p>}
      </Card>
      <Card title="Kalibrierung">
        <p className="mb-2 text-xs text-muted">ER:LC liefert Positionen relativ zur Kartenmitte (X nach rechts, Z nach unten). Standard für die offiziellen 5355-px-Karten: Ursprung in der Bildmitte, Maßstab 1. Liegen Marker daneben, hier anpassen.</p>
        <div className="grid grid-cols-2 gap-2">{num('Breite (px)', 'width')}{num('Höhe (px)', 'height')}{num('Ursprung X (px)', 'originX')}{num('Ursprung Y (px)', 'originY')}{num('Maßstab (px je Einheit)', 'scale')}</div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setMap({ originX: m.width / 2, originY: m.height / 2, scale: 1 })}>Auf Standard zurücksetzen</Button>
      </Card>
      <Card title="Ebenen" className="lg:col-span-2">
        <OptionListEditor title="Ebenen (jede einzeln ein-/ausblendbar)" value={draft.layers} noColor noEmoji onChange={(v) => upd({ layers: v.map((l) => ({ key: l.key.toLowerCase(), label: l.label, ...(l.builtin ? { builtin: true } : {}), enabledByDefault: l.enabledByDefault !== false })) })}
          extra={(o, set) => <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.enabledByDefault !== false} onChange={(e) => set({ enabledByDefault: e.target.checked })} />standardmäßig an</label>} />
        <OptionListEditor title="Marker-Darstellung" value={draft.markers} onChange={(v) => upd({ markers: v.map((x) => ({ key: x.key.toLowerCase(), label: x.label, emoji: x.emoji || '•', color: x.color ?? '#64748b' })) })} />
      </Card>
    </div>
  );
}

// ───────── ER:LC Integration ─────────
interface ErlcForm { id?: string; name: string; serverRef?: string | null; description?: string | null; logoUrl?: string | null; guildId?: string | null; active: boolean; key?: string; pollSeconds: number; features: string[]; webhookEnabled: boolean; criticalCommands: string; blockedCommands: string }

function ErlcIntegration() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['erlc-servers'], queryFn: () => api<ErlcServerView[]>('/erlc/servers'), refetchInterval: 5_000 });
  const [edit, setEdit] = useState<ErlcForm | null>(null);
  const [del, setDel] = useState<ErlcServerView | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['erlc-servers'] }); void qc.invalidateQueries({ queryKey: ['cad-overview'] }); };
  const test = useMutation({ mutationFn: (v: { id: string; action: 'test' | 'reconnect' }) => api<{ ok: boolean; status: string; message?: string; latencyMs?: number }>(`/erlc/servers/${v.id}/${v.action}`, { method: 'POST' }),
    onSuccess: (r) => { setMsg({ ok: r.ok, text: r.ok ? `Verbunden (${r.latencyMs ?? '?'} ms).` : r.message ?? r.status }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const toggle = useMutation({ mutationFn: (s: ErlcServerView) => api(`/erlc/servers/${s.id}`, { method: 'PATCH', body: { active: !s.active } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/erlc/servers/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); refresh(); } });
  const open = (s?: ErlcServerView) => setEdit(s ? { id: s.id, name: s.name, serverRef: s.serverRef, description: s.description, logoUrl: s.logoUrl, guildId: s.guildId, active: s.active, pollSeconds: s.pollSeconds, features: s.features, webhookEnabled: s.webhookEnabled, criticalCommands: s.settings.criticalCommands.join(' '), blockedCommands: s.settings.blockedCommands.join(' ') }
    : { name: '', active: true, pollSeconds: 15, features: ['players', 'staff', 'queue', 'vehicles', 'emergencyCalls', 'modCalls'], webhookEnabled: false, criticalCommands: '', blockedCommands: '' });
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">Der Server-Key wird nur verschlüsselt im Backend gespeichert und nie wieder angezeigt.</p><Button onClick={() => open()}>ER:LC-Server verbinden</Button></div>
      {msg && <p role="status" className={`mb-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState text="Noch kein ER:LC-Server verbunden." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">{q.data.map((s) => (
          <Card key={s.id} title={<span className="flex items-center gap-2">{s.logoUrl && <img src={s.logoUrl} alt="" className="h-5 w-5 rounded" />}{s.name}</span>} actions={<Badge tone={ERLC_STATUS_TONE[s.status] ?? 'neutral'}>{s.statusLabel}</Badge>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted">Server-Key</dt><dd className="font-mono">{s.keyMasked}</dd>
              <dt className="text-muted">Letzter Abgleich</dt><dd>{s.lastSyncAt ? `${new Date(s.lastSyncAt).toLocaleString('de-DE')} (${ago(s.lastSyncAt)})` : '—'}</dd>
              <dt className="text-muted">API-Latenz</dt><dd>{s.latencyMs ? `${s.latencyMs} ms` : '—'}</dd>
              <dt className="text-muted">Anfragelimit</dt><dd>{s.rateLimit.blockedUntil ? `pausiert bis ${new Date(s.rateLimit.blockedUntil).toLocaleTimeString('de-DE')}` : s.rateLimit.buckets.map((b) => `${b.bucket}: ${b.remaining ?? '?'}/${b.limit ?? '?'}`).join(' · ') || 'ok'}</dd>
              <dt className="text-muted">Letzter Fehler</dt><dd className={s.lastError ? 'text-danger' : ''}>{s.lastError ? `${s.lastError} (${ago(s.lastErrorAt)})` : '—'}</dd>
              <dt className="text-muted">Intervall</dt><dd>{s.pollSeconds} s{s.paused ? ' · pausiert (Key prüfen)' : ''}</dd>
              <dt className="text-muted">Funktionen</dt><dd className="text-xs">{s.features.map((f) => ERLC_FEATURE_LABELS[f as keyof typeof ERLC_FEATURE_LABELS] ?? f).join(', ') || '—'}</dd>
              {s.webhookEnabled && s.webhookPath && <><dt className="text-muted">Webhook-URL</dt><dd className="break-all font-mono text-xs">{location.origin}{s.webhookPath}</dd></>}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" disabled={test.isPending} onClick={() => test.mutate({ id: s.id, action: 'test' })}>Verbindung testen</Button>
              <Button size="sm" variant="secondary" disabled={test.isPending} onClick={() => test.mutate({ id: s.id, action: 'reconnect' })}>Neu verbinden</Button>
              <Button size="sm" variant="secondary" onClick={() => toggle.mutate(s)}>{s.active ? 'Deaktivieren' : 'Aktivieren'}</Button>
              <Button size="sm" variant="secondary" onClick={() => open(s)}>Bearbeiten</Button>
              <Button size="sm" variant="danger" onClick={() => setDel(s)}>Entfernen</Button>
            </div>
          </Card>))}</div>
      )}
      {edit && <ErlcServerForm value={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
      <ConfirmDialog cancelLabel="Abbrechen" open={!!del} danger title="ER:LC-Server entfernen" message={`„${del?.name}“ inkl. Notruf- und Befehlsprotokoll entfernen? Der Key wird gelöscht.`} confirmLabel="Entfernen" onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </>
  );
}

function ErlcServerForm({ value, onClose, onSaved }: { value: ErlcForm; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string>();
  const cmds = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).map((x) => (x.startsWith(':') ? x : `:${x}`));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: v.name, serverRef: v.serverRef || null, description: v.description || null, logoUrl: v.logoUrl || null, guildId: v.guildId || null, active: v.active, pollSeconds: v.pollSeconds, features: v.features, webhookEnabled: v.webhookEnabled,
        ...(v.key ? { key: v.key } : {}), ...(v.id ? { settings: { criticalCommands: cmds(v.criticalCommands), blockedCommands: cmds(v.blockedCommands) } } : {}) };
      return v.id ? api(`/erlc/servers/${v.id}`, { method: 'PATCH', body }) : api('/erlc/servers', { body });
    },
    onSuccess: () => { onSaved(); onClose(); }, onError: (e) => setErr(errText(e)),
  });
  const upd = (p: Partial<ErlcForm>) => setV({ ...v, ...p });
  return (
    <Modal open wide title={v.id ? `${v.name} bearbeiten` : 'ER:LC-Server verbinden'} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Servername">{(id) => <Input id={id} required minLength={2} maxLength={80} value={v.name} onChange={(e) => upd({ name: e.target.value })} />}</Field>
        <Field label="Server-ID / Join-Key (Anzeige)">{(id) => <Input id={id} maxLength={80} value={v.serverRef ?? ''} onChange={(e) => upd({ serverRef: e.target.value })} />}</Field>
        <Field label={v.id ? 'Server-Key (leer lassen = unverändert)' : 'Server-Key'} hint="Aus den ER:LC-Servereinstellungen. Wird verschlüsselt gespeichert und nie wieder angezeigt.">{(id) => (
          <Input id={id} type="password" autoComplete="new-password" required={!v.id} placeholder={v.id ? '••••••••••••' : ''} value={v.key ?? ''} onChange={(e) => upd({ key: e.target.value })} />
        )}</Field>
        <Field label="Zugehöriger Discord-Server">{() => <GuildSelect label="Discord-Server" value={v.guildId} onChange={(g) => upd({ guildId: g })} />}</Field>
        <Field label="Aktualisierungsintervall">{(id) => <Select id={id} value={v.pollSeconds} onChange={(e) => upd({ pollSeconds: Number(e.target.value) })}>{ERLC_POLL_OPTIONS.map((s) => <option key={s} value={s}>{s} Sekunden</option>)}</Select>}</Field>
        <Field label="Logo (https-Adresse)">{(id) => <Input id={id} value={v.logoUrl ?? ''} onChange={(e) => upd({ logoUrl: e.target.value })} />}</Field>
        <div className="sm:col-span-2"><Field label="Beschreibung">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={v.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />}</Field></div>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-medium text-muted">Erlaubte Funktionen</legend>
          <div className="grid gap-1 sm:grid-cols-2">{ERLC_FEATURES.map((f) => <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.features.includes(f)} onChange={(e) => upd({ features: e.target.checked ? [...v.features, f] : v.features.filter((x) => x !== f) })} />{ERLC_FEATURE_LABELS[f]}</label>)}</div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => upd({ active: e.target.checked })} />Aktiv</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.webhookEnabled} onChange={(e) => upd({ webhookEnabled: e.target.checked })} />Ereignis-Webhook nutzen (Notrufe sofort)</label>
        {v.id && <>
          <Field label="Kritische Befehle (Bestätigung + eigenes Recht)">{(id) => <Input id={id} value={v.criticalCommands} onChange={(e) => upd({ criticalCommands: e.target.value })} />}</Field>
          <Field label="Gesperrte Befehle">{(id) => <Input id={id} value={v.blockedCommands} onChange={(e) => upd({ blockedCommands: e.target.value })} />}</Field>
        </>}
        {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>Speichern</Button></div>
      </form>
    </Modal>
  );
}

// ───────── Teamübersicht (Zuordnung Discord ↔ Roblox ↔ ER:LC ↔ Team ↔ Einheit) ─────────
interface Member { id: string; userId: string | null; discordId: string | null; discordName: string | null; robloxName: string | null; robloxId: string | null; erlcName: string | null; team: string | null; unitId: string | null; zelloName: string | null; callsign: string | null; department: string | null; rank: string | null; extra: Record<string, string | number> | null; inGame: boolean }

export function CadTeam() {
  const { can } = useAuth();
  const { cfg } = useCadConfig();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cad-members'], queryFn: () => api<Member[]>('/cad/members') });
  const units = useQuery({ queryKey: ['cad-units'], queryFn: () => api<CadUnitRow[]>('/cad/units') });
  const [edit, setEdit] = useState<Partial<Member> | null>(null);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState<string>();
  const save = useMutation({
    mutationFn: (m: Partial<Member>) => { const { id, ...rest } = m; delete rest.inGame; const body = Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, x === '' ? null : x])); return id ? api(`/cad/members/${id}`, { method: 'PATCH', body }) : api('/cad/members', { body: Object.fromEntries(Object.entries(body).filter(([, x]) => x !== null && x !== undefined)) }); },
    onSuccess: () => { setEdit(null); setErr(undefined); void qc.invalidateQueries({ queryKey: ['cad-members'] }); void qc.invalidateQueries({ queryKey: ['cad-units'] }); }, onError: (e) => setErr(errText(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/cad/members/${id}`, { method: 'DELETE' }), onSuccess: () => { setEdit(null); void qc.invalidateQueries({ queryKey: ['cad-members'] }); } });
  const unitName = (id: string | null) => units.data?.find((u) => u.id === id)?.callsign ?? '—';
  const rows = (q.data ?? []).filter((m) => !filter || JSON.stringify(m).toLowerCase().includes(filter.toLowerCase()));
  const text = (label: string, k: keyof Member) => <Field label={label}>{(id) => <Input id={id} maxLength={64} value={(edit?.[k] as string | null) ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}</Field>;
  return (
    <>
      <PageHeader title="Teamübersicht" subtitle="Discord ↔ Roblox ↔ ER:LC ↔ Team ↔ Einheit · Funk-Benutzerdaten" actions={can('cad.manage_units') ? <Button onClick={() => setEdit({})}>Zuordnung anlegen</Button> : undefined} />
      <Input aria-label="Suchen" className="mb-2 max-w-xs" placeholder="Suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {q.isLoading ? <SkeletonRows /> : !rows.length ? <Card><EmptyState text="Noch keine Zuordnungen." hint="Mit dem ER:LC-Namen erscheint die Einheit live auf der Karte." /></Card> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted">{['Discord', 'Roblox', 'ER:LC', 'Team', 'Einheit', 'Funkrufname', 'Zello', 'Abteilung', 'Rang', ...cfg.memberFields.map((f) => f.label), ''].map((h, i) => <th key={i} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((m) => <tr key={m.id} className="border-t border-line">
            <td className="px-2 py-1">{m.discordName ?? m.discordId ?? '—'}</td><td className="px-2 py-1">{m.robloxName ?? '—'}{m.robloxId ? <span className="text-xs text-muted"> ({m.robloxId})</span> : null}</td>
            <td className="px-2 py-1">{m.erlcName ?? '—'}{m.inGame && ' 🟢'}</td><td className="px-2 py-1">{optLabel(cfg.unitTypes, m.team)}</td><td className="px-2 py-1">{unitName(m.unitId)}</td>
            <td className="px-2 py-1">{m.callsign ?? '—'}</td><td className="px-2 py-1">{m.zelloName ?? '—'}</td><td className="px-2 py-1">{m.department ?? '—'}</td><td className="px-2 py-1">{m.rank ?? '—'}</td>
            {cfg.memberFields.map((f) => <td key={f.key} className="px-2 py-1">{m.extra?.[f.key] ?? '—'}</td>)}
            <td className="px-2 py-1">{can('cad.manage_units') && <Button size="sm" variant="ghost" onClick={() => setEdit(m)}>Bearbeiten</Button>}</td>
          </tr>)}</tbody></table></div>
      )}
      {edit && (
        <Modal open wide title={edit.id ? 'Zuordnung bearbeiten' : 'Zuordnung anlegen'} onClose={() => setEdit(null)}>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            {text('Discord-Name', 'discordName')}{text('Discord-ID', 'discordId')}{text('Roblox-Name', 'robloxName')}{text('Roblox-ID', 'robloxId')}{text('ER:LC-Spielername', 'erlcName')}
            <Field label="Team">{(id) => <Select id={id} value={edit.team ?? ''} onChange={(e) => setEdit({ ...edit, team: e.target.value || null })}><option value="">—</option>{cfg.unitTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>}</Field>
            <Field label="Einheit">{(id) => <Select id={id} value={edit.unitId ?? ''} onChange={(e) => setEdit({ ...edit, unitId: e.target.value || null })}><option value="">—</option>{(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}</Select>}</Field>
            {text('Funkrufname', 'callsign')}{text('Zello-Benutzername', 'zelloName')}{text('Abteilung', 'department')}{text('Rang', 'rank')}
            {cfg.memberFields.map((f) => <Field key={f.key} label={f.label}>{(id) => f.type === 'select' && f.options?.length
              ? <Select id={id} value={String(edit.extra?.[f.key] ?? '')} onChange={(e) => setEdit({ ...edit, extra: { ...(edit.extra ?? {}), [f.key]: e.target.value } })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>
              : <Input id={id} type={f.type === 'number' ? 'number' : 'text'} value={String(edit.extra?.[f.key] ?? '')} onChange={(e) => setEdit({ ...edit, extra: { ...(edit.extra ?? {}), [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })} />}</Field>)}
            {err && <p role="alert" className="text-sm text-danger sm:col-span-3">{err}</p>}
            <div className="flex justify-between gap-2 sm:col-span-3">{edit.id ? <Button variant="danger" onClick={() => del.mutate(edit.id!)}>Löschen</Button> : <span />}<div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Abbrechen</Button><Button type="submit">Speichern</Button></div></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ───────── Cross-Server ─────────
interface Link { id: string; name: string; sourceGuildId: string; targetGuildId: string; active: boolean; sendTypes: string[]; allowActions: string[]; roleIds: string[]; channels: Record<string, string[]> | null; notify: boolean }

export function CadCrossServer() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const guilds = useGuilds();
  const q = useQuery({ queryKey: ['cad-links'], queryFn: () => api<Link[]>('/cad/links') });
  const [edit, setEdit] = useState<Partial<Link> | null>(null);
  const [err, setErr] = useState<string>();
  const gname = (id: string) => guilds.data?.find((g) => g.id === id)?.name ?? id;
  const save = useMutation({
    mutationFn: (l: Partial<Link>) => { const { id, ...body } = l; return id ? api(`/cad/links/${id}`, { method: 'PATCH', body: { ...body, channels: body.channels ?? {} } }) : api('/cad/links', { body: { ...body, channels: body.channels ?? {} } }); },
    onSuccess: () => { setEdit(null); setErr(undefined); void qc.invalidateQueries({ queryKey: ['cad-links'] }); }, onError: (e) => setErr(errText(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api(`/cad/links/${id}`, { method: 'DELETE' }), onSuccess: () => { setEdit(null); void qc.invalidateQueries({ queryKey: ['cad-links'] }); } });
  const toggle = (list: string[] | undefined, x: string) => ((list ?? []).includes(x) ? (list ?? []).filter((y) => y !== x) : [...(list ?? []), x]);
  return (
    <>
      <PageHeader title="Server-Verbindungen" subtitle="Leitstelle ↔ SEK/K9: welche Daten fließen, welche Aktionen erlaubt sind" actions={can('cad.manage_cross_server') ? <Button onClick={() => setEdit({ active: true, notify: true, sendTypes: ['incidents', 'unit_requests'], allowActions: ['status_report', 'radio'], roleIds: [], channels: {} })}>Verbindung anlegen</Button> : undefined} />
      {q.isLoading ? <SkeletonRows /> : !q.data?.length ? <Card><EmptyState text="Noch keine Server verbunden." hint="Ohne Verbindung bleiben die Server vollständig getrennt." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">{q.data.map((l) => (
          <Card key={l.id} title={l.name} actions={<Badge tone={l.active ? 'success' : 'neutral'}>{l.active ? 'aktiv' : 'aus'}</Badge>}>
            <p className="text-sm"><b>{gname(l.sourceGuildId)}</b> → <b>{gname(l.targetGuildId)}</b></p>
            <p className="mt-1 text-xs text-muted">Sendet: {l.sendTypes.map((t) => CAD_LINK_LABELS[t] ?? t).join(', ') || 'nichts'}</p>
            <p className="text-xs text-muted">Darf zurück: {l.allowActions.map((t) => CAD_LINK_LABELS[t] ?? t).join(', ') || 'nichts'}{l.roleIds.length ? ` (nur mit freigegebener Rolle)` : ''}</p>
            {can('cad.manage_cross_server') && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setEdit(l)}>Bearbeiten</Button>}
          </Card>))}</div>
      )}
      {edit && (
        <Modal open wide title={edit.id ? 'Verbindung bearbeiten' : 'Verbindung anlegen'} onClose={() => setEdit(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(edit); }}>
            <div className="sm:col-span-2"><Field label="Name">{(id) => <Input id={id} required minLength={2} maxLength={80} value={edit.name ?? ''} placeholder="Leitstelle ↔ SEK/K9" onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field></div>
            <Field label="Quelle (Leitstelle)">{() => <GuildSelect label="Quelle" allowEmpty={false} value={edit.sourceGuildId} onChange={(v) => v && setEdit({ ...edit, sourceGuildId: v })} />}</Field>
            <Field label="Ziel (z. B. SEK + K9)">{() => <GuildSelect label="Ziel" allowEmpty={false} value={edit.targetGuildId} onChange={(v) => v && setEdit({ ...edit, targetGuildId: v, channels: {}, roleIds: [] })} />}</Field>
            <fieldset><legend className="mb-1 text-xs font-medium text-muted">Quelle darf an Ziel senden</legend>{CAD_LINK_SEND_TYPES.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(edit.sendTypes ?? []).includes(t)} onChange={() => setEdit({ ...edit, sendTypes: toggle(edit.sendTypes, t) })} />{CAD_LINK_LABELS[t]}</label>)}</fieldset>
            <fieldset><legend className="mb-1 text-xs font-medium text-muted">Ziel darf zurück</legend>{CAD_LINK_ACTIONS.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(edit.allowActions ?? []).includes(t)} onChange={() => setEdit({ ...edit, allowActions: toggle(edit.allowActions, t) })} />{CAD_LINK_LABELS[t]}</label>)}</fieldset>
            <div className="sm:col-span-2"><Field label="Nur diese Rollen auf dem Ziel-Server (leer = alle mit CAD-Recht)">{() => <GuildRoles label="Rollen" guildId={edit.targetGuildId ?? null} value={edit.roleIds ?? []} onChange={(v) => setEdit({ ...edit, roleIds: v })} />}</Field></div>
            <div className="space-y-1 sm:col-span-2"><p className="text-xs font-medium text-muted">Kanäle auf dem Ziel-Server je Datenart</p>
              {(edit.sendTypes ?? []).map((t) => <div key={t} className="flex flex-wrap items-center gap-2 text-sm"><span className="w-44">{CAD_LINK_LABELS[t]}</span><GuildChannels label={`Kanäle ${t}`} guildId={edit.targetGuildId ?? null} value={edit.channels?.[t] ?? []} onChange={(v) => setEdit({ ...edit, channels: { ...(edit.channels ?? {}), [t]: v } })} /></div>)}</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Aktiv</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.notify !== false} onChange={(e) => setEdit({ ...edit, notify: e.target.checked })} />Benachrichtigungen senden</label>
            {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
            <div className="flex justify-between gap-2 sm:col-span-2">{edit.id ? <Button variant="danger" onClick={() => del.mutate(edit.id!)}>Löschen</Button> : <span />}<div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Abbrechen</Button><Button type="submit" disabled={!edit.sourceGuildId || !edit.targetGuildId}>Speichern</Button></div></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ───────── Protokolle ─────────
export function CadLogs() {
  const q = useQuery({ queryKey: ['cad-logs'], queryFn: () => api<{ id: string; action: string; module: string; entityType: string | null; entityId: string | null; after: unknown; actor: string | null; createdAt: string }[]>('/cad/logs') });
  const [f, setF] = useState('');
  const rows = (q.data ?? []).filter((r) => !f || `${r.action} ${r.actor} ${JSON.stringify(r.after)}`.toLowerCase().includes(f.toLowerCase()));
  return (
    <>
      <PageHeader title="Protokolle" subtitle="Änderungsprotokoll von CAD und ER:LC (unveränderbar)" />
      <Input aria-label="Filtern" className="mb-2 max-w-xs" placeholder="Filtern…" value={f} onChange={(e) => setF(e.target.value)} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <EmptyState text="Keine Einträge." /> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="px-2 py-1">Zeit</th><th className="px-2 py-1">Benutzer</th><th className="px-2 py-1">Aktion</th><th className="px-2 py-1">Details</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-line align-top"><td className="whitespace-nowrap px-2 py-1">{new Date(r.createdAt).toLocaleString('de-DE')}</td><td className="px-2 py-1">{r.actor ?? 'System'}</td><td className="px-2 py-1"><code>{r.action}</code></td><td className="max-w-md truncate px-2 py-1 text-xs text-muted" title={JSON.stringify(r.after)}>{r.after ? JSON.stringify(r.after) : ''}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}

// ───────── Gefahrenstatus (Stufen, Texte, Buttons, Ping) ─────────
/** Button-Panel vom Dashboard aus in einen beliebigen Kanal senden (ein älteres Panel löscht der Bot). */
function DangerPanelSender() {
  const qc = useQueryClient();
  const guilds = useGuilds();
  const cur = useQuery({ queryKey: ['danger-panel'], queryFn: () => api<{ channelId: string | null; posted: boolean }>('/danger-level/panel') });
  const [channelId, setChannelId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>();
  const send = useMutation({
    mutationFn: (target: string) => api('/danger-level/panel', { body: { channelId: target } }),
    onSuccess: () => { setMsg('✅ Gesendet – der Bot postet das Panel in wenigen Sekunden.'); setTimeout(() => void qc.invalidateQueries({ queryKey: ['danger-panel'] }), 8000); },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Fehler'),
  });
  const chName = (id: string | null) => { for (const g of guilds.data ?? []) { const c = g.channels.find((x) => x.id === id); if (c) return `#${c.name} (${g.name})`; } return id ?? '—'; };
  return (
    <Card title="📌 Panel in Discord senden" className="lg:col-span-2">
      <p className="mb-2 text-xs text-muted">Das Panel zeigt den aktuellen Status mit einer Schaltfläche je Stufe und aktualisiert sich selbst. Es gibt immer nur ein Panel: Wird es in einen anderen Kanal geschickt, löscht der Bot das alte.</p>
      <p className="mb-2 text-sm">Aktuell: {cur.data?.channelId ? <b>{chName(cur.data.channelId)}</b> : <span className="text-muted">noch kein Panel gepostet</span>}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1"><Field label="Kanal">{() => <ChannelPicker ariaLabel="Kanal für das Panel" value={channelId ?? cur.data?.channelId} onChange={(id) => { setChannelId(id); setMsg(undefined); }} />}</Field></div>
        <Button disabled={!(channelId ?? cur.data?.channelId) || send.isPending} onClick={() => { const t = channelId ?? cur.data?.channelId; if (t) send.mutate(t); }}>Panel senden</Button>
      </div>
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
    </Card>
  );
}

function DangerSettings() {
  const q = useQuery({ queryKey: ['danger-config'], queryFn: () => api<DangerConfig>('/danger-level/config') });
  const [d, setD] = useState<DangerConfig | null>(null);
  useEffect(() => { if (q.data && !d) setD(q.data); }, [q.data, d]);
  useAutosaveDraft(d ? 'danger:config' : null, d ?? undefined, (v) => ({ method: 'PUT', path: '/danger-level/config', body: v, guildId: null, label: 'Gefahrenstatus' }));
  const guilds = useGuilds();
  if (!d) return <SkeletonRows />;
  const setLevel = (i: number, p: Partial<DangerConfig['levels'][number]>) => setD({ ...d, levels: d.levels.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const move = (i: number, dir: number) => { const n = [...d.levels]; const [x] = n.splice(i, 1); n.splice(i + dir, 0, x!); setD({ ...d, levels: n }); };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DangerPanelSender />
      <Card title="Panel-Inhalt">
        <div className="grid gap-2">
          <Field label="Titel">{(id) => <Input id={id} maxLength={200} value={d.panelTitle} onChange={(e) => setD({ ...d, panelTitle: e.target.value })} />}</Field>
          <Field label="Text (Markdown)">{(id) => <Textarea id={id} rows={5} maxLength={3000} value={d.panelText} onChange={(e) => setD({ ...d, panelText: e.target.value })} />}</Field>
          <Field label="Emoji auf den Schaltflächen (leer = Emoji der Stufe)">{(id) => <Input id={id} maxLength={4} value={d.buttonEmoji} onChange={(e) => setD({ ...d, buttonEmoji: e.target.value })} />}</Field>
          <Field label="Bei jeder Änderung pingen (z. B. @Im Dienst)" hint="Kanal: Einstellungen → Discord → Gefahrenstatus-Kanal">{() => (
            <div className="flex flex-wrap items-center gap-1">
              {d.pingRoleIds.map((id) => { const r = guilds.data?.flatMap((g) => g.roles).find((x) => x.id === id); return <span key={id} className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs">@{r?.name ?? id}<button type="button" aria-label="entfernen" onClick={() => setD({ ...d, pingRoleIds: d.pingRoleIds.filter((x) => x !== id) })}>×</button></span>; })}
              <Select aria-label="Rolle hinzufügen" className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && setD({ ...d, pingRoleIds: [...new Set([...d.pingRoleIds, e.target.value])] })}><option value="">+ Rolle…</option>{(guilds.data ?? []).map((g) => <optgroup key={g.id} label={g.name}>{g.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}</Select>
            </div>
          )}</Field>
        </div>
      </Card>
      <Card title="Vorschau">
        <div className="rounded border-l-4 bg-panel-2 p-3 text-sm" style={{ borderColor: d.levels[0]?.color }}>
          <p className="mb-2 text-base font-bold">{d.panelTitle}</p><p className="whitespace-pre-wrap">{d.panelText}</p>
          <div className="mt-3 flex flex-wrap gap-1">{d.levels.map((l) => <span key={l.key} className="rounded bg-danger px-2 py-1 text-xs text-white">{d.buttonEmoji || l.emoji} {l.name}</span>)}</div>
        </div>
      </Card>
      <Card title="Stufen" className="lg:col-span-2">
        <ul className="space-y-3">{d.levels.map((l, i) => (
          <li key={i} className="grid gap-2 rounded border border-line p-2 md:grid-cols-[auto_1fr_1fr_auto]">
            <div className="flex gap-1"><Input aria-label="Emoji" className="w-14 text-center" maxLength={4} value={l.emoji} onChange={(e) => setLevel(i, { emoji: e.target.value })} /><Input aria-label="Farbe" type="color" className="h-9 w-12 p-0.5" value={l.color} onChange={(e) => setLevel(i, { color: e.target.value })} /></div>
            <Input aria-label="Name (Schaltfläche)" maxLength={40} value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} />
            <Input aria-label="Überschrift" maxLength={200} value={l.title} placeholder="z. B. Geringe Kriminalität." onChange={(e) => setLevel(i, { title: e.target.value })} />
            <div className="flex items-center gap-1">
              <Select aria-label="Schaltflächenfarbe" className="w-auto py-1 text-xs" value={l.buttonStyle} onChange={(e) => setLevel(i, { buttonStyle: e.target.value as 'danger' })}><option value="danger">rot</option><option value="primary">blau</option><option value="success">grün</option><option value="secondary">grau</option></Select>
              <Button size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></Button>
              <Button size="sm" variant="ghost" aria-label="nach unten" disabled={i === d.levels.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></Button>
              <Button size="sm" variant="ghost" aria-label="Entfernen" disabled={d.levels.length <= 2} onClick={() => setD({ ...d, levels: d.levels.filter((_, j) => j !== i) })}><Trash2 size={12} /></Button>
            </div>
            <Textarea aria-label="Text der Meldung (Markdown)" className="md:col-span-4" rows={3} maxLength={3500} value={l.text} onChange={(e) => setLevel(i, { text: e.target.value })} />
          </li>))}</ul>
        <Button size="sm" variant="secondary" className="mt-2" disabled={d.levels.length >= 10} onClick={() => setD({ ...d, levels: [...d.levels, { key: `STATUS_${d.levels.length + 1}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`, name: `Status ${d.levels.length + 1}`, title: '', text: '', emoji: '⚪', color: '#64748b', buttonStyle: 'danger' }] })}>+ Stufe</Button>
      </Card>
    </div>
  );
}
