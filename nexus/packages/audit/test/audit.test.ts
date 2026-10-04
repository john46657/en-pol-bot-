import { auditRepository, prisma } from '@nexus/database';
import { AREAS, areaCounts, areaOf, exportCsv, missingFields, query } from '../src/index.js';
import { endShift, saveType, startShift, pauseShift, resumeShift, createUnit } from '@nexus/shifts';
import { assignUnit, changeStatus, createOperation } from '@nexus/operations';
import { createNotice, revokeNotice, updateNotice } from '@nexus/wanted';
import { claim, closeTicket, openTicket, saveCategory as saveTicketCategory, setPriority } from '@nexus/tickets';
import { approve as approveAbsence, requestAbsence } from '@nexus/absences';
import { penalties, vehicles } from '@nexus/fleet';
import { createTraining, enroll, grade, saveCourse, startTraining } from '@nexus/training';
import { approve as approvePromotion, requestPromotion } from '@nexus/promotions';
import { createRecord, saveRank } from '@nexus/personnel';
import { saveLevel, setLevel } from '@nexus/danger';
import { saveChannel, setAccess } from '@nexus/radio';
import { award, saveQualification } from '@nexus/qualifications';
import { saveConfig } from '@nexus/sek';
import { generate } from '@nexus/reports';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const G = 'audittest-guild';
const [A, B, BOSS] = ['900000000000290001', '900000000000290002', '900000000000290003'];
const trainer = { userId: BOSS, manage: true, canExam: true };
const fakeDiscord = () => ({ createChannel: vi.fn(async () => '800000000000290001'), deleteChannel: vi.fn(async () => {}), fetchMessages: vi.fn(async () => []), send: vi.fn(async () => {}), sendDm: vi.fn(async () => {}), setMemberAccess: vi.fn(async () => {}) });
const port = () => {
  const roles = new Map<string, Set<string>>();
  const driver = { getRoleIds: async (u: string) => [...(roles.get(u) ?? [])], add: async (u: string, r: string) => void roles.set(u, (roles.get(u) ?? new Set()).add(r)), remove: async (u: string, r: string) => void roles.get(u)?.delete(r) };
  return { sendDm: vi.fn(async () => {}), postMessage: vi.fn(async () => ({ id: 'm' })), editMessage: vi.fn(), roleDriver: () => driver } as never;
};
const actions = async () => (await prisma.auditLog.findMany({ where: { guildId: G } })).map((a) => a.action);

/** Zähler/Zustände ohne Fremdschlüssel überleben das Löschen des Servers – für wiederholbare Läufe aufräumen. */
const cleanup = async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  const where = { guildId: G };
  await Promise.all([prisma.operationCounter, prisma.wantedCounter, prisma.ticketCounter, prisma.penaltyCounter, prisma.trainingCounter, prisma.absenceCounter, prisma.promotionCounter, prisma.dangerState, prisma.dangerEvent, prisma.radioEvent, prisma.sekConfig].map((m) => (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where })));
};

beforeAll(async () => {
  await cleanup();
  await prisma.guild.create({ data: { id: G, name: 'Audit', settings: { create: {} } } });
  const r1 = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true, discordRoleId: '900000000000299001' }, 'x');
  const r2 = await saveRank(G, { name: 'Beamter', order: 2, discordRoleId: '900000000000299002' }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: r1.id });
  await createRecord({ guildId: G, userId: B, rpName: 'Bert', actorId: 'x', rankId: r1.id });

  // --- Shifts & Streifen ---
  const type = await saveType(G, { name: 'Streife' }, BOSS);
  const s = await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] });
  await pauseShift(G, A);
  await resumeShift(G, A);
  const unit = await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
  // --- Einsätze ---
  const op = await createOperation({ guildId: G, actorId: BOSS, kind: 'Raub', location: 'Bank' });
  await assignOpUnit(op.id, unit.id);
  await changeStatus({ guildId: G, operationId: op.id, to: 'ACTIVE', actorId: BOSS });
  await changeStatus({ guildId: G, operationId: op.id, to: 'COMPLETED', actorId: BOSS, report: 'Täter festgenommen und Beute gesichert.' });
  await endShift(G, s.id, { actorId: A });
  const op2 = await createOperation({ guildId: G, actorId: BOSS, kind: 'Fehlalarm', location: 'Park' });
  await assignOpUnit(op2.id, (await createUnit({ guildId: G, userId: B, callsign: 'Bruno 2' }).catch(async () => null))?.id ?? '', true);
  // --- Fahndungen ---
  const w = await createNotice({ guildId: G, kind: 'PERSON', actorId: A, reason: 'Raubüberfall', subjectName: 'Max Mustermann' });
  await updateNotice(G, w.id, { lastSeen: 'Flughafen' }, A);
  await revokeNotice(G, w.id, 'Festgenommen', BOSS);
  // --- Tickets ---
  const cat = await saveTicketCategory(G, { name: 'Support' }, BOSS);
  const d = fakeDiscord();
  const t = await openTicket({ guildId: G, userId: A, username: 'Anna', categoryId: cat.id, subject: 'Hilfe bitte' }, d);
  const staff = { userId: BOSS, roleIds: [], manage: true, handle: true };
  await claim(G, t.id, staff, d);
  await setPriority(G, t.id, 'URGENT', staff);
  await closeTicket(G, t.id, 'gelöst', staff, d);
  // --- Abmeldungen ---
  const day = (n: number) => new Date(Date.UTC(2026, 9, 7 + n));
  const abs = await requestAbsence({ guildId: G, userId: A, start: day(1), end: day(3), category: 'URLAUB', reason: 'Urlaub' }, new Date('2026-10-07T10:00:00Z'));
  await approveAbsence({ guildId: G, absenceId: abs.id, actorId: BOSS }, new Date('2026-10-07T10:00:00Z'));
  // --- Strafen & Fahrzeuge ---
  await penalties.issuePenalty({ guildId: G, kind: 'FINE', subjectName: 'X Y', reason: 'Rotlicht', amount: 100, issuedBy: A });
  const v = await vehicles.addVehicle({ guildId: G, plate: 'LS-PD 1', type: 'Streifenwagen', actorId: BOSS });
  await vehicles.reportDamage({ guildId: G, vehicleId: v.id, description: 'Kratzer', actorId: A });
  // --- Ausbildung / Qualifikation ---
  const course = await saveCourse(G, { name: 'Grundkurs', theoryMax: 100 }, BOSS);
  const tr = await createTraining({ guildId: G, courseId: course.id, scheduledAt: new Date(Date.now() + 86_400_000), actorId: BOSS, trainerIds: [BOSS] });
  await enroll({ guildId: G, trainingId: tr.id, userId: B, actorId: B });
  await startTraining(G, tr.id, trainer);
  await grade({ guildId: G, trainingId: tr.id, userId: B, part: 'THEORY', points: 90, actor: trainer });
  const q = await saveQualification(G, { name: 'SEK' }, BOSS);
  await award({ guildId: G, qualificationId: q.id, userId: B, actorId: BOSS });
  // --- Beförderung inkl. Rollenänderung ---
  const req = await requestPromotion({ guildId: G, userId: A, toRankId: r2.id, requestedBy: BOSS });
  await approvePromotion({ guildId: G, requestId: req.id, actorId: B, port: port() });
  // --- Gefahrenstatus, Funk, SEK, Berichte ---
  await setLevel({ guildId: G, level: 3, actorId: BOSS, roleIds: [], reason: 'Lage' });
  await saveLevel(G, { level: 2, name: 'Gelb' }, BOSS);
  await saveChannel(G, { channelId: '800000000000290009', name: 'Funk 1' }, BOSS);
  await setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: BOSS });
  await saveConfig(G, {}, BOSS);
  await generate(G, 'DAY', new Date(), BOSS);
  // --- Konfiguration / Bewerbung (Fachmodule früherer Phasen schreiben diese Einträge) ---
  await auditRepository.log({ guildId: G, actorId: BOSS, action: 'settings.selection.set', resource: ['GuildSettings', 'log-channel'], before: { value: null }, after: { value: '1' } });
  await auditRepository.log({ guildId: G, actorId: B, action: 'submission.submitted', resource: ['ApplicationSubmission', 'sub1'], after: { status: 'SUBMITTED' } });

  async function assignOpUnit(operationId: string, unitId: string, optional = false) {
    if (optional && !unitId) return;
    await assignUnit(G, operationId, unitId, BOSS);
  }
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Abdeckung: jede Aktion der genannten Bereiche hinterlässt einen Audit-Eintrag', () => {
  const expected: [string, string[]][] = [
    ['applications', ['submission.submitted']],
    ['roles', ['role.change']],
    ['promotions', ['promotion.requested', 'promotion.approved']],
    ['training', ['training.created', 'training.enrolled', 'training.started', 'training.graded', 'training.passed', 'qualification.awarded']],
    ['shifts', ['shift.started', 'shift.paused', 'shift.resumed', 'shift.ended', 'unit.created']],
    ['operations', ['operation.created', 'operation.unit.assigned', 'operation.status']],
    ['wanted', ['wanted.created', 'wanted.updated', 'wanted.revoked']],
    ['danger', ['danger.level.set']],
    ['tickets', ['ticket.opened', 'ticket.claimed', 'ticket.priority', 'ticket.closed']],
    ['absences', ['absence.requested', 'absence.approved']],
    ['sek', ['sek.config.saved']],
    ['penalties', ['penalty.issued', 'vehicle.created', 'vehicle.damage']],
    ['radio', ['radio.access.added', 'radio.channel.added']],
    ['reports', ['report.generated']],
    ['config', ['settings.selection.set', 'ticket.category.created']],
  ];
  it.each(expected)('%s', async (area, wanted) => {
    const have = await actions();
    for (const a of wanted) expect(have, `${area}: ${a}`).toContain(a);
    expect(wanted.every((a) => areaOf(a) === area || area === 'config' || a.startsWith('unit.'))).toBe(true);
  });

  it('jeder Eintrag enthält Server, Aktion, Zeit und (Benutzer oder Automation) sowie einen Datensatz', async () => {
    const all = await prisma.auditLog.findMany({ where: { guildId: G } });
    expect(all.length).toBeGreaterThan(40);
    const problems = all.map((e) => ({ action: e.action, miss: missingFields(e) })).filter((x) => x.miss.length > 0);
    expect(problems).toEqual([]);
    expect(all.every((e) => e.createdAt instanceof Date && e.guildId === G)).toBe(true);
  });

  it('Vorher/Nachher bei Änderungen', async () => {
    const upd = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'wanted.updated' } });
    expect(upd.before).toMatchObject({ lastSeen: null });
    expect(upd.after).toMatchObject({ lastSeen: 'Flughafen' });
    const sel = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'settings.selection.set' } });
    expect(sel).toMatchObject({ before: { value: null }, after: { value: '1' } });
    const role = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'role.change' } });
    expect(role.before).toBeTruthy();
    expect(role.after).toBeTruthy();
  });
});

describe('Auswertung', () => {
  it('areaOf: spezifischster Präfix gewinnt, Unbekanntes → other', () => {
    expect(areaOf('ticket.category.created')).toBe('config');
    expect(areaOf('ticket.closed')).toBe('tickets');
    expect(areaOf('unit.disbanded')).toBe('shifts');
    expect(areaOf('irgendwas.neues')).toBe('other');
    expect(new Set(AREAS.map((a) => a.key)).size).toBe(AREAS.length);
  });
  it('Filter nach Bereich (ohne Fremdes), Benutzer, Datensatz, Ergebnis, Suche', async () => {
    const tickets = await query({ guildId: G, area: 'tickets', limit: 200 });
    expect(tickets.items.map((e) => e.action).sort()).toEqual(['ticket.claimed', 'ticket.closed', 'ticket.opened', 'ticket.priority']); // ohne ticket.category.created
    expect((await query({ guildId: G, area: 'config', limit: 200 })).items.map((e) => e.action)).toEqual(expect.arrayContaining(['ticket.category.created', 'settings.selection.set']));
    expect((await query({ guildId: G, actorId: A, limit: 200 })).items.every((e) => e.actorId === A)).toBe(true);
    const rid = (await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'wanted.created' } })).resourceId!;
    expect((await query({ guildId: G, resourceId: rid, limit: 200 })).items.map((e) => e.action).sort()).toEqual(['wanted.created', 'wanted.revoked', 'wanted.updated']);
    expect((await query({ guildId: G, search: 'festgenommen', limit: 200 })).items.length).toBeGreaterThan(0);
    expect((await query({ guildId: G, result: 'failed' })).items).toHaveLength(0);
    expect((await query({ guildId: G, area: 'tickets', from: new Date(Date.now() + 3600_000) })).items).toHaveLength(0);
  });
  it('Blättern: Cursor liefert alles genau einmal, neueste zuerst', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const p = await query({ guildId: G, limit: 7, cursor });
      seen.push(...p.items.map((e) => e.id));
      cursor = p.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(await prisma.auditLog.count({ where: { guildId: G } }));
    const first = await query({ guildId: G, limit: 3 });
    expect(first.items[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(first.items[2]!.createdAt.getTime());
  });
  it('Zähler je Bereich', async () => {
    const c = Object.fromEntries((await areaCounts(G)).map((x) => [x.key, x.count]));
    expect(c['tickets']).toBe(4);
    expect(c['wanted']).toBe(3);
    expect(c['danger']).toBeGreaterThanOrEqual(1);
  });
  it('CSV-Export: Kopfzeile, Bereichsnamen, Formelinjektion neutralisiert, Mandantentrennung', async () => {
    await auditRepository.log({ guildId: G, actorId: BOSS, action: 'settings.selection.set', resource: ['GuildSettings', 'x'], reason: '=HYPERLINK("http://böse")', after: { value: 'a,b' } });
    const { csv, rows, truncated } = await exportCsv({ guildId: G, area: 'config' });
    expect(truncated).toBe(false);
    expect(rows).toBeGreaterThanOrEqual(3);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('zeit,bereich,aktion,benutzerTyp,benutzer,datensatzArt,datensatzId,berechtigung,automation,ergebnis,grund,vorher,nachher');
    expect(csv).toContain('Konfigurationsänderungen');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/,=HYPERLINK/);
    const other = await prisma.guild.create({ data: { id: 'audittest-other', name: 'Anderer', settings: { create: {} } } });
    expect((await exportCsv({ guildId: other.id })).rows).toBe(0);
    await prisma.guild.delete({ where: { id: other.id } });
    expect((await exportCsv({ guildId: G }, 5)).truncated).toBe(true);
  });
  it('Das Audit-Log ist append-only (kein update/delete im Repository)', () => {
    expect(Object.keys(auditRepository)).toEqual(expect.not.arrayContaining(['update', 'delete', 'remove']));
  });
});
