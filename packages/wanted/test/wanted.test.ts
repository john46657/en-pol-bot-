import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { WantedError, checkSubject, createNotice, formatNumber, getByNumber, history, normalizePlate, revokeNotice, searchNotices, updateNotice } from '../src/index.js';

const G = 'wantedtest-guild';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof WantedError && e.code === code);
const person = (name = 'Max Mustermann', extra = {}) => createNotice({ guildId: G, kind: 'PERSON', actorId: 'cop', reason: 'Raubüberfall Bank', subjectName: name, ...extra });
const car = (plate = 'LS-AB 123', extra = {}) => createNotice({ guildId: G, kind: 'VEHICLE', actorId: 'cop', reason: 'Fluchtfahrzeug', plate, vehicleModel: 'Sultan', vehicleColor: 'schwarz', ...extra });

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.wantedCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Fahndung', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.wantedCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Erstellen – Personen und Fahrzeuge getrennt', () => {
  it('fortlaufende Nummern (auch parallel), Normalisierung', async () => {
    const all = await Promise.all([person('A A'), person('B B'), car('X 1'), car('X 2')]);
    expect(all.map((n) => n.number).sort()).toEqual([1, 2, 3, 4]);
    expect(formatNumber(12)).toBe('F-0012');
    expect(normalizePlate('ls-ab 123')).toBe('LSAB123');
    expect((await getByNumber(G, 3)).id).toBeTruthy();
  });
  it('Pflichtfelder je Art; Vermischung abgelehnt', async () => {
    await err(createNotice({ guildId: G, kind: 'PERSON', actorId: 'c', reason: 'Grund hier' }), 'invalid'); // kein Name
    await err(createNotice({ guildId: G, kind: 'VEHICLE', actorId: 'c', reason: 'Grund hier' }), 'invalid'); // kein Kennzeichen
    await err(createNotice({ guildId: G, kind: 'PERSON', actorId: 'c', reason: 'Grund hier', subjectName: 'X', plate: 'AB 1' }), 'invalid');
    await err(createNotice({ guildId: G, kind: 'VEHICLE', actorId: 'c', reason: 'Grund hier', plate: 'AB 1', subjectName: 'X' }), 'invalid');
    await err(createNotice({ guildId: G, kind: 'PERSON', actorId: 'c', reason: 'x', subjectName: 'X' }), 'invalid'); // Grund zu kurz
    await err(createNotice({ guildId: G, kind: 'BOOT', actorId: 'c', reason: 'xxx' }), 'invalid');
    await err(person('Y Y', { priority: 'MEGA' }), 'invalid');
    await err(person('Z Z', { subjectUserId: 'abc' }), 'invalid');
  });
  it('dieselbe Person/dasselbe Kennzeichen nicht doppelt aktiv – nach Aufheben wieder möglich', async () => {
    const a = await person('Max  Mustermann');
    await err(person('max mustermann'), 'conflict');
    const c = await car('LS-AB 123');
    await err(car('lsab123'), 'conflict');
    await person('Maxi Mustermann'); // anderer Name geht
    await revokeNotice(G, a.id, 'Festgenommen', 'cop');
    await person('Max Mustermann');
    await revokeNotice(G, c.id, 'Sichergestellt', 'cop');
    await car('LS-AB 123');
  });
});

describe('Bearbeiten, Aufheben, Historie', () => {
  it('Änderungen mit Vorher/Nachher; keine Änderung/aufgehoben abgelehnt', async () => {
    const n = await person('Max Mustermann', { lastSeen: 'Bank' });
    const u = await updateNotice(G, n.id, { lastSeen: 'Flughafen', priority: 'URGENT', appearance: 'Narbe am Kinn' }, 'cop2');
    expect(u).toMatchObject({ lastSeen: 'Flughafen', priority: 'URGENT', appearance: 'Narbe am Kinn', subjectName: 'Max Mustermann' });
    await err(updateNotice(G, n.id, { lastSeen: 'Flughafen' }, 'cop'), 'invalid');
    const ev = (await history(G, n.id)).find((e) => e.type === 'updated')!;
    expect(ev.data).toMatchObject({ before: { lastSeen: 'Bank', priority: 'NORMAL', appearance: null }, after: { lastSeen: 'Flughafen', priority: 'URGENT' } });
    expect(ev.actorId).toBe('cop2');
    // Umbenennen ändert den Suchschlüssel; Kollision verhindert
    await person('Anna Beispiel');
    await err(updateNotice(G, n.id, { subjectName: 'anna beispiel' }, 'cop'), 'conflict');
    await updateNotice(G, n.id, { subjectName: 'Maximilian Mustermann' }, 'cop');
    expect(await checkSubject(G, 'PERSON', 'maximilian  mustermann')).toMatchObject({ id: n.id });
    expect(await checkSubject(G, 'PERSON', 'Max Mustermann')).toBeNull();
    await revokeNotice(G, n.id, 'Festnahme', 'cop');
    await err(updateNotice(G, n.id, { lastSeen: 'x' }, 'cop'), 'conflict');
  });
  it('Aufheben: Grund Pflicht, nur einmal, Audit + Historie; Fahrzeugwert korrekt', async () => {
    const c = await car('LS-AB 123', { ownerName: 'Max' });
    expect(c).toMatchObject({ plate: 'LS-AB 123', subjectKey: 'LSAB123', ownerName: 'Max' });
    await err(revokeNotice(G, c.id, '', 'cop'), 'invalid');
    await err(revokeNotice(G, c.id, 'x'.repeat(301), 'cop'), 'invalid');
    const r = await revokeNotice(G, c.id, 'Fahrzeug sichergestellt', 'cop');
    expect(r).toMatchObject({ status: 'REVOKED', revokeReason: 'Fahrzeug sichergestellt', revokedBy: 'cop', activeKey: null });
    await err(revokeNotice(G, c.id, 'nochmal', 'cop'), 'conflict');
    expect((await history(G, c.id)).map((e) => e.type)).toEqual(['created', 'revoked']);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'wanted.revoked' } })).toBe(1);
  });
});

describe('Suchen', () => {
  it('Name, Kennzeichen (formatunabhängig), Modell, Nummer, Filter nach Art/Status', async () => {
    const p1 = await person('Max Mustermann');
    await person('Erika Musterfrau');
    await car('LS-AB 123', { ownerName: 'Max Mustermann' });
    await revokeNotice(G, p1.id, 'Festgenommen', 'c');
    const names = async (f: object) => (await searchNotices({ guildId: G, ...f })).items.map((n) => n.number).sort();
    expect(await names({})).toEqual([1, 2, 3]);
    expect(await names({ query: 'muster' })).toEqual([1, 2, 3]);
    expect(await names({ query: 'erika' })).toEqual([2]);
    expect(await names({ query: 'lsab123' })).toEqual([3]);
    expect(await names({ query: 'ls ab 123' })).toEqual([3]);
    expect(await names({ query: 'sultan' })).toEqual([3]);
    expect(await names({ query: 'F-0002' })).toEqual([2]);
    expect(await names({ query: 'F-0001' })).toEqual([1]);
    expect(await names({ query: '1' })).toEqual([1, 3]); // Nummer 1 und Kennzeichen mit 1
    expect(await names({ kind: 'PERSON' })).toEqual([1, 2]);
    expect(await names({ kind: 'VEHICLE' })).toEqual([3]);
    expect(await names({ status: 'ACTIVE' })).toEqual([2, 3]);
    expect(await names({ status: 'REVOKED', query: 'max' })).toEqual([1]);
    const page = await searchNotices({ guildId: G, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });
});
