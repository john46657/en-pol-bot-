import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  backgroundFor,
  backgroundStyle,
  contrast,
  designVars,
  hslToRgb,
  normalizeConfig,
  parseHex,
  parseHslText,
  parseRgbText,
  rgbToHsl,
  toHex,
} from '../src/client.js';

describe('Farben', () => {
  it('HEX ⇄ RGB ⇄ HSL', () => {
    expect(parseHex('#5865F2')).toEqual({ r: 88, g: 101, b: 242, a: 1 });
    expect(toHex({ r: 88, g: 101, b: 242, a: 1 })).toBe('#5865F2');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
    expect(parseHex('#00000080')?.a).toBe(0.5);
    expect(parseHex('rot')).toBeNull();
    expect(rgbToHsl({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToRgb(120, 100, 50)).toMatchObject({ r: 0, g: 255, b: 0 });
    for (const hex of ['#5865F2', '#0B0D10', '#FAA61A', '#FFFFFF']) {
      const c = parseHex(hex)!,
        h = rgbToHsl(c),
        back = hslToRgb(h.h, h.s, h.l);
      expect(
        Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b),
        hex,
      ).toBeLessThanOrEqual(6);
    }
  });
  it('Texteingaben', () => {
    expect(parseRgbText('88 / 101 / 242')).toEqual({ r: 88, g: 101, b: 242, a: 1 });
    expect(parseRgbText('300 0 0')).toBeNull();
    expect(parseHslText('235, 86%, 65%')).not.toBeNull();
    expect(parseHslText('400 0 0')).toBeNull();
  });
  it('Kontrast', () => {
    expect(contrast('#FFFFFF', '#000000')).toBe(21);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});

describe('CSS-Variablen', () => {
  it('Standard ergibt alle erwarteten Variablen mit den Farben des gewählten Modus', () => {
    const v = designVars(DEFAULT_CONFIG, 'dark');
    expect(v['--primary']).toBe('#5865F2');
    expect(v['--bg']).toBe('#0B0D10');
    expect(designVars(DEFAULT_CONFIG, 'light')['--bg']).toBe('#F4F5F7');
    expect(v['--sidebar-w']).toBe('260px');
    expect(v['--dur']).toBe('200ms');
    expect(v['--card-blur']).toBe('none');
  });
  it('Änderungen wirken: Farbe, Glas, Radius je Komponente, Animationen aus', () => {
    const c = normalizeConfig({
      colors: { dark: { primary: '#FF0000' } },
      glass: { enabled: true, blur: 12, opacity: 60 },
      cards: { radius: 4 },
      animation: { disabled: true },
    });
    const v = designVars(c, 'dark');
    expect(v['--primary']).toBe('#FF0000');
    expect(v['--card-blur']).toBe('blur(12px)');
    expect(v['--card-bg']).toContain('60%');
    expect(v['--radius-card']).toBe('4px');
    expect(v['--radius-btn']).toBe('12px'); // ohne eigenen Wert gilt der globale
    expect(v['--dur']).toBe('0ms');
    expect(
      designVars(normalizeConfig({ cards: { glass: false }, glass: { enabled: true } }), 'dark')[
        '--card-blur'
      ],
    ).toBe('none'); // Karte überschreibt global
  });
  it('Upload-Adressen werden über resolveUrl auf die API-Adresse abgebildet', () => {
    const c = normalizeConfig({
      background: {
        global: {
          type: 'image',
          imageUrl: '/uploads/900000000000000001/aaaaaaaaaaaaaaaaaaaaaaaa.webp',
        },
      },
    });
    const l = backgroundStyle(
      c.background.global,
      undefined,
      (u) => `https://api.example${u}`,
    ).layer;
    expect(l['backgroundImage']).toBe(
      'url("https://api.example/uploads/900000000000000001/aaaaaaaaaaaaaaaaaaaaaaaa.webp")',
    );
    expect(backgroundStyle(c.background.global).layer['backgroundImage']).toContain(
      'url("/uploads/',
    );
  });
  it('Hintergründe: Typen, Overlay, seitenspezifisch mit Rückfall auf global', () => {
    const c = normalizeConfig({
      background: {
        global: {
          type: 'gradient',
          color: '#000000',
          color2: '#111111',
          angle: 90,
          overlay: { enabled: true, opacity: 40 },
        },
        pages: { tickets: { type: 'solid', color: '#222222' } },
      },
    });
    expect(backgroundStyle(backgroundFor(c, 'tickets')).layer['background']).toBe('#222222');
    const g = backgroundStyle(backgroundFor(c, 'team'));
    expect(g.layer['background']).toBe('linear-gradient(90deg, #000000, #111111)');
    expect(g.overlay).toEqual({ background: '#000000', opacity: '0.4' });
    expect(
      backgroundStyle(DEFAULT_CONFIG.background.global, DEFAULT_CONFIG.colors.dark.background)
        .layer['background'],
    ).toBe('var(--bg)');
    const img = backgroundStyle(
      normalizeConfig({
        background: {
          global: { type: 'image', imageUrl: 'https://x.de/a b.png', blur: 5, brightness: 80 },
        },
      }).background.global,
    );
    expect(img.layer['backgroundImage']).toBe('url("https://x.de/a%20b.png")');
    expect(img.layer['filter']).toBe('blur(5px) brightness(80%)');
  });
});
