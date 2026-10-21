import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert, ImageUp, Undo2 } from 'lucide-react';
import {
  BRANDING_AREAS, BRANDING_IMAGES, REQUIRED_BOT_PERMISSIONS, SETUP_STEPS, checkBrandingImage, imageInfo, readableTextOn, serverConfigSchema,
  type BotPermissionKey, type BrandingImageKind, type ServerConfigData,
} from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/guilds';
import { setServer } from '../../lib/server';
import { errText } from '../../lib/tickets';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, confirmDialog, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../../components/ui';

interface Asset { id: string; kind: BrandingImageKind; mime: string; size: number; width: number; height: number; url: string; originalName: string; createdAt: string; inUse: boolean; inRevisions: boolean }
interface ConfigResp {
  server: { id: string; guildId: string; name: string; status: string; archivedAt: string | null };
  config: { data: ServerConfigData; version: number; setupStep: number; setupCompletedAt: string | null; saved: boolean; updatedAt: string | null };
  assets: Asset[];
  bot: { present: boolean; guildName: string | null; icon: string | null; channels: number; roles: number; permissions: Record<string, boolean> | null; missing: BotPermissionKey[] | null };
  canManage: boolean;
}
interface ModuleRow { key: string; name: string; description: string; system: boolean; enabled: boolean; version: number; dependsOn: string[] }
interface Revision { version: number; note: string | null; createdAt: string; createdBy: string | null; data: ServerConfigData; modules: Record<string, boolean> }

const TABS = { general: 'Allgemein', images: 'Branding & Bilder', design: 'Design & Farben', modules: 'Module', discord: 'Discord-Verbindung', permissions: 'Berechtigungen', notifications: 'Benachrichtigungen', backup: 'Datensicherung' } as const;
type TabKey = keyof typeof TABS;
type Set = (p: (d: ServerConfigData) => ServerConfigData) => void;
const SLOTS: { key: string; kind: BrandingImageKind; label: string; get: (d: ServerConfigData) => string | null; put: (d: ServerConfigData, v: string | null) => ServerConfigData }[] = [
  { key: 'logo', kind: 'logo', label: 'Serverlogo', get: (d) => d.branding.logo, put: (d, v) => ({ ...d, branding: { ...d.branding, logo: v } }) },
  { key: 'avatar', kind: 'avatar', label: 'Profilbild', get: (d) => d.branding.avatar, put: (d, v) => ({ ...d, branding: { ...d.branding, avatar: v } }) },
  { key: 'banner', kind: 'banner', label: 'Dashboard-Banner', get: (d) => d.branding.banner, put: (d, v) => ({ ...d, branding: { ...d.branding, banner: v } }) },
  { key: 'background', kind: 'background', label: 'Hintergrundbild', get: (d) => d.branding.background, put: (d, v) => ({ ...d, branding: { ...d.branding, background: v } }) },
  ...(Object.keys(BRANDING_AREAS) as (keyof typeof BRANDING_AREAS)[]).map((a) => ({ key: `areas.${a}`, kind: 'area' as const, label: `Bereichsbild: ${BRANDING_AREAS[a]}`, get: (d: ServerConfigData) => d.branding.areas[a], put: (d: ServerConfigData, v: string | null) => ({ ...d, branding: { ...d.branding, areas: { ...d.branding.areas, [a]: v } } }) })),
];

/** Einstieg aus dem Menü: Konfiguration des gerade gewählten Servers (sonst Server-Übersicht). */
export function CurrentServerSettings() {
  const [server] = useServer();
  return <Navigate to={server ? `/servers/${server}/settings` : '/servers'} replace />;
}

/**
 * Server-Konfiguration (je Discord-Server getrennt): Allgemein, Branding & Bilder, Design, Module, Discord-Verbindung,
 * Berechtigungen, Benachrichtigungen, Datensicherung – oder als Einrichtungsassistent (`setup`).
 * Alles wird erst nach erfolgreicher Prüfung durch den Server gespeichert; die Vorschau zeigt Änderungen vorher.
 */
export function ServerSettings({ setup = false }: { setup?: boolean }) {
  const { guildId = '' } = useParams();
  const brand = useQuery({ queryKey: ['branding', guildId], queryFn: () => api<{ serverId: string }>(`/servers/branding/${guildId}`), retry: false });
  const serverId = brand.data?.serverId;
  // Hinweis „Gespeichert“ überlebt das Neuladen des Editors nach dem Speichern (neue Version = neuer Editor-Zustand)
  const [notice, setNotice] = useState<string>();
  const cfg = useQuery({ queryKey: ['server-config', serverId], queryFn: () => api<ConfigResp>(`/servers/${serverId}/config`), enabled: !!serverId, retry: false });
  const err = brand.error ?? cfg.error;
  if (err) return err instanceof ApiError && (err.status === 404 || err.status === 403)
    ? <EmptyState text="Server nicht gefunden oder kein Zugriff." hint="Die Konfiguration eines Servers sehen nur bestätigte Mitglieder mit dem Recht „servers.view“ auf genau diesem Server." />
    : <ErrorState error={err} onRetry={() => void cfg.refetch()} />;
  if (!cfg.data) return <SkeletonRows />;
  return <Editor key={`${cfg.data.server.id}:${cfg.data.config.version}`} c={cfg.data} setup={setup} notice={notice} setNotice={setNotice} />;
}

function Editor({ c, setup, notice: msg, setNotice: setMsg }: { c: ConfigResp; setup: boolean; notice?: string; setNotice: (m?: string) => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [draft, setDraft] = useState<ServerConfigData>(c.config.data);
  const set: Set = (p) => { setDraft((d) => p(d)); setMsg(undefined); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(c.config.data);
  const parsed = serverConfigSchema.safeParse(draft);
  const errors = useMemo(() => (parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]))), [parsed]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['server-config', c.server.id] }); void qc.invalidateQueries({ queryKey: ['branding'] }); };
  const save = useMutation({
    mutationFn: () => api<{ version: number }>(`/servers/${c.server.id}/config`, { method: 'PUT', body: { data: draft, version: c.config.version } }),
    onSuccess: (r) => { setMsg(`Gespeichert – Version ${r.version}.`); refresh(); },
  });
  const ro = !c.canManage;
  // Warnung beim Verlassen mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const saveBar = (
    <div className="flex flex-wrap items-center gap-2">
      {ro ? <span className="text-sm text-muted">Nur Ansicht – zum Ändern fehlt dir „servers.manage“ auf diesem Server.</span> : <>
        <Button disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichert …' : 'Speichern'}</Button>
        <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => { setDraft(c.config.data); setMsg(undefined); }}><Undo2 size={14} aria-hidden />Verwerfen</Button>
        {dirty && <span className="text-xs text-warning">Ungespeicherte Änderungen (Vorschau zeigt sie bereits)</span>}
      </>}
      {msg && <span role="status" className="flex items-center gap-1 text-sm text-success"><Check size={14} aria-hidden />{msg}</span>}
      {save.error && <span role="alert" className="text-sm text-danger">{save.error instanceof ApiError && save.error.status === 409 ? 'Inzwischen von jemand anderem geändert – bitte Seite neu laden. Deine Änderung ist NICHT gespeichert.' : errText(save.error)}</span>}
    </div>
  );
  const sections: Record<TabKey, ReactNode> = {
    general: <General d={draft} set={set} errors={errors} ro={ro} />,
    images: <Images c={c} d={draft} set={set} ro={ro} onChanged={refresh} />,
    design: <Design d={draft} set={set} errors={errors} ro={ro} hasBackground={!!draft.branding.background} />,
    modules: <Modules serverId={c.server.id} />,
    discord: <Discord c={c} />,
    permissions: <Permissions />,
    notifications: <Notifications />,
    backup: <Backup c={c} onRestored={refresh} />,
  };
  const preview = <Preview d={draft} assets={c.assets} />;
  if (setup) return <Wizard c={c} draft={draft} sections={sections} preview={preview} saveBar={saveBar} dirty={dirty} valid={parsed.success} onDone={() => { setServer(c.server.guildId); void nav('/dashboard'); }} />;
  const keys = Object.keys(TABS) as TabKey[];
  const tab = (keys.find((k) => k === search.get('tab')) ?? 'general') as TabKey;
  return (
    <>
      <PageHeader title="Server-Konfiguration" subtitle={`${c.server.name} · Guild ${c.server.guildId} – gilt nur für diesen Server.`}
        actions={<Link to={`/servers/${c.server.guildId}/setup`} className="text-sm text-primary underline">{c.config.setupCompletedAt ? 'Einrichtungsassistent erneut öffnen' : 'Einrichtungsassistent fortsetzen'}</Link>} />
      {!c.config.setupCompletedAt && <p className="mb-3 rounded border border-warning/40 bg-warning/10 p-2 text-sm">Die Einrichtung ist noch nicht abgeschlossen. <Link className="underline" to={`/servers/${c.server.guildId}/setup`}>Assistent fortsetzen (Schritt {Math.min(c.config.setupStep + 1, SETUP_STEPS.length)}/{SETUP_STEPS.length})</Link></p>}
      <Tabs tabs={keys.map((k) => TABS[k])} active={TABS[tab]} onChange={(t) => setSearch({ tab: keys.find((k) => TABS[k] === t)! })} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="grid min-w-0 content-start gap-4">
          {sections[tab]}
          {['general', 'images', 'design'].includes(tab) && <Card>{saveBar}</Card>}
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">{preview}</div>
      </div>
    </>
  );
}

// ───────── Einrichtungsassistent ─────────
function Wizard({ c, draft, sections, preview, saveBar, dirty, valid, onDone }: { c: ConfigResp; draft: ServerConfigData; sections: Record<TabKey, ReactNode>; preview: ReactNode; saveBar: ReactNode; dirty: boolean; valid: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(Math.min(c.config.setupStep, SETUP_STEPS.length - 1));
  const progress = useMutation({ mutationFn: (b: { step: number; complete?: boolean }) => api(`/servers/${c.server.id}/config/setup`, { method: 'POST', body: b }) });
  const go = (n: number) => { setStep(n); if (c.canManage && n > c.config.setupStep) progress.mutate({ step: n }); window.scrollTo({ top: 0 }); };
  const finish = useMutation({ mutationFn: () => api(`/servers/${c.server.id}/config/setup`, { method: 'POST', body: { step: SETUP_STEPS.length - 1, complete: true } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['branding'] }); onDone(); } });
  const key = SETUP_STEPS[step]!.key;
  const blocked = key === 'review' && (dirty || !c.config.saved);
  const body: Record<string, ReactNode> = {
    connect: sections.discord,
    server: <ServerCheck c={c} />,
    names: sections.general, images: sections.images, design: sections.design, modules: sections.modules,
    review: <Review c={c} d={draft} valid={valid} saveBar={saveBar} dirty={dirty} />,
    finish: <Card title="Vorschau & Abschluss"><p className="mb-3 text-sm text-muted">So sieht das Dashboard dieses Servers aus. Du kannst später jederzeit unter <b>Administration → Server-Konfiguration</b> zurückkehren.</p>{preview}</Card>,
  };
  return (
    <>
      <PageHeader title="Einrichtungsassistent" subtitle={`${c.server.name} – Schritt ${step + 1} von ${SETUP_STEPS.length}: ${SETUP_STEPS[step]!.label}`} actions={<Link to={`/servers/${c.server.guildId}/settings`} className="text-sm text-primary underline">Später fortsetzen</Link>} />
      <ol className="mb-4 grid grid-cols-4 gap-1 sm:grid-cols-8" aria-label="Fortschritt">
        {SETUP_STEPS.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => go(i)} disabled={i > Math.max(step, c.config.setupStep) + 1} aria-current={i === step ? 'step' : undefined}
              className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition ${i === step ? 'border-primary bg-primary/15' : i < step || i <= c.config.setupStep ? 'border-success/40 bg-success/10' : 'border-line bg-panel'} disabled:opacity-50`}>
              <span className="block font-semibold">{i < step || (c.config.setupCompletedAt && i !== step) ? '✓' : i + 1}</span><span className="block truncate">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="grid min-w-0 content-start gap-4">
          {body[key]}
          {['names', 'images', 'design'].includes(key) && <Card>{saveBar}</Card>}
          {(progress.error || finish.error) && <p role="alert" className="text-sm text-danger">{errText(progress.error ?? finish.error)}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" disabled={step === 0} onClick={() => go(step - 1)}>Zurück</Button>
            {step < SETUP_STEPS.length - 1
              ? <Button disabled={blocked} title={blocked ? 'Bitte zuerst speichern' : undefined} onClick={() => go(step + 1)}>Weiter</Button>
              : <Button disabled={!c.canManage || !c.config.saved || dirty || finish.isPending} onClick={() => finish.mutate()}>Einrichtung abschließen</Button>}
          </div>
        </div>
        {key !== 'finish' && <div className="xl:sticky xl:top-4 xl:self-start">{preview}</div>}
      </div>
    </>
  );
}

function ServerCheck({ c }: { c: ConfigResp }) {
  const ok = (b: boolean | null, label: string, hint?: string) => (
    <li className="flex items-start gap-2 text-sm">{b === null ? <CircleAlert size={16} className="mt-0.5 text-warning" aria-hidden /> : b ? <Check size={16} className="mt-0.5 text-success" aria-hidden /> : <CircleAlert size={16} className="mt-0.5 text-danger" aria-hidden />}<span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span></li>
  );
  return (
    <Card title="Server & Berechtigungen">
      <ul className="grid gap-2">
        {ok(true, `Server „${c.server.name}“ ist registriert (Guild-ID ${c.server.guildId}).`)}
        {ok(c.server.status === 'ACTIVE' && !c.server.archivedAt, c.server.status === 'ACTIVE' ? 'Server ist freigeschaltet.' : 'Server ist deaktiviert – ein Systemadministrator muss ihn freischalten.')}
        {ok(true, 'Du bist bestätigtes Mitglied dieses Servers.')}
        {ok(c.canManage, c.canManage ? 'Du darfst diesen Server konfigurieren (servers.manage).' : 'Dir fehlt „servers.manage“ auf diesem Server – du kannst nur ansehen.', c.canManage ? undefined : 'Rechte vergibt ein Administrator unter Benutzer & Rollen bzw. über eine Discord-Rolle dieses Servers.')}
        {ok(c.bot.missing === null ? null : c.bot.missing.length === 0, c.bot.missing === null ? 'Bot-Rechte noch unbekannt (Bot hat für diesen Server nichts gemeldet).' : c.bot.missing.length ? `Dem Bot fehlen Rechte: ${c.bot.missing.map((k) => REQUIRED_BOT_PERMISSIONS[k]).join(', ')}` : 'Der Bot hat alle benötigten Rechte.')}
      </ul>
    </Card>
  );
}

function Review({ c, d, valid, saveBar, dirty }: { c: ConfigResp; d: ServerConfigData; valid: boolean; saveBar: ReactNode; dirty: boolean }) {
  const img = (id: string | null) => (id ? c.assets.find((a) => a.id === id)?.originalName ?? 'Bild' : '—');
  const rows: [string, string][] = [
    ['Anzeigename', d.general.displayName], ['Kurzname', d.general.shortName || '—'], ['Dashboard-Titel', d.general.dashboardTitle || '—'],
    ['Logo', img(d.branding.logo)], ['Profilbild', img(d.branding.avatar)], ['Banner', img(d.branding.banner)], ['Hintergrund', img(d.branding.background)],
    ['Farben', `${d.design.primary} / ${d.design.accent}`], ['Design', d.design.mode === 'user' ? 'nach Benutzereinstellung' : d.design.mode === 'dark' ? 'dunkel' : 'hell'],
  ];
  return (
    <Card title="Einstellungen prüfen & speichern">
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
      {!valid && <p role="alert" className="mb-2 text-sm text-danger">Einige Angaben sind ungültig – bitte in den vorherigen Schritten korrigieren.</p>}
      {!dirty && c.config.saved && <p className="mb-2 text-sm text-success">Alle Änderungen sind gespeichert (Version {c.config.version}).</p>}
      {saveBar}
    </Card>
  );
}

// ───────── Bereiche ─────────
const FieldError = ({ e }: { e?: string }) => (e ? <span role="alert" className="text-xs text-danger">{e}</span> : null);

function General({ d, set, errors, ro }: { d: ServerConfigData; set: Set; errors: Record<string, string>; ro: boolean }) {
  const g = (p: Partial<ServerConfigData['general']>) => set((x) => ({ ...x, general: { ...x.general, ...p } }));
  return (
    <Card title="Allgemein">
      <fieldset disabled={ro} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Servername (Anzeige)">{(id) => <div className="grid gap-1"><Input id={id} value={d.general.displayName} maxLength={80} onChange={(e) => g({ displayName: e.target.value })} /><FieldError e={errors['general.displayName']} /></div>}</Field>
          <Field label="Kurzname" hint="Für die Seitenleiste, z. B. EMD (max. 16 Zeichen)">{(id) => <Input id={id} value={d.general.shortName} maxLength={16} onChange={(e) => g({ shortName: e.target.value })} />}</Field>
        </div>
        <Field label="Dashboard-Titel">{(id) => <Input id={id} value={d.general.dashboardTitle} maxLength={80} onChange={(e) => g({ dashboardTitle: e.target.value })} />}</Field>
        <Field label="Begrüßungstext" hint="Erscheint oben auf dem Dashboard dieses Servers.">{(id) => <Textarea id={id} rows={4} value={d.general.welcomeText} maxLength={1000} onChange={(e) => g({ welcomeText: e.target.value })} />}</Field>
      </fieldset>
    </Card>
  );
}

function Images({ c, d, set, ro, onChanged }: { c: ConfigResp; d: ServerConfigData; set: Set; ro: boolean; onChanged: () => void }) {
  const unused = c.assets.filter((a) => !a.inUse && !a.inRevisions && !SLOTS.some((s) => s.get(d) === a.id));
  const kept = c.assets.filter((a) => !a.inUse && a.inRevisions && !SLOTS.some((s) => s.get(d) === a.id));
  const del = useMutation({ mutationFn: (id: string) => api(`/servers/${c.server.id}/assets/${id}`, { method: 'DELETE', query: { confirm: true } }), onSuccess: onChanged });
  return (
    <>
      <Card title="Branding & Bilder">
        <p className="mb-3 text-sm text-muted">Erlaubt sind PNG, JPG und WebP (kein SVG). Bilder werden geprüft (echter Dateityp, Größe, Abmessungen) und nur für diesen Server gespeichert. Externe Bildadressen sind nicht möglich.</p>
        <div className="grid gap-3 md:grid-cols-2">{SLOTS.map((s) => <ImageSlot key={s.key} c={c} slot={s} d={d} set={set} ro={ro} onUploaded={onChanged} />)}</div>
      </Card>
      {!ro && (unused.length > 0 || kept.length > 0) && (
        <Card title="Nicht verwendete Bilder">
          {del.error && <p role="alert" className="mb-2 text-sm text-danger">{errText(del.error)}</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {unused.map((a) => <li key={a.id} className="flex items-center gap-2 rounded border border-line p-2 text-sm"><img src={a.url} alt="" className="h-10 w-10 rounded object-cover" /><span className="min-w-0 flex-1 truncate">{a.originalName}<span className="block text-xs text-muted">{BRANDING_IMAGES[a.kind].label} · {a.width}×{a.height}</span></span>
              <Button size="sm" variant="ghost" disabled={del.isPending} onClick={() => void confirmDialog(`„${a.originalName}“ endgültig entfernen? Das Bild wird von keiner Konfiguration verwendet.`, { title: 'Bild entfernen', confirmLabel: 'Entfernen', danger: true }).then((ok) => ok && del.mutate(a.id))}>Entfernen</Button></li>)}
            {kept.map((a) => <li key={a.id} className="flex items-center gap-2 rounded border border-line p-2 text-sm opacity-80"><img src={a.url} alt="" className="h-10 w-10 rounded object-cover" /><span className="min-w-0 flex-1 truncate">{a.originalName}<span className="block text-xs text-muted">wird für frühere Versionen aufbewahrt (Wiederherstellung)</span></span></li>)}
          </ul>
        </Card>
      )}
    </>
  );
}

function ImageSlot({ c, slot, d, set, ro, onUploaded }: { c: ConfigResp; slot: typeof SLOTS[number]; d: ServerConfigData; set: Set; ro: boolean; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string>();
  const rule = BRANDING_IMAGES[slot.kind];
  const cur = c.assets.find((a) => a.id === slot.get(d));
  const choices = c.assets.filter((a) => a.kind === slot.kind);
  const up = useMutation({
    mutationFn: async (f: File) => {
      // Vorabprüfung im Browser (die verbindliche Prüfung macht der Server)
      const info = imageInfo(new Uint8Array(await f.slice(0, 65_536).arrayBuffer()));
      if (!info) throw new Error('Kein gültiges PNG-, JPG- oder WebP-Bild.');
      const bad = checkBrandingImage(slot.kind, { mime: info.mime, size: f.size, width: info.width, height: info.height });
      if (bad) throw new Error(bad);
      const fd = new FormData(); fd.append('kind', slot.kind); fd.append('file', f);
      return api<Asset>(`/servers/${c.server.id}/assets`, { method: 'POST', formData: fd });
    },
    onSuccess: (a) => { setErr(undefined); set((x) => slot.put(x, a.id)); onUploaded(); },
    onError: (e) => setErr(e instanceof ApiError ? errText(e) : e instanceof Error ? e.message : 'Hochladen fehlgeschlagen'),
  });
  return (
    <div className="grid content-start gap-2 rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{slot.label}</span><span className="text-[11px] text-muted">min. {rule.minW}×{rule.minH}, max. {Math.round(rule.maxBytes / 1048576)} MB</span></div>
      <div className="grid h-24 place-items-center overflow-hidden rounded bg-panel-2">{cur ? <img src={cur.url} alt={`${slot.label} (Vorschau)`} className="max-h-24 max-w-full object-contain" /> : <span className="text-xs text-muted">kein Bild</span>}</div>
      {!ro && (
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={`${slot.label} hochladen`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) up.mutate(f); }} />
          <Button size="sm" variant="secondary" disabled={up.isPending} onClick={() => input.current?.click()}><ImageUp size={14} aria-hidden />{up.isPending ? 'Lädt …' : cur ? 'Ersetzen' : 'Hochladen'}</Button>
          {choices.length > 1 && <div className="w-40"><Select aria-label={`${slot.label} aus vorhandenen wählen`} value="" onChange={(e) => e.target.value && set((x) => slot.put(x, e.target.value))}><option value="">Vorhandenes …</option>{choices.map((a) => <option key={a.id} value={a.id}>{a.originalName} ({a.width}×{a.height})</option>)}</Select></div>}
          {cur && <Button size="sm" variant="ghost" onClick={() => set((x) => slot.put(x, null))}>Nicht verwenden</Button>}
        </div>
      )}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}

function Design({ d, set, errors, ro, hasBackground }: { d: ServerConfigData; set: Set; errors: Record<string, string>; ro: boolean; hasBackground: boolean }) {
  const s = (p: Partial<ServerConfigData['design']>) => set((x) => ({ ...x, design: { ...x.design, ...p } }));
  const color = (k: 'primary' | 'accent', label: string) => (
    <Field label={label}>{(id) => (
      <div className="grid gap-1">
        <div className="flex gap-2"><input id={id} type="color" aria-label={label} className="h-9 w-12 rounded border border-line bg-bg" value={/^#[0-9a-f]{6}$/i.test(d.design[k]) ? d.design[k] : '#000000'} onChange={(e) => s({ [k]: e.target.value })} /><Input aria-label={`${label} (hex)`} value={d.design[k]} maxLength={7} onChange={(e) => s({ [k]: e.target.value })} /></div>
        <FieldError e={errors[`design.${k}`]} />
        {/^#[0-9a-f]{6}$/i.test(d.design[k]) && <span className="text-[11px] text-muted">Schrift darauf: {readableTextOn(d.design[k]) === '#ffffff' ? 'weiß' : 'dunkel'} (automatisch für gute Lesbarkeit)</span>}
      </div>
    )}</Field>
  );
  return (
    <Card title="Design & Farben">
      <fieldset disabled={ro} className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">{color('primary', 'Primärfarbe')}{color('accent', 'Akzentfarbe (Buttons, Links)')}</div>
        <Field label="Hell/Dunkel" hint="Persönliche Einstellungen der Benutzer haben Vorrang; der Server-Standard gilt für alle, die „System“ gewählt haben.">{(id) => <Select id={id} value={d.design.mode} onChange={(e) => s({ mode: e.target.value as ServerConfigData['design']['mode'] })}><option value="user">Wie vom Benutzer eingestellt</option><option value="dark">Dunkel</option><option value="light">Hell</option></Select>}</Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.design.useBackground} disabled={!hasBackground} onChange={(e) => s({ useBackground: e.target.checked })} />Hintergrundbild verwenden{!hasBackground && <span className="text-xs text-muted">(zuerst unter „Branding & Bilder“ hochladen)</span>}</label>
      </fieldset>
    </Card>
  );
}

function Modules({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ms-modules', serverId], queryFn: () => api<ModuleRow[]>(`/servers/${serverId}/modules`), retry: false });
  const m = useMutation({ mutationFn: (x: ModuleRow) => api(`/servers/${serverId}/modules/${x.key}`, { method: 'PATCH', body: { enabled: !x.enabled, version: x.version } }), onSettled: () => void qc.invalidateQueries({ queryKey: ['ms-modules', serverId] }) });
  return (
    <Card title="Module">
      <p className="mb-3 text-sm text-muted">Ausgeschaltete Module werden für diesen Server ausgeblendet und gesperrt – ihre Daten bleiben vollständig gespeichert und sind nach dem Einschalten wieder da. Andere Server sind nicht betroffen.</p>
      {q.error ? <p role="alert" className="text-sm text-danger">{errText(q.error)}</p> : !q.data ? <SkeletonRows /> : (
        <ul className="grid gap-2">{q.data.map((x) => (
          <li key={x.key} className="flex items-center justify-between gap-3 rounded border border-line p-2">
            <span className="min-w-0"><span className="font-medium">{x.name}</span>{x.system && <span className="ml-1"><Badge>immer an</Badge></span>}<span className="block text-xs text-muted">{x.description}</span></span>
            {!x.system && <Toggle checked={x.enabled} onChange={() => { if (!m.isPending) m.mutate(x); }} label={`${x.name} ${x.enabled ? 'ausschalten' : 'einschalten'}`} />}
          </li>
        ))}</ul>
      )}
      {m.error && <p role="alert" className="mt-2 text-sm text-danger">{m.error instanceof ApiError && m.error.status === 409 ? 'Inzwischen geändert – Ansicht wurde neu geladen.' : errText(m.error)}</p>}
    </Card>
  );
}

function Discord({ c }: { c: ConfigResp }) {
  return (
    <Card title="Discord-Verbindung">
      {c.bot.present ? (
        <div className="grid gap-3 text-sm">
          <p className="flex items-center gap-2">{c.bot.icon && <img src={c.bot.icon} alt="" className="h-8 w-8 rounded-full" />}<Check size={16} className="text-success" aria-hidden />Der Bot ist auf „{c.bot.guildName}“ ({c.bot.channels} Kanäle, {c.bot.roles} Rollen gemeldet).</p>
          {c.bot.missing === null ? <p className="text-warning">Die Server-Rechte des Bots sind noch unbekannt (ältere Bot-Version oder noch keine Meldung).</p> : (
            <ul className="grid gap-1 sm:grid-cols-2">{(Object.keys(REQUIRED_BOT_PERMISSIONS) as BotPermissionKey[]).map((k) => {
              const missing = c.bot.missing!.includes(k);
              return <li key={k} className={missing ? 'text-danger' : 'text-success'}>{missing ? '✗' : '✓'} {REQUIRED_BOT_PERMISSIONS[k]}</li>;
            })}</ul>
          )}
          {!!c.bot.missing?.length && <p className="text-xs text-muted">Rechte in Discord unter Servereinstellungen → Rollen → Rolle des Bots ergänzen. Die Anzeige aktualisiert sich, sobald der Bot neu meldet (spätestens nach einigen Minuten).</p>}
        </div>
      ) : (
        <div className="grid gap-2 text-sm">
          <p className="text-warning">Der Bot hat diesen Server (Guild {c.server.guildId}) bisher nicht gemeldet – er ist nicht eingeladen oder offline.</p>
          <a className="w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg" href={`/api/v1/auth/discord/add-server?guild=${c.server.guildId}`}>Bot zu diesem Server hinzufügen</a>
          <p className="text-xs text-muted">Nach dem Hinzufügen meldet der Bot den Server automatisch; danach diese Seite neu laden.</p>
        </div>
      )}
    </Card>
  );
}

function Permissions() {
  return (
    <Card title="Berechtigungen">
      <p className="text-sm text-muted">Wer diesen Server konfigurieren darf, regeln Rollen <b>dieses</b> Servers: Konfiguration ändern = <code>servers.manage</code>, ansehen = <code>servers.view</code>, Module schalten = <code>modules.manage</code>. Rechte gelten nie automatisch auf anderen Servern; Discord-Rollen werden nur auf ihrem eigenen Server berücksichtigt.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Link className="rounded border border-line px-3 py-1.5 text-sm hover:bg-panel-2" to="/admin/roles">Rollen & Rechte</Link><Link className="rounded border border-line px-3 py-1.5 text-sm hover:bg-panel-2" to="/admin/multi-server">Server & Module (Mitglieder, effektive Rechte)</Link></div>
    </Card>
  );
}

function Notifications() {
  return (
    <Card title="Benachrichtigungen">
      <p className="text-sm text-muted">Benachrichtigungen dieses Servers werden in den bestehenden Bereichen eingestellt (jeweils nur für den gewählten Server):</p>
      <ul className="mt-2 grid gap-1 text-sm">
        <li><Link className="text-primary underline" to="/admin/logging">Logging (Discord)</Link> – welche Aktionen in welchen Kanal gemeldet werden</li>
        <li><Link className="text-primary underline" to="/support-tickets?tab=settings">Ticket-Center → Allgemein</Link> – Ticket-Benachrichtigungen</li>
        <li><Link className="text-primary underline" to="/admin/settings">Einstellungen</Link> – Discord-Kanäle des Bots</li>
      </ul>
    </Card>
  );
}

function Backup({ c, onRestored }: { c: ConfigResp; onRestored: () => void }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['server-config-revisions', c.server.id], queryFn: () => api<Revision[]>(`/servers/${c.server.id}/config/revisions`) });
  const [withModules, setWithModules] = useState(false);
  const r = useMutation({ mutationFn: (v: number) => api<{ version: number; modulesChanged: number }>(`/servers/${c.server.id}/config/revisions/${v}/restore`, { method: 'POST', body: { version: c.config.version, modules: withModules } }), onSuccess: onRestored });
  return (
    <Card title="Datensicherung & Wiederherstellung">
      <p className="mb-3 text-sm text-muted">Jede gespeicherte Konfiguration bleibt als Version erhalten. Wiederherstellen legt eine <b>neue</b> Version an – nichts wird gelöscht. Vollständige Datenbank-Backups (alle Server) gibt es unter <Link className="underline" to="/admin/backups">Backups</Link>{user?.globalAdmin ? '' : ' (nur Systemadministratoren)'}.</p>
      {c.canManage && <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={withModules} onChange={(e) => setWithModules(e.target.checked)} />Modul-Schalter dieser Version mit wiederherstellen (Daten bleiben in jedem Fall erhalten)</label>}
      {r.error && <p role="alert" className="mb-2 text-sm text-danger">{errText(r.error)}</p>}
      {r.data && <p role="status" className="mb-2 text-sm text-success">Wiederhergestellt als Version {r.data.version}{r.data.modulesChanged ? ` (${r.data.modulesChanged} Modul(e) umgeschaltet)` : ''}.</p>}
      {!q.data ? <SkeletonRows /> : !q.data.length ? <p className="text-sm text-muted">Noch keine gespeicherte Version.</p> : (
        <ul className="grid gap-2">{q.data.map((v) => (
          <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2 text-sm">
            <span>Version {v.version}{v.version === c.config.version && <span className="ml-1"><Badge tone="success">aktuell</Badge></span>}<span className="block text-xs text-muted">{fmt(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''}{v.note ? ` · ${v.note}` : ''} · {v.data?.general?.displayName}</span></span>
            {c.canManage && v.version !== c.config.version && <Button size="sm" variant="secondary" disabled={r.isPending} onClick={() => void confirmDialog(`Version ${v.version} als neue Version wiederherstellen?`, { title: 'Wiederherstellen', confirmLabel: 'Wiederherstellen' }).then((ok) => ok && r.mutate(v.version))}>Wiederherstellen</Button>}
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

// ───────── Live-Vorschau ─────────
function Preview({ d, assets }: { d: ServerConfigData; assets: Asset[] }) {
  const url = (id: string | null) => (id ? assets.find((a) => a.id === id)?.url ?? null : null);
  const valid = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const primary = valid(d.design.primary) ? d.design.primary : '#1e3a8a', accent = valid(d.design.accent) ? d.design.accent : '#3b82f6';
  const light = d.design.mode === 'light';
  const bg = d.design.useBackground && url(d.branding.background);
  const logo = url(d.branding.logo) ?? url(d.branding.avatar);
  const banner = url(d.branding.areas.dashboard) ?? url(d.branding.banner);
  return (
    <Card title="Live-Vorschau (noch nicht gespeichert, bis du speicherst)">
      <div className={`overflow-hidden rounded-lg border ${light ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-line bg-[#0b0e14] text-slate-100'}`} style={bg ? { background: `center / cover no-repeat url("${bg}")` } : undefined}>
        <div className="flex">
          <div className={`hidden w-28 shrink-0 flex-col gap-1 p-2 sm:flex ${light ? 'bg-white' : 'bg-[#111827]'}`}>
            <div className="flex items-center gap-1.5 rounded px-1 py-1" style={{ background: primary, color: readableTextOn(primary) }}>
              {logo ? <img src={logo} alt="" className="h-5 w-5 rounded object-contain" /> : <span className="grid h-5 w-5 place-items-center rounded bg-black/20 text-[9px] font-bold">{(d.general.shortName || d.general.displayName).slice(0, 2).toUpperCase()}</span>}
              <span className="truncate text-[11px] font-semibold">{d.general.shortName || d.general.displayName}</span>
            </div>
            {['Dashboard', 'Team', 'Tickets'].map((x, i) => <span key={x} className="rounded px-1 py-0.5 text-[10px]" style={i === 0 ? { background: `${accent}33`, color: accent } : undefined}>{x}</span>)}
          </div>
          <div className="min-w-0 flex-1 p-2">
            {banner && <img src={banner} alt="" className="mb-2 h-16 w-full rounded object-cover" />}
            <div className={`rounded p-2 ${light ? 'bg-white' : 'bg-[#111827]/90'}`} style={{ borderLeft: `3px solid ${primary}` }}>
              <p className="text-sm font-semibold">{d.general.dashboardTitle || d.general.displayName || 'Servername'}</p>
              {d.general.welcomeText && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] opacity-80">{d.general.welcomeText}</p>}
            </div>
            <div className="mt-2 flex gap-1"><span className="rounded px-2 py-1 text-[10px] font-medium" style={{ background: accent, color: readableTextOn(accent) }}>MDT öffnen</span><span className={`rounded border px-2 py-1 text-[10px] ${light ? 'border-slate-300' : 'border-white/20'}`}>Leitstelle</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
}
