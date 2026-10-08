import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Maximize2, Minimize2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { flush } from '../lib/autosave';
import { DEFAULT_LAYOUTS, usePrefs, type Layout, type WidgetCfg, type WidgetSize } from '../lib/prefs';
import { useRealtime } from '../lib/realtime';
import { NAV, navFor, tr, visible } from '../nav';
import { Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, PriorityBadge, Select, Skeleton, StatusBadge } from '../components/ui';
import { TeamRoster, useRoster } from '../components/TeamRoster';
import { VoiceWidget } from '../components/VoiceWidget';
import { RadioCodeList } from './RadioCodes';
import { TeamChanceSummary } from './TeamChance';

type Row = Record<string, unknown> & { id: string };
interface WidgetDef { id: string; title: string; perms: string[]; to?: string; render: () => ReactNode }

const SPAN: Record<WidgetSize, string> = { S: '', M: 'xl:col-span-2', L: 'md:col-span-2 xl:col-span-3', XL: 'md:col-span-2 xl:col-span-4' };
const SIZES: WidgetSize[] = ['S', 'M', 'L', 'XL'];

function Q({ q, empty, children }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown }; empty?: boolean; children: ReactNode }) {
  if (q.isLoading) return <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (empty) return <p className="py-2 text-sm text-muted">Nichts anzuzeigen.</p>;
  return <>{children}</>;
}
const list = <T,>(key: unknown[], path: string, query: Record<string, string | number | boolean>) => () => useQuery({ queryKey: key, queryFn: () => api<Page<T>>(path, { query }) });

// ---- Widgets (jede Anzeige nur mit den nötigen Rechten; die API prüft ohnehin) ----
function Stats() {
  const { can } = useAuth();
  const roster = useRoster();
  const tickets = useQuery({ queryKey: ['w-tickets-open-count'], queryFn: () => api<{ total: number }>('/support-tickets', { query: { kind: 'open', pageSize: 1 } }), enabled: can('ticket.view') && can('dashboard.tickets.view') });
  const apps = useQuery({ queryKey: ['w-apps-count'], queryFn: () => api<Page<Row>>('/applications', { query: { status: 'OPEN', pageSize: 1 } }), enabled: can('applications.view') && can('dashboard.applications.view') });
  const voice = useQuery({ queryKey: ['team-voice'], queryFn: () => api<{ channels: { members: unknown[] }[] }>('/team/voice'), enabled: can('dashboard.voice.view') && can('team.view') });
  const duty = useQuery({ queryKey: ['duty', 'dash'], queryFn: () => api<Row[]>('/team'), enabled: can('team.view') });
  const tiles: [string, number | undefined, string, boolean][] = [
    ['🎫 Offene Tickets', tickets.data?.total, '/support-tickets', can('ticket.view') && can('dashboard.tickets.view')],
    ['📝 Offene Bewerbungen', apps.data?.total, '/applications', can('applications.view') && can('dashboard.applications.view')],
    ['🟢 Team online', roster.data?.members.filter((m) => m.status === 'online' || m.status === 'idle' || m.status === 'dnd').length, '/teamlist', can('team.view') && can('dashboard.team.view')],
    ['🎙️ In Voice', voice.data?.channels.reduce((n, c) => n + c.members.length, 0), '/teamlist', can('dashboard.voice.view') && can('team.view')],
    ['👮 Im Dienst', duty.data?.filter((d) => d.status === 'ON_DUTY').length, '/team', can('team.view')],
  ];
  const shown = tiles.filter((t) => t[3]);
  if (!shown.length) return <p className="text-sm text-muted">Keine Statistiken für deine Rolle.</p>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{shown.map(([l, v, to]) => <Link key={l} to={to} className="rounded-md border border-line p-3 hover:border-primary"><p className="text-2xl font-semibold">{v ?? '—'}</p><p className="text-xs text-muted">{l}</p></Link>)}</div>;
}

export const QUICK_ACTIONS: { id: string; label: string; to?: string; perms: string[]; action?: 'search' }[] = [
  { id: 'ticket-create', label: '+ Ticket erstellen', to: '/support-tickets', perms: ['ticket.create'] },
  { id: 'applications', label: 'Bewerbung ansehen', to: '/applications', perms: ['applications.view', 'dashboard.applications.view'] },
  { id: 'team-search', label: 'Teammitglied suchen', to: '/teamlist', perms: ['team.view', 'dashboard.team.view'] },
  { id: 'member-search', label: 'Mitglied suchen', to: '/admin/users', perms: ['users.view', 'dashboard.settings.view'] },
  { id: 'search', label: '🔍 Globale Suche (Strg+K)', perms: [], action: 'search' },
  { id: 'radio', label: '📡 Funk-Code öffnen', to: '/radio-codes', perms: ['radio.view', 'dashboard.radio.view'] },
  { id: 'teamchance', label: '📣 Team-Chance', to: '/teamchance', perms: ['teamchance.view', 'dashboard.teamchance.view'] },
  { id: 'incident', label: '+ Einsatz anlegen', to: '/incidents', perms: ['incidents.create'] },
  { id: 'report', label: '+ Bericht schreiben', to: '/reports', perms: ['reports.create'] },
  { id: 'settings', label: '⚙️ Persönliche Einstellungen', to: '/me/settings', perms: [] },
];
export const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

function Quick() {
  const { can } = useAuth();
  const { prefs } = usePrefs();
  const nav = useNavigate();
  const items = QUICK_ACTIONS.filter((a) => prefs.quickActions.includes(a.id) && a.perms.every(can));
  if (!items.length) return <p className="text-sm text-muted">Keine Schnellaktionen gewählt – unter „Dashboard bearbeiten“ oder Persönlich einstellen.</p>;
  return <div className="flex flex-wrap gap-2">{items.map((a) => <Button key={a.id} variant="secondary" size="sm" onClick={() => (a.action === 'search' ? openSearch() : nav(a.to!))}>{a.label}</Button>)}</div>;
}

function Favorites() {
  const { prefs } = usePrefs();
  const { can } = useAuth();
  const items = [...new Set(prefs.favorites.map((p) => navFor(NAV, p)).filter((n): n is (typeof NAV)[number] => !!n && visible(n, can)))];
  if (!items.length) return <p className="text-sm text-muted">Noch keine Favoriten. Im Menü auf ☆ neben einem Bereich klicken.</p>;
  return <ul className="grid gap-1 sm:grid-cols-2">{items.map((n) => <li key={n.path}><Link to={n.path} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-panel-2"><n.icon size={14} aria-hidden />⭐ {tr(n.label, prefs.language)}</Link></li>)}</ul>;
}

function Notifications() {
  const q = useQuery({ queryKey: ['notifications', 'widget'], queryFn: () => api<Page<{ id: string; title: string; body: string | null; createdAt: string; type: string }>>('/notifications', { query: { filter: 'unread', pageSize: 6 } }), refetchInterval: 5_000 });
  return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5 text-sm">{q.data?.items.map((n) => <li key={n.id}><p className="font-medium">🔔 {n.title}</p><p className="text-xs text-muted">{fmt(n.createdAt)}</p></li>)}</ul></Q>;
}

interface TicketRow { id: string; number: string; name: string; creatorName: string; createdAt: string; status: { name: string; emoji?: string | null } | null; priority: { name: string } | null }
function Tickets({ query }: { query: Record<string, string | number> }) {
  const q = useQuery({ queryKey: ['w-tickets', query], queryFn: () => api<Page<TicketRow>>('/support-tickets', { query: { pageSize: 6, ...query } }), refetchInterval: 5_000 });
  return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5 text-sm">{q.data?.items.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><Link to={`/support-tickets/${t.id}`} className="min-w-0 truncate hover:underline">🎫 {t.number} · {t.name}</Link><span className="shrink-0 text-xs text-muted">{t.status?.name ?? ''}</span></li>)}</ul></Q>;
}

function Activity() {
  const q = useQuery({ queryKey: ['team-activity'], queryFn: () => api<{ at: string; name: string; kind: string; detail?: string }[]>('/team/activity', { query: { limit: 10 } }), refetchInterval: 5_000 });
  const K: Record<string, string> = { joined: '➕ neu im Team', left: '➖ nicht mehr im Team', roles: '🛡️ Rollen geändert', name: '✏️ Name geändert', avatar: '🖼️ Avatar geändert', status: '🔄 Status' };
  return <Q q={q} empty={!q.data?.length}><ul className="space-y-1 text-sm">{q.data?.map((a, i) => <li key={i}><span className="font-medium">{a.name}</span> <span className="text-muted">{K[a.kind] ?? a.kind}{a.detail ? ` (${a.detail})` : ''} · {fmt(a.at)}</span></li>)}</ul></Q>;
}

function Grouped({ by }: { by: 'office' | 'rank' }) {
  const q = useRoster();
  const groups = new Map<string, number>();
  for (const m of q.data?.members ?? []) { const k = m[by] ?? '—'; groups.set(k, (groups.get(k) ?? 0) + 1); }
  return <Q q={q} empty={!groups.size}><ul className="space-y-1 text-sm">{[...groups].sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k} className="flex justify-between"><span>{by === 'office' ? '🏢' : '🎖️'} {k}</span><span className="text-muted">{n}</span></li>)}</ul></Q>;
}

const useInc = list<Row>(['incidents', 'dash'], '/incidents', { active: true, pageSize: 8 });
const useQueue = list<Row>(['queue', 'dash'], '/incidents', { status: 'NEW', pageSize: 8 });
const useWanted = list<Row>(['wanted', 'dash'], '/wanted', { pageSize: 6 });
function Incidents() { const q = useInc(); return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5">{q.data?.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><Link to={`/incidents/${i.id}`} className="min-w-0 truncate hover:underline">{String(i.number)} · {String(i.title)}</Link><span className="flex shrink-0 gap-1"><PriorityBadge priority={String(i.priority)} /><StatusBadge status={String(i.status)} /></span></li>)}</ul></Q>; }
function Queue() { const q = useQueue(); return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5">{q.data?.items.map((i) => <li key={i.id} className="flex items-center justify-between"><span className="min-w-0 truncate">{String(i.title)}</span><PriorityBadge priority={String(i.priority)} /></li>)}</ul></Q>; }
function Units() { const q = useQuery({ queryKey: ['units', 'dash'], queryFn: () => api<Row[]>('/dispatch/units') }); return <Q q={q} empty={!q.data?.length}><ul className="space-y-1.5">{q.data?.map((u) => <li key={u.id} className="flex justify-between"><span>{String(u.callsign)}</span><StatusBadge status={String(u.status)} /></li>)}</ul></Q>; }
function Wanted() { const q = useWanted(); return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5">{q.data?.items.map((w) => <li key={w.id} className="flex justify-between gap-2"><Link to={`/wanted/${w.id}`} className="min-w-0 truncate hover:underline">{String(w.reason)}</Link><PriorityBadge priority={String(w.priority)} /></li>)}</ul></Q>; }
function Reports() { const q = useQuery({ queryKey: ['reports', 'dash'], queryFn: () => api<Page<Row>>('/reports', { query: { status: 'SUBMITTED', pageSize: 6 } }) }); return <Q q={q} empty={!q.data?.items.length}><ul className="space-y-1.5">{q.data?.items.map((r) => <li key={r.id} className="flex justify-between gap-2"><Link to={`/reports/${r.id}`} className="min-w-0 truncate hover:underline">{String(r.number)} · {String(r.title)}</Link><StatusBadge status={String(r.status)} /></li>)}</ul></Q>; }
function Applications() { const q = useQuery({ queryKey: ['applications', 'dash'], queryFn: () => api<Page<Row>>('/applications', { query: { status: 'OPEN', pageSize: 6 } }) }); return <Q q={q} empty={!q.data?.items.length}><p className="text-3xl font-semibold">{q.data?.total}</p><ul className="mt-1 space-y-1 text-sm">{q.data?.items.map((a) => <li key={a.id}><Link className="hover:underline" to={`/applications/${a.id}`}>📝 {String(a.number)} · {String(a.robloxUsername)}</Link></li>)}</ul></Q>; }

export const WIDGETS: WidgetDef[] = [
  { id: 'stats', title: '📊 Statistiken', perms: ['dashboard.view'], render: () => <Stats /> },
  { id: 'quick', title: '🔍 Schnellzugriff', perms: ['dashboard.view'], render: () => <Quick /> },
  { id: 'favorites', title: '⭐ Favoriten', perms: ['dashboard.view'], render: () => <Favorites /> },
  { id: 'notifications', title: '🔔 Benachrichtigungen', perms: ['dashboard.view'], render: () => <Notifications /> },
  { id: 'tickets', title: '🎫 Offene Tickets', perms: ['ticket.view', 'dashboard.tickets.view'], to: '/support-tickets', render: () => <Tickets query={{ kind: 'open' }} /> },
  { id: 'my-tickets', title: '🎫 Meine Tickets', perms: ['ticket.view', 'dashboard.tickets.view'], to: '/support-tickets', render: () => <Tickets query={{ kind: 'open', claimer: 'me' }} /> },
  { id: 'ticket-activity', title: '🎫 Ticket-Aktivität', perms: ['ticket.view', 'dashboard.tickets.view'], to: '/support-tickets', render: () => <Tickets query={{ kind: 'all' }} /> },
  { id: 'applications', title: '📝 Bewerbungen', perms: ['applications.view', 'dashboard.applications.view'], to: '/applications', render: () => <Applications /> },
  { id: 'teamlist', title: '👥 Teamliste', perms: ['team.view', 'dashboard.team.view'], to: '/teamlist', render: () => <TeamRoster compact limit={8} /> },
  { id: 'voice', title: '🎙️ Aktive Sprachkanäle', perms: ['team.view', 'dashboard.voice.view'], render: () => <VoiceWidget /> },
  { id: 'activity', title: '📋 Team-Aktivitäten', perms: ['team.view', 'dashboard.team.view'], render: () => <Activity /> },
  { id: 'offices', title: '🏢 Büros', perms: ['team.view', 'dashboard.offices.view'], to: '/teamlist', render: () => <Grouped by="office" /> },
  { id: 'ranks', title: '🎖️ Dienstgrade', perms: ['team.view', 'dashboard.team.view'], to: '/teamlist', render: () => <Grouped by="rank" /> },
  { id: 'radio', title: '📡 Funk-Codes', perms: ['radio.view', 'dashboard.radio.view'], to: '/radio-codes', render: () => <RadioCodeList /> },
  { id: 'teamchance', title: '📣 Team-Chance', perms: ['teamchance.view', 'dashboard.teamchance.view'], to: '/teamchance', render: () => <TeamChanceSummary /> },
  { id: 'incidents', title: '🚨 Aktive Einsätze', perms: ['incidents.view'], to: '/incidents', render: () => <Incidents /> },
  { id: 'queue', title: '📡 Leitstellen-Warteschlange', perms: ['dispatch.view'], to: '/dispatch', render: () => <Queue /> },
  { id: 'units', title: '🚓 Einheiten', perms: ['dispatch.view'], to: '/dispatch', render: () => <Units /> },
  { id: 'wanted', title: '🚩 Fahndungen', perms: ['wanted.view'], to: '/wanted', render: () => <Wanted /> },
  { id: 'reports', title: '📄 Offene Berichte', perms: ['reports.review'], to: '/reports', render: () => <Reports /> },
];

/** Startseite aus Widgets. „Dashboard bearbeiten“: hinzufügen, entfernen, verschieben (Drag & Drop), Größe, minimieren, ausblenden; mehrere Layouts. Alles automatisch gespeichert. */
export function Dashboard() {
  const { can, user } = useAuth();
  const { layouts, setLayouts, prefs, update, loading } = usePrefs();
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<number>();
  const [over, setOver] = useState<number>();
  useRealtime('incidents', ['incident.created', 'incident.status'], [['incidents', 'dash'], ['queue', 'dash']]);
  useRealtime('dispatch', ['queue.changed', 'unit.status', 'unit.assigned'], [['queue', 'dash'], ['units', 'dash'], ['incidents', 'dash']]);
  useRealtime('team', ['duty.changed'], [['duty', 'dash']]);
  const customize = can('dashboard.customize');
  const active = layouts.items.find((l) => l.id === layouts.active) ?? layouts.items[0]!;
  const allowed = (id: string) => { const d = WIDGETS.find((w) => w.id === id); return !!d && d.perms.every(can); };
  const widgets = active.widgets.filter((w) => allowed(w.widget));

  const saveLayout = (l: Layout) => setLayouts({ ...layouts, items: layouts.items.map((x) => (x.id === l.id ? l : x)) });
  const setWidgets = (fn: (ws: WidgetCfg[]) => WidgetCfg[]) => saveLayout({ ...active, widgets: fn(active.widgets) });
  const patch = (id: string, p: Partial<WidgetCfg>) => setWidgets((ws) => ws.map((w) => (w.widget === id ? { ...w, ...p } : w)));
  const moveTo = (from: number, to: number) => setWidgets((ws) => { const vis = ws.filter((w) => allowed(w.widget)); const a = vis[from], b = vis[to]; if (!a || !b) return ws; const out = ws.filter((w) => w !== a); out.splice(out.indexOf(b) + (from < to ? 1 : 0), 0, a); return out; });
  const addable = WIDGETS.filter((w) => w.perms.every(can) && !active.widgets.some((x) => x.widget === w.id));

  const newLayout = () => { const id = `l${Date.now().toString(36)}`; setLayouts({ active: id, items: [...layouts.items, { id, name: `Layout ${layouts.items.length + 1}`, widgets: [{ widget: 'stats', size: 'XL' as const, minimized: false, hidden: false }] }].slice(0, 10) }); };
  const removeLayout = () => { if (layouts.items.length < 2) return; const items = layouts.items.filter((l) => l.id !== active.id); setLayouts({ active: items[0]!.id, items }); };

  return (
    <>
      <PageHeader title={`Willkommen, ${user?.displayName}`} subtitle={edit ? 'Bearbeiten: Widgets ziehen, Größe ändern, minimieren, ausblenden – wird automatisch gespeichert.' : undefined}
        actions={<div className="flex flex-wrap items-center gap-2">
          {layouts.items.length > 1 || edit ? <Select aria-label="Layout" className="w-auto py-1.5 text-sm" value={active.id} onChange={(e) => setLayouts({ ...layouts, active: e.target.value })}>{layouts.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select> : null}
          {customize && (edit ? <>
            <Button variant="secondary" onClick={() => void flush()}><Save size={14} />💾 Änderungen speichern</Button>
            <Button onClick={() => { void flush(); setEdit(false); }}>Fertig</Button>
          </> : <Button variant="secondary" onClick={() => setEdit(true)}>Dashboard bearbeiten</Button>)}
        </div>} />
      {edit && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-primary/50 p-3">
          <label className="text-xs text-muted">Layout-Name<Input className="mt-1 w-48 py-1 text-sm" value={active.name} maxLength={40} onChange={(e) => e.target.value.trim() && saveLayout({ ...active, name: e.target.value })} /></label>
          <Button size="sm" variant="secondary" onClick={newLayout} disabled={layouts.items.length >= 10}><Plus size={12} />Neues Layout</Button>
          <Button size="sm" variant="ghost" onClick={removeLayout} disabled={layouts.items.length < 2}><Trash2 size={12} />Layout löschen</Button>
          <Button size="sm" variant="ghost" onClick={() => setLayouts(null)}><RotateCcw size={12} />Auf Standard zurücksetzen</Button>
          <span className="mx-2 h-6 w-px bg-line" aria-hidden />
          <Select aria-label="Widget hinzufügen" className="w-auto py-1 text-sm" value="" onChange={(e) => e.target.value && setWidgets((ws) => [...ws, { widget: e.target.value, size: 'M', minimized: false, hidden: false }])}>
            <option value="">+ Widget hinzufügen…</option>{addable.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </Select>
          <details className="text-sm"><summary className="cursor-pointer text-xs text-muted">Schnellzugriff wählen</summary>
            <div className="mt-1 flex flex-wrap gap-2">{QUICK_ACTIONS.filter((a) => a.perms.every(can)).map((a) => <label key={a.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={prefs.quickActions.includes(a.id)} onChange={(e) => update({ quickActions: e.target.checked ? [...prefs.quickActions, a.id] : prefs.quickActions.filter((x) => x !== a.id) })} />{a.label}</label>)}</div>
          </details>
        </div>
      )}
      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div> : !widgets.length ? <EmptyState text="Keine Widgets in diesem Layout." hint={customize ? '„Dashboard bearbeiten“ → Widget hinzufügen.' : undefined} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {widgets.map((w, i) => {
            const def = WIDGETS.find((d) => d.id === w.widget)!;
            if (w.hidden && !edit) return null;
            return (
              <div key={w.widget} className={`${SPAN[w.size]} ${w.hidden ? 'opacity-50' : ''} ${over === i && drag !== undefined && drag !== i ? 'widget-drop rounded-lg' : ''}`}
                draggable={edit} onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDrag(undefined); setOver(undefined); }}
                onDragOver={(e) => { if (edit && drag !== undefined) { e.preventDefault(); setOver(i); } }} onDrop={(e) => { e.preventDefault(); if (drag !== undefined && drag !== i) moveTo(drag, i); setDrag(undefined); setOver(undefined); }}>
                <Card title={<span className="flex items-center gap-1.5">{edit && <GripVertical size={14} className="cursor-grab text-muted" aria-hidden />}{def.title}</span>}
                  actions={<span className="flex items-center gap-0.5">
                    {!edit && def.to && !w.minimized && <Link to={def.to} className="mr-1 text-xs text-primary hover:underline">Alle</Link>}
                    {edit && <>
                      <Select aria-label={`Größe ${def.title}`} className="w-auto py-0.5 text-xs" value={w.size} onChange={(e) => patch(w.widget, { size: e.target.value as WidgetSize })}>{SIZES.map((s) => <option key={s} value={s}>{{ S: 'Klein', M: 'Mittel', L: 'Groß', XL: 'Ganze Breite' }[s]}</option>)}</Select>
                      <Button size="sm" variant="ghost" aria-label="Kleiner" onClick={() => patch(w.widget, { size: SIZES[Math.max(0, SIZES.indexOf(w.size) - 1)]! })}><Minimize2 size={12} /></Button>
                      <Button size="sm" variant="ghost" aria-label="Größer" onClick={() => patch(w.widget, { size: SIZES[Math.min(3, SIZES.indexOf(w.size) + 1)]! })}><Maximize2 size={12} /></Button>
                      <Button size="sm" variant="ghost" aria-label={w.hidden ? 'Einblenden' : 'Ausblenden'} onClick={() => patch(w.widget, { hidden: !w.hidden })}>{w.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</Button>
                      <Button size="sm" variant="ghost" aria-label="Entfernen" onClick={() => setWidgets((ws) => ws.filter((x) => x.widget !== w.widget))}><X size={12} /></Button>
                    </>}
                    {customize && <Button size="sm" variant="ghost" aria-label={w.minimized ? 'Aufklappen' : 'Minimieren'} onClick={() => patch(w.widget, { minimized: !w.minimized })}>{w.minimized ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</Button>}
                  </span>}>
                  {w.minimized ? <p className="text-xs text-muted">Minimiert</p> : def.render()}
                </Card>
              </div>
            );
          })}
        </div>
      )}
      {!edit && layouts === DEFAULT_LAYOUTS && customize && <p className="mt-4 text-xs text-muted">Tipp: Mit „Dashboard bearbeiten“ stellst du dir deine Startseite selbst zusammen – nur für dich.</p>}
    </>
  );
}
