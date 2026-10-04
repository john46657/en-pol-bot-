import {
  CHART_SOURCES,
  CTA_KINDS,
  CTA_LABEL,
  GRID_COLS,
  MAX_WIDGETS,
  METRICS,
  METRIC_KEYS,
  SIZE_PRESETS,
  WIDGET_LABEL,
  WIDGET_TYPES,
  addWidget,
  compact,
  createWidget,
  duplicateWidget,
  normalizeCta,
  placeWidget,
  type Cta,
  type Widget,
  type WidgetType,
} from '@nexus/design/client';
import { useRef, useState } from 'react';
import { ColorOpt, RolePicker, UrlText } from './controls';
import { ImageField } from './ImageField';
import { pageOptions } from './pageOptions';
import { useEditor } from './state';

const ROW = 36;
const GAP = 8;
const SHADOWS = [
  ['none', 'Keiner'],
  ['small', 'Klein'],
  ['medium', 'Mittel'],
  ['large', 'Groß'],
] as const;

/** Widgets einer Seite: Bibliothek, Raster-Leinwand (ziehen/vergrößern), Einstellungen je Widget. */
export function WidgetEditor({ page = 'overview' }: { page?: string }) {
  const { draft, set, disabled } = useEditor();
  const widgets = draft.layout.pages[page]?.widgets ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    mode: 'move' | 'resize';
    sx: number;
    sy: number;
    orig: Widget;
    start: Widget[];
    cw: number;
    last: string;
  } | null>(null);
  const sel = widgets.find((w) => w.id === selected) ?? null;

  const save = (list: Widget[]) =>
    set('layout', { ...draft.layout, pages: { ...draft.layout.pages, [page]: { widgets: list } } });
  const patch = (id: string, p: Partial<Widget>) =>
    save(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const patchProps = (id: string, p: Record<string, unknown>) =>
    save(widgets.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...p } } : w)));
  const patchStyle = (id: string, p: Partial<Widget['style']>) =>
    save(widgets.map((w) => (w.id === id ? { ...w, style: { ...w.style, ...p } } : w)));
  const place = (id: string, rect: Partial<Pick<Widget, 'x' | 'y' | 'w' | 'h'>>) =>
    save(placeWidget(widgets, id, rect));
  const add = (type: WidgetType) => {
    const w = createWidget(
      type,
      widgets.map((x) => x.id),
    );
    save(addWidget(widgets, w));
    setSelected(w.id);
  };

  // --- Ziehen / Größe ändern (Zeiger-Ereignisse) ---
  const down = (e: React.PointerEvent, w: Widget, mode: 'move' | 'resize') => {
    if (disabled || !canvas.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: w.id,
      mode,
      sx: e.clientX,
      sy: e.clientY,
      orig: w,
      start: widgets,
      cw: (canvas.current.getBoundingClientRect().width + GAP) / GRID_COLS,
      last: '',
    };
    setSelected(w.id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.sx) / d.cw);
    const dy = Math.round((e.clientY - d.sy) / (ROW + GAP));
    const rect =
      d.mode === 'move'
        ? { x: d.orig.x + dx, y: d.orig.y + dy }
        : { w: d.orig.w + dx, h: d.orig.h + dy };
    const key = JSON.stringify(rect);
    if (key === d.last) return;
    d.last = key;
    // Immer vom Stand beim Start aus rechnen: wer zurückzieht, bringt die verdrängten Widgets mit zurück
    set('layout', {
      ...draft.layout,
      pages: { ...draft.layout.pages, [page]: { widgets: placeWidget(d.start, d.id, rect) } },
    });
  };
  const up = () => {
    drag.current = null;
  };

  const rows = Math.max(8, ...widgets.map((w) => w.y + w.h)) + 3;
  return (
    <>
      <h3>Widget hinzufügen</h3>
      <div className="we-lib">
        {WIDGET_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="btn"
            disabled={disabled || widgets.length >= MAX_WIDGETS}
            title={WIDGET_LABEL[t].hint}
            aria-label={`${WIDGET_LABEL[t].label} hinzufügen`}
            onClick={() => add(t)}
          >
            {WIDGET_LABEL[t].icon} {WIDGET_LABEL[t].label}
          </button>
        ))}
      </div>
      <p className="muted">
        Auf der Leinwand ziehen (⠿ in der Titelzeile) und an der Ecke ◢ vergrößern. Andere Widgets
        weichen aus. Alternativ im Bereich „Einstellungen“ per Tasten.
      </p>
      <div className="dz-seg">
        <button
          type="button"
          className="btn"
          disabled={disabled || widgets.length === 0}
          onClick={() => save(compact(widgets))}
        >
          Aufräumen (nach oben ziehen)
        </button>
        <span className="muted">
          {widgets.length} / {MAX_WIDGETS} Widgets
        </span>
      </div>
      <div
        ref={canvas}
        className="we-canvas"
        style={{ gridAutoRows: ROW, gap: GAP, minHeight: rows * (ROW + GAP) }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Widget-Leinwand"
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            className={`we-item ${selected === w.id ? 'sel' : ''} ${w.visible ? '' : 'hid'}`}
            style={{ gridColumn: `${w.x} / span ${w.w}`, gridRow: `${w.y} / span ${w.h}` }}
            onClick={() => setSelected(w.id)}
          >
            <div
              className="we-grip"
              onPointerDown={(e) => down(e, w, 'move')}
              title="Ziehen zum Verschieben"
            >
              <span aria-hidden>⠿</span> {w.icon || WIDGET_LABEL[w.type].icon}{' '}
              <b>{w.title || WIDGET_LABEL[w.type].label}</b>
              {!w.visible && ' (versteckt)'}
            </div>
            <button
              type="button"
              className="we-pick"
              onClick={() => setSelected(w.id)}
              aria-label={`${w.title || WIDGET_LABEL[w.type].label} auswählen`}
              aria-pressed={selected === w.id}
            >
              <small className="muted">
                {w.type === 'stat'
                  ? METRICS[w.props['metric'] as keyof typeof METRICS].label
                  : WIDGET_LABEL[w.type].hint}
                <br />
                {w.w}×{w.h} · Spalte {w.x}, Zeile {w.y}
              </small>
            </button>
            <span
              className="we-resize"
              onPointerDown={(e) => down(e, w, 'resize')}
              title="Größe ändern"
              aria-hidden
            >
              ◢
            </span>
          </div>
        ))}
        {widgets.length === 0 && (
          <p className="muted we-empty">Noch keine Widgets. Wähle oben eines aus.</p>
        )}
      </div>

      {sel && (
        <div
          className="card we-insp"
          role="group"
          aria-label={`Einstellungen: ${sel.title || WIDGET_LABEL[sel.type].label}`}
        >
          <h3>
            {WIDGET_LABEL[sel.type].icon} {WIDGET_LABEL[sel.type].label} – Einstellungen
          </h3>
          <label className="fld">
            <span>Titel (leer = Standard)</span>
            <input
              value={sel.title}
              maxLength={60}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { title: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Icon</span>
            <input
              value={sel.icon}
              maxLength={8}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { icon: e.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={sel.visible}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { visible: e.target.checked })}
            />{' '}
            Sichtbar
          </label>

          <h4>Größe und Position</h4>
          <div className="dz-seg">
            {SIZE_PRESETS.map(([name, w, h]) => (
              <button
                key={name}
                type="button"
                className={`btn ${sel.w === w && sel.h === h ? 'primary' : ''}`}
                disabled={disabled}
                onClick={() => place(sel.id, { w, h })}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="two">
            <Nm
              label="Breite (Spalten)"
              value={sel.w}
              min={1}
              max={GRID_COLS}
              disabled={disabled}
              onChange={(v) => place(sel.id, { w: v })}
            />
            <Nm
              label="Höhe (Zeilen)"
              value={sel.h}
              min={1}
              max={12}
              disabled={disabled}
              onChange={(v) => place(sel.id, { h: v })}
            />
            <Nm
              label="Spalte"
              value={sel.x}
              min={1}
              max={GRID_COLS}
              disabled={disabled}
              onChange={(v) => place(sel.id, { x: v })}
            />
            <Nm
              label="Zeile"
              value={sel.y}
              min={1}
              max={80}
              disabled={disabled}
              onChange={(v) => place(sel.id, { y: v })}
            />
          </div>
          <div className="dz-seg" role="group" aria-label="Verschieben mit Tasten">
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || sel.x <= 1}
              aria-label="Nach links"
              onClick={() => place(sel.id, { x: sel.x - 1 })}
            >
              ←
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || sel.x + sel.w > GRID_COLS}
              aria-label="Nach rechts"
              onClick={() => place(sel.id, { x: sel.x + 1 })}
            >
              →
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || sel.y <= 1}
              aria-label="Nach oben"
              onClick={() => place(sel.id, { y: sel.y - 1 })}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled}
              aria-label="Nach unten"
              onClick={() => place(sel.id, { y: sel.y + 1 })}
            >
              ↓
            </button>
          </div>

          <Props w={sel} disabled={disabled} patchProps={(p) => patchProps(sel.id, p)} />

          <h4>Aussehen dieses Widgets</h4>
          <p className="muted">
            Leer/„Standard“ = die globalen Einstellungen (Layout, Karten) gelten.
          </p>
          <div className="two">
            <ColorOpt
              label="Hintergrund"
              value={sel.style.background}
              disabled={disabled}
              onChange={(v) => patchStyle(sel.id, { background: v })}
            />
            <ColorOpt
              label="Textfarbe"
              value={sel.style.color}
              disabled={disabled}
              onChange={(v) => patchStyle(sel.id, { color: v })}
            />
          </div>
          <div className="two">
            <TriNum
              label="Rahmen (px)"
              value={sel.style.border}
              def={1}
              min={0}
              max={4}
              disabled={disabled}
              onChange={(v) => patchStyle(sel.id, { border: v })}
            />
            <TriNum
              label="Rundung (px)"
              value={sel.style.radius}
              def={12}
              min={0}
              max={48}
              disabled={disabled}
              onChange={(v) => patchStyle(sel.id, { radius: v })}
            />
          </div>
          <label className="fld">
            <span>Schatten</span>
            <select
              value={sel.style.shadow ?? ''}
              disabled={disabled}
              onChange={(e) =>
                patchStyle(sel.id, {
                  shadow:
                    e.target.value === '' ? null : (e.target.value as Widget['style']['shadow']),
                })
              }
            >
              <option value="">Standard</option>
              {SHADOWS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>Glas-Effekt</span>
            <select
              value={sel.style.glass === null ? '' : sel.style.glass ? 'on' : 'off'}
              disabled={disabled}
              onChange={(e) =>
                patchStyle(sel.id, {
                  glass: e.target.value === '' ? null : e.target.value === 'on',
                })
              }
            >
              <option value="">Standard</option>
              <option value="on">An</option>
              <option value="off">Aus</option>
            </select>
          </label>

          <RolePicker
            value={sel.roles}
            onChange={(roles) => patch(sel.id, { roles })}
            disabled={disabled}
          />

          <div className="dz-seg">
            <button
              type="button"
              className="btn"
              disabled={disabled || widgets.length >= MAX_WIDGETS}
              onClick={() => {
                const list = duplicateWidget(widgets, sel.id);
                save(list);
                setSelected(list.find((x) => !widgets.some((o) => o.id === x.id))?.id ?? sel.id);
              }}
            >
              Duplizieren
            </button>
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={() => {
                save(widgets.filter((w) => w.id !== sel.id));
                setSelected(null);
              }}
            >
              Entfernen
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Nm({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="fld">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
      />
    </label>
  );
}
function TriNum({
  label,
  value,
  def,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  def: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="fld">
      <span>{label}</span>
      <label className="check">
        <input
          type="checkbox"
          checked={value !== null}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? def : null)}
        />{' '}
        eigener Wert
      </label>
      {value !== null && (
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}

/** Einstellungen, die vom Widget-Typ abhängen. */
function Props({
  w,
  disabled,
  patchProps,
}: {
  w: Widget;
  disabled: boolean;
  patchProps: (p: Record<string, unknown>) => void;
}) {
  const p = w.props;
  const txt = (key: string, label: string, max: number, hint?: string) => (
    <label className="fld">
      <span>{label}</span>
      <input
        value={String(p[key] ?? '')}
        maxLength={max}
        disabled={disabled}
        onChange={(e) => patchProps({ [key]: e.target.value })}
      />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
  switch (w.type) {
    case 'stat':
      return (
        <>
          <label className="fld">
            <span>Kennzahl</span>
            <select
              value={String(p['metric'])}
              disabled={disabled}
              onChange={(e) => patchProps({ metric: e.target.value })}
            >
              {METRIC_KEYS.map((k) => (
                <option key={k} value={k}>
                  {METRICS[k].icon} {METRICS[k].label}
                </option>
              ))}
            </select>
          </label>
          {txt('description', 'Beschreibung', 120)}
          {txt(
            'trend',
            'Zusatzzeile (z. B. „+12 % diese Woche“)',
            60,
            'Fester Text – keine automatische Berechnung.',
          )}
        </>
      );
    case 'tickets':
    case 'applications':
    case 'team':
    case 'activity':
      return (
        <Nm
          label="Anzahl Einträge (1–10)"
          value={Number(p['limit'])}
          min={1}
          max={10}
          disabled={disabled}
          onChange={(v) => patchProps({ limit: v })}
        />
      );
    case 'chart':
      return (
        <label className="fld">
          <span>Datenquelle</span>
          <select
            value={String(p['source'])}
            disabled={disabled}
            onChange={(e) => patchProps({ source: e.target.value })}
          >
            {(Object.keys(CHART_SOURCES) as (keyof typeof CHART_SOURCES)[]).map((k) => (
              <option key={k} value={k}>
                {CHART_SOURCES[k].label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'date':
      return (
        <label className="fld">
          <span>Anzeige</span>
          <select
            value={String(p['format'])}
            disabled={disabled}
            onChange={(e) => patchProps({ format: e.target.value })}
          >
            <option value="datetime">Datum und Uhrzeit</option>
            <option value="date">Nur Datum</option>
            <option value="time">Nur Uhrzeit</option>
          </select>
        </label>
      );
    case 'text':
      return (
        <label className="fld">
          <span>Text</span>
          <textarea
            rows={6}
            maxLength={2000}
            value={String(p['body'])}
            disabled={disabled}
            onChange={(e) => patchProps({ body: e.target.value })}
          />
          <small className="muted">
            # Überschrift · **fett** · *kursiv* · - Listenpunkt · [Link](https://…)
          </small>
        </label>
      );
    case 'link':
      return (
        <>
          {txt('description', 'Beschreibung', 200)}
          <CtaEditor
            cta={p['cta'] as Cta}
            disabled={disabled}
            onChange={(cta) => patchProps({ cta })}
          />
        </>
      );
    case 'image':
      return (
        <>
          <ImageField
            label="Bild"
            value={String(p['src'])}
            disabled={disabled}
            onCommit={(v) => patchProps({ src: v })}
          />
          {txt('alt', 'Beschreibung (für Screenreader)', 120)}
          <label className="fld">
            <span>Darstellung</span>
            <select
              value={String(p['fit'])}
              disabled={disabled}
              onChange={(e) => patchProps({ fit: e.target.value })}
            >
              <option value="cover">Füllen</option>
              <option value="contain">Einpassen</option>
            </select>
          </label>
          <div className="two">
            <ColorOpt
              label="Überlagerung (Overlay)"
              value={String(p['overlayColor'])}
              disabled={disabled}
              onChange={(v) => patchProps({ overlayColor: v || '#000000' })}
            />
            <Nm
              label="Overlay-Deckkraft (0 = aus)"
              value={Number(p['overlayOpacity'])}
              min={0}
              max={100}
              disabled={disabled}
              onChange={(v) => patchProps({ overlayOpacity: v })}
            />
          </div>
          <p className="muted">Optional: Bild als Link</p>
          <CtaEditor
            cta={p['cta'] as Cta}
            disabled={disabled}
            onChange={(cta) => patchProps({ cta })}
            noText
          />
        </>
      );
    case 'banner':
      return (
        <>
          <label className="fld">
            <span>Text</span>
            <textarea
              rows={3}
              maxLength={400}
              value={String(p['body'])}
              disabled={disabled}
              onChange={(e) => patchProps({ body: e.target.value })}
            />
          </label>
          <ImageField
            label="Bild"
            value={String(p['image'])}
            disabled={disabled}
            onCommit={(v) => patchProps({ image: v })}
          />
          <label className="fld">
            <span>Ablaufdatum (optional)</span>
            <input
              type="date"
              value={String(p['expires'])}
              disabled={disabled}
              onChange={(e) => patchProps({ expires: e.target.value })}
            />
          </label>
          <CtaEditor
            cta={p['cta'] as Cta}
            disabled={disabled}
            onChange={(cta) => patchProps({ cta })}
          />
        </>
      );
    case 'health':
      return (
        <p className="muted">
          Zeigt den Zustand der Server-Einrichtung. Keine weiteren Einstellungen.
        </p>
      );
  }
}

/** Button-Builder: Text, Icon, Aktion, Farben, Hover, Rundung, Rahmen, Schatten. */
export function CtaEditor({
  cta: raw,
  disabled,
  onChange,
  noText,
}: {
  cta: Cta;
  disabled: boolean;
  onChange: (c: Cta) => void;
  noText?: boolean;
}) {
  const { draft } = useEditor();
  const cta = normalizeCta(raw);
  const set = (p: Partial<Cta>) => onChange({ ...cta, ...p });
  return (
    <fieldset className="perm-group" disabled={disabled}>
      <legend>Button</legend>
      <label className="fld">
        <span>Aktion</span>
        <select
          value={cta.kind}
          onChange={(e) => set({ kind: e.target.value as Cta['kind'], target: '' })}
        >
          {CTA_KINDS.map((k) => (
            <option key={k} value={k}>
              {CTA_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {cta.kind === 'page' && (
        <label className="fld">
          <span>Seite</span>
          <select value={cta.target} onChange={(e) => set({ target: e.target.value })}>
            <option value="">– wählen –</option>
            {pageOptions(draft.layout.custom).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      {cta.kind === 'modal' && (
        <>
          <label className="fld">
            <span>Titel des Fensters</span>
            <input
              value={cta.modalTitle}
              maxLength={80}
              onChange={(e) => set({ modalTitle: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Text des Fensters</span>
            <textarea
              rows={5}
              maxLength={1500}
              value={cta.modalBody}
              onChange={(e) => set({ modalBody: e.target.value })}
            />
            <small className="muted">
              # Überschrift · **fett** · *kursiv* · - Liste · [Link](https://…)
            </small>
          </label>
        </>
      )}
      {(cta.kind === 'url' || cta.kind === 'discord') && (
        <UrlText
          label={cta.kind === 'discord' ? 'Discord-Link (https://discord.gg/…)' : 'Adresse (https)'}
          value={cta.target}
          disabled={disabled}
          allowEmpty
          onCommit={(v) => set({ target: v })}
        />
      )}
      {cta.kind !== 'none' && !noText && (
        <>
          <div className="two">
            <label className="fld">
              <span>Text</span>
              <input
                value={cta.text}
                maxLength={40}
                onChange={(e) => set({ text: e.target.value })}
              />
            </label>
            <label className="fld">
              <span>Icon</span>
              <input
                value={cta.icon}
                maxLength={8}
                onChange={(e) => set({ icon: e.target.value })}
              />
            </label>
          </div>
          <div className="two">
            <ColorOpt
              label="Farbe"
              value={cta.color}
              disabled={disabled}
              onChange={(v) => set({ color: v })}
            />
            <ColorOpt
              label="Hover-Farbe"
              value={cta.hoverColor}
              disabled={disabled}
              onChange={(v) => set({ hoverColor: v })}
            />
          </div>
          <ColorOpt
            label="Textfarbe"
            value={cta.textColor}
            disabled={disabled}
            onChange={(v) => set({ textColor: v })}
          />
          <div className="two">
            <TriNum
              label="Rundung (px)"
              value={cta.radius}
              def={8}
              min={0}
              max={48}
              disabled={disabled}
              onChange={(v) => set({ radius: v })}
            />
            <Nm
              label="Rahmen (px)"
              value={cta.border}
              min={0}
              max={4}
              disabled={disabled}
              onChange={(v) => set({ border: v })}
            />
          </div>
          <label className="fld">
            <span>Schatten</span>
            <select
              value={cta.shadow ?? ''}
              onChange={(e) =>
                set({ shadow: e.target.value === '' ? null : (e.target.value as Cta['shadow']) })
              }
            >
              <option value="">Standard</option>
              {SHADOWS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </fieldset>
  );
}
