import {
  contrast,
  parseHex,
  parseHslText,
  parseRgbText,
  rgbToHsl,
  toHex,
} from '@nexus/design/client';
import { useId, useState, type ReactNode } from 'react';
import { defaultAt, getIn, isDefault, useEditor } from './state';

/** Beschriftung + Steuerelement + „↩ Zurücksetzen“, sobald der Wert vom Standard abweicht. */
export function Field({
  path,
  label,
  hint,
  children,
  noReset,
}: {
  path: string;
  label: string;
  hint?: string;
  children: ReactNode;
  noReset?: boolean;
}) {
  const { draft, reset, disabled } = useEditor();
  const changed = !noReset && !isDefault(draft, path);
  return (
    <div className="fld dz-field">
      <span className="dz-label">
        {label}
        {changed && (
          <button
            type="button"
            className="btn dz-reset"
            disabled={disabled}
            onClick={() => reset(path)}
            title={`Zurücksetzen auf ${String(defaultAt(path))}`}
            aria-label={`${label} zurücksetzen`}
          >
            ↩ Zurücksetzen
          </button>
        )}
      </span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

export function Num({
  path,
  label,
  min,
  max,
  step = 1,
  unit = '',
  hint,
}: {
  path: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}) {
  const { draft, set, disabled } = useEditor();
  const v = Number(getIn(draft, path));
  const id = useId();
  return (
    <Field path={path} label={`${label}: ${v}${unit}`} {...(hint ? { hint } : {})}>
      <div className="dz-num">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(v) ? v : min}
          disabled={disabled}
          onChange={(e) => set(path, Number(e.target.value))}
          aria-label={label}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(v) ? v : min}
          disabled={disabled}
          onChange={(e) => e.target.value !== '' && set(path, Number(e.target.value))}
          aria-label={`${label} (Zahl)`}
        />
      </div>
    </Field>
  );
}

export function Pick({
  path,
  label,
  options,
  hint,
}: {
  path: string;
  label: string;
  options: readonly (readonly [string, string])[];
  hint?: string;
}) {
  const { draft, set, disabled } = useEditor();
  return (
    <Field path={path} label={label} {...(hint ? { hint } : {})}>
      <select
        aria-label={label}
        value={String(getIn(draft, path))}
        disabled={disabled}
        onChange={(e) => set(path, e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { draft, set, disabled } = useEditor();
  return (
    <Field path={path} label="" {...(hint ? { hint } : {})}>
      <label className="check">
        <input
          type="checkbox"
          checked={getIn(draft, path) === true}
          disabled={disabled}
          onChange={(e) => set(path, e.target.checked)}
        />{' '}
        {label}
      </label>
    </Field>
  );
}

export function Txt({
  path,
  label,
  max = 60,
  placeholder,
  hint,
}: {
  path: string;
  label: string;
  max?: number;
  placeholder?: string;
  hint?: string;
}) {
  const { draft, set, disabled } = useEditor();
  return (
    <Field path={path} label={label} {...(hint ? { hint } : {})}>
      <input
        type="text"
        aria-label={label}
        maxLength={max}
        placeholder={placeholder}
        value={String(getIn(draft, path) ?? '')}
        disabled={disabled}
        onChange={(e) => set(path, e.target.value)}
      />
    </Field>
  );
}

/** Wert, der „vom Theme/global geerbt“ sein kann (null) oder einen eigenen Wert hat – z. B. Rundung einer Karte. */
export function Inherit({
  path,
  label,
  children,
  hint,
}: {
  path: string;
  label: string;
  children: (value: unknown, set: (v: unknown) => void) => ReactNode;
  hint?: string;
}) {
  const { draft, set, disabled } = useEditor();
  const v = getIn(draft, path);
  const own = v !== null && v !== undefined;
  return (
    <Field path={path} label={label} {...(hint ? { hint } : {})}>
      <label className="check">
        <input
          type="checkbox"
          checked={own}
          disabled={disabled}
          onChange={(e) =>
            set(
              path,
              e.target.checked
                ? path.includes('radius')
                  ? Number(getIn(draft, 'radius'))
                  : path.endsWith('shadow')
                    ? 'small'
                    : false
                : null,
            )
          }
        />{' '}
        Eigenen Wert verwenden
      </label>
      {own && children(v, (x) => set(path, x))}
    </Field>
  );
}

const ALPHA = (a: number) => Math.round(a * 100);

/**
 * Color Picker mit HEX, RGB, HSL und Transparenz. Die Anzeige wird immer aus dem Entwurf abgeleitet; nur eine
 * (noch) ungültige Zwischeneingabe bleibt lokal stehen – und nur so lange, wie sich der Wert nicht von außen ändert.
 */
export function ColorField({ path, label }: { path: string; label: string }) {
  const { draft, set, disabled } = useEditor();
  const hex = String(getIn(draft, path));
  const rgba = parseHex(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  const hsl = rgbToHsl(rgba);
  type Kind = 'hex' | 'rgb' | 'hsl';
  const [typed, setTyped] = useState<{ kind: Kind; value: string; base: string } | null>(null);
  const shown = (kind: Kind, derived: string) =>
    typed && typed.kind === kind && typed.base === hex ? typed.value : derived;
  const input = (kind: Kind, value: string, parse: (t: string) => ReturnType<typeof parseHex>) => {
    const c = parse(value);
    if (c) {
      set(path, toHex(c));
      setTyped(null);
    } else setTyped({ kind, value, base: hex });
  };
  const bad = (kind: Kind) => typed?.kind === kind && typed.base === hex && typed.value !== '';
  return (
    <Field path={path} label={label}>
      <div className="dz-color">
        <input
          type="color"
          value={`#${hex.slice(1, 7)}`}
          disabled={disabled}
          aria-label={`${label} wählen`}
          onChange={(e) => {
            setTyped(null);
            set(path, toHex({ ...(parseHex(e.target.value) ?? rgba), a: rgba.a }));
          }}
        />
        <input
          type="text"
          className={bad('hex') ? 'dz-bad' : ''}
          value={shown('hex', hex)}
          disabled={disabled}
          aria-label={`${label} HEX`}
          maxLength={9}
          onChange={(e) => input('hex', e.target.value, parseHex)}
        />
      </div>
      <div className="dz-color3">
        <label>
          RGB
          <input
            type="text"
            className={bad('rgb') ? 'dz-bad' : ''}
            value={shown('rgb', `${rgba.r} ${rgba.g} ${rgba.b}`)}
            disabled={disabled}
            aria-label={`${label} RGB`}
            onChange={(e) => input('rgb', e.target.value, (t) => parseRgbText(t, rgba.a))}
          />
        </label>
        <label>
          HSL
          <input
            type="text"
            className={bad('hsl') ? 'dz-bad' : ''}
            value={shown('hsl', `${hsl.h} ${hsl.s}% ${hsl.l}%`)}
            disabled={disabled}
            aria-label={`${label} HSL`}
            onChange={(e) => input('hsl', e.target.value, (t) => parseHslText(t, rgba.a))}
          />
        </label>
        <label>
          Alpha %
          <input
            type="number"
            min={0}
            max={100}
            value={ALPHA(rgba.a)}
            disabled={disabled}
            aria-label={`${label} Transparenz`}
            onChange={(e) =>
              e.target.value !== '' &&
              set(
                path,
                toHex({ ...rgba, a: Math.min(100, Math.max(0, Number(e.target.value))) / 100 }),
              )
            }
          />
        </label>
      </div>
    </Field>
  );
}

/** Lesbarkeits-Hinweis für Text auf Fläche (WCAG: ab 4,5 gut). */
export function ContrastHint({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  const c = contrast(fg.slice(0, 7), bg.slice(0, 7));
  return (
    <p className={c >= 4.5 ? 'muted' : 'dz-warn'} role={c >= 4.5 ? undefined : 'status'}>
      {c >= 4.5 ? '✓' : '⚠️'} {label}: Kontrast {c}:1{' '}
      {c >= 4.5 ? '(gut lesbar)' : '(schwer lesbar – mindestens 4,5:1 empfohlen)'}
    </p>
  );
}
