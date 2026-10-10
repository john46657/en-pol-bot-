import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { RotateCcw } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { backgroundIsLight, DEFAULT_PREFS, GRADIENTS, usePrefs, type Preferences } from '../lib/prefs';
import { NAV, navFor, tr, visible } from '../nav';
import { QUICK_ACTIONS } from './Dashboard';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';
import { TwoFactorCard } from '../components/TwoFactorCard';

const ACCENT_PRESETS = ['#5865F2', '#7289DA', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];
/** Benachrichtigungsarten, die man für sich ausblenden kann. */
const NOTIFICATION_TYPES: [string, string][] = [
  ['APPLICATION', '🔔 Neue Bewerbung'], ['TICKET_CLAIMED', '🎫 Ticket übernommen'], ['TEAM_CHANGE', '👥 Teamänderung'], ['MESSAGE', '📢 Neue Nachricht (Ankündigung)'],
  ['SYSTEM', '⚠️ Systemhinweis'], ['TEAMCHANCE', '📣 Team-Chance geöffnet'],
  ['QUALIFICATION', '🏅 Qualifikationen'], ['TICKET_ISSUED', '🧾 Strafzettel'], ['PERSONNEL', '🪪 Dienstgrad / Personal'],
  ['INCIDENT_ASSIGNMENT', '🚨 Einsatz zugewiesen'], ['REPORT_REVIEW', '📄 Bericht zur Prüfung'], ['COMPLAINT_ASSIGNMENT', '⚖️ Beschwerde zugewiesen'],
  ['ACADEMY_ASSIGNMENT', '🎓 Akademie'], ['SEK', '🎯 SEK'], ['RADIO', '📡 Funk'], ['WORKFLOW', '⚙️ Workflows'],
];
const TIMEZONES = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="grid items-center gap-1 py-2 sm:grid-cols-[220px_1fr]"><div><p className="text-sm font-medium">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div><div className="flex flex-wrap items-center gap-2">{children}</div></div>
);
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap rounded-md border border-line">{options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`px-3 py-1.5 text-sm ${value === v ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg'}`}>{l}</button>)}</div>;
}
const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;

/** Eigener Anzeigename (Teamliste, Dienst-Übersicht, Einsätze …). */
function NameCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState<string>();
  const value = name ?? user?.displayName ?? '';
  const save = useMutation({
    mutationFn: () => api('/me/name', { method: 'PUT', body: { displayName: value.trim() } }),
    onSuccess: () => { setName(undefined); void qc.invalidateQueries({ queryKey: ['me'] }); void qc.invalidateQueries(); },
  });
  const changed = !!value.trim() && value.trim() !== user?.displayName;
  return (
    <Card title="👤 Name">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (changed) save.mutate(); }}>
        <label className="grid min-w-60 flex-1 gap-1 text-sm">Anzeigename<Input aria-label="Anzeigename" maxLength={64} value={value} onChange={(e) => setName(e.target.value)} /></label>
        <Button type="submit" disabled={!changed || save.isPending}>Speichern</Button>
      </form>
      <p className="mt-2 text-xs text-muted">So stehst du in der Teamliste, der Dienst-Übersicht, bei Einsätzen und Berichten. Anmeldename bleibt @{user?.username}.</p>
      {save.error && <p role="alert" className="mt-1 text-sm text-danger">{errText(save.error)}</p>}
      {save.isSuccess && <p role="status" className="mt-1 text-sm text-success">Gespeichert.</p>}
    </Card>
  );
}

/** Persönliche Einstellungen – wirken nur für einen selbst und werden automatisch gespeichert (auf jedem Gerät gleich). */
export function PersonalSettings() {
  const { can } = useAuth();
  const { prefs: p, update } = usePrefs();
  const set = <K extends keyof Preferences>(k: K) => (v: Preferences[K]) => update({ [k]: v } as Partial<Preferences>);
  const navItems = NAV.filter((n) => visible(n, can));
  const bgLight = backgroundIsLight(p.background);
  return (
    <>
      <PageHeader title="Persönliche Einstellungen" subtitle="Nur für dich – andere Benutzer sehen davon nichts. Alles wird automatisch gespeichert und auf allen Geräten geladen."
        actions={<Button variant="ghost" onClick={() => update({ ...DEFAULT_PREFS, favorites: p.favorites, quickActions: p.quickActions, notifications: p.notifications })}><RotateCcw size={14} />Design zurücksetzen</Button>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <NameCard />
        <Card title="🎨 Design">
          <Row label="Modus" hint={bgLight !== null ? `Folgt gerade dem ${bgLight ? 'hellen' : 'dunklen'} Hintergrund` : undefined}><Seg label="Modus" value={p.theme} onChange={set('theme')} options={[['dark', '🌙 Dunkel'], ['light', '☀️ Hell'], ['system', '🖥️ System']]} /></Row>
          <Row label="Akzentfarbe" hint="Leer = Farbe des Servers">
            {ACCENT_PRESETS.map((c) => <button key={c} type="button" aria-label={`Akzentfarbe ${c}`} aria-pressed={p.accent?.toLowerCase() === c.toLowerCase()} onClick={() => update({ accent: c })} className={`h-7 w-7 rounded-full border-2 ${p.accent?.toLowerCase() === c.toLowerCase() ? 'border-fg' : 'border-transparent'}`} style={{ background: c }} />)}
            <input type="color" aria-label="Eigene Akzentfarbe" value={p.accent ?? '#3b82f6'} onChange={(e) => update({ accent: e.target.value })} className="h-8 w-10 rounded border border-line bg-bg" />
            {p.accent && <Button size="sm" variant="ghost" onClick={() => update({ accent: undefined })}>Server-Farbe</Button>}
          </Row>
          <Row label="Hintergrund" hint="Farbe/Verlauf bestimmt hell oder dunkel – damit die Schrift lesbar bleibt">
            <Select aria-label="Hintergrund-Art" className="w-auto" value={p.background.type} onChange={(e) => update({ background: { type: e.target.value as Preferences['background']['type'], value: e.target.value === 'gradient' ? 'nacht' : e.target.value === 'color' ? '#0b0e14' : '' } })}>
              <option value="none">Standard</option><option value="color">Farbe</option><option value="gradient">Verlauf</option><option value="image">Bild (https-Link)</option>
            </Select>
            {p.background.type === 'color' && <input type="color" aria-label="Hintergrundfarbe" value={p.background.value || '#0b0e14'} onChange={(e) => update({ background: { type: 'color', value: e.target.value } })} className="h-8 w-10 rounded border border-line bg-bg" />}
            {p.background.type === 'gradient' && <Select aria-label="Verlauf" className="w-auto" value={p.background.value} onChange={(e) => update({ background: { type: 'gradient', value: e.target.value } })}>{Object.keys(GRADIENTS).map((g) => <option key={g} value={g}>{g}</option>)}</Select>}
            {p.background.type === 'image' && <Input aria-label="Bild-Link" className="min-w-60 flex-1" placeholder="https://…/bild.jpg" defaultValue={p.background.value} onChange={(e) => /^https:\/\/\S+$/.test(e.target.value) && update({ background: { type: 'image', value: e.target.value } })} />}
          </Row>
          <Row label="Kartenstil"><Seg label="Kartenstil" value={p.cardStyle} onChange={set('cardStyle')} options={[['solid', 'Voll'], ['glass', 'Glas'], ['outline', 'Rahmen']]} /></Row>
          <Row label={`Transparenz (${p.transparency} %)`}><input type="range" aria-label="Transparenz" min={0} max={90} step={5} value={p.transparency} onChange={(e) => update({ transparency: Number(e.target.value) })} className="w-56" /></Row>
          <Row label={`Eckenradius (${p.radius} px)`}><input type="range" aria-label="Eckenradius" min={0} max={24} value={p.radius} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-56" /></Row>
          <Row label="Schatten"><Seg label="Schatten" value={p.shadow} onChange={set('shadow')} options={[['none', 'Kein'], ['soft', 'Weich'], ['strong', 'Stark']]} /></Row>
          <Row label="Effekte"><Toggle label="Leuchteffekt" checked={p.glow} onChange={set('glow')} /><Toggle label="Animationen" checked={p.animations} onChange={set('animations')} /></Row>
        </Card>
        <Card title="🧭 Darstellung & Navigation">
          <Row label="Sidebar-Größe"><Seg label="Sidebar-Größe" value={p.sidebarWidth} onChange={set('sidebarWidth')} options={[['narrow', 'Schmal'], ['normal', 'Normal'], ['wide', 'Breit']]} /></Row>
          <Row label="Sidebar"><Toggle label="Eingeklappt (nur Symbole)" checked={p.sidebarCollapsed} onChange={set('sidebarCollapsed')} /></Row>
          <Row label={`Schriftgröße (${p.fontSize} px)`}><input type="range" aria-label="Schriftgröße" min={12} max={18} value={p.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-56" /></Row>
          <Row label="Darstellung"><Seg label="Darstellung" value={p.density} onChange={set('density')} options={[['comfortable', 'Komfortabel'], ['compact', 'Kompakt']]} /></Row>
          <Row label="Teamliste"><Seg label="Teamlisten-Ansicht" value={p.teamList.view} onChange={(v) => update({ teamList: { ...p.teamList, view: v } })} options={[['cards', 'Karten'], ['table', 'Tabelle']]} /></Row>
          <Row label="Zeitzone"><Select aria-label="Zeitzone" className="w-auto" value={p.timezone ?? ''} onChange={(e) => update({ timezone: e.target.value || undefined })}><option value="">Wie dieses Gerät</option>{TIMEZONES.map((z) => <option key={z}>{z}</option>)}</Select></Row>
          <Row label="Datumsformat"><Select aria-label="Datumsformat" className="w-auto" value={p.dateFormat} onChange={(e) => update({ dateFormat: e.target.value as Preferences['dateFormat'] })}><option>DD.MM.YYYY</option><option>YYYY-MM-DD</option><option>MM/DD/YYYY</option></Select></Row>
        </Card>
        <Card title="🔔 Benachrichtigungen">
          <p className="mb-2 text-xs text-muted">Ausgeschaltete Arten erscheinen nicht im Benachrichtigungs-Center, nicht im Zähler und nicht als Popup.</p>
          <div className="mb-2"><Toggle label="Neue Benachrichtigungen als Popup zeigen" checked={p.notifications.toasts !== false} onChange={(v) => update({ notifications: { ...p.notifications, toasts: v } })} /></div>
          <div className="grid gap-1.5 sm:grid-cols-2">{NOTIFICATION_TYPES.map(([t, l]) => <Toggle key={t} label={l} checked={!p.notifications.muted.includes(t)} onChange={(on) => update({ notifications: { ...p.notifications, muted: on ? p.notifications.muted.filter((x) => x !== t) : [...p.notifications.muted, t] } })} />)}</div>
        </Card>
        <Card title="⭐ Favoriten & Schnellzugriff">
          <p className="mb-2 text-xs text-muted">Favoriten erscheinen oben im Menü und im Favoriten-Widget (auch über ☆ im Menü).</p>
          <div className="grid gap-1.5 sm:grid-cols-2">{navItems.map((n) => <Toggle key={n.path} label={tr(n.label, p.language)} checked={p.favorites.some((x) => navFor([n], x))} onChange={(on) => update({ favorites: on ? [...p.favorites, n.path] : p.favorites.filter((x) => !navFor([n], x)) })} />)}</div>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Schnellaktionen</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">{QUICK_ACTIONS.filter((a) => a.perms.every(can)).map((a) => <Toggle key={a.id} label={a.label} checked={p.quickActions.includes(a.id)} onChange={(on) => update({ quickActions: on ? [...p.quickActions, a.id] : p.quickActions.filter((x) => x !== a.id) })} />)}</div>
        </Card>
        <TwoFactorCard />
      </div>
    </>
  );
}
