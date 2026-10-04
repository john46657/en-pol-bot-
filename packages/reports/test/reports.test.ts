import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportError, buildReport, generate, getReport, listReports, publish, renderEmbed, renderText } from '../src/index.js';

const G = 'reporttest-guild';
const [A, B] = ['900000000000250001', '900000000000250002'];
const CH = '800000000000250001';
// Mittwoch, 07.10.2026 (Berlin, MESZ): Tag = 06.10. 22:00Z – 07.10. 22:00Z; Woche Mo 05.10. – So 11.10.
const ON = new Date('2026-10-07T10:00:00Z');
const at = (iso: string) => new Date(iso);
const port = () => {
  let n = 0;
  return { sendDm: vi.fn(), postMessage: vi.fn(async () => ({ id: `m${++n}` })), editMessage: vi.fn(async () => {}), roleDriver: vi.fn() } as never;
};
let typeStreife = '';
let typeSek = '';

async function shift(userId: string, typeId: string, start: string, netSeconds: number | null) {
  return prisma.shift.create({ data: { guildId: G, userId, typeId, startedAt: at(start), status: netSeconds === null ? 'ACTIVE' : 'ENDED', openKey: netSeconds === null ? 'open' : null, ...(netSeconds !== null ? { endedAt: new Date(at(start).getTime() + netSeconds * 1000), durationSeconds: netSeconds } : {}) } });
}

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Berichte', settings: { create: {} } } });
  typeStreife = (await prisma.shiftType.create({ data: { guildId: G, name: 'Streife' } })).id;
  typeSek = (await prisma.shiftType.create({ data: { guildId: G, name: 'SEK' } })).id;
  // --- heute (07.10.) ---
  await shift(A, typeStreife, '2026-10-07T08:00:00Z', 3600);
  await shift(B, typeStreife, '2026-10-07T09:00:00Z', 7200);
  await shift(B, typeSek, '2026-10-07T09:30:00Z', null); // läuft noch
  // --- gestern (06.10., gleiche Woche) ---
  await shift(A, typeStreife, '2026-10-06T08:00:00Z', 10_800);
  // --- Vorwoche (30.09.) ---
  await shift(A, typeStreife, '2026-09-30T08:00:00Z', 5400);
  await prisma.operation.createMany({ data: [
    { guildId: G, number: 1, kind: 'Raub', location: 'Bank', priority: 'URGENT', status: 'COMPLETED', createdBy: A, createdAt: at('2026-10-07T07:00:00Z') },
    { guildId: G, number: 2, kind: 'Unfall', location: 'A7', priority: 'NORMAL', status: 'CANCELLED', createdBy: A, createdAt: at('2026-10-07T08:00:00Z') },
    { guildId: G, number: 3, kind: 'Streit', location: 'Park', priority: 'NORMAL', status: 'ACTIVE', createdBy: A, createdAt: at('2026-10-07T09:00:00Z') },
    { guildId: G, number: 4, kind: 'Alt', location: 'X', priority: 'LOW', status: 'COMPLETED', createdBy: A, createdAt: at('2026-10-06T09:00:00Z') },
  ] });
  await prisma.wantedNotice.createMany({ data: [
    { guildId: G, number: 1, kind: 'PERSON', subjectKey: 'max', subjectName: 'Max', reason: 'Raub', createdBy: A, activeKey: 'active', createdAt: at('2026-10-07T07:30:00Z') },
    { guildId: G, number: 2, kind: 'VEHICLE', subjectKey: 'lsab1', plate: 'LS-AB 1', reason: 'Flucht', createdBy: A, activeKey: 'active', createdAt: at('2026-10-07T07:40:00Z') },
    { guildId: G, number: 3, kind: 'PERSON', subjectKey: 'eva', subjectName: 'Eva', reason: 'Betrug', status: 'REVOKED', revokedAt: at('2026-10-07T12:00:00Z'), createdBy: A, createdAt: at('2026-10-05T07:00:00Z') },
  ] });
  await prisma.penalty.createMany({ data: [
    { guildId: G, number: 1, kind: 'FINE', subjectName: 'X', subjectKey: 'x', amount: 500, reason: 'Rotlicht', issuedBy: A, createdAt: at('2026-10-07T10:00:00Z') },
    { guildId: G, number: 2, kind: 'FINE', subjectName: 'Y', subjectKey: 'y', amount: 300, reason: 'Rasen', issuedBy: A, createdAt: at('2026-10-07T10:30:00Z') },
    { guildId: G, number: 3, kind: 'POINTS', subjectName: 'Y', subjectKey: 'y', points: 3, reason: 'Rasen', issuedBy: A, createdAt: at('2026-10-07T10:31:00Z') },
    { guildId: G, number: 4, kind: 'FINE', subjectName: 'Z', subjectKey: 'z', amount: 999, reason: 'Fehler', status: 'REVOKED', revokedAt: at('2026-10-07T11:00:00Z'), issuedBy: A, createdAt: at('2026-10-07T10:40:00Z') },
  ] });
  const cat = await prisma.ticketCategory.create({ data: { guildId: G, name: 'Support' } });
  await prisma.ticket.createMany({ data: [
    { guildId: G, number: 1, categoryId: cat.id, userId: A, subject: 'Eins', createdAt: at('2026-10-07T07:00:00Z') },
    { guildId: G, number: 2, categoryId: cat.id, userId: A, subject: 'Zwei', status: 'CLOSED', closedAt: at('2026-10-07T08:00:00Z'), createdAt: at('2026-10-06T07:00:00Z') },
  ] });
  const course = await prisma.trainingCourse.create({ data: { guildId: G, name: 'Grund', theoryMax: 100 } });
  const tr = await prisma.training.create({ data: { guildId: G, number: 1, courseId: course.id, scheduledAt: at('2026-10-07T07:00:00Z'), status: 'FINISHED', finishedAt: at('2026-10-07T09:00:00Z'), maxParticipants: 5, createdBy: A, trainerIds: [] } });
  await prisma.trainingParticipant.createMany({ data: [{ guildId: G, trainingId: tr.id, userId: A, status: 'PASSED' }, { guildId: G, trainingId: tr.id, userId: B, status: 'FAILED' }] });
  await prisma.promotionRequest.create({ data: { guildId: G, number: 1, userId: A, recordId: 'r', fromRankName: 'Anwärter', toRankId: 'x', toRankName: 'Beamter', status: 'APPROVED', requestedBy: B, decidedBy: B, decidedAt: at('2026-10-06T12:00:00Z') } });
  await prisma.absence.create({ data: { guildId: G, number: 1, userId: B, startDate: new Date('2026-10-08T00:00:00Z'), endDate: new Date('2026-10-09T00:00:00Z'), category: 'URLAUB', reason: 'Urlaub', status: 'APPROVED' } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Tagesbericht – Zahlen stimmen mit den gespeicherten Datensätzen überein', () => {
  it('Schichten, Dienstzeit, Einsätze, Fahndungen, Strafen, Tickets, Ausbildungen', async () => {
    const d = await buildReport(G, 'DAY', ON);
    expect(d.from).toBe('2026-10-06T22:00:00.000Z');
    expect(d.to).toBe('2026-10-07T22:00:00.000Z');
    expect(d.shifts).toMatchObject({ started: 3, ended: 2, stillRunning: 1, activeMembers: 2, netSeconds: 10_800, averageSeconds: 5400 });
    expect(d.shifts.byType).toEqual([{ name: 'Streife', count: 2, netSeconds: 10_800 }, { name: 'SEK', count: 1, netSeconds: 0 }]);
    expect(d.operations).toMatchObject({ created: 3, completed: 1, cancelled: 1, open: 1, byPriority: { URGENT: 1, NORMAL: 2 } });
    expect(d.wanted).toMatchObject({ created: 2, persons: 1, vehicles: 1, revoked: 1, activeTotal: 2 });
    expect(d.penalties).toMatchObject({ total: 4, finesTotal: 800, points: 3, revoked: 1, byKind: { FINE: 3, POINTS: 1 } });
    expect(d.tickets).toEqual({ opened: 1, closed: 1, openTotal: 1 });
    expect(d.trainings).toEqual({ held: 1, participants: 2, passed: 1, failed: 1 });
    expect(d.week).toBeUndefined();
  });
  it('anderer Tag: eigene Zahlen (gestern)', async () => {
    const d = await buildReport(G, 'DAY', new Date('2026-10-06T10:00:00Z'));
    expect(d.shifts).toMatchObject({ started: 1, netSeconds: 10_800, activeMembers: 1 });
    expect(d.operations.created).toBe(1);
    expect(d.tickets).toMatchObject({ opened: 1, closed: 0 });
  });
  it('leerer Tag: Nullen, keine Fehler', async () => {
    const d = await buildReport(G, 'DAY', new Date('2026-09-01T10:00:00Z'));
    expect(d.shifts).toMatchObject({ started: 0, netSeconds: 0, averageSeconds: 0, byType: [] });
    expect(d.penalties).toMatchObject({ total: 0, finesTotal: 0 });
  });
});

describe('Wochenbericht', () => {
  it('Gesamtstunden, aktivste Beamte, Beförderungen, Vorwoche-Vergleich', async () => {
    const w = await buildReport(G, 'WEEK', ON);
    expect(w.from).toBe('2026-10-04T22:00:00.000Z'); // Montag 05.10. 00:00 Berlin
    expect(w.shifts).toMatchObject({ started: 4, netSeconds: 21_600 }); // 3600 + 7200 + 10800
    expect(w.week!.totalHours).toBe(6);
    expect(w.week!.topMembers).toEqual([{ userId: A, netSeconds: 14_400, shifts: 2 }, { userId: B, netSeconds: 7200, shifts: 1 }]);
    expect(w.week!.promotions).toEqual([{ userId: A, from: 'Anwärter', to: 'Beamter' }]);
    expect(w.week!.absencesStarted).toBe(1);
    expect(w.week!.previous).toMatchObject({ netSeconds: 5400, shifts: 1, operations: 0 });
    expect(w.operations.created).toBe(4);
  });
});

describe('Speichern, Darstellung, Veröffentlichen', () => {
  it('idempotent je Zeitraum; Neuberechnung überschreibt; Liste', async () => {
    const r1 = await generate(G, 'DAY', ON, 'u1');
    const r2 = await generate(G, 'DAY', new Date('2026-10-07T20:00:00Z'), 'u2'); // gleicher Berlin-Tag
    expect(r2.id).toBe(r1.id);
    expect(r2.generatedBy).toBe('u2');
    await generate(G, 'WEEK', ON);
    expect((await listReports(G)).map((r) => r.kind).sort()).toEqual(['DAY', 'WEEK']);
    expect((await listReports(G, 'WEEK')).length).toBe(1);
    expect((await getReport(G, r1.id)).periodStart.toISOString()).toBe('2026-10-06T22:00:00.000Z');
    await expect(getReport(G, 'nix')).rejects.toSatisfy((e) => e instanceof ReportError);
  });
  it('Darstellung enthält die Zahlen', async () => {
    const t = renderText(await buildReport(G, 'WEEK', ON));
    expect(t).toContain('Wochenbericht 05.10.2026 – 11.10.2026');
    expect(t).toContain('6 Std Dienstzeit');
    expect(t).toContain('Anwärter → **Beamter**');
    expect(renderEmbed(await buildReport(G, 'DAY', ON)).title).toBe('📊 Tagesbericht 07.10.2026');
  });
  it('Veröffentlichen: ohne Kanal ehrlich, dann posten, dann bearbeiten, gelöschte Nachricht neu, Fehler gemeldet', async () => {
    const r = await generate(G, 'DAY', ON);
    const p = port();
    expect((await publish(G, r.id, p)).status).toBe('no-channel');
    await guildRepository.setSelection(G, 'report-channel', CH);
    expect((await publish(G, r.id, p)).status).toBe('posted');
    expect((await publish(G, r.id, p)).status).toBe('edited');
    (p as any).editMessage.mockRejectedValueOnce(new Error('Unknown Message'));
    expect((await publish(G, r.id, p)).status).toBe('posted');
    (p as any).editMessage.mockRejectedValueOnce(new Error('weg'));
    (p as any).postMessage.mockRejectedValueOnce(new Error('Missing Access'));
    expect(await publish(G, r.id, p)).toMatchObject({ status: 'failed', reason: 'Missing Access' });
  });
});
