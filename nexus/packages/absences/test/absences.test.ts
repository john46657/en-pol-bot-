import { guildRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbsenceError, activeAbsence, approve, berlinToday, daysBetween, endEarly, fmtDay, formatNumber, getByNumber, historyOf, listAbsences, listActive, parseDay, reject, requestAbsence, withdraw } from '../src/index.js';

const G = 'abstest-guild';
const [A, B, BOSS] = ['900000000000230001', '900000000000230002', '900000000000230003'];
const NOW = new Date('2026-10-07T10:00:00Z'); // Mittwoch 12:00 Berlin
const d = (s: string) => parseDay(s)!;
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof AbsenceError && e.code === code);
const req = (extra: Partial<Parameters<typeof requestAbsence>[0]> = {}) => requestAbsence({ guildId: G, userId: A, start: d('10.10.2026'), end: d('15.10.2026'), category: 'URLAUB', reason: 'Familienurlaub', ...extra }, NOW);
const port = () => ({ sendDm: vi.fn(async () => {}), postMessage: vi.fn(async () => ({ id: 'm' })), editMessage: vi.fn(), roleDriver: vi.fn() }) as never;

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.absenceCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Abmeldung', settings: { create: {} } } });
  const rank = await saveRank(G, { name: 'Beamter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id }); // B hat keine Akte
});
afterAll(async () => {
  await prisma.absenceCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Datum', () => {
  it('parseDay/berlinToday/daysBetween', () => {
    expect(parseDay('07.10.2026')?.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(parseDay('2026-10-07')?.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(parseDay('31.02.2026')).toBeNull();
    expect(parseDay('morgen')).toBeNull();
    expect(berlinToday(new Date('2026-10-07T22:30:00Z')).toISOString()).toBe('2026-10-08T00:00:00.000Z'); // 00:30 Berlin = nächster Tag
    expect(berlinToday(NOW).toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(daysBetween(d('10.10.2026'), d('10.10.2026'))).toBe(1);
    expect(daysBetween(d('10.10.2026'), d('15.10.2026'))).toBe(6);
    expect(fmtDay(d('05.01.2026'))).toBe('05.01.2026');
  });
});

describe('Antrag', () => {
  it('gültiger Antrag: Nummer, Ankündigung im Kanal; Validierung', async () => {
    await guildRepository.setSelection(G, 'absence-channel', '800000000000230001');
    const p = port();
    const a = await req({ port: p });
    expect(a).toMatchObject({ number: 1, status: 'PENDING', category: 'URLAUB' });
    expect((p as any).postMessage).toHaveBeenCalled();
    expect(formatNumber(a.number)).toBe('A-0001');
    await err(req({ category: 'SPASS' }), 'invalid');
    await err(req({ reason: 'x' }), 'invalid');
    await err(req({ start: d('15.10.2026'), end: d('10.10.2026') }), 'invalid');
    await err(req({ start: d('01.10.2026'), end: d('03.10.2026'), reason: 'Urlaub gestern' }), 'invalid'); // Vergangenheit
    await err(req({ start: d('10.10.2026'), end: d('15.12.2026') }), 'invalid'); // > 60 Tage
    await err(req({ start: d('10.03.2027'), end: d('12.03.2027') }), 'invalid'); // zu weit in der Zukunft
    await err(req({ start: new Date('x') }), 'invalid');
  });
  it('Krankmeldung rückwirkend bis 3 Tage; Überschneidungen blockiert (offen und genehmigt), nach Ablehnung frei', async () => {
    await requestAbsence({ guildId: G, userId: A, start: d('04.10.2026'), end: d('08.10.2026'), category: 'KRANK', reason: 'Grippe' }, NOW);
    await err(requestAbsence({ guildId: G, userId: B, start: d('03.10.2026'), end: d('04.10.2026'), category: 'KRANK', reason: 'Grippe' }, NOW), 'invalid'); // 4 Tage zurück
    await err(req({ start: d('08.10.2026'), end: d('09.10.2026') }), 'conflict'); // überschneidet Krank bis 08.
    const a = await req({ start: d('10.10.2026'), end: d('12.10.2026') });
    await err(req({ start: d('12.10.2026'), end: d('14.10.2026') }), 'conflict');
    await reject({ guildId: G, absenceId: a.id, actorId: BOSS, reason: 'Personalmangel' }, NOW);
    await req({ start: d('12.10.2026'), end: d('14.10.2026') }); // jetzt frei
  });
  it('Nummern parallel eindeutig', async () => {
    const mk = (u: string, s: string, e: string) => requestAbsence({ guildId: G, userId: u, start: d(s), end: d(e), category: 'URLAUB', reason: 'Urlaub' }, NOW);
    const all = await Promise.all([mk(A, '10.10.2026', '11.10.2026'), mk(B, '10.10.2026', '11.10.2026'), mk('900000000000230009', '10.10.2026', '11.10.2026')]);
    expect(all.map((x) => x.number).sort()).toEqual([1, 2, 3]);
  });
});

describe('Entscheidung', () => {
  it('Genehmigen: Personalakte-Eintrag, Benachrichtigung, Audit; nicht doppelt, nicht selbst', async () => {
    const p = port();
    const a = await req();
    await err(approve({ guildId: G, absenceId: a.id, actorId: A }, NOW), 'forbidden');
    const ok = await approve({ guildId: G, absenceId: a.id, actorId: BOSS, reason: 'Viel Erholung', port: p }, NOW);
    expect(ok.status).toBe('APPROVED');
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    const entry = await prisma.personnelEntry.findFirstOrThrow({ where: { recordId: rec.id, kind: 'ABSENCE' } });
    expect(entry).toMatchObject({ id: ok.entryId, revokedAt: null });
    expect(entry.title).toBe('Abmeldung 10.10.2026 – 15.10.2026: Urlaub');
    expect(JSON.stringify((p as any).sendDm.mock.calls)).toContain('genehmigt');
    await err(approve({ guildId: G, absenceId: a.id, actorId: BOSS }, NOW), 'conflict');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'absence.approved' } })).toBe(1);
  });
  it('Mitglied ohne Akte: genehmigt ohne Akteneintrag; vergangener Zeitraum nicht genehmigbar', async () => {
    const b = await requestAbsence({ guildId: G, userId: B, start: d('10.10.2026'), end: d('11.10.2026'), category: 'URLAUB', reason: 'Urlaub' }, NOW);
    expect((await approve({ guildId: G, absenceId: b.id, actorId: BOSS }, NOW)).entryId).toBeNull();
    const k = await requestAbsence({ guildId: G, userId: A, start: d('05.10.2026'), end: d('06.10.2026'), category: 'KRANK', reason: 'Erkältung' }, NOW);
    await err(approve({ guildId: G, absenceId: k.id, actorId: BOSS }, NOW), 'conflict'); // Ende < heute
  });
  it('Ablehnen: Grund Pflicht, Benachrichtigung', async () => {
    const p = port();
    const a = await req();
    await err(reject({ guildId: G, absenceId: a.id, actorId: BOSS }, NOW), 'invalid');
    await err(reject({ guildId: G, absenceId: a.id, actorId: A, reason: 'nein' }, NOW), 'forbidden');
    const r = await reject({ guildId: G, absenceId: a.id, actorId: BOSS, reason: 'Zu viele Abmeldungen', port: p }, NOW);
    expect(r).toMatchObject({ status: 'REJECTED', decisionReason: 'Zu viele Abmeldungen' });
    expect(JSON.stringify((p as any).sendDm.mock.calls)).toContain('abgelehnt');
    await err(reject({ guildId: G, absenceId: a.id, actorId: BOSS, reason: 'nochmal' }, NOW), 'conflict');
  });
});

describe('Zurückziehen, vorzeitig beenden, laufende Abmeldung', () => {
  it('Zurückziehen: offen jederzeit, genehmigt nur vor Beginn (Eintrag widerrufen), nur selbst/Führung', async () => {
    const a = await req();
    await err(withdraw(G, a.id, B, false, NOW), 'forbidden');
    await approve({ guildId: G, absenceId: a.id, actorId: BOSS }, NOW);
    const w = await withdraw(G, a.id, A, false, NOW);
    expect(w.status).toBe('WITHDRAWN');
    expect((await prisma.personnelEntry.findUniqueOrThrow({ where: { id: a.id && (await prisma.absence.findUniqueOrThrow({ where: { id: a.id } })).entryId! } })).revokedAt).not.toBeNull();
    await err(withdraw(G, a.id, A, false, NOW), 'conflict');
    const open = await req({ start: d('20.10.2026'), end: d('22.10.2026') });
    expect((await withdraw(G, open.id, BOSS, true, NOW)).status).toBe('WITHDRAWN');
  });
  it('laufende Abmeldung: aktiv, in „Wer ist abgemeldet?“, nicht mehr zurückziehbar, vorzeitig beenden', async () => {
    const a = await requestAbsence({ guildId: G, userId: A, start: d('06.10.2026'), end: d('12.10.2026'), category: 'KRANK', reason: 'Grippe' }, NOW);
    await approve({ guildId: G, absenceId: a.id, actorId: BOSS }, NOW);
    expect((await activeAbsence(G, A, NOW))?.id).toBe(a.id);
    expect(await activeAbsence(G, B, NOW)).toBeNull();
    expect((await listActive(G, NOW)).map((x) => x.userId)).toEqual([A]);
    expect(await activeAbsence(G, A, new Date('2026-10-13T10:00:00Z'))).toBeNull(); // danach vorbei
    await err(withdraw(G, a.id, A, false, NOW), 'conflict');
    const e = await endEarly(G, a.id, A, false, NOW);
    expect(e.status).toBe('ENDED');
    expect(await activeAbsence(G, A, NOW)).toBeNull();
    await err(endEarly(G, a.id, A, false, NOW), 'conflict');
  });
  it('Historie und Listen', async () => {
    const a = await req();
    await approve({ guildId: G, absenceId: a.id, actorId: BOSS }, NOW);
    await req({ start: d('20.10.2026'), end: d('21.10.2026') });
    expect((await historyOf(G, A)).map((x) => x.number)).toEqual([2, 1]);
    expect((await listAbsences({ guildId: G, status: 'PENDING' }, NOW)).items.map((x) => x.number)).toEqual([2]);
    expect((await listAbsences({ guildId: G, upcoming: true }, NOW)).items.map((x) => x.number)).toEqual([1]);
    expect((await getByNumber(G, 2)).userId).toBe(A);
    await err(getByNumber(G, 9), 'not-found');
  });
});
