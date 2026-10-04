import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LEVELS, DangerError, deleteLevel, ensureDefaults, getCurrent, history, listLevels, saveLevel, setLevel, statusMessage } from '../src/index.js';

const G = 'dangertest-guild';
const ROLE = '900000000000090001';
const CH = '800000000000090001';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof DangerError && e.code === code);

const port = () => {
  let n = 0;
  return {
    posted: [] as any[], edited: [] as any[],
    postMessage: vi.fn(async function (this: any, _c: string, p: any) { return { id: `m${++n}` }; }),
    editMessage: vi.fn(async () => {}),
    sendDm: vi.fn(async () => {}),
    roleDriver: vi.fn(),
  };
};

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.dangerState.deleteMany({ where: { guildId: G } });
  await prisma.dangerEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Gefahr', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.dangerState.deleteMany({ where: { guildId: G } });
  await prisma.dangerEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Stufen', () => {
  it('Standard 0–5 mit Name/Farbe/Emoji/Beschreibung – auch bei parallelem Erstzugriff genau einmal', async () => {
    await Promise.all([ensureDefaults(G), ensureDefaults(G), listLevels(G)]);
    const levels = await listLevels(G);
    expect(levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(levels[3]).toMatchObject({ name: DEFAULT_LEVELS[3].name, color: '#F97316', emoji: '🟠' });
    expect((await getCurrent(G)).level.level).toBe(0);
  });
  it('anpassen, neu anlegen, validieren, löschen mit Schutz; alles im Audit-Log', async () => {
    await saveLevel(G, { level: 2, name: 'Gelb', color: '#FFFF00', emoji: '🟨', allowedRoleIds: [ROLE] }, 'admin');
    expect((await listLevels(G))[2]).toMatchObject({ name: 'Gelb', allowedRoleIds: [ROLE] });
    await saveLevel(G, { level: 6, name: 'Extra' }, 'admin');
    await err(saveLevel(G, { level: 21, name: 'x' }, 'a'), 'invalid');
    await err(saveLevel(G, { level: 1, name: '' }, 'a'), 'invalid');
    await err(saveLevel(G, { level: 1, name: 'x', color: 'rot' }, 'a'), 'invalid');
    await err(saveLevel(G, { level: 1, name: 'x', allowedRoleIds: ['abc'] }, 'a'), 'invalid');
    await setLevel({ guildId: G, level: 6, actorId: 'a', roleIds: [] });
    await err(deleteLevel(G, 6, 'a'), 'conflict'); // aktuell gesetzt
    await deleteLevel(G, 5, 'a');
    await err(deleteLevel(G, 5, 'a'), 'not-found');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: { startsWith: 'danger.level.' } } })).toBe(4); // geändert + neu + gesetzt + gelöscht
  });
});

describe('Setzen', () => {
  it('Wechsel mit Verlauf und Audit, gleiche Stufe abgelehnt', async () => {
    const r = await setLevel({ guildId: G, level: 3, actorId: 'u1', roleIds: [], reason: 'Banküberfall' });
    expect(r).toMatchObject({ from: 0, level: { level: 3 } });
    expect((await getCurrent(G)).state?.reason).toBe('Banküberfall');
    await err(setLevel({ guildId: G, level: 3, actorId: 'u1', roleIds: [] }), 'conflict');
    await err(setLevel({ guildId: G, level: 9, actorId: 'u1', roleIds: [] }), 'not-found');
    await err(setLevel({ guildId: G, level: 1, actorId: 'u1', roleIds: [], reason: 'x'.repeat(301) }), 'invalid');
    await setLevel({ guildId: G, level: 0, actorId: 'u2', roleIds: [] });
    expect((await history(G)).map((e) => [e.fromLevel, e.toLevel, e.actorId]).reverse()).toEqual([[0, 3, 'u1'], [3, 0, 'u2']]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'danger.level.set' }, orderBy: { createdAt: 'asc' } });
    expect(log).toMatchObject({ actorId: 'u1', reason: 'Banküberfall', permission: 'danger.set' });
    expect((log.after as any).level).toBe(3);
  });
  it('berechtigte Rollen je Stufe; Verwaltung darf überstimmen', async () => {
    await saveLevel(G, { level: 5, name: 'Ausnahme', allowedRoleIds: [ROLE] }, 'admin');
    await err(setLevel({ guildId: G, level: 5, actorId: 'u', roleIds: ['x'] }), 'forbidden');
    await setLevel({ guildId: G, level: 4, actorId: 'u', roleIds: ['x'] }); // andere Stufe ohne Rollenbeschränkung
    await setLevel({ guildId: G, level: 5, actorId: 'u', roleIds: [ROLE] });
    await setLevel({ guildId: G, level: 1, actorId: 'u', roleIds: [] });
    await setLevel({ guildId: G, level: 5, actorId: 'boss', roleIds: [], override: true });
  });
});

describe('Statusmeldung im Kanal', () => {
  it('erst posten, dann bearbeiten, bei gelöschter Nachricht neu posten, ohne Kanal nichts, Fehler brechen nicht ab', async () => {
    const p = port();
    expect((await setLevel({ guildId: G, level: 1, actorId: 'u', roleIds: [], port: p as never })).published).toBe('none');
    await guildRepository.setSelection(G, 'danger-channel', CH);
    expect((await setLevel({ guildId: G, level: 2, actorId: 'u', roleIds: [], port: p as never })).published).toBe('posted');
    expect((await setLevel({ guildId: G, level: 3, actorId: 'u', roleIds: [], port: p as never })).published).toBe('edited');
    p.editMessage.mockRejectedValueOnce(new Error('Unknown Message'));
    expect((await setLevel({ guildId: G, level: 4, actorId: 'u', roleIds: [], port: p as never })).published).toBe('posted');
    p.postMessage.mockRejectedValueOnce(new Error('Missing Access'));
    p.editMessage.mockRejectedValueOnce(new Error('weg'));
    const r = await setLevel({ guildId: G, level: 5, actorId: 'u', roleIds: [], port: p as never });
    expect(r.published).toBe('failed');
    expect((await getCurrent(G)).level.level).toBe(5); // Änderung bleibt bestehen
  });
  it('Embed enthält Stufe, Farbe, Grund', async () => {
    const [l] = await listLevels(G);
    const m = statusMessage({ ...l!, level: 4, color: '#EF4444', name: 'Kritisch' }, 'u1', 'Geiselnahme', new Date());
    expect(m.embeds[0]).toMatchObject({ color: 0xef4444, title: expect.stringContaining('Gefahrenstufe 4') });
    expect(JSON.stringify(m)).toContain('Geiselnahme');
  });
});
