import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Locate, Minus, Pencil, Plus, X } from 'lucide-react';
import { ERLC_BUILTIN_MAP, gameToPixel, pixelToGame, type CadConfig } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { optLabel, useCadPrefs, type CadMapData, type CadMapObject } from '../../lib/cad';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';

/** Ein Marker auf der Karte: Spielkoordinate, Layer, Darstellung und Inhalt des Info-Fensters. */
interface Marker { id: string; layer: string; x: number; z: number; emoji: string; color: string; label: string; title: string; body: ReactNode; actions?: ReactNode; pulse?: boolean }
type Mode = { kind: 'view' } | { kind: 'poi' } | { kind: 'zone'; points: [number, number][] } | { kind: 'pick'; onPick: (x: number, z: number) => void; hint: string; tag?: string };

const MAX_ZOOM = 6;
type View = { s: number; tx: number; ty: number };

/**
 * Interaktive CAD-Karte: Kartenbild aus den Einstellungen (hochgeladene ER:LC-Map), darüber Layer mit Markern,
 * POIs und Zonen. Zoom mit Mausrad/Buttons, Verschieben per Ziehen (auch Touch). Positionen in Spielkoordinaten.
 */
export function MapView({ cfg, data, height = '70vh', focus, onCreateIncidentAt, actionsFor, compact, placeUnit }: {
  cfg: CadConfig; data: CadMapData | undefined; height?: string; focus?: { x: number; z: number; id?: string } | null;
  onCreateIncidentAt?: (x: number, z: number) => void; actionsFor?: (m: { kind: string; id: string }) => ReactNode; compact?: boolean;
  /** Einheit ohne Position direkt platzieren (Einheiten → „Auf Karte platzieren“). */
  placeUnit?: { id: string; callsign: string; done: () => void } | null;
}) {
  const { can } = useAuth();
  const qcMap = useQueryClient();
  const { cad, set } = useCadPrefs();
  /** Manuelle Position einer Einheit (gilt, solange kein zugeordneter Spieler in ER:LC ist). */
  const setUnitPos = async (id: string, x: number, z: number) => { await api(`/cad/units/${id}`, { method: 'PATCH', body: { mapX: x, mapZ: z } }); void qcMap.invalidateQueries({ queryKey: ['cad-map'] }); void qcMap.invalidateQueries({ queryKey: ['cad-units'] }); };
  const box = useRef<HTMLDivElement>(null);
  const m = cfg.map;
  // Eigenes Kartenbild; fehlt es oder lädt es nicht (z. B. Webseiten-Adresse), gilt die mitgelieferte ER:LC-Karte
  const [mapFailed, setMapFailed] = useState<string | null>(null);
  const mapSrc = m.imageUrl && mapFailed !== m.imageUrl ? m.imageUrl : ERLC_BUILTIN_MAP;
  const [view, setView] = useState<{ s: number; tx: number; ty: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(focus?.id ?? null);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [editObj, setEditObj] = useState<Partial<CadMapObject> | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const hidden = useMemo(() => new Set(cad.hiddenLayers ?? cfg.layers.filter((l) => l.enabledByDefault === false).map((l) => l.key)), [cad.hiddenLayers, cfg.layers]);

  /**
   * Die Karte füllt das Feld immer ganz aus: kleinster Zoom = Feld vollständig bedeckt, Verschieben nur bis zum Kartenrand.
   * So bleibt sie gleich groß – nur rein- und wieder rauszoomen bis zu dieser Größe.
   */
  const clamp = (v: View): View => {
    const el = box.current;
    if (!el) return v;
    const w = el.clientWidth, h = el.clientHeight;
    const minS = Math.max(w / m.width, h / m.height);
    const s = Math.min(Math.max(MAX_ZOOM, minS), Math.max(minS, v.s));
    const tx = Math.min(0, Math.max(w - m.width * s, v.tx)), ty = Math.min(0, Math.max(h - m.height * s, v.ty));
    return { s, tx, ty };
  };
  /** Ganze Karte: kleinster Zoom, mittig. */
  const whole = (): View => {
    const el = box.current!;
    const s = Math.max(el.clientWidth / m.width, el.clientHeight / m.height);
    return { s, tx: (el.clientWidth - m.width * s) / 2, ty: (el.clientHeight - m.height * s) / 2 };
  };

  // Start: gespeicherte persönliche Ansicht oder ganze Karte
  useEffect(() => {
    const el = box.current;
    if (!el || view) return;
    if (cad.zoom && cad.center && !compact) setView(clamp({ s: cad.zoom, tx: el.clientWidth / 2 - cad.center.x * cad.zoom, ty: el.clientHeight / 2 - cad.center.y * cad.zoom }));
    else setView(whole());
  }, [m.width, m.height, view, cad.zoom, cad.center, compact]);

  // Feldgröße ändert sich (Fenster, Seitenleiste): Ansicht wieder an den Rand anpassen
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setView((v) => (v ? clamp(v) : v)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [m.width, m.height]);

  // Fokus (z. B. „Auf Karte anzeigen“): dorthin springen und Info-Fenster öffnen
  useEffect(() => {
    const el = box.current;
    if (!el || !focus) return;
    const { px, py } = gameToPixel(m, focus.x, focus.z);
    const s = Math.max(view?.s ?? 0.3, 0.6);
    setView(clamp({ s, tx: el.clientWidth / 2 - px * s, ty: el.clientHeight / 2 - py * s }));
    if (focus.id) setSelected(focus.id);
  }, [focus?.x, focus?.z, focus?.id]);

  useEffect(() => {
    if (placeUnit) setMode({ kind: 'pick', hint: `Position für ${placeUnit.callsign} anklicken.`, onPick: (x, z) => void setUnitPos(placeUnit.id, x, z).then(placeUnit.done) });
  }, [placeUnit?.id]);

  // Persönlichen Ausschnitt merken (gesammelt gespeichert)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const remember = (v: View) => {
    if (compact || !box.current) return;
    const el = box.current;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => set({ zoom: Number(v.s.toFixed(4)), center: { x: Math.round((el.clientWidth / 2 - v.tx) / v.s), y: Math.round((el.clientHeight / 2 - v.ty) / v.s) } }), 1500);
  };
  const apply = (v: View) => { const c = clamp(v); setView(c); remember(c); };
  const zoomAt = (factor: number, cx: number, cy: number) => {
    if (!view) return;
    const s = clamp({ ...view, s: view.s * factor }).s;
    apply({ s, tx: cx - ((cx - view.tx) * s) / view.s, ty: cy - ((cy - view.ty) * s) / view.s });
  };
  const center = () => { const el = box.current!; return [el.clientWidth / 2, el.clientHeight / 2] as const; };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const toGame = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    const px = (clientX - r.left - view!.tx) / view!.s, py = (clientY - r.top - view!.ty) / view!.s;
    const g = pixelToGame(m, px, py);
    return { x: Math.round(g.x * 10) / 10, z: Math.round(g.z * 10) / 10 };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-marker],[data-ui]')) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: view!.tx, ty: view!.ty, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !view) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    if (d.moved) setView(clamp({ ...view, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !view) return;
    if (d.moved) { remember(view); return; }
    // Klick auf die Karte
    const g = toGame(e.clientX, e.clientY);
    if (mode.kind === 'poi') { setEditObj({ kind: 'POI', x: g.x, z: g.z, layer: 'pois', name: '' }); setMode({ kind: 'view' }); }
    else if (mode.kind === 'zone') setMode({ kind: 'zone', points: [...mode.points, [g.x, g.z]] });
    else if (mode.kind === 'pick') { mode.onPick(g.x, g.z); setMode({ kind: 'view' }); }
    else setSelected(null);
  };

  // ---- Marker aus allen Layern ----
  const style = (key: string) => cfg.markers.find((x) => x.key === key) ?? { emoji: '•', color: '#94a3b8', label: key, key };
  const markers: Marker[] = useMemo(() => {
    if (!data) return [];
    const out: Marker[] = [];
    const is = (s: CadMapData['units'][number]) => cfg.unitTypes.find((t) => t.key === s.type);
    for (const i of data.incidents) out.push({ id: `incident:${i.id}`, layer: 'incidents', x: i.mapX!, z: i.mapZ!, emoji: style('incident').emoji, color: cfg.priorities.find((p) => p.key === i.priority)?.color ?? style('incident').color,
      label: i.number, title: `${i.number} · ${i.title}`, pulse: i.status === 'CRITICAL',
      body: <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"><dt className="text-muted">Priorität</dt><dd>{optLabel(cfg.priorities, i.priority)}</dd><dt className="text-muted">Status</dt><dd>{optLabel(cfg.incidentStatuses, i.status)}</dd>{i.keyword && <><dt className="text-muted">Stichwort</dt><dd>{i.keyword}</dd></>}<dt className="text-muted">Ort</dt><dd>{i.location ?? '—'}</dd><dt className="text-muted">Einheiten</dt><dd>{i.units.filter((u) => !u.clearedAt).map((u) => u.unit.callsign).join(', ') || 'keine'}</dd></dl>,
      actions: actionsFor?.({ kind: 'incident', id: i.id }) });
    for (const c of data.calls) out.push({ id: `call:${c.id}`, layer: 'calls', x: c.mapX!, z: c.mapZ!, emoji: style('call').emoji, color: style('call').color, label: `#${c.callNumber}`, title: `🚨 NOTRUF #${c.callNumber}`, pulse: c.status === 'OPEN',
      body: <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"><dt className="text-muted">Meldung</dt><dd>{c.description ?? '—'}</dd><dt className="text-muted">Ort</dt><dd>{c.positionDescriptor ?? '—'}</dd><dt className="text-muted">Zeit</dt><dd>{new Date(c.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</dd><dt className="text-muted">Status</dt><dd>{c.status === 'OPEN' ? 'Offen' : c.status === 'CLAIMED' ? 'Übernommen' : 'Geschlossen'}</dd>{c.incident && <><dt className="text-muted">Einsatz</dt><dd>{c.incident.number}</dd></>}</dl>,
      actions: actionsFor?.({ kind: 'call', id: c.id }) });
    for (const u of data.units) {
      const t = is(u);
      out.push({ id: `unit:${u.id}`, layer: t?.layer ?? 'units', x: u.position!.x, z: u.position!.z, emoji: u.icon ?? t?.emoji ?? style('unit').emoji, color: u.color ?? t?.color ?? style('unit').color, label: u.callsign, title: u.callsign,
        body: <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"><dt className="text-muted">Status</dt><dd>{optLabel(cfg.unitStatuses, u.status)}</dd><dt className="text-muted">Team</dt><dd>{t?.label ?? u.type ?? '—'}</dd><dt className="text-muted">Discord</dt><dd>{u.crew.map((c) => c.discordName).filter(Boolean).join(', ') || u.memberNames.join(', ') || '—'}</dd><dt className="text-muted">ER:LC</dt><dd>{u.crew.map((c) => c.erlcName).filter(Boolean).join(', ') || '—'}</dd><dt className="text-muted">Aktueller Einsatz</dt><dd>{u.current ? `${u.current.number}` : 'Keiner'}</dd><dt className="text-muted">Position</dt><dd>{u.position!.source === 'erlc' ? `live${u.position!.street ? ` · ${u.position!.street}` : ''}` : 'manuell'}</dd></dl>,
        actions: <>{actionsFor?.({ kind: 'unit', id: u.id })}{can('cad.manage_units') && <Button size="sm" variant="secondary" onClick={() => setMode({ kind: 'pick', hint: `Neue Position für ${u.callsign} anklicken.`, onPick: (x, z) => void setUnitPos(u.id, x, z) })}>📍 Position setzen</Button>}</> });
    }
    const unitNames = new Set(data.units.flatMap((u) => u.crew.map((c) => c.erlcName?.toLowerCase())).filter(Boolean));
    for (const p of data.players) {
      if (!p.location) continue;
      const staff = p.staff;
      if (unitNames.has(p.name.toLowerCase())) continue; // erscheint schon als Einheit
      const st = style(staff ? 'staff' : 'player');
      out.push({ id: `player:${p.serverId}:${p.name}`, layer: staff ? 'staff' : 'players', x: p.location.x, z: p.location.z, emoji: st.emoji, color: st.color, label: p.callsign ?? p.name, title: p.name,
        body: <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"><dt className="text-muted">Team</dt><dd>{p.team ?? '—'}</dd>{p.callsign && <><dt className="text-muted">Rufname</dt><dd>{p.callsign}</dd></>}<dt className="text-muted">Rechte</dt><dd>{p.permission ?? '—'}</dd><dt className="text-muted">Ort</dt><dd>{[p.location.street, p.location.postal && `PLZ ${p.location.postal}`].filter(Boolean).join(' · ') || '—'}</dd>{p.wantedStars > 0 && <><dt className="text-muted">Gesucht</dt><dd>{'⭐'.repeat(p.wantedStars)}</dd></>}</dl> });
    }
    for (const v of data.vehicles) out.push({ id: `vehicle:${v.serverId}:${v.owner}:${v.plate}`, layer: 'vehicles', x: v.x, z: v.z, emoji: style('vehicle').emoji, color: v.colorHex ?? style('vehicle').color, label: v.plate ?? v.name, title: v.name,
      body: <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"><dt className="text-muted">Kennzeichen</dt><dd>{v.plate ?? '—'}</dd><dt className="text-muted">Fahrer/Besitzer</dt><dd>{v.owner}</dd></dl> });
    for (const o of data.objects) if (o.kind === 'POI' && o.x !== null && o.z !== null) out.push({ id: `poi:${o.id}`, layer: o.layer, x: o.x, z: o.z, emoji: o.icon ?? style('poi').emoji, color: o.color ?? style('poi').color, label: o.name, title: o.name,
      body: <div className="text-xs">{o.description ?? ''}{o.category && <p className="text-muted">Kategorie: {o.category}</p>}</div>,
      actions: can('cad.manage_map') ? <Button size="sm" variant="secondary" onClick={() => setEditObj(o)}>Bearbeiten</Button> : undefined });
    return out;
  }, [data, cfg, actionsFor, can]);

  const visible = markers.filter((mk) => !hidden.has(mk.layer));
  const zones = (data?.objects ?? []).filter((o) => o.kind === 'ZONE' && o.points && !hidden.has(o.layer));
  const sel = visible.find((mk) => mk.id === selected);
  const toggleLayer = (k: string) => { const next = new Set(hidden); if (next.has(k)) next.delete(k); else next.add(k); set({ hiddenLayers: [...next] }); };
  const counts = (k: string) => markers.filter((mk) => mk.layer === k).length + (data?.objects ?? []).filter((o) => o.kind === 'ZONE' && o.layer === k).length;

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-[#0b0e14] select-none" style={{ height }} ref={box}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="application" aria-label="Einsatzkarte">
      {view && (
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: m.width, height: m.height, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, cursor: mode.kind === 'view' ? 'grab' : 'crosshair' }}>
          <img src={mapSrc} alt="ER:LC-Karte" draggable={false} onError={() => m.imageUrl && setMapFailed(m.imageUrl)} className="pointer-events-none absolute inset-0 h-full w-full" />
          <svg className="pointer-events-none absolute inset-0" width={m.width} height={m.height}>
            {zones.map((z) => <polygon key={z.id} points={z.points!.map(([x, zz]) => { const p = gameToPixel(m, x, zz); return `${p.px},${p.py}`; }).join(' ')} fill={`${z.color ?? (z.layer === 'restricted' ? '#ef4444' : '#3b82f6')}33`} stroke={z.color ?? (z.layer === 'restricted' ? '#ef4444' : '#3b82f6')} strokeWidth={3 / view.s} />)}
            {mode.kind === 'zone' && mode.points.length > 0 && <polyline points={mode.points.map(([x, zz]) => { const p = gameToPixel(m, x, zz); return `${p.px},${p.py}`; }).join(' ')} fill="none" stroke="#facc15" strokeWidth={3 / view.s} strokeDasharray={`${8 / view.s}`} />}
          </svg>
          {zones.map((z) => { const p = gameToPixel(m, z.points![0]![0], z.points![0]![1]); return <span key={`zl-${z.id}`} className="pointer-events-none absolute whitespace-nowrap rounded bg-black/60 px-1 text-[11px] text-white" style={{ left: p.px, top: p.py, transform: `scale(${1 / view.s})`, transformOrigin: 'top left' }}>{z.name}</span>; })}
          {visible.map((mk) => {
            const { px, py } = gameToPixel(m, mk.x, mk.z);
            return (
              <button key={mk.id} data-marker type="button" title={mk.title} aria-label={mk.title} onClick={(e) => { e.stopPropagation(); setSelected(mk.id === selected ? null : mk.id); }}
                className="absolute flex items-center gap-1" style={{ left: px, top: py, transform: `translate(-50%, -50%) scale(${1 / view.s})`, zIndex: mk.id === selected ? 20 : mk.layer === 'calls' || mk.layer === 'incidents' ? 10 : 5 }}>
                <span className={`grid h-7 w-7 place-items-center rounded-full border-2 text-sm shadow ${mk.pulse ? 'animate-pulse' : ''}`} style={{ borderColor: mk.color, background: `${mk.color}cc` }}>{mk.emoji}</span>
                {(!compact || mk.layer === 'calls' || mk.layer === 'incidents') && <span className="whitespace-nowrap rounded bg-black/70 px-1 text-[11px] font-medium text-white">{mk.label}</span>}
              </button>
            );
          })}
        </div>
      )}
      {data?.stale && <div data-ui className="absolute left-2 bottom-2 rounded bg-warning/90 px-2 py-1 text-xs text-black">ER:LC-API momentan nicht erreichbar – letzter bekannter Stand</div>}

      {/* Steuerung */}
      <div data-ui className="absolute right-2 top-2 flex flex-col gap-1">
        <Button size="sm" variant="secondary" aria-label="Hineinzoomen" onClick={() => zoomAt(1.4, ...center())}><Plus size={14} /></Button>
        <Button size="sm" variant="secondary" aria-label="Herauszoomen" onClick={() => zoomAt(1 / 1.4, ...center())}><Minus size={14} /></Button>
        <Button size="sm" variant="secondary" aria-label="Ganze Karte" onClick={() => apply(whole())}><Locate size={14} /></Button>
        <Button size="sm" variant="secondary" aria-label="Ebenen" aria-expanded={showLayers} onClick={() => setShowLayers((v) => !v)}><Layers size={14} /></Button>
      </div>
      {showLayers && (
        <div data-ui className="absolute right-12 top-2 max-h-[80%] w-56 overflow-auto rounded-md border border-line bg-panel p-2 text-sm shadow-lg">
          <p className="mb-1 text-xs font-semibold text-muted">Ebenen</p>
          {cfg.layers.map((l) => <label key={l.key} className="flex items-center justify-between gap-2 py-0.5"><span className="flex items-center gap-2"><input type="checkbox" checked={!hidden.has(l.key)} onChange={() => toggleLayer(l.key)} />{l.label}</span><span className="text-xs text-muted">{counts(l.key)}</span></label>)}
        </div>
      )}
      {!compact && (
        <div data-ui className="absolute left-2 top-2 flex flex-wrap gap-1">
          {onCreateIncidentAt && can('cad.create_incident') && <Button size="sm" variant={mode.kind === 'pick' && mode.tag === 'incident' ? 'primary' : 'secondary'} onClick={() => setMode(mode.kind === 'pick' && mode.tag === 'incident' ? { kind: 'view' } : { kind: 'pick', tag: 'incident', hint: 'Klicke auf die Karte, um dort einen Einsatz anzulegen.', onPick: onCreateIncidentAt })}>🔴 Einsatz hier</Button>}
          {can('cad.manage_map') && <>
            <Button size="sm" variant={mode.kind === 'poi' ? 'primary' : 'secondary'} onClick={() => setMode(mode.kind === 'poi' ? { kind: 'view' } : { kind: 'poi' })}><Pencil size={12} /> POI setzen</Button>
            <Button size="sm" variant={mode.kind === 'zone' ? 'primary' : 'secondary'} onClick={() => setMode(mode.kind === 'zone' ? { kind: 'view' } : { kind: 'zone', points: [] })}>⬠ Zone zeichnen</Button>
            {mode.kind === 'zone' && mode.points.length >= 3 && <Button size="sm" onClick={() => { setEditObj({ kind: 'ZONE', points: mode.points, layer: 'zones', name: '' }); setMode({ kind: 'view' }); }}>Zone fertig ({mode.points.length} Punkte)</Button>}
          </>}
        </div>
      )}
      {mode.kind !== 'view' && <div data-ui className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded bg-primary px-3 py-1 text-xs text-primary-fg">{mode.kind === 'poi' ? 'Klicke auf die Karte, um den POI zu setzen.' : mode.kind === 'zone' ? 'Klicke Punkte der Zone auf die Karte (mind. 3), dann „Zone fertig“.' : mode.hint} <button className="ml-2 underline" onClick={() => setMode({ kind: 'view' })}>Abbrechen</button></div>}

      {sel && (
        <div data-ui className="absolute bottom-2 right-2 z-30 w-72 max-w-[calc(100%-1rem)] rounded-md border border-line bg-panel p-3 shadow-xl" role="dialog" aria-label={sel.title}>
          <div className="mb-1 flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{sel.title}</h3><button aria-label="Schließen" onClick={() => setSelected(null)}><X size={14} /></button></div>
          {sel.body}
          {sel.actions && <div className="mt-2 flex flex-wrap gap-1">{sel.actions}</div>}
        </div>
      )}
      {editObj && <MapObjectForm cfg={cfg} value={editObj} onClose={() => setEditObj(null)} />}
    </div>
  );
}

/** POI/Zone anlegen oder bearbeiten (Map-Editor). */
function MapObjectForm({ cfg, value, onClose }: { cfg: CadConfig; value: Partial<CadMapObject>; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string>();
  const roles = useQuery({ queryKey: ['roles-list'], queryFn: () => api<{ id: string; name: string }[]>('/roles').catch(() => []) });
  const done = () => { void qc.invalidateQueries({ queryKey: ['cad-map'] }); onClose(); };
  const save = useMutation({
    mutationFn: () => { const body = { kind: v.kind, name: v.name, description: v.description || null, category: v.category || null, layer: v.layer, icon: v.icon || null, color: v.color || null, x: v.x ?? null, z: v.z ?? null, points: v.points ?? null, roleIds: v.roleIds ?? [], incidentType: v.incidentType || null, autoAction: v.autoAction || null };
      return v.id ? api(`/cad/map/objects/${v.id}`, { method: 'PATCH', body }) : api('/cad/map/objects', { body }); },
    onSuccess: done, onError: (e) => setErr(e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen'),
  });
  const del = useMutation({ mutationFn: () => api(`/cad/map/objects/${v.id}`, { method: 'DELETE' }), onSuccess: done });
  const upd = (p: Partial<CadMapObject>) => setV({ ...v, ...p });
  return (
    <Modal open title={`${v.kind === 'ZONE' ? 'Zone' : 'POI'} ${v.id ? 'bearbeiten' : 'anlegen'}`} onClose={onClose}>
      <div className="grid gap-3" data-ui>
        <Field label="Name">{(id) => <Input id={id} value={v.name ?? ''} maxLength={80} onChange={(e) => upd({ name: e.target.value })} />}</Field>
        <Field label="Beschreibung">{(id) => <Textarea id={id} rows={2} value={v.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ebene">{(id) => <Select id={id} value={v.layer} onChange={(e) => upd({ layer: e.target.value })}>{cfg.layers.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select>}</Field>
          <Field label="Kategorie">{(id) => <Input id={id} value={v.category ?? ''} maxLength={40} onChange={(e) => upd({ category: e.target.value })} />}</Field>
          {v.kind === 'POI' && <Field label="Symbol (Emoji)">{(id) => <Input id={id} value={v.icon ?? ''} maxLength={4} placeholder="📍" onChange={(e) => upd({ icon: e.target.value })} />}</Field>}
          <Field label="Farbe">{(id) => <Input id={id} type="color" value={v.color ?? '#10b981'} onChange={(e) => upd({ color: e.target.value })} />}</Field>
          {v.kind === 'ZONE' && <Field label="Einsatzart (optional)">{(id) => <Select id={id} value={v.incidentType ?? ''} onChange={(e) => upd({ incidentType: e.target.value || null })}><option value="">—</option>{cfg.incidentTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>}</Field>}
          {v.kind === 'ZONE' && <Field label="Automatische Aktion">{(id) => <Select id={id} value={v.autoAction ?? ''} onChange={(e) => upd({ autoAction: e.target.value || null })}><option value="">keine</option><option value="warn">Warnung bei Einsätzen in der Zone</option><option value="notify">Leitstelle benachrichtigen</option></Select>}</Field>}
        </div>
        <Field label="Sichtbar für (leer = alle mit CAD-Zugriff)">{(id) => (
          <Select id={id} multiple value={v.roleIds ?? []} onChange={(e) => upd({ roleIds: [...e.target.selectedOptions].map((o) => o.value) })} className="h-24">{(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        )}</Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-between gap-2">
          {v.id ? <Button variant="danger" onClick={() => del.mutate()}>Löschen</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={!v.name || save.isPending} onClick={() => save.mutate()}>Speichern</Button></div>
        </div>
      </div>
    </Modal>
  );
}
