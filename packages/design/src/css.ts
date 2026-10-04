import type { Background, DesignConfig } from './config.js';

/** Übersetzt die Konfiguration in CSS-Variablen – die einzige Stelle, an der Design-Werte zu CSS werden. */
const SHADOWS = {
  none: 'none',
  small: '0 1px 3px #00000040',
  medium: '0 4px 12px #00000050',
  large: '0 12px 32px #00000066',
} as const;
export const shadowValue = (preset: keyof typeof SHADOWS | 'custom', custom: string): string =>
  preset === 'custom' ? custom || SHADOWS.small : SHADOWS[preset];

const FONT_STACK: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  Inter: 'Inter, system-ui, sans-serif',
  Roboto: 'Roboto, system-ui, sans-serif',
  Poppins: 'Poppins, system-ui, sans-serif',
  'Open Sans': '"Open Sans", system-ui, sans-serif',
};
const SPEED = { slow: 400, normal: 200, fast: 100 } as const;

export function designVars(c: DesignConfig, mode: 'dark' | 'light'): Record<string, string> {
  const p = c.colors[mode];
  const glass = c.glass.enabled;
  const cardGlass = c.cards.glass ?? glass;
  const dur = c.animation.disabled ? 0 : SPEED[c.animation.speed];
  const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  return {
    '--bg': p.background,
    '--fg': p.textPrimary,
    '--muted': p.textSecondary,
    '--panel': p.surface,
    '--panel-hover': p.surfaceHover,
    '--line': p.border,
    '--primary': p.primary,
    '--primary-hover': p.primaryHover,
    '--secondary': p.secondary,
    '--side': p.sidebar,
    '--header-bg': p.header,
    '--ok': p.success,
    '--bad': p.warning,
    '--err': p.danger,
    '--info': p.info,
    '--font-main': FONT_STACK[c.typography.fontMain] ?? FONT_STACK['system']!,
    '--font-heading': FONT_STACK[c.typography.fontHeading] ?? FONT_STACK['system']!,
    '--h1-size': `${c.typography.h1.size}px`,
    '--h1-weight': String(c.typography.h1.weight),
    '--h2-size': `${c.typography.h2.size}px`,
    '--h2-weight': String(c.typography.h2.weight),
    '--body-size': `${c.typography.body.size}px`,
    '--body-weight': String(c.typography.body.weight),
    '--body-line': String(c.typography.body.lineHeight),
    '--body-letter': `${c.typography.body.letterSpacing / 10}px`,
    '--radius': `${c.radius}px`,
    '--radius-card': `${c.cards.radius ?? c.radius}px`,
    '--radius-btn': `${c.buttons.radius ?? c.radius}px`,
    '--shadow': shadowValue(c.shadow.preset, c.shadow.custom),
    '--shadow-card': shadowValue(c.cards.shadow ?? c.shadow.preset, c.shadow.custom),
    '--shadow-btn': shadowValue(c.buttons.shadow ?? 'none', c.shadow.custom),
    '--card-border': `${c.cards.border}px`,
    '--card-bg': cardGlass ? mix(p.surface, c.glass.opacity) : p.surface,
    '--card-blur': cardGlass ? `blur(${c.glass.blur}px)` : 'none',
    '--card-line': cardGlass
      ? `color-mix(in srgb, #ffffff ${c.glass.borderOpacity}%, transparent)`
      : p.border,
    '--sidebar-w': `${c.sidebar.width}px`,
    '--sidebar-border': `${c.sidebar.border}px`,
    '--sidebar-radius': `${c.sidebar.radius}px`,
    '--sidebar-bg':
      c.sidebar.style === 'transparent'
        ? 'transparent'
        : c.sidebar.style === 'glass'
          ? mix(p.sidebar, c.glass.opacity)
          : p.sidebar,
    '--sidebar-blur': c.sidebar.style === 'glass' ? `blur(${c.glass.blur}px)` : 'none',
    '--header-h': `${c.header.height}px`,
    '--header-border': `${c.header.border}px`,
    '--header-bg-mixed': c.header.opacity >= 100 ? p.header : mix(p.header, c.header.opacity),
    '--header-blur': c.header.blur > 0 ? `blur(${c.header.blur}px)` : 'none',
    '--dur': `${dur}ms`,
  };
}

/** Gradient-/Bild-Hintergrund als Inline-Stil der Hintergrundebene; Overlay getrennt. */
/**
 * `followColor`: ist die Volltonfarbe gleich der Dark-Hintergrundfarbe der Palette, folgt sie dem Modus (`var(--bg)`),
 * sonst würde der Light-Modus mit dunklem Hintergrund starten.
 */
export function backgroundStyle(
  b: Background,
  followColor?: string,
): {
  layer: Record<string, string>;
  overlay: Record<string, string> | null;
} {
  const layer: Record<string, string> = { opacity: String(b.opacity / 100) };
  const filters = [
    b.blur > 0 ? `blur(${b.blur}px)` : '',
    b.brightness !== 100 ? `brightness(${b.brightness}%)` : '',
  ].filter(Boolean);
  if (filters.length) layer['filter'] = filters.join(' ');
  if (b.type === 'solid')
    layer['background'] =
      followColor !== undefined && b.color === followColor ? 'var(--bg)' : b.color;
  else if (b.type === 'gradient')
    layer['background'] = `linear-gradient(${b.angle}deg, ${b.color}, ${b.color2})`;
  else {
    layer['backgroundColor'] = b.color;
    if (b.imageUrl) {
      layer['backgroundImage'] = `url("${b.imageUrl.replace(/["\\()\s]/g, encodeURIComponent)}")`;
      layer['backgroundPosition'] = b.position;
      layer['backgroundSize'] = b.size;
      layer['backgroundRepeat'] = 'no-repeat';
    }
  }
  const overlay = b.overlay.enabled
    ? { background: b.overlay.color, opacity: String(b.overlay.opacity / 100) }
    : null;
  return { layer, overlay };
}
/** Hintergrund einer Seite: eigener, sonst der globale. */
export const backgroundFor = (c: DesignConfig, page: string): Background =>
  c.background.pages[page] ?? c.background.global;
