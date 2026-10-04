import { COLOR_KEYS, FONTS, type Background } from '@nexus/design/client';
import { NAV } from '../../pages/GuildLayout';
import { ColorField, ContrastHint, Inherit, Num, Pick, Toggle, Txt, Field } from './controls';
import { getIn, useEditor } from './state';
import { useState } from 'react';

const COLOR_LABEL: Record<(typeof COLOR_KEYS)[number], string> = {
  primary: 'Primärfarbe',
  primaryHover: 'Primärfarbe (Hover)',
  secondary: 'Sekundärfarbe',
  background: 'Hintergrund',
  surface: 'Flächen / Karten',
  surfaceHover: 'Flächen (Hover)',
  sidebar: 'Sidebar',
  header: 'Header',
  textPrimary: 'Text',
  textSecondary: 'Text (gedämpft)',
  border: 'Rahmen',
  success: 'Erfolg',
  warning: 'Warnung',
  danger: 'Gefahr / Fehler',
  info: 'Info',
};
const SHADOW_OPTS = [
  ['none', 'Keiner'],
  ['small', 'Klein'],
  ['medium', 'Mittel'],
  ['large', 'Groß'],
  ['custom', 'Eigener'],
] as const;

export function General() {
  const { draft } = useEditor();
  return (
    <>
      <h3>Servername</h3>
      <Pick
        path="general.nameMode"
        label="Anzeigename"
        options={[
          ['discord', 'Discord-Servernamen automatisch verwenden'],
          ['custom', 'Eigenen Namen verwenden'],
        ]}
      />
      {draft.general.nameMode === 'custom' && (
        <Txt
          path="general.customName"
          label="Dashboard-Name"
          placeholder="z. B. PrinceArmy Management"
        />
      )}
      <h3>Logo</h3>
      <Pick
        path="general.logo.mode"
        label="Quelle"
        options={[
          ['discord', 'Discord-Servericon'],
          ['upload', 'Eigenes Bild (URL)'],
          ['none', 'Kein Logo'],
        ]}
      />
      {draft.general.logo.mode === 'upload' && (
        <Txt
          path="general.logo.url"
          label="Bild-Adresse"
          max={500}
          placeholder="https://…"
          hint="Nur https-Adressen. Ein Upload direkt im Dashboard folgt später."
        />
      )}
      <Num path="general.logo.width" label="Breite" min={16} max={200} unit=" px" />
      <Num path="general.logo.height" label="Höhe" min={16} max={200} unit=" px" />
      <Num path="general.logo.radius" label="Rundung" min={0} max={100} unit=" px" />
      <Pick
        path="general.logo.position"
        label="Position"
        options={[
          ['left', 'Links'],
          ['center', 'Mitte'],
          ['right', 'Rechts'],
        ]}
      />
    </>
  );
}

function BackgroundFields({ base }: { base: string }) {
  const { draft } = useEditor();
  const b = getIn(draft, base) as Background;
  const t = b.type;
  return (
    <>
      <Pick
        path={`${base}.type`}
        label="Typ"
        options={[
          ['solid', 'Einfarbig'],
          ['gradient', 'Farbverlauf'],
          ['image', 'Bild'],
          ['gif', 'GIF'],
        ]}
      />
      <ColorField
        path={`${base}.color`}
        label={
          t === 'gradient' ? 'Farbe 1' : t === 'solid' ? 'Farbe' : 'Grundfarbe (hinter dem Bild)'
        }
      />
      {t === 'gradient' && (
        <>
          <ColorField path={`${base}.color2`} label="Farbe 2" />
          <Num
            path={`${base}.angle`}
            label="Richtung"
            min={0}
            max={360}
            unit="°"
            hint="Üblich: 0°, 45°, 90°, 135°, 180° – oder frei wählen."
          />
        </>
      )}
      {(t === 'image' || t === 'gif') && (
        <>
          <Txt
            path={`${base}.imageUrl`}
            label="Bild-Adresse"
            max={500}
            placeholder="https://…"
            hint="Nur https-Adressen (kein Upload-Pfad vorhanden – folgt später)."
          />
          <Pick
            path={`${base}.position`}
            label="Position"
            options={[
              ['center', 'Mitte'],
              ['top', 'Oben'],
              ['bottom', 'Unten'],
              ['left', 'Links'],
              ['right', 'Rechts'],
            ]}
          />
          <Pick
            path={`${base}.size`}
            label="Größe"
            options={[
              ['cover', 'Füllen (cover)'],
              ['contain', 'Einpassen (contain)'],
              ['auto', 'Originalgröße'],
            ]}
          />
        </>
      )}
      <Num path={`${base}.opacity`} label="Deckkraft" min={0} max={100} unit=" %" />
      <Num path={`${base}.blur`} label="Unschärfe" min={0} max={40} unit=" px" />
      <Num path={`${base}.brightness`} label="Helligkeit" min={20} max={200} unit=" %" />
      <Toggle path={`${base}.overlay.enabled`} label="Overlay aktivieren" />
      {b.overlay.enabled && (
        <>
          <ColorField path={`${base}.overlay.color`} label="Overlay-Farbe" />
          <Num
            path={`${base}.overlay.opacity`}
            label="Overlay-Deckkraft"
            min={0}
            max={100}
            unit=" %"
          />
        </>
      )}
    </>
  );
}

export const PAGE_OPTIONS: readonly (readonly [string, string])[] = [
  ['overview', 'Übersicht'],
  ...NAV.filter((n) => n.to !== '').map((n) => [n.to, n.label] as const),
];

export function BackgroundTab() {
  const { draft, set, disabled } = useEditor();
  const [page, setPage] = useState('');
  const own = page !== '' && draft.background.pages[page] !== undefined;
  return (
    <>
      <h3>Globaler Hintergrund</h3>
      <BackgroundFields base="background.global" />
      <h3>Hintergrund einzelner Seiten</h3>
      <p className="muted">Ohne eigenen Hintergrund gilt automatisch der globale.</p>
      <label className="fld">
        <span>Seite</span>
        <select value={page} onChange={(e) => setPage(e.target.value)}>
          <option value="">– Seite wählen –</option>
          {PAGE_OPTIONS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
              {draft.background.pages[k] ? ' ✓ eigener Hintergrund' : ''}
            </option>
          ))}
        </select>
      </label>
      {page !== '' && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={own}
              disabled={disabled}
              onChange={(e) =>
                set(
                  `background.pages.${page}`,
                  e.target.checked ? structuredClone(draft.background.global) : undefined,
                )
              }
            />{' '}
            Seitenspezifischen Hintergrund verwenden
          </label>
          {own && <BackgroundFields base={`background.pages.${page}`} />}
        </>
      )}
    </>
  );
}

export function ColorsTab() {
  const { draft } = useEditor();
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const p = draft.colors[mode];
  return (
    <>
      <div className="dz-seg" role="tablist" aria-label="Modus">
        {(['dark', 'light'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`btn ${mode === m ? 'primary' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
        ))}
      </div>
      <p className="muted">
        Dark und Light sind unabhängig. Alle Bereiche des Dashboards nutzen diese Farben.
      </p>
      <ContrastHint fg={p.textPrimary} bg={p.background} label="Text auf Hintergrund" />
      <ContrastHint fg={p.textPrimary} bg={p.surface} label="Text auf Karten" />
      <ContrastHint fg="#FFFFFF" bg={p.primary} label="Weißer Text auf Primärfarbe" />
      {COLOR_KEYS.map((k) => (
        <ColorField key={`${mode}-${k}`} path={`colors.${mode}.${k}`} label={COLOR_LABEL[k]} />
      ))}
    </>
  );
}

const WEIGHTS = [
  ['300', '300 – Leicht'],
  ['400', '400 – Normal'],
  ['500', '500 – Mittel'],
  ['600', '600 – Halbfett'],
  ['700', '700 – Fett'],
  ['800', '800 – Extrafett'],
] as const;
export function TypographyTab() {
  const fonts = FONTS.map((f) => [f, f === 'system' ? 'System' : f] as const);
  return (
    <>
      <Pick
        path="typography.fontMain"
        label="Hauptschrift"
        options={fonts}
        hint="Wird nur geladen, wenn gewählt."
      />
      <Pick path="typography.fontHeading" label="Überschriften" options={fonts} />
      <h3>Überschrift 1</h3>
      <Num path="typography.h1.size" label="Größe" min={16} max={64} unit=" px" />
      <Pick path="typography.h1.weight" label="Gewicht" options={WEIGHTS} />
      <h3>Überschrift 2</h3>
      <Num path="typography.h2.size" label="Größe" min={14} max={48} unit=" px" />
      <Pick path="typography.h2.weight" label="Gewicht" options={WEIGHTS} />
      <h3>Fließtext</h3>
      <Num path="typography.body.size" label="Größe" min={11} max={24} unit=" px" />
      <Pick path="typography.body.weight" label="Gewicht" options={WEIGHTS} />
      <Num path="typography.body.lineHeight" label="Zeilenhöhe" min={1} max={2.5} step={0.05} />
      <Num
        path="typography.body.letterSpacing"
        label="Buchstabenabstand (Zehntel-px)"
        min={-2}
        max={10}
        step={0.5}
      />
    </>
  );
}

export function NavigationTab() {
  const { draft } = useEditor();
  return (
    <>
      <h3>Sidebar</h3>
      <Toggle path="sidebar.enabled" label="Sidebar aktiv" />
      {draft.sidebar.enabled && (
        <>
          <Num path="sidebar.width" label="Breite" min={180} max={400} unit=" px" />
          <Pick
            path="sidebar.position"
            label="Position"
            options={[
              ['left', 'Links'],
              ['right', 'Rechts'],
            ]}
          />
          <Pick
            path="sidebar.style"
            label="Stil"
            options={[
              ['solid', 'Einfarbig'],
              ['glass', 'Glas'],
              ['transparent', 'Transparent'],
            ]}
          />
          <Num path="sidebar.border" label="Rahmen" min={0} max={4} unit=" px" />
          <Num path="sidebar.radius" label="Rundung" min={0} max={48} unit=" px" />
        </>
      )}
      <p className="muted">
        Eigene Einträge, Reihenfolge per Drag &amp; Drop und Gruppen folgen in der nächsten Phase.
      </p>
      <h3>Header</h3>
      <Num path="header.height" label="Höhe" min={40} max={120} unit=" px" />
      <Num path="header.opacity" label="Deckkraft" min={0} max={100} unit=" %" />
      <Num path="header.blur" label="Unschärfe" min={0} max={40} unit=" px" />
      <Num path="header.border" label="Rahmen" min={0} max={4} unit=" px" />
      <Toggle path="header.showLogo" label="Logo anzeigen" />
      <Toggle path="header.showName" label="Servername anzeigen" />
      <Toggle
        path="header.showProfile"
        label="Benutzerprofil (Abmelden, Hell/Dunkel) anzeigen"
        hint="Achtung: Ausgeblendet kann man sich im Dashboard nicht mehr abmelden."
      />
    </>
  );
}

export function CardsButtonsTab() {
  const radius = (v: unknown, set: (x: unknown) => void) => (
    <input
      type="number"
      min={0}
      max={48}
      value={Number(v)}
      onChange={(e) => e.target.value !== '' && set(Number(e.target.value))}
      aria-label="Rundung in px"
    />
  );
  const shadow = (v: unknown, set: (x: unknown) => void) => (
    <select value={String(v)} onChange={(e) => set(e.target.value)} aria-label="Schatten">
      {SHADOW_OPTS.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <h3>Karten</h3>
      <Inherit path="cards.radius" label="Rundung (px)">
        {radius}
      </Inherit>
      <Inherit path="cards.shadow" label="Schatten">
        {shadow}
      </Inherit>
      <Inherit path="cards.glass" label="Glas-Effekt">
        {(v, set) => (
          <label className="check">
            <input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} />{' '}
            Glas für Karten
          </label>
        )}
      </Inherit>
      <Num path="cards.border" label="Rahmen" min={0} max={4} unit=" px" />
      <h3>Buttons</h3>
      <Inherit path="buttons.radius" label="Rundung (px)">
        {radius}
      </Inherit>
      <Inherit path="buttons.shadow" label="Schatten">
        {shadow}
      </Inherit>
    </>
  );
}

const RADIUS_PRESETS = [0, 4, 8, 12, 16, 20, 24];
export function LayoutTab() {
  const { draft, set, disabled } = useEditor();
  const custom = !RADIUS_PRESETS.includes(draft.radius);
  return (
    <>
      <h3>Rundung</h3>
      <Field path="radius" label={`Globale Rundung: ${draft.radius} px`}>
        <div className="dz-seg">
          {RADIUS_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              className={`btn ${draft.radius === r ? 'primary' : ''}`}
              onClick={() => set('radius', r)}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            className={`btn ${custom ? 'primary' : ''}`}
            onClick={() => set('radius', 10)}
          >
            Eigene
          </button>
        </div>
        {custom && <Num path="radius" label="Eigene Rundung" min={0} max={48} unit=" px" />}
      </Field>
      <h3>Glas-Effekt</h3>
      <Toggle path="glass.enabled" label="Glassmorphism aktivieren" />
      {draft.glass.enabled && (
        <>
          <Num path="glass.opacity" label="Deckkraft" min={10} max={100} unit=" %" />
          <Num path="glass.blur" label="Unschärfe" min={0} max={40} unit=" px" />
          <Num path="glass.border" label="Rahmen" min={0} max={4} unit=" px" />
          <Num path="glass.borderOpacity" label="Rahmen-Deckkraft" min={0} max={100} unit=" %" />
        </>
      )}
      <h3>Schatten</h3>
      <Pick path="shadow.preset" label="Stärke" options={SHADOW_OPTS} />
      {draft.shadow.preset === 'custom' && (
        <Txt
          path="shadow.custom"
          label="Eigener Schatten"
          max={80}
          placeholder="0 4px 12px #00000055"
          hint="Format: x y [weichzeichnung] [ausbreitung] #Farbe"
        />
      )}
    </>
  );
}

export function AnimationTab() {
  const { draft } = useEditor();
  return (
    <>
      <Toggle path="animation.disabled" label="Alle Animationen deaktivieren" />
      {!draft.animation.disabled && (
        <>
          <Pick
            path="animation.speed"
            label="Geschwindigkeit"
            options={[
              ['slow', 'Langsam'],
              ['normal', 'Normal'],
              ['fast', 'Schnell'],
            ]}
          />
          <Toggle path="animation.pageTransitions" label="Seitenübergänge" />
          <Toggle path="animation.cardHover" label="Karten-Hover" />
          <Toggle path="animation.buttonHover" label="Button-Hover" />
          <Toggle path="animation.sidebar" label="Sidebar-Animation" />
          <Toggle
            path="animation.modal"
            label="Modal-Animation"
            hint="Wirkt, sobald Dialoge im Dashboard vorhanden sind."
          />
          <Toggle path="animation.notification" label="Benachrichtigungs-Animation" />
        </>
      )}
      <p className="muted">
        Benutzer mit „Bewegung reduzieren“ im Betriebssystem sehen die Animationen ohnehin nicht.
      </p>
    </>
  );
}

export function ResponsiveTab() {
  return (
    <>
      <Pick
        path="responsive.mobileNav"
        label="Navigation auf dem Handy"
        options={[
          ['drawer', 'Ausklappmenü (Drawer)'],
          ['bottom', 'Leiste unten'],
          ['hidden', 'Ausgeblendet'],
        ]}
        hint="Gilt bei Bildschirmbreiten bis 760 px. Die Vorschau oben zeigt es mit „Mobil“."
      />
      <Toggle path="responsive.stackCards" label="Karten auf dem Handy untereinander stapeln" />
    </>
  );
}

export function ModesTab() {
  return (
    <>
      <Pick
        path="mode"
        label="Standard-Modus des Servers"
        options={[
          ['dark', 'Dunkel'],
          ['light', 'Hell'],
          ['system', 'System'],
        ]}
        hint="Jeder Benutzer kann oben rechts selbst umschalten; das hat Vorrang."
      />
      <p className="muted">
        Die Farben von Dark und Light stellst du im Tab „Farben“ getrennt ein.
      </p>
    </>
  );
}
