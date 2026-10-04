import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  DesignError,
  PRESETS,
  activateTheme,
  changedPaths,
  createTheme,
  deleteTheme,
  duplicateTheme,
  exportTheme,
  findIssues,
  getDesign,
  getEffective,
  importTheme,
  listVersions,
  mergeDeep,
  normalizeConfig,
  previewImport,
  resetAll,
  resetPath,
  resolveConfig,
  restoreVersion,
  safeUrl,
  setOverrides,
  summarizeChange,
  updateTheme,
} from '../src/index.js';

const [A, B] = ['designtest-a', 'designtest-b'];
const ACTOR = '900000000000990001';
const err = (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toSatisfy((e) => e instanceof DesignError && e.code === code);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  for (const id of [A, B])
    await prisma.guild.create({ data: { id, name: id, settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

describe('Normalisierung (wirft nie)', () => {
  it('liefert bei Müll den Standard', () => {
    for (const bad of [
      null,
      undefined,
      5,
      'x',
      [],
      { colors: 7 },
      { colors: { dark: { primary: 'rot' } } },
    ])
      expect(normalizeConfig(bad)).toEqual(DEFAULT_CONFIG);
  });
  it('übernimmt gültige Einzelwerte und begrenzt Zahlen', () => {
    const c = normalizeConfig({
      colors: { dark: { primary: '#ff0000' } },
      sidebar: { width: 9999 },
      radius: -4,
      typography: { h1: { weight: 650 } },
    });
    expect(c.colors.dark.primary).toBe('#FF0000');
    expect(c.colors.dark.surface).toBe(DEFAULT_CONFIG.colors.dark.surface);
    expect(c.sidebar.width).toBe(400);
    expect(c.radius).toBe(0);
    expect(c.typography.h1.weight).toBe(700);
  });
  it('alle 15 Farben sind vorhanden, Dark und Light unabhängig', () => {
    const c = normalizeConfig({
      colors: { dark: { primary: '#111111' }, light: { primary: '#EEEEEE' } },
    });
    expect(Object.keys(c.colors.dark)).toHaveLength(15);
    expect(c.colors.dark.primary).toBe('#111111');
    expect(c.colors.light.primary).toBe('#EEEEEE');
  });
  it('URLs: nur https und lokale Uploads', () => {
    expect(safeUrl('https://example.org/a.png')).toBe('https://example.org/a.png');
    expect(safeUrl('/uploads/g1/bg.webp')).toBe('/uploads/g1/bg.webp');
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AA',
      'http://x.de/a.png',
      '//evil.de/a',
      '/uploads/../etc/passwd',
      'https://u:p@x.de/a',
    ])
      expect(safeUrl(bad), bad).toBe('');
  });
  it('Seitenhintergründe: nur gültige Schlüssel; fehlende erben den globalen', () => {
    const c = normalizeConfig({
      background: {
        global: { color: '#123456' },
        pages: { tickets: { type: 'gradient' }, '../x': { type: 'image' } },
      },
    });
    expect(Object.keys(c.background.pages)).toEqual(['tickets']);
    expect(c.background.pages['tickets']).toMatchObject({ type: 'gradient', color: '#123456' });
  });
  it('eigener Schatten wird gegen CSS-Injektion geprüft', () => {
    expect(normalizeConfig({ shadow: { custom: '0 4px 12px #00000055' } }).shadow.custom).toBe(
      '0 4px 12px #00000055',
    );
    expect(
      normalizeConfig({ shadow: { custom: '0 0 0 red; background:url(x)' } }).shadow.custom,
    ).toBe('');
  });
  it('findIssues nennt ungültige Pfade, ignoriert unbekannte Schlüssel nicht still', () => {
    expect(findIssues({ colors: { dark: { primary: 'blau' } } })).toEqual(['colors.dark.primary']);
    expect(findIssues({ radius: 12 })).toEqual([]);
    expect(findIssues({ sidebar: { width: 5000 } })).toEqual(['sidebar.width']);
  });
});

describe('Vorrang Custom > Theme > Standard', () => {
  it('mergeDeep/resolveConfig ersetzen nur gesetzte Werte', () => {
    const theme = normalizeConfig({ colors: { dark: { primary: '#00AA00', surface: '#101010' } } });
    const c = resolveConfig(theme, { colors: { dark: { primary: '#AA0000' } } });
    expect(c.colors.dark.primary).toBe('#AA0000');
    expect(c.colors.dark.surface).toBe('#101010');
    expect(mergeDeep({ a: { b: 1, c: 2 } }, { a: { b: 9 } })).toEqual({ a: { b: 9, c: 2 } });
  });
  it('changedPaths/summarizeChange', () => {
    const a = DEFAULT_CONFIG,
      b = normalizeConfig({ colors: { dark: { primary: '#000001' } }, radius: 8 });
    expect(changedPaths(a, b)).toEqual(['colors.dark.primary', 'radius']);
    expect(summarizeChange(a, b)).toContain('Farben: dark.primary');
    expect(summarizeChange(a, a)).toBe('Keine Änderung');
  });
});

describe('Themes je Server', () => {
  it('legt die fünf Vorlagen an, „Standard“ ist aktiv', async () => {
    const d = await getDesign(A);
    expect(d.themes.map((t) => t.name).sort()).toEqual(PRESETS.map((p) => p.name).sort());
    expect(d.themes.find((t) => t.id === d.activeThemeId)?.name).toBe('Standard');
    expect(d.effective.source).toBe('theme');
    expect((await getDesign(A)).themes).toHaveLength(5); // idempotent
  });
  it('Servertrennung: Server B sieht und ändert nichts von Server A', async () => {
    const t = await createTheme({
      guildId: A,
      actorId: ACTOR,
      name: 'Nur A',
      config: { colors: { dark: { primary: '#123456' } } },
    });
    await activateTheme(A, t.id, ACTOR);
    expect((await getEffective(A)).config.colors.dark.primary).toBe('#123456');
    expect((await getEffective(B)).config.colors.dark.primary).toBe(
      DEFAULT_CONFIG.colors.dark.primary,
    );
    expect((await getDesign(B)).themes.map((x) => x.name)).not.toContain('Nur A');
    await err(activateTheme(B, t.id, ACTOR), 'not-found');
    await err(
      updateTheme({ guildId: B, themeId: t.id, actorId: ACTOR, name: 'Hack' }),
      'not-found',
    );
    await err(deleteTheme(B, t.id, ACTOR), 'not-found');
    await err(exportTheme(B, t.id), 'not-found');
    await err(listVersions(B, t.id), 'not-found');
  });
  it('erstellen: Name prüfen, eindeutig, Version 1', async () => {
    await err(createTheme({ guildId: A, actorId: ACTOR, name: 'x' }), 'invalid');
    const t = await createTheme({
      guildId: A,
      actorId: ACTOR,
      name: 'My Server Theme',
      description: 'Eigenes Design',
    });
    expect(t.version).toBe(1);
    await err(createTheme({ guildId: A, actorId: ACTOR, name: 'my server theme' }), 'conflict');
    await err(
      createTheme({
        guildId: A,
        actorId: ACTOR,
        name: 'Kaputt',
        config: { colors: { dark: { primary: 'nope' } } },
      }),
      'invalid',
    );
  });
  it('duplizieren zählt „Copy“ hoch, ohne das Original zu ändern', async () => {
    const d = await getDesign(A);
    const purple = d.themes.find((t) => t.name === 'Purple')!;
    const c1 = await duplicateTheme(A, purple.id, ACTOR);
    const c2 = await duplicateTheme(A, purple.id, ACTOR);
    expect([c1.name, c2.name]).toEqual(['Purple Copy', 'Purple Copy 2']);
    expect(c1.builtin).toBe(false);
  });
  it('Vorlagen sind schreibgeschützt und nicht löschbar; aktives Theme nicht löschbar', async () => {
    const d = await getDesign(A);
    const std = d.themes.find((t) => t.name === 'Standard')!;
    await err(
      updateTheme({ guildId: A, themeId: std.id, actorId: ACTOR, config: { radius: 4 } }),
      'conflict',
    );
    await err(deleteTheme(A, std.id, ACTOR), 'conflict');
    const c = await duplicateTheme(A, std.id, ACTOR);
    await activateTheme(A, c.id, ACTOR);
    await err(deleteTheme(A, c.id, ACTOR), 'conflict');
    await activateTheme(A, std.id, ACTOR); // vorheriges bleibt erhalten
    await deleteTheme(A, c.id, ACTOR);
  });
  it('Änderungen erzeugen Versionen mit Zusammenfassung; Wiederherstellen', async () => {
    const t = await createTheme({ guildId: A, actorId: ACTOR, name: 'Verlauf' });
    const t2 = await updateTheme({
      guildId: A,
      themeId: t.id,
      actorId: ACTOR,
      config: { colors: { dark: { primary: '#0000FF' } } },
    });
    expect(t2.version).toBe(2);
    const same = await updateTheme({
      guildId: A,
      themeId: t.id,
      actorId: ACTOR,
      config: t2.config,
    });
    expect(same.version).toBe(2); // keine Änderung → keine neue Version
    await updateTheme({
      guildId: A,
      themeId: t.id,
      actorId: ACTOR,
      config: { colors: { dark: { primary: '#00FF00' } } },
    });
    const v = await listVersions(A, t.id);
    expect(v.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(v[1]!.changeSummary).toContain('Farben');
    const back = await restoreVersion(A, t.id, 2, ACTOR);
    expect(back.version).toBe(4);
    expect(normalizeConfig(back.config).colors.dark.primary).toBe('#0000FF');
    expect((await listVersions(A, t.id))[0]!.changeSummary).toBe('Version 2 wiederhergestellt');
    await err(restoreVersion(A, t.id, 99, ACTOR), 'not-found');
  });
  it('Audit-Log: jede Änderung nachvollziehbar', async () => {
    const t = await createTheme({ guildId: A, actorId: ACTOR, name: 'Audit' });
    await updateTheme({ guildId: A, themeId: t.id, actorId: ACTOR, config: { radius: 4 } });
    await activateTheme(A, t.id, ACTOR);
    const rows = await prisma.auditLog.findMany({
      where: { guildId: A, action: { startsWith: 'design.' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual([
      'design.theme.created',
      'design.theme.updated',
      'design.theme.activated',
    ]);
    expect(rows.every((r) => r.actorId === ACTOR)).toBe(true);
  });
});

describe('Überschreibungen, Zurücksetzen, Fallback', () => {
  it('Server-Überschreibung wirkt über dem Theme; Einzelwert und alles zurücksetzbar', async () => {
    await setOverrides({
      guildId: A,
      actorId: ACTOR,
      overrides: { colors: { dark: { primary: '#ABCDEF' } }, radius: 20 },
    });
    let e = await getEffective(A);
    expect(e.config.colors.dark.primary).toBe('#ABCDEF');
    expect(e.config.radius).toBe(20);
    e = await resetPath(A, 'colors.dark.primary', ACTOR);
    expect(e.config.colors.dark.primary).toBe(DEFAULT_CONFIG.colors.dark.primary);
    expect(e.config.radius).toBe(20);
    await err(resetPath(A, 'colors..x', ACTOR), 'invalid');
    e = await resetAll(A, ACTOR);
    expect(e.config.radius).toBe(DEFAULT_CONFIG.radius);
    await err(
      setOverrides({ guildId: A, actorId: ACTOR, overrides: { radius: 'viel' } }),
      'invalid',
    );
  });
  it('beschädigte Theme-Daten → zuletzt funktionierende Konfiguration, dann Standard', async () => {
    const t = await createTheme({
      guildId: A,
      actorId: ACTOR,
      name: 'Wackelig',
      config: { colors: { dark: { primary: '#445566' } } },
    });
    await activateTheme(A, t.id, ACTOR);
    expect((await getEffective(A)).config.colors.dark.primary).toBe('#445566'); // merkt sich lastGood
    await prisma.dashboardTheme.update({
      where: { id: t.id },
      data: { config: { colors: 'kaputt', sidebar: { width: -1 } } },
    });
    const e = await getEffective(A);
    expect(e.source).toBe('last-good');
    expect(e.config.colors.dark.primary).toBe('#445566');
    await prisma.dashboardSettings.update({
      where: { guildId: A },
      data: { lastGood: { colors: null } },
    });
    expect((await getEffective(A)).config).toEqual(DEFAULT_CONFIG); // lastGood normalisiert → Standardwerte
  });
  it('unbekannter Server → Fehler statt Absturz mit fremden Daten', async () => {
    await err(getDesign('gibt-es-nicht'), 'not-found');
  });
});

describe('Export / Import', () => {
  it('Export enthält keine Server-, Benutzer- oder ID-Angaben', async () => {
    const t = await createTheme({ guildId: A, actorId: ACTOR, name: 'Export' });
    const out = await exportTheme(A, t.id);
    const json = JSON.stringify(out);
    for (const secret of [A, ACTOR, t.id]) expect(json).not.toContain(secret);
    expect(out).toMatchObject({ format: 'nexus-theme', name: 'Export', version: 1 });
  });
  it('Vorschau meldet bereinigte Werte; Import legt Theme an und löst Namenskonflikte', async () => {
    const t = await createTheme({
      guildId: A,
      actorId: ACTOR,
      name: 'Quelle',
      config: { colors: { dark: { primary: '#FF00FF' } } },
    });
    const file = await exportTheme(A, t.id);
    const hostile = {
      ...file,
      config: {
        ...file.config,
        background: { global: { type: 'image', imageUrl: 'javascript:alert(1)' } },
        evil: { x: 1 },
      },
    };
    const p = previewImport(hostile);
    expect(p.config.background.global.imageUrl).toBe('');
    expect(p.sanitized).toContain('background.global.imageUrl');
    const imported = await importTheme({ guildId: B, actorId: ACTOR, data: file });
    expect(imported.name).toBe('Quelle');
    expect((await importTheme({ guildId: B, actorId: ACTOR, data: file })).name).toBe('Quelle (2)');
    expect(() => previewImport({ format: 'anderes' })).toThrow(DesignError);
    expect(() => previewImport({ ...file, formatVersion: 2 })).toThrow(DesignError);
    expect(() => previewImport({ ...file, name: '' })).toThrow(DesignError);
    expect(() => previewImport('text')).toThrow(DesignError);
  });
});

describe('Gleichzeitige Erstaufrufe', () => {
  it('parallele Aufrufe legen die Vorlagen genau einmal an', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => getDesign(A)));
    expect(results.every((r) => r.themes.length === 5)).toBe(true);
    expect(await prisma.dashboardTheme.count({ where: { guildId: A } })).toBe(5);
    expect(await prisma.dashboardSettings.count({ where: { guildId: A } })).toBe(1);
  });
});
