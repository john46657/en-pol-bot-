import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  findIssues,
  materializeItems,
  moveItem,
  newGroupId,
  normalizeConfig,
  resolveNavigation,
  type DesignConfig,
} from '../src/client.js';

const B = [
  { key: 'overview', label: 'Übersicht', icon: '🏠' },
  { key: 'tickets', label: 'Tickets', icon: '🎫' },
  { key: 'applications', label: 'Bewerbungen', icon: '📋' },
  { key: 'logs', label: 'Logs', icon: '📜' },
  { key: 'design', label: 'Design', icon: '🎨' },
];
const nav = (n: unknown) => normalizeConfig({ navigation: n }).navigation;
const ctx = (over: Partial<Parameters<typeof resolveNavigation>[2]> = {}) => ({
  isAdmin: false,
  roleIds: [] as string[],
  allowed: () => true,
  ...over,
});
const keys = (s: ReturnType<typeof resolveNavigation>) =>
  s.flatMap((x) => x.items.map((i) => i.key));

describe('Normalisierung der Navigation', () => {
  it('Standard: keine Gruppen, keine Einträge', () => {
    expect(DEFAULT_CONFIG.navigation).toEqual({ groups: [], items: [] });
    expect(normalizeConfig(null).navigation).toEqual({ groups: [], items: [] });
  });
  it('bereinigt Gruppen und Einträge, verwirft Ungültiges', () => {
    const n = nav({
      groups: [
        { id: 'support', name: ' Support ', icon: '🎫' },
        { id: 'support', name: 'Doppelt' },
        { id: 'X Y', name: 'Falsche ID' },
        { id: 'leer', name: '  ' },
      ],
      items: [
        {
          key: 'tickets',
          group: 'support',
          title: 'Support-Tickets',
          color: '#ff0000',
          roles: ['123456789012345678', 'kein-id', '123456789012345678'],
        },
        { key: 'tickets' },
        { key: 'logs', group: 'gibt-es-nicht', color: 'rot' },
        { key: 'link-abc', href: 'javascript:alert(1)' },
        { key: 'link-def', href: 'https://example.org/handbuch', title: 'Handbuch' },
        { key: '../evil' },
      ],
    });
    expect(n.groups).toEqual([{ id: 'support', name: 'Support', icon: '🎫', visible: true }]);
    expect(n.items.map((i) => i.key)).toEqual(['tickets', 'logs', 'link-def']);
    expect(n.items[0]).toMatchObject({
      title: 'Support-Tickets',
      group: 'support',
      color: '#FF0000',
      roles: ['123456789012345678'],
    });
    expect(n.items[1]).toMatchObject({ group: '', color: '' });
    expect(n.items[2]).toMatchObject({ href: 'https://example.org/handbuch' });
  });
  it('begrenzt Anzahl', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ key: `seite-${i}` }));
    expect(nav({ items }).items).toHaveLength(80);
    expect(
      nav({ groups: Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, name: `G${i}` })) })
        .groups,
    ).toHaveLength(12);
  });
  it('vollständige Einträge gelten nicht als „ungültig“, Reihenfolge der Schlüssel egal', () => {
    const full = {
      groups: [{ visible: true, icon: '', name: 'A', id: 'a' }],
      items: [
        {
          href: '',
          roles: [],
          badge: '',
          hoverColor: '',
          color: '',
          group: 'a',
          visible: true,
          icon: '',
          title: '',
          key: 'tickets',
        },
      ],
    };
    expect(findIssues({ navigation: full })).toEqual([]);
  });
});

describe('Auflösung', () => {
  it('Standard: alle eingebauten Einträge in ihrer Reihenfolge, ohne Gruppen', () => {
    const s = resolveNavigation(B, DEFAULT_CONFIG.navigation, ctx());
    expect(s).toHaveLength(1);
    expect(s[0]!.group).toBeNull();
    expect(keys(s)).toEqual(['overview', 'tickets', 'applications', 'logs', 'design']);
    expect(s[0]!.items[1]).toMatchObject({ title: 'Tickets', icon: '🎫' });
  });
  it('Reihenfolge, Titel, Icon, Farben, Badge; neue Seiten erscheinen am Ende', () => {
    const n = nav({
      items: [
        {
          key: 'logs',
          title: 'Protokoll',
          icon: '🗒️',
          badge: 'neu',
          color: '#00FF00',
          hoverColor: '#00AA00',
        },
        { key: 'overview' },
      ],
    });
    const s = resolveNavigation(B, n, ctx());
    expect(keys(s)).toEqual(['logs', 'overview', 'tickets', 'applications', 'design']);
    expect(s[0]!.items[0]).toEqual({
      key: 'logs',
      title: 'Protokoll',
      icon: '🗒️',
      color: '#00FF00',
      hoverColor: '#00AA00',
      badge: 'neu',
      href: '',
    });
  });
  it('Gruppen in Reihenfolge; ungruppierte zuerst; versteckte Gruppen und leere Gruppen entfallen', () => {
    const n = nav({
      groups: [
        { id: 'support', name: 'SUPPORT' },
        { id: 'verwaltung', name: 'VERWALTUNG' },
        { id: 'weg', name: 'WEG', visible: false },
        { id: 'leer', name: 'LEER' },
      ],
      items: [
        { key: 'logs', group: 'verwaltung' },
        { key: 'tickets', group: 'support' },
        { key: 'applications', group: 'support' },
        { key: 'design', group: 'weg' },
      ],
    });
    const s = resolveNavigation(B, n, ctx());
    expect(s.map((x) => x.group?.name ?? '–')).toEqual(['–', 'SUPPORT', 'VERWALTUNG']);
    expect(keys(s)).toEqual(['overview', 'tickets', 'applications', 'logs']);
  });
  it('versteckte Einträge und fehlende Rechte blenden aus', () => {
    const n = nav({ items: [{ key: 'tickets', visible: false }] });
    expect(keys(resolveNavigation(B, n, ctx({ allowed: (k) => k !== 'logs' })))).toEqual([
      'overview',
      'applications',
      'design',
    ]);
  });
  it('Rollen: nur Mitglieder der Rolle sehen den Eintrag; Verwalter immer', () => {
    const n = nav({ items: [{ key: 'logs', roles: ['111111111111111111'] }] });
    expect(keys(resolveNavigation(B, n, ctx()))).not.toContain('logs');
    expect(keys(resolveNavigation(B, n, ctx({ roleIds: ['222222222222222222'] })))).not.toContain(
      'logs',
    );
    expect(keys(resolveNavigation(B, n, ctx({ roleIds: ['111111111111111111'] })))).toContain(
      'logs',
    );
    expect(keys(resolveNavigation(B, n, ctx({ isAdmin: true })))).toContain('logs');
  });
  it('angeheftete Einträge bleiben trotz „versteckt“ (kein Aussperren), aber nur mit Recht', () => {
    const n = nav({ items: [{ key: 'design', visible: false, roles: ['111111111111111111'] }] });
    expect(keys(resolveNavigation(B, n, ctx({ pinned: ['design'] })))).toContain('design');
    expect(
      keys(resolveNavigation(B, n, ctx({ pinned: ['design'], allowed: (k) => k !== 'design' }))),
    ).not.toContain('design');
  });
  it('Link-Einträge: eigener Titel, Standard-Icon, ohne Rechte-Prüfung', () => {
    const n = nav({
      items: [{ key: 'link-abc', href: 'https://example.org/h', title: 'Handbuch' }],
    });
    const s = resolveNavigation(B, n, ctx({ allowed: () => false }));
    expect(s[0]!.items).toEqual([
      {
        key: 'link-abc',
        title: 'Handbuch',
        icon: '🔗',
        color: '',
        hoverColor: '',
        badge: '',
        href: 'https://example.org/h',
      },
    ]);
  });
});

describe('Hilfsfunktionen', () => {
  it('materializeItems: bekannte zuerst, unbekannte weg, fehlende angehängt', () => {
    const n = nav({ items: [{ key: 'logs' }, { key: 'gibts-nicht' }, { key: 'tickets' }] });
    expect(materializeItems(B, n).map((i) => i.key)).toEqual(
      ['logs', 'gibts-nicht'.length ? 'tickets' : '', 'overview', 'applications', 'design'].filter(
        Boolean,
      ),
    );
  });
  it('moveItem verschiebt und ignoriert ungültige Positionen', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2], 0, 5)).toEqual([1, 2]);
  });
  it('newGroupId erzeugt gültige, eindeutige IDs', () => {
    expect(newGroupId('Verwaltung & Co.', [])).toBe('verwaltung-co');
    expect(newGroupId('Support', ['support'])).toBe('support-2');
    expect(newGroupId('🎓', [])).toBe('gruppe');
  });
});

describe('Typ', () => {
  it('DesignConfig enthält navigation', () => {
    const c: DesignConfig = DEFAULT_CONFIG;
    expect(c.navigation.groups).toEqual([]);
  });
});
