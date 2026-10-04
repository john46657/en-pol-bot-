import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DURATION_MINUTES, WantedError, checkSubject, expireDueNotices, getDefaultDuration, setDefaultDuration, createNotice, formatNumber, getByNumber, history, normalizePlate, revokeNotice, searchNotices, updateNotice } from '../src/index.js';

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

describe('Automatisches Ablaufen (Phase 46)', () => {
  const minutesLeft = (n: { expiresAt: Date | null }) => Math.round((n.expiresAt!.getTime() - Date.now()) / 60_000);

  it('Standard 20 Minuten; eigene Dauer; 0 = läuft nicht ab; ungültige Dauer abgelehnt', async () => {
    expect(await getDefaultDuration(G)).toBe(DEFAULT_DURATION_MINUTES);
    expect(minutesLeft(await person('A A'))).toBe(20);
    expect(minutesLeft(await person('B B', { durationMinutes: 90 }))).toBe(90);
    expect((await person('C C', { durationMinutes: 0 })).expiresAt).toBeNull();
    await err(person('D D', { durationMinutes: -1 }), 'invalid');
    await err(person('E E', { durationMinutes: 1.5 }), 'invalid');
    await err(person('F F', { durationMinutes: 999_999 }), 'invalid');
  });

  it('Server-Standarddauer ändern wirkt auf neue Fahndungen und wird protokolliert', async () => {
    await setDefaultDuration(G, 45, 'admin');
    expect(await getDefaultDuration(G)).toBe(45);
    expect(minutesLeft(await person('A A'))).toBe(45);
    await setDefaultDuration(G, 0, 'admin');
    expect((await person('B B')).expiresAt).toBeNull();
    await err(setDefaultDuration(G, 99999, 'admin'), 'invalid');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'wanted.settings.updated' } })).toBe(2);
  });

  it('abgelaufene Fahndung: Status EXPIRED, nicht mehr aktiv, Historie, nicht mehr bearbeitbar', async () => {
    const a = await person('Ablauf Test');
    const keep = await person('Bleibt Aktiv', { durationMinutes: 0 });
    const later = new Date(Date.now() + 21 * 60_000);
    expect(await expireDueNotices(G, later)).toEqual({ expired: 1 });
    expect(await expireDueNotices(G, later)).toEqual({ expired: 0 }); // nichts doppelt
    const n = await getByNumber(G, a.number);
    expect(n.status).toBe('EXPIRED');
    expect(n.activeKey).toBeNull();
    expect(n.expiredAt).not.toBeNull();
    expect((await getByNumber(G, keep.number)).status).toBe('ACTIVE');
    const ev = await history(G, a.id);
    expect(ev.map((e) => e.type)).toEqual(['created', 'expired']);
    expect(ev[1]!.actorId).toBeNull();
    await err(updateNotice(G, a.id, { reason: 'neuer Grund' }, 'c'), 'conflict');
    await err(revokeNotice(G, a.id, 'zu spät', 'c'), 'conflict');
  });

  it('nie als aktiv sichtbar, auch ohne Worker-Lauf; danach neue Fahndung zur selben Person möglich', async () => {
    const a = await person('Max Mustermann');
    await prisma.wantedNotice.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); // abgelaufen, Worker noch nicht gelaufen
    expect(await checkSubject(G, 'PERSON', 'max mustermann')).toBeNull();
    expect((await searchNotices({ guildId: G, status: 'ACTIVE' })).items).toHaveLength(0);
    expect((await searchNotices({ guildId: G, status: 'EXPIRED' })).items.map((n) => n.number)).toEqual([a.number]);
    const again = await person('Max Mustermann');
    expect(again.status).toBe('ACTIVE');
  });

  it('Server getrennt: der Ablauf betrifft nur den eigenen Server, ohne Angabe alle', async () => {
    const other = 'wantedtest-guild-2';
    await prisma.guild.deleteMany({ where: { id: other } });
    await prisma.guild.create({ data: { id: other, name: 'Zwei', settings: { create: {} } } });
    try {
      await person('A A');
      await createNotice({ guildId: other, kind: 'PERSON', actorId: 'c', reason: 'Grund hier', subjectName: 'B B' });
      const later = new Date(Date.now() + 25 * 60_000);
      expect(await expireDueNotices(G, later)).toEqual({ expired: 1 });
      expect((await prisma.wantedNotice.findMany({ where: { guildId: other } }))[0]!.status).toBe('ACTIVE');
      expect((await expireDueNotices(undefined, later)).expired).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.wantedCounter.deleteMany({ where: { guildId: other } });
      await prisma.guild.deleteMany({ where: { id: other } });
    }
  });
});
