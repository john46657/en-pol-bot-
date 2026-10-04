import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  GRID_COLS,
  MAX_WIDGETS,
  addWidget,
  compact,
  createWidget,
  ctaTarget,
  defaultLayout,
  duplicateWidget,
  findIssues,
  isExpired,
  normalizeCta,
  normalizeConfig,
  normalizeLayout,
  normalizeWidget,
  overlaps,
  parseInline,
  parseRichText,
  placeWidget,
  resolveOverlaps,
  type Widget,
} from '../src/client.js';

const w = (id: string, x: number, y: number, ww = 3, h = 2): Widget => ({
  ...createWidget('text', []),
  id,
  x,
  y,
  w: ww,
  h,
});
const noOverlap = (list: readonly Widget[]) =>
  list.every((a, i) => list.every((b, j) => i === j || !overlaps(a, b)));

describe('Standard-Layout', () => {
  it('Übersicht mit Standard-Widgets, ohne Überlappung, im Raster', () => {
    const l = defaultLayout().pages['overview']!.widgets;
    expect(l.length).toBeGreaterThanOrEqual(6);
    expect(noOverlap(l)).toBe(true);
    expect(l.every((x) => x.x >= 1 && x.x + x.w - 1 <= GRID_COLS)).toBe(true);
    expect(DEFAULT_CONFIG.layout).toEqual(defaultLayout());
  });
  it('fehlt `layout` (ältere Themes), gilt der Standard; leere Übersicht bleibt leer', () => {
    expect(normalizeConfig({}).layout).toEqual(defaultLayout());
    expect(
      normalizeLayout({ pages: { overview: { widgets: [] } } }).pages['overview']!.widgets,
    ).toEqual([]);
  });
});

describe('Normalisierung', () => {
  it('verwirft Ungültiges, begrenzt Größen/Positionen, ergänzt Standard-Props', () => {
    const n = normalizeWidget({
      id: 'abc123',
      type: 'stat',
      x: 99,
      y: -5,
      w: 99,
      h: 0,
      props: { metric: 'gibts-nicht' },
      roles: ['123456789012345678', 'x'],
    })!;
    expect(n).toMatchObject({ x: 1, y: 1, w: 12, h: 1, roles: ['123456789012345678'] });
    expect(n.props).toEqual({ metric: 'openTickets', description: '', trend: '' });
    expect(normalizeWidget({ id: 'abc123', type: 'bösartig' })).toBeNull();
    expect(normalizeWidget({ id: '../x', type: 'text' })).toBeNull();
  });
  it('Spalten laufen nie über den Rand (x + w ≤ 13)', () => {
    const n = normalizeWidget({ id: 'abc123', type: 'text', x: 11, w: 6 })!;
    expect(n.x + n.w - 1).toBeLessThanOrEqual(GRID_COLS);
  });
  it('Seiten: doppelte IDs entfallen, Überlappungen werden aufgelöst, Begrenzung der Anzahl', () => {
    const page = normalizeLayout({
      pages: {
        tickets: {
          widgets: [
            { id: 'aaaa11', type: 'text', x: 1, y: 1 },
            { id: 'aaaa11', type: 'text' },
            { id: 'bbbb22', type: 'text', x: 1, y: 1 },
          ],
        },
      },
    }).pages['tickets']!;
    expect(page.widgets).toHaveLength(2);
    expect(noOverlap(page.widgets)).toBe(true);
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `w${String(i).padStart(4, '0')}`,
      type: 'text',
      y: i + 1,
    }));
    expect(normalizeLayout({ pages: { x: { widgets: many } } }).pages['x']!.widgets).toHaveLength(
      MAX_WIDGETS,
    );
    expect(
      Object.keys(
        normalizeLayout({ pages: { '../x': { widgets: [] }, ok: { widgets: [] } } }).pages,
      ),
    ).toEqual(['ok', 'overview']);
  });
  it('vollständige Widgets gelten nicht als „ungültig“', () => {
    const full = defaultLayout();
    expect(findIssues({ layout: full })).toEqual([]);
  });
  it('Props je Typ: Bild nur https, Banner-Datum, Text begrenzt', () => {
    const img = normalizeWidget({
      id: 'img001',
      type: 'image',
      props: { src: 'javascript:alert(1)', fit: 'x' },
    })!;
    expect(img.props).toMatchObject({ src: '', fit: 'cover' });
    expect(
      normalizeWidget({ id: 'img001', type: 'image', props: { src: 'https://example.org/a.png' } })!
        .props['src'],
    ).toBe('https://example.org/a.png');
    expect(
      normalizeWidget({ id: 'ban001', type: 'banner', props: { expires: '2026-12-31' } })!.props[
        'expires'
      ],
    ).toBe('2026-12-31');
    expect(
      normalizeWidget({ id: 'ban001', type: 'banner', props: { expires: 'morgen' } })!.props[
        'expires'
      ],
    ).toBe('');
    expect(
      (
        normalizeWidget({ id: 'txt001', type: 'text', props: { body: 'x'.repeat(5000) } })!.props[
          'body'
        ] as string
      ).length,
    ).toBe(2000);
  });
});

describe('Aktions-Buttons', () => {
  it('prüft Ziele je Art; ungültige Ziele werden geleert', () => {
    expect(
      normalizeCta({ kind: 'url', target: 'https://example.org/x', text: 'Öffnen' }),
    ).toMatchObject({ kind: 'url', target: 'https://example.org/x' });
    for (const bad of ['javascript:alert(1)', 'http://example.org', 'data:text/html,x'])
      expect(normalizeCta({ kind: 'url', target: bad }).target, bad).toBe('');
    expect(normalizeCta({ kind: 'discord', target: 'https://discord.gg/abc' }).kind).toBe(
      'discord',
    );
    expect(
      normalizeCta({ kind: 'discord', target: 'https://evil.example/discord.gg' }).target,
    ).toBe('');
    expect(normalizeCta({ kind: 'page', target: 'tickets' }).kind).toBe('page');
    expect(normalizeCta({ kind: 'page', target: '../etc' }).target).toBe('');
    expect(normalizeCta({ kind: 'ticket', target: 'https://x.de' }).target).toBe('');
    expect(normalizeCta({ kind: 'modal' }).kind).toBe('none');
    // Ungültiges Ziel → kein Button, aber die gewählte Art bleibt (Tippen im Editor)
    expect(ctaTarget(normalizeCta({ kind: 'url', target: 'javascript:alert(1)' }), '1')).toBeNull();
    expect(normalizeCta({ kind: 'url', target: 'h' }).kind).toBe('url');
  });
  it('Farben/Rundung/Rahmen/Schatten werden geprüft', () => {
    expect(
      normalizeCta({
        color: 'rot',
        hoverColor: '#ff0000',
        radius: 999,
        border: 9,
        shadow: 'riesig',
      }),
    ).toMatchObject({ color: '', hoverColor: '#FF0000', radius: 48, border: 4, shadow: 'none' });
  });
  it('ctaTarget: intern über Router, extern in neuem Tab', () => {
    expect(ctaTarget(normalizeCta({ kind: 'page', target: 'overview' }), '1')).toEqual({
      href: '/guilds/1/',
      external: false,
    });
    expect(ctaTarget(normalizeCta({ kind: 'page', target: 'tickets' }), '1')).toEqual({
      href: '/guilds/1/tickets',
      external: false,
    });
    expect(ctaTarget(normalizeCta({ kind: 'ticket' }), '1')).toEqual({
      href: '/guilds/1/tickets',
      external: false,
    });
    expect(ctaTarget(normalizeCta({ kind: 'application' }), '1')).toEqual({
      href: '/guilds/1/applications',
      external: false,
    });
    expect(ctaTarget(normalizeCta({ kind: 'url', target: 'https://example.org' }), '1')).toEqual({
      href: 'https://example.org/',
      external: true,
    });
    expect(ctaTarget(normalizeCta({}), '1')).toBeNull();
  });
});

describe('Raster', () => {
  it('Verschieben: andere weichen nach unten aus, nichts überlappt, das bewegte Widget bleibt', () => {
    const list = [w('aaaa11', 1, 1), w('bbbb22', 4, 1), w('cccc33', 1, 3)];
    const moved = placeWidget(list, 'aaaa11', { x: 4, y: 1 });
    expect(noOverlap(moved)).toBe(true);
    expect(moved.find((x) => x.id === 'aaaa11')).toMatchObject({ x: 4, y: 1 });
    expect(moved.find((x) => x.id === 'bbbb22')!.y).toBeGreaterThanOrEqual(3);
  });
  it('Vergrößern verdrängt Nachbarn; Größe wird begrenzt', () => {
    const list = [w('aaaa11', 1, 1), w('bbbb22', 4, 1)];
    const big = placeWidget(list, 'aaaa11', { w: 8, h: 3 });
    expect(big.find((x) => x.id === 'aaaa11')).toMatchObject({ w: 8, h: 3 });
    expect(noOverlap(big)).toBe(true);
    expect(
      placeWidget(list, 'aaaa11', { w: 99, h: 99 }).find((x) => x.id === 'aaaa11'),
    ).toMatchObject({ w: 12, h: 12 });
    expect(placeWidget(list, 'aaaa11', { x: 12, w: 4 }).find((x) => x.id === 'aaaa11')!.x).toBe(9);
    expect(placeWidget(list, 'gibts-nicht', { x: 2 })).toEqual(list);
  });
  it('Aufräumen zieht nach oben, ohne Überlappung und ohne Reihenfolge zu vertauschen', () => {
    const c = compact([w('aaaa11', 1, 5), w('bbbb22', 4, 9), w('cccc33', 1, 12)]);
    expect(c.map((x) => [x.id, x.y])).toEqual([
      ['aaaa11', 1],
      ['bbbb22', 1],
      ['cccc33', 3],
    ]);
    expect(noOverlap(c)).toBe(true);
  });
  it('Hinzufügen unten, Duplizieren mit neuer ID unter dem Original, Obergrenze', () => {
    const list = [w('aaaa11', 1, 1), w('bbbb22', 1, 3, 12, 2)];
    const added = addWidget(
      list,
      createWidget(
        'stat',
        list.map((x) => x.id),
      ),
    );
    expect(added[2]).toMatchObject({ x: 1, y: 5 });
    const dup = duplicateWidget(list, 'aaaa11');
    expect(dup).toHaveLength(3);
    expect(new Set(dup.map((x) => x.id)).size).toBe(3);
    expect(noOverlap(dup)).toBe(true);
    const full = Array.from({ length: MAX_WIDGETS }, (_, i) =>
      w(`w${String(i).padStart(4, '0')}`, 1, i * 2 + 1),
    );
    expect(duplicateWidget(full, full[0]!.id)).toHaveLength(MAX_WIDGETS);
  });
  it('resolveOverlaps ist idempotent', () => {
    const once = resolveOverlaps([w('aaaa11', 1, 1), w('bbbb22', 1, 1), w('cccc33', 2, 1)]);
    expect(resolveOverlaps(once)).toEqual(once);
  });
});

describe('Mehrzeilige Texte', () => {
  it('Zeilenumbrüche bleiben erhalten, andere Steuerzeichen nicht', () => {
    const w = normalizeWidget({
      id: 'txt001',
      type: 'text',
      props: { body: 'a\r\nb\n\u0007c\u0000d' },
    })!;
    expect(w.props['body']).toBe('a\nb\ncd');
    expect(parseRichText(w.props['body'] as string).map((b) => b.t)).toEqual(['p', 'p', 'p']);
    expect(
      normalizeWidget({ id: 'ban001', type: 'banner', props: { body: 'x\ny' } })!.props['body'],
    ).toBe('x\ny');
  });
});

describe('Text-Formatierung', () => {
  it('Überschrift, Liste, fett, kursiv, Link', () => {
    const b = parseRichText(
      '# Titel\nText mit **fett** und *kursiv* und [Link](https://example.org/x).\n- eins\n- **zwei**\n\nEnde',
    );
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'p']);
    expect(b[0]).toMatchObject({ t: 'h', level: 1 });
    expect((b[2] as { items: unknown[] }).items).toHaveLength(2);
    const p = (b[1] as { inline: { t: string }[] }).inline.map((x) => x.t);
    expect(p).toEqual(['text', 'b', 'text', 'i', 'text', 'a', 'text']);
  });
  it('erzeugt nie HTML: Tags bleiben Text, unsichere Links bleiben Text', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { t: 'text', s: '<script>alert(1)</script>' },
    ]);
    const js = parseInline('[x](javascript:alert(1))');
    expect(js.every((n) => n.t === 'text')).toBe(true); // nie ein Link
    expect(js.map((n) => (n as { s: string }).s).join('')).toBe('[x](javascript:alert(1))');
    expect(parseInline('[x](http://example.org)')[0]).toMatchObject({ t: 'text' });
    expect(parseInline('[x](https://example.org)')[0]).toMatchObject({
      t: 'a',
      href: 'https://example.org/',
    });
  });
});

describe('Banner-Ablauf', () => {
  it('gilt bis Ende des Tages (Berliner Datum)', () => {
    expect(isExpired('', new Date('2026-10-04T10:00:00Z'))).toBe(false);
    expect(isExpired('2026-10-04', new Date('2026-10-04T21:00:00Z'))).toBe(false);
    expect(isExpired('2026-10-04', new Date('2026-10-04T22:30:00Z'))).toBe(true); // 05.10. 00:30 in Berlin
  });
});
