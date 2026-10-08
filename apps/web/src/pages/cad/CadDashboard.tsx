import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { CAD_WIDGET_LABELS, CAD_WIDGETS } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, ERLC_STATUS_TONE, optLabel, useCadPrefs, type CadMapData, type CadOverview } from '../../lib/cad';
import { Badge, Button, Card, ErrorState, Modal, PageHeader, SkeletonRows } from '../../components/ui';
import { MapView } from './MapView';
import { DutyActivity } from '../../components/DutyActivity';

const STATUS_DE: Record<string, string> = { CONNECTED: '🟢 Verbunden', LIMITED: '🟡 Eingeschränkt', OFFLINE: '🔴 Offline', ERROR: '⚠️ Fehler', UNKNOWN: '⚪ Unbekannt', DISABLED: '⏸️ Deaktiviert' };

/** Leitstellen-Startseite. Welche Widgets in welcher Reihenfolge erscheinen, legt jeder Benutzer für sich fest. */
export function CadDashboard() {
  const { can } = useAuth();
  const { cad, set } = useCadPrefs();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 5_000 });
  const map = useQuery({ queryKey: ['cad-map'], queryFn: () => api<CadMapData>('/cad/map'), refetchInterval: 5_000 });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data, cfg = d.config;
  // „Aktivität im Dienst“ ist neu: ohne eigene Ansicht auch bei älteren Leitstellen-Einstellungen anzeigen
  const widgets = (cad.widgets ?? (cfg.widgets.includes('dutyActivity') ? cfg.widgets : [...cfg.widgets.slice(0, 3), 'dutyActivity', ...cfg.widgets.slice(3)])).filter((w) => (CAD_WIDGETS as readonly string[]).includes(w) && (w !== 'dutyActivity' || can('team.view')));
  const available = d.units.filter((u) => u.status === cfg.unitStatuses[0]?.key && u.operational);
  const erlcLive = d.erlc.some((s) => s.status === 'CONNECTED' || s.status === 'LIMITED');
  const wide = new Set(['map', 'activeIncidents', 'units']);
  /** Kennzahl als kompakte Kachel (oben in einer Reihe statt einer großen Karte je Zahl). */
  const STATS: Record<string, () => { value: string | number; hint?: string; to?: string; tone?: 'danger' | 'success' | 'muted' }> = {
    availableUnits: () => ({ value: available.length, hint: `von ${d.units.length} Einheiten`, to: '/cad/units', tone: !d.units.length ? 'muted' : !available.length ? 'danger' : 'success' }),
    persons: () => ({ value: d.counts.persons ?? '–', hint: 'in den Akten', to: d.counts.persons !== null ? '/persons' : undefined }),
    vehicles: () => ({ value: d.counts.vehicles ?? '–', hint: 'im Register', to: d.counts.vehicles !== null ? '/vehicles' : undefined }),
  };
  const Small = ({ text, hint }: { text: string; hint?: string }) => <p className="py-3 text-center text-sm text-muted">{text}{hint && <span className="mt-0.5 block text-xs">{hint}</span>}</p>;
  const W: Record<string, () => React.ReactNode> = {
    activeIncidents: () => d.incidents.length ? <ul className="divide-y divide-line">{d.incidents.slice(0, 8).map((i) => (
      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"><Link to={`/cad/incidents?id=${i.id}`} className="hover:underline"><b>{i.number}</b> · {i.title}</Link><span className="flex gap-1 text-xs"><span>{optLabel(cfg.priorities, i.priority)}</span><span className="text-muted">{optLabel(cfg.incidentStatuses, i.status)}</span></span></li>))}</ul>
      : <Small text="Keine aktiven Einsätze." hint={can('cad.create_incident') ? 'Neuer Einsatz über „Einsätze“ oder per Klick auf die Karte.' : undefined} />,
    activeCalls: () => d.calls.length ? <ul className="space-y-1 text-sm">{d.calls.slice(0, 6).map((c) => <li key={c.id} className="rounded border-l-2 border-danger pl-2"><Link to={`/cad/calls?id=${c.id}`} className="hover:underline">🚨 #{c.callNumber} · {c.description ?? 'ohne Beschreibung'}</Link><span className="block text-xs text-muted">{c.positionDescriptor ?? '—'} · {ago(c.startedAt)}</span></li>)}</ul> : <Small text="Keine offenen Notrufe." hint={erlcLive ? undefined : 'Notrufe kommen automatisch aus ER:LC, sobald der Server verbunden ist.'} />,
    erlcStatus: () => d.erlc.length ? <ul className="space-y-1.5 text-sm">{d.erlc.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2"><span>{s.name}</span><Badge tone={ERLC_STATUS_TONE[s.status] ?? 'neutral'}>{STATUS_DE[s.status] ?? s.status}</Badge><span className="w-full text-xs text-muted">Abgleich {ago(s.lastSyncAt)}{s.latencyMs ? ` · ${s.latencyMs} ms` : ''}{s.lastError && s.status !== 'CONNECTED' ? ` · ${s.lastError}` : ''}</span></li>)}</ul> : <Small text="Kein ER:LC-Server verbunden." hint={can('cad.manage_erlc') ? 'CAD → Einstellungen → ER:LC Integration' : undefined} />,
    map: () => <MapView cfg={cfg} data={map.data} height="420px" compact />,
    units: () => d.units.length ? <ul className="grid gap-1 text-sm sm:grid-cols-2">{d.units.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1"><span className="font-medium">{u.icon ?? cfg.unitTypes.find((t) => t.key === u.type)?.emoji ?? '🚔'} {u.callsign}</span><span className="text-xs">{optLabel(cfg.unitStatuses, u.status)}{u.current ? ` · ${u.current.number}` : ''}</span></li>)}</ul> : <Small text="Keine Einheiten angelegt." hint={can('cad.manage_units') ? 'Einheiten → Neue Einheit' : undefined} />,
    radio: () => d.radio.length ? <ul className="space-y-1 text-sm">{d.radio.slice(0, 8).map((r) => <li key={r.id}><b>{r.callsign ?? r.authorName ?? 'Funk'}:</b> „{r.text}“<span className="block text-xs text-muted">{ago(r.createdAt)}{r.incidentNumber ? ` · ${r.incidentNumber}` : ''}</span></li>)}</ul> : <Small text="Noch keine Funkmeldungen." />,
    dutyActivity: () => <DutyActivity />,
  };
  const stats = widgets.filter((w) => STATS[w]);
  const panels = widgets.filter((w) => W[w]);
  const move = (i: number, dir: -1 | 1) => { const next = [...widgets]; const [x] = next.splice(i, 1); next.splice(i + dir, 0, x!); set({ widgets: next }); };
  return (
    <>
      <PageHeader title="Leitstelle" subtitle="CAD-Übersicht – aktualisiert sich live"
        actions={<span className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-success" />Stand {new Date(q.dataUpdatedAt).toLocaleTimeString('de-DE')}</span><Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Settings2 size={14} /> Ansicht anpassen</Button></span>} />
      <SetupChecklist d={d} />
      {/* Lage auf einen Blick: Einsätze, Notrufe und die gewählten Kennzahlen */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Aktive Einsätze" value={d.incidents.length} hint={d.incidents.length ? `${d.incidents.filter((i) => i.priority === cfg.priorities[0]?.key).length} mit höchster Priorität` : 'alles ruhig'} to="/cad/incidents" tone={d.incidents.length ? 'warning' : 'success'} />
        <Tile label="Offene Notrufe" value={d.calls.length} hint={d.calls.length ? `ältester ${ago(d.calls[d.calls.length - 1]!.startedAt)}` : 'keine'} to="/cad/calls" tone={d.calls.length ? 'danger' : 'success'} />
        {stats.map((w) => { const x = STATS[w]!(); return <Tile key={w} label={CAD_WIDGET_LABELS[w] ?? w} value={x.value} hint={x.hint} to={x.to} tone={x.tone} />; })}
      </div>
      <div className={`grid gap-3 ${cad.compact ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {panels.map((w) => (
          <Card key={w} title={<span className="flex items-center gap-2">{CAD_WIDGET_LABELS[w]}{w === 'activeIncidents' && d.incidents.length > 0 && <Badge tone="warning">{d.incidents.length}</Badge>}{w === 'activeCalls' && d.calls.length > 0 && <Badge tone="danger">{d.calls.length}</Badge>}</span>}
            className={wide.has(w) ? 'md:col-span-2 xl:col-span-2' : undefined}>{W[w]!()}</Card>
        ))}
      </div>
      <Modal open={editing} title="Meine CAD-Ansicht" onClose={() => setEditing(false)}>
        <p className="mb-2 text-xs text-muted">Gilt nur für dich. Reihenfolge mit den Pfeilen, Kacheln an-/abwählen.</p>
        <ul className="space-y-1">{widgets.map((w, i) => (
          <li key={w} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked onChange={() => set({ widgets: widgets.filter((x) => x !== w) })} />{CAD_WIDGET_LABELS[w]}</label>
            <span className="flex gap-1"><Button size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></Button><Button size="sm" variant="ghost" aria-label="nach unten" disabled={i === widgets.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></Button></span></li>))}</ul>
        <ul className="mt-2 space-y-1">{CAD_WIDGETS.filter((w) => !widgets.includes(w)).map((w) => <li key={w}><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={false} onChange={() => set({ widgets: [...widgets, w] })} />{CAD_WIDGET_LABELS[w]}</label></li>)}</ul>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cad.compact} onChange={(e) => set({ compact: e.target.checked })} />Kompakte Ansicht</label>
        <div className="mt-3 flex justify-between"><Button variant="ghost" size="sm" onClick={() => set({ widgets: undefined, compact: false })}>Standard wiederherstellen</Button><Button onClick={() => setEditing(false)}>Fertig</Button></div>
      </Modal>
    </>
  );
}

const TILE_TONE = { success: 'border-l-success', warning: 'border-l-warning', danger: 'border-l-danger', muted: 'border-l-line' } as const;
/** Kennzahl-Kachel: große Zahl, Beschriftung, kurzer Hinweis; führt zur passenden Seite. */
function Tile({ label, value, hint, to, tone = 'success' }: { label: string; value: string | number; hint?: string; to?: string; tone?: keyof typeof TILE_TONE }) {
  const body = (
    <>
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className={`text-2xl font-bold ${tone === 'muted' ? 'text-muted' : ''}`}>{value}</p>
      {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
    </>
  );
  const cls = `card block min-w-0 border border-line border-l-4 ${TILE_TONE[tone]} px-3 py-2 text-left`;
  return to ? <Link to={to} className={`${cls} transition hover:bg-panel-2/60`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/**
 * Einrichtungs-Assistent für Administratoren: prüft die Schritte nach dem Update (Leitstellen-Server, ER:LC,
 * Einheiten, Zuordnungen, Discord-Kanäle, Server-Verbindung) und führt direkt zur passenden Einstellung.
 * Verschwindet, sobald alles erledigt ist (oder wenn man ihn ausblendet).
 */
function SetupChecklist({ d }: { d: CadOverview }) {
  const { can } = useAuth();
  const { cad, set } = useCadPrefs();
  const admin = can('cad.manage_settings') || can('cad.manage_erlc') || can('cad.manage_map');
  const links = useQuery({ queryKey: ['cad-links'], queryFn: () => api<{ id: string; active: boolean }[]>('/cad/links'), enabled: admin });
  const members = useQuery({ queryKey: ['cad-members'], queryFn: () => api<{ id: string; erlcName: string | null }[]>('/cad/members'), enabled: admin });
  if (!admin || cad.setupHidden) return null;
  const cfg = d.config;
  const steps = [
    { done: !!cfg.homeGuildId, text: 'Discord-Server der Leitstelle auswählen', to: '/cad/settings?tab=Allgemein', hint: 'Einstellungen → Allgemein', perm: 'cad.manage_settings' },
    { done: d.erlc.length > 0, text: 'ER:LC-Server mit Server-Key verbinden', to: '/cad/settings?tab=ER%3ALC+Integration', hint: 'Einstellungen → ER:LC Integration', perm: 'cad.manage_erlc' },
    { done: d.erlc.some((s) => s.status === 'CONNECTED'), text: 'ER:LC-Verbindung erfolgreich getestet', to: '/cad/settings?tab=ER%3ALC+Integration', hint: '„Verbindung testen“ – Status 🟢 Verbunden', perm: 'cad.manage_erlc' },
    { done: d.units.length > 0, text: 'Einheiten anlegen (z. B. SEK-01, K9-01)', to: '/cad/units', hint: 'Einheiten → Neue Einheit', perm: 'cad.manage_units' },
    { done: (members.data ?? []).some((m) => m.erlcName), text: 'Mitglieder zuordnen (Discord ↔ ER:LC ↔ Einheit)', to: '/cad/team', hint: 'Teamübersicht – dann erscheinen Einheiten live auf der Karte', perm: 'cad.manage_units' },
    { done: cfg.routes.some((r) => r.enabled && r.channelIds.length), text: 'Discord-Kanäle für Meldungen festlegen', to: '/cad/settings?tab=Discord-Kan%C3%A4le', hint: 'Einstellungen → Discord-Kanäle', perm: 'cad.manage_settings' },
    { done: (links.data ?? []).some((l) => l.active), text: 'Server-Verbindung Leitstelle ↔ SEK/K9 anlegen', to: '/cad/cross-server', hint: 'Nur nötig, wenn SEK/K9 auf einem eigenen Discord-Server sind', perm: 'cad.manage_cross_server', optional: true },
  ];
  const open = steps.filter((s) => !s.done && !s.optional);
  if (!open.length) return null;
  const doneCount = steps.filter((s) => s.done).length;
  const next = open[0]!;
  return (
    <Card className="mb-3" title={`🧭 Einrichtung – ${doneCount} von ${steps.length} erledigt`} actions={<Button size="sm" variant="ghost" onClick={() => set({ setupHidden: true })}>Ausblenden</Button>}>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Fortschritt der Einrichtung">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-2">{steps.map((s, i) => {
        const go = !s.done && can(s.perm);
        const inner = (
          <>
            <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-success/20 text-success' : s === next ? 'bg-primary text-white' : 'border border-line text-muted'}`}>{s.done ? '✓' : i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className={`block font-medium ${s.done ? 'text-muted line-through' : 'text-fg'}`}>{s.text}{s.optional && <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}</span>
              {!s.done && <span className="block text-xs text-muted">{s.hint}{!can(s.perm) ? ' – dafür fehlt dir das Recht' : ''}</span>}
            </span>
            {go && <span aria-hidden className="self-center text-muted">›</span>}
          </>
        );
        return (
          <li key={s.text}>
            {go ? <Link to={s.to} className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm transition hover:bg-panel-2/60 ${s === next ? 'border-primary/60 bg-primary/5' : 'border-line'}`}>{inner}</Link>
              : <div className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm">{inner}</div>}
          </li>
        );
      })}</ol>
    </Card>
  );
}
