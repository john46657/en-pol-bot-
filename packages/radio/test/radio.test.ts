import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRestriction } from '@nexus/restrictions';
import { RadioError, accessHistory, checkChannel, checkMember, decideAccess, listAccess, removeAccess, removeChannel, saveChannel, setAccess } from '../src/index.js';

const G = 'radiotest-guild';
const [A, B, C] = ['900000000000050001', '900000000000050002', '900000000000050003'];
const CH = { general: '800000000000000001', special: '800000000000000002', duty: '800000000000000003' };
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof RadioError && e.code === code);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.radioEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Funk', settings: { create: {} } } });
  await saveChannel(G, { channelId: CH.general, name: 'Funk 1' }, 'x');
  await saveChannel(G, { channelId: CH.special, name: 'SEK-Funk', area: 'SPECIAL' }, 'x');
  await saveChannel(G, { channelId: CH.duty, name: 'Dienstfunk', requiresDuty: true }, 'x');
});
afterAll(async () => {
  await prisma.radioEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('decideAccess (Stufen × Bereich × Dienst)', () => {
  const gen = { area: 'GENERAL', requiresDuty: false } as const;
  const spec = { area: 'SPECIAL', requiresDuty: false } as const;
  it.each([
    [null, gen, true, 'none', 'not-whitelisted'],
    [{ level: 'LISTEN', special: false }, gen, true, 'listen', 'ok'],
    [{ level: 'SPEAK', special: false }, gen, true, 'speak', 'ok'],
    [{ level: 'SPEAK', special: false }, spec, true, 'none', 'special-required'],
    [{ level: 'SPEAK', special: true }, spec, true, 'speak', 'ok'],
    [{ level: 'LISTEN', special: true }, spec, true, 'listen', 'ok'],
    [{ level: 'FULL', special: false }, spec, true, 'speak', 'ok'],
    [{ level: 'FULL', special: true }, { ...gen, requiresDuty: true }, false, 'none', 'off-duty'],
    [{ level: 'FULL', special: true }, { ...gen, active: false }, true, 'none', 'inactive'],
  ] as const)('%j in %j (Dienst: %s) → %s', (entry, ch, duty, access, reason) => {
    expect(decideAccess(entry as never, ch as never, duty)).toEqual({ access, reason });
  });
});

describe('Whitelist', () => {
  it('hinzufügen, ändern, entfernen mit Verlauf und Audit; Vollzugriff ⇒ Spezial', async () => {
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', reason: 'Neu', actorId: 'boss' });
    await err(setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: 'boss' }), 'conflict');
    const up = await setAccess({ guildId: G, userId: A, level: 'FULL', actorId: 'boss' });
    expect(up).toMatchObject({ level: 'FULL', special: true, reason: 'Neu' });
    await removeAccess(G, A, 'boss', 'Rückstufung');
    await err(removeAccess(G, A, 'boss'), 'not-found');
    expect((await accessHistory(G, A)).map((e) => e.type).reverse()).toEqual(['added', 'changed', 'removed']);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: { startsWith: 'radio.access' } } })).toBe(3);
  });
  it('Validierung', async () => {
    await err(setAccess({ guildId: G, userId: 'abc', level: 'SPEAK', actorId: 'b' }), 'invalid');
    await err(setAccess({ guildId: G, userId: A, level: 'ADMIN', actorId: 'b' }), 'invalid');
    await err(setAccess({ guildId: G, userId: A, level: 'SPEAK', reason: 'x'.repeat(201), actorId: 'b' }), 'invalid');
  });
  it('Suchen und Filtern', async () => {
    await setAccess({ guildId: G, userId: A, level: 'LISTEN', actorId: 'b' });
    await setAccess({ guildId: G, userId: B, level: 'SPEAK', special: true, actorId: 'b' });
    await setAccess({ guildId: G, userId: C, level: 'SPEAK', actorId: 'b' });
    expect((await listAccess({ guildId: G })).items).toHaveLength(3);
    expect((await listAccess({ guildId: G, level: 'SPEAK' })).items.map((x) => x.userId).sort()).toEqual([B, C]);
    expect((await listAccess({ guildId: G, special: true })).items.map((x) => x.userId)).toEqual([B]);
    expect((await listAccess({ guildId: G, userIds: [A] })).items).toHaveLength(1);
    const page = await listAccess({ guildId: G, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe('Prüfung gegen Kanäle (Abnahme: nur Berechtigte nutzen den jeweiligen Funkbereich)', () => {
  it('Whitelist, Spezialfunk und Dienstpflicht', async () => {
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: 'b' });
    const m = await checkMember(G, A);
    const by = Object.fromEntries(m.channels.map((c) => [c.name, c.access]));
    expect(by).toEqual({ 'Funk 1': 'speak', 'Dienstfunk': 'none', 'SEK-Funk': 'none' });
    expect((await checkChannel(G, B, CH.general))?.reason).toBe('not-whitelisted');
    expect(await checkChannel(G, A, '800000000000009999')).toBeNull();

    const type = await prisma.shiftType.create({ data: { guildId: G, name: 'Streife' } });
    const shift = await prisma.shift.create({ data: { guildId: G, userId: A, typeId: type.id, openKey: 'open' } });
    expect((await checkChannel(G, A, CH.duty))?.access).toBe('speak');
    await prisma.shift.update({ where: { id: shift.id }, data: { status: 'PAUSED' } });
    expect((await checkChannel(G, A, CH.duty))?.reason).toBe('off-duty'); // Pause zählt nicht als Dienst
  });
  it('Kanal entfernen', async () => {
    await removeChannel(G, CH.general, 'x');
    await err(removeChannel(G, CH.general, 'x'), 'not-found');
    expect(await checkChannel(G, A, CH.general)).toBeNull();
  });
});

describe('Büro-Warteraum ist kein Funkkanal', () => {
  it('wird abgelehnt', async () => {
    await guildRepository.setSelection(G, 'office-waiting-voice', '800000000000000077');
    await err(saveChannel(G, { channelId: '800000000000000077', name: 'Warteraum' }, 'x'), 'conflict');
    await saveChannel(G, { channelId: '800000000000000078', name: 'Anderer' }, 'x'); // andere Kanäle gehen
  });
});

describe('Funksperre (Phase 47)', () => {
  it('gesperrtes Mitglied hat trotz Whitelist keinen Zugriff; andere nicht betroffen', async () => {
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: 'b' });
    await setAccess({ guildId: G, userId: B, level: 'SPEAK', actorId: 'b' });
    expect((await checkChannel(G, A, CH.general))?.access).toBe('speak');
    const r = await createRestriction({ guildId: G, userId: A, type: 'RADIO', reason: 'Funkdisziplin', actorId: 'b' });
    expect(await checkChannel(G, A, CH.general)).toMatchObject({ access: 'none', reason: 'restricted' });
    expect((await checkMember(G, A)).channels.every((c) => c.access === 'none' && c.reason === 'restricted')).toBe(true);
    expect((await checkChannel(G, B, CH.general))?.access).toBe('speak');
    await prisma.restriction.update({ where: { id: r.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await checkChannel(G, A, CH.general))?.access).toBe('speak');
  });
});
