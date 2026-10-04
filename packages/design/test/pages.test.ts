import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  PAGE_TEMPLATES,
  bannersFor,
  ctaTarget,
  filterForViewer,
  findIssues,
  isExpired,
  newPageKey,
  normalizeCta,
  normalizeConfig,
  normalizeLayout,
  overlaps,
  templateWidgets,
  type DesignConfig,
} from '../src/client.js';

const ROLE_A = '111111111111111111';
const ROLE_B = '222222222222222222';
const layout = (l: unknown) => normalizeLayout(l);
const cfg = (l: unknown, nav: unknown = {}): DesignConfig =>
  normalizeConfig({ layout: l, navigation: nav });

describe('Eigene Seiten', () => {
  it('Standard: keine eigenen Seiten und Banner; Übersicht vorhanden', () => {
    expect(DEFAULT_CONFIG.layout.custom).toEqual([]);
    expect(DEFAULT_CONFIG.layout.banners).toEqual([]);
    expect(Object.keys(DEFAULT_CONFIG.layout.pages)).toEqual(['overview']);
  });
  it('bereinigt: ungültige/doppelte Seiten entfallen, jede eigene Seite hat ein Layout, fremde Layout-Schlüssel entfallen', () => {
    const l = layout({
      custom: [
        {
          key: 'page-ausbildung',
          name: ' Ausbildung ',
          icon: '🎓',
          description: 'Übersicht',
          roles: [ROLE_A, 'x'],
        },
        { key: 'page-ausbildung', name: 'Doppelt' },
        { key: 'tickets', name: 'Falscher Schlüssel' },
        { key: 'page-../x', name: 'Böse' },
        { key: 'page-leer', name: '  ' },
      ],
      pages: {
        'page-ausbildung': { widgets: [{ id: 'abcd01', type: 'text' }] },
        'page-gibts-nicht': { widgets: [] },
        tickets: { widgets: [] },
      },
    });
    expect(l.custom).toEqual([
      {
        key: 'page-ausbildung',
        name: 'Ausbildung',
        icon: '🎓',
        description: 'Übersicht',
        roles: [ROLE_A],
      },
    ]);
    expect(Object.keys(l.pages).sort()).toEqual(['overview', 'page-ausbildung']);
    expect(l.pages['page-ausbildung']!.widgets).toHaveLength(1);
  });
  it('Obergrenze von 20 Seiten', () => {
    const custom = Array.from({ length: 40 }, (_, i) => ({ key: `page-s${i}`, name: `S${i}` }));
    expect(layout({ custom }).custom).toHaveLength(20);
  });
  it('vollständige Konfiguration gilt nicht als ungültig', () => {
    const c = cfg({
      custom: [{ key: 'page-a', name: 'A', icon: '', description: '', roles: [] }],
      pages: { 'page-a': { widgets: [] } },
      banners: [],
    });
    expect(findIssues({ layout: c.layout })).toEqual([]);
  });
  it('Buttons zu eigenen Seiten führen auf /p/<adresse>', () => {
    expect(ctaTarget(normalizeCta({ kind: 'page', target: 'page-ausbildung' }), '5')).toEqual({
      href: '/guilds/5/p/ausbildung',
      external: false,
    });
  });
  it('newPageKey: gültig, eindeutig, mit Umlauten', () => {
    expect(newPageKey('Ausbildung', [])).toBe('page-ausbildung');
    expect(newPageKey('Ausbildung', ['page-ausbildung'])).toBe('page-ausbildung-2');
    expect(newPageKey('Übung & Co.', [])).toMatch(/^page-[a-z0-9-]+$/);
    expect(newPageKey('🎓', [])).toBe('page-seite');
  });
});

describe('Seiten-Vorlagen', () => {
  it('jede Vorlage ergibt gültige, überlappungsfreie Widgets; Vorlage „leer“ ist leer', () => {
    expect(templateWidgets('empty', 'ab')).toEqual([]);
    for (const t of PAGE_TEMPLATES) {
      const widgets = templateWidgets(t, 'tpl');
      const l = layout({
        custom: [{ key: 'page-x', name: 'X' }],
        pages: { 'page-x': { widgets } },
      });
      const out = l.pages['page-x']!.widgets;
      expect(out, t).toHaveLength(widgets.length);
      expect(
        out.every((a, i) => out.every((b, j) => i === j || !overlaps(a, b))),
        t,
      ).toBe(true);
      expect(findIssues({ layout: { ...l } }), t).toEqual([]);
      expect(new Set(out.map((w) => w.id)).size, t).toBe(out.length);
    }
  });
  it('Vorlagen-IDs sind je Präfix verschieden', () => {
    const a = templateWidgets('stats', 'aaaa').map((w) => w.id);
    const b = templateWidgets('stats', 'bbbb').map((w) => w.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});

describe('Banner', () => {
  it('bereinigt Felder und Seiten', () => {
    const b = layout({
      banners: [
        {
          id: 'ban001',
          title: ' Wichtig ',
          body: 'a\nb',
          image: 'javascript:x',
          cta: { kind: 'url', target: 'https://example.org' },
          pages: ['*', 'tickets', '../x'],
          expires: '2026-12-31',
          size: 'riesig',
          roles: [ROLE_A],
        },
        { id: 'ban001' },
        { id: '../x' },
        { title: 'ohne id' },
      ],
    }).banners;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({
      title: 'Wichtig',
      body: 'a\nb',
      image: '',
      size: 'medium',
      pages: ['*', 'tickets'],
      expires: '2026-12-31',
      roles: [ROLE_A],
      visible: true,
    });
    expect(b[0]!.cta.target).toBe('https://example.org/');
  });
  it('höchstens 10 Banner; ohne Seiten gilt „alle“', () => {
    expect(
      layout({
        banners: Array.from({ length: 30 }, (_, i) => ({ id: `ban${String(i).padStart(3, '0')}` })),
      }).banners,
    ).toHaveLength(10);
    expect(layout({ banners: [{ id: 'ban001', pages: [] }] }).banners[0]!.pages).toEqual(['*']);
  });
  it('bannersFor: Seite, Sichtbarkeit, Ablauf, leere Banner, höchstens drei', () => {
    const mk = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'T', ...over });
    const all = layout({
      banners: [
        mk('ban001'),
        mk('ban002', { pages: ['tickets'] }),
        mk('ban003', { visible: false }),
        mk('ban004', { expires: '2026-01-01' }),
        mk('ban005', { title: '', body: '' }),
        mk('ban006'),
        mk('ban007'),
        mk('ban008'),
      ],
    }).banners;
    const expired = (d: string) => isExpired(d, new Date('2026-10-04T10:00:00Z'));
    expect(bannersFor(all, 'overview', expired).map((b) => b.id)).toEqual([
      'ban001',
      'ban006',
      'ban007',
    ]);
    expect(bannersFor(all, 'tickets', expired).map((b) => b.id)).toEqual([
      'ban001',
      'ban002',
      'ban006',
    ]);
  });
});

describe('Sichtweise je Benutzer (serverseitig)', () => {
  const c = cfg(
    {
      custom: [
        { key: 'page-intern', name: 'Intern', roles: [ROLE_A] },
        { key: 'page-offen', name: 'Offen' },
      ],
      pages: {
        overview: {
          widgets: [
            { id: 'aaaa01', type: 'text' },
            { id: 'aaaa02', type: 'text', roles: [ROLE_B] },
          ],
        },
        'page-intern': { widgets: [{ id: 'bbbb01', type: 'text' }] },
        'page-offen': { widgets: [{ id: 'cccc01', type: 'text' }] },
      },
      banners: [
        { id: 'ban001', pages: ['*'], roles: [ROLE_A] },
        { id: 'ban002', pages: ['page-intern', 'overview'] },
        { id: 'ban003', pages: ['page-intern'] },
      ],
    },
    { items: [{ key: 'page-intern' }, { key: 'tickets', roles: [ROLE_B] }, { key: 'logs' }] },
  );
  it('Verwalter sieht alles (unverändert)', () => {
    expect(filterForViewer(c, { isAdmin: true, roleIds: [] })).toBe(c);
  });
  it('ohne Rollen: eingeschränkte Seiten, Widgets, Banner und Menüeinträge sind nicht mehr enthalten', () => {
    const v = filterForViewer(c, { isAdmin: false, roleIds: [] });
    expect(v.layout.custom.map((p) => p.key)).toEqual(['page-offen']);
    expect(Object.keys(v.layout.pages).sort()).toEqual(['overview', 'page-offen']);
    expect(v.layout.pages['overview']!.widgets.map((w) => w.id)).toEqual(['aaaa01']);
    expect(v.layout.banners.map((b) => b.id)).toEqual(['ban002']);
    expect(v.layout.banners[0]!.pages).toEqual(['overview']); // Verweis auf versteckte Seite entfernt
    expect(v.navigation.items.map((i) => i.key)).toEqual(['logs']);
    expect(JSON.stringify(v)).not.toContain('bbbb01'); // Inhalt der versteckten Seite ist nicht im Ergebnis
    expect(JSON.stringify(v)).not.toContain('Intern');
  });
  it('mit Rolle A sieht man die interne Seite, mit Rolle B das eingeschränkte Widget', () => {
    const a = filterForViewer(c, { isAdmin: false, roleIds: [ROLE_A] });
    expect(a.layout.custom.map((p) => p.key)).toEqual(['page-intern', 'page-offen']);
    expect(a.layout.banners.map((b) => b.id)).toEqual(['ban001', 'ban002', 'ban003']);
    const b = filterForViewer(c, { isAdmin: false, roleIds: [ROLE_B] });
    expect(b.layout.pages['overview']!.widgets).toHaveLength(2);
    expect(b.navigation.items.map((i) => i.key)).toEqual(['tickets', 'logs']);
  });
  it('verändert die Eingabe nicht', () => {
    const before = JSON.stringify(c);
    filterForViewer(c, { isAdmin: false, roleIds: [] });
    expect(JSON.stringify(c)).toBe(before);
  });
});
