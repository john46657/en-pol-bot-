import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { weekStartOf } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, member: Agent, viewer: Agent;
let officerPersonnelId = '', officerUserId = '';

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ph_admin', ['System Administrator']);
  const officer = await makeUser(prisma, 'ph_officer', ['Police Member']);
  officerUserId = officer.id;
  // darf Laufbahn und Personal sehen, aber keine Verwarnungen
  await prisma.role.create({ data: { name: 'PH Laufbahn', permissions: { create: ['career.view', 'personnel.view'].map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) } } });
  await makeUser(prisma, 'ph_viewer', ['PH Laufbahn']);
  admin = (await login(app, 'ph_admin')).agent;
  member = (await login(app, 'ph_officer')).agent;
  viewer = (await login(app, 'ph_viewer')).agent;
  const p = await prisma.personnel.create({ data: { userId: officer.id, rank: 'Polizeimeister', team: 'Streife', joinDate: new Date('2026-01-05T10:00:00Z'), rankSince: new Date('2026-03-01T10:00:00Z') } });
  officerPersonnelId = p.id;
});
afterAll(async () => { await app.close(); });

describe('Digitale Beamtenlaufbahn', () => {
  it('chronologische Übersicht mit Datum, Ereignis, Bearbeiter, Beschreibung; alte Dienstgrade bleiben', async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'ph_admin' } });
    await prisma.personnelRecord.createMany({ data: [
      { personnelId: officerPersonnelId, type: 'PROMOTION', summary: 'Polizeimeisteranwärter → Polizeimeister', data: { from: 'Polizeimeisteranwärter', to: 'Polizeimeister', approvers: ['ph_admin'] }, createdById: adminUser.id, createdAt: new Date('2026-03-01T10:00:00Z') },
      { personnelId: officerPersonnelId, type: 'TRANSFER', summary: 'Verkehr → Streife', createdById: adminUser.id, createdAt: new Date('2026-04-01T10:00:00Z') },
      { personnelId: officerPersonnelId, type: 'AWARD', summary: 'Ehrennadel', createdById: adminUser.id, createdAt: new Date('2026-05-01T10:00:00Z') },
      { personnelId: officerPersonnelId, type: 'WARNING', summary: 'Verspätung', createdById: adminUser.id, createdAt: new Date('2026-05-02T10:00:00Z') },
    ] });
    await prisma.hrRequest.create({ data: { number: 'HR-TEST-1', kind: 'PROMOTION', personnelId: officerPersonnelId, toValue: 'Polizeiobermeister', fromValue: 'Polizeimeister', reason: 'gute Leistungen', requesterId: adminUser.id, status: 'IN_REVIEW', approvals: [{ userId: adminUser.id, name: 'ph_admin', stage: 1, decision: 'APPROVE', comment: 'einverstanden', at: '2026-06-01T10:00:00.000Z' }] } });
    await prisma.dutySession.create({ data: { userId: officerUserId, status: 'ON_DUTY', startedAt: new Date('2026-06-10T18:00:00Z'), endedAt: new Date('2026-06-10T20:30:00Z') } });
    const r = await admin.get(`/api/v1/hr/people/${officerPersonnelId}/career`);
    expect(r.status).toBe(200);
    const kinds = r.body.entries.map((e: { kind: string }) => e.kind);
    expect(kinds[0]).toBe('JOINED');
    expect(kinds).toEqual(expect.arrayContaining(['PROMOTION', 'TRANSFER', 'AWARD', 'WARNING', 'DECISION', 'DUTY']));
    const times = r.body.entries.map((e: { at: string }) => Date.parse(e.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const e of r.body.entries) { expect(e.at).toBeTruthy(); expect(e.title).toBeTruthy(); expect(e.source).toBeTruthy(); }
    expect(r.body.entries.find((e: { kind: string }) => e.kind === 'PROMOTION')).toMatchObject({ actor: 'ph_admin', description: expect.stringContaining('Genehmigt von') });
    expect(r.body.entries.find((e: { kind: string; title: string }) => e.kind === 'DECISION' && e.title.includes('genehmigt'))).toMatchObject({ actor: 'ph_admin', description: 'einverstanden' });
    expect(r.body.entries.find((e: { kind: string }) => e.kind === 'DUTY').title).toContain('2 h 30 min');
    expect(r.body.totals.dutyMinutes).toBe(150);
  });
  it('geschützte Einträge nur mit Recht; Laufbahn nur mit career.view', async () => {
    const r = await viewer.get(`/api/v1/hr/people/${officerPersonnelId}/career`);
    expect(r.status).toBe(200);
    expect(r.body.entries.some((e: { kind: string }) => e.kind === 'WARNING')).toBe(false);
    expect((await member.get(`/api/v1/hr/people/${officerPersonnelId}/career`)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'career.read', entityId: officerPersonnelId } })).toBeGreaterThanOrEqual(2);
  });
  it('Beförderungsvoraussetzungen werden geprüft und fehlende verständlich angezeigt', async () => {
    const exam = await prisma.hrExam.create({ data: { title: 'Laufbahnprüfung', questions: [] } });
    await prisma.hrRank.createMany({ data: [
      { name: 'Polizeiobermeister', position: 1, requirements: [{ id: '11111111-1111-4111-8111-111111111111', type: 'EXAM', label: '', value: 0, ref: exam.id }, { id: '22222222-2222-4222-8222-222222222222', type: 'MIN_DUTY_HOURS', label: '', value: 1, ref: null }] },
      { name: 'Polizeimeister', position: 2 },
    ] });
    const r = await admin.get(`/api/v1/hr/people/${officerPersonnelId}/career`);
    const next = r.body.next[0];
    expect(next.rankName).toBe('Polizeiobermeister');
    expect(next.eligible).toBe(false);
    expect(next.results.find((x: { type: string }) => x.type === 'EXAM')).toMatchObject({ met: false, current: 'offen', needed: 'bestanden', label: expect.stringContaining('Laufbahnprüfung') });
    expect(next.results.find((x: { type: string }) => x.type === 'MIN_DUTY_HOURS').met).toBe(true);
    // Laufbahn ändert nichts: Dienstgrad unverändert
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: officerPersonnelId } })).rank).toBe('Polizeimeister');
  });
});

describe('Adaptives Prüfungszentrum', () => {
  const q = (id: string, topic: string, difficulty = 'MEDIUM') => ({ id, type: 'SINGLE', text: `Frage ${id}`, options: ['richtig', 'falsch'], correct: ['0'], points: 1, topic, difficulty });
  let examId = '';
  it('Themen, Schwierigkeit, Ziehregeln und Fallbeispiel mit Kriterienkatalog speichern', async () => {
    const body = {
      title: 'Theorie Streifendienst', passPercent: 70, maxAttempts: 3, retryHours: 0, autoGrade: true,
      questions: [q('a1', 'Verkehrskontrolle'), q('a2', 'Verkehrskontrolle', 'HARD'), q('b1', 'Festnahme'), q('b2', 'Festnahme'), q('c1', 'Recht'),
        { id: 'f1', type: 'CASE', text: 'Fiktiver Fall: Kontrolle bei Nacht …', points: 4, topic: 'Führungsaufgabe', caseKind: 'LEADERSHIP', rubric: [{ id: 'k1', label: 'Eigensicherung', points: 2 }, { id: 'k2', label: 'Kommunikation', points: 2 }] }],
      drawRules: [{ topic: 'Verkehrskontrolle', difficulty: null, count: 1 }, { topic: 'Festnahme', difficulty: null, count: 1 }, { topic: 'Führungsaufgabe', difficulty: null, count: 1 }],
    };
    const r = await admin.post('/api/v1/hr/exams').send(body);
    expect(r.status).toBe(201);
    examId = r.body.id;
    const d = await admin.get(`/api/v1/hr/exams/${examId}`);
    expect(d.body.drawRules).toHaveLength(3);
    expect(d.body.questions.find((x: { id: string }) => x.id === 'f1')).toMatchObject({ caseKind: 'LEADERSHIP', rubric: [{ id: 'k1' }, { id: 'k2' }] });
  });
  it('entfernte Aufgaben (Verkehrsunfall, Leitstellenübung) werden abgelehnt', async () => {
    expect((await admin.post('/api/v1/hr/exams').send({ title: 'Leitstellenübung', questions: [q('x', 'Recht')] })).status).toBe(400);
    expect((await admin.post('/api/v1/hr/exams').send({ title: 'Prüfung', questions: [q('x', 'Verkehrsunfall')] })).status).toBe(400);
    expect((await admin.post('/api/v1/hr/exams').send({ title: 'Prüfung', questions: [{ id: 'x', type: 'CASE', text: 'Fall', caseKind: 'TRAFFIC_ACCIDENT', rubric: [{ id: 'a', label: 'A', points: 1 }] }] })).status).toBe(400);
  });
  it('zufällige Zusammenstellung nach Regeln, manuelle Bewertung nach Kriterien, schwache Themen markiert, Ergebnis in der Personalakte', async () => {
    const cur = (await admin.get(`/api/v1/hr/exams/${examId}`)).body;
    const upd = await admin.put(`/api/v1/hr/exams/${examId}`).send({ title: cur.title, questions: cur.questions, drawRules: cur.drawRules, passPercent: 70, maxAttempts: 3, retryHours: 0, active: true });
    expect(upd.status).toBe(200);
    const start = await member.post(`/api/v1/hr/exams/${examId}/start`);
    expect(start.status).toBe(200);
    const qs = start.body.questions as { id: string; topic: string; type: string; rubric?: unknown }[];
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((x) => x.topic))).toEqual(new Set(['Verkehrskontrolle', 'Festnahme', 'Führungsaufgabe']));
    expect(qs.find((x) => x.type === 'CASE')!.rubric).toBeUndefined(); // Teilnehmer sehen den Kriterienkatalog nicht vorab
    // Festnahme falsch, Verkehrskontrolle richtig, Fallbeispiel offen
    const answers = Object.fromEntries(qs.map((x) => [x.id, x.type === 'CASE' ? 'Ich sichere zuerst …' : x.topic === 'Festnahme' ? '1' : '0']));
    const sub = await member.post(`/api/v1/hr/attempts/${start.body.id}/submit`).send({ answers });
    expect(sub.body.status).toBe('SUBMITTED'); // Fallbeispiel → manuelle Bewertung
    const caseQ = qs.find((x) => x.type === 'CASE')!;
    const g = await admin.post(`/api/v1/hr/attempts/${start.body.id}/grade`).send({ scores: {}, criteria: { [caseQ.id]: { k1: 2, k2: 1 } }, feedback: 'Festnahme wiederholen' });
    expect(g.status).toBe(200);
    expect(g.body.result).toMatchObject({ score: 4, maxScore: 6, passed: false, weakTopics: ['Festnahme'] });
    expect(g.body.questions.find((x: { id: string }) => x.id === caseQ.id)).toMatchObject({ earned: 3, rubricAwarded: { k1: 2, k2: 1 } });
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { personnelId: officerPersonnelId, type: 'EXAM' }, orderBy: { createdAt: 'desc' } });
    expect(rec).toMatchObject({ details: 'Festnahme wiederholen', data: expect.objectContaining({ weakTopics: ['Festnahme'], passed: false }) });
    // nicht bestanden → keine Beförderung, Dienstgrad unverändert
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: officerPersonnelId } })).rank).toBe('Polizeimeister');
  });
  it('Wiederholung bevorzugt schwache Themen; Fortschritt je Beamtem', async () => {
    const again = await member.post(`/api/v1/hr/exams/${examId}/start`);
    expect(again.status).toBe(200);
    expect(again.body.questions.some((x: { topic: string }) => x.topic === 'Festnahme')).toBe(true);
    const mine = await member.get('/api/v1/hr/me/exam-progress');
    expect(mine.status).toBe(200);
    expect(mine.body.weakTopics).toEqual(['Festnahme']);
    expect(mine.body.exams[0]).toMatchObject({ title: 'Theorie Streifendienst', attemptsUsed: 1, attemptsLeft: 2, passed: false, bestPercent: 67, weakTopics: ['Festnahme'], feedback: 'Festnahme wiederholen' });
    expect((await admin.get(`/api/v1/hr/people/${officerPersonnelId}/exam-progress`)).body.summary).toMatchObject({ examsTotal: 1, examsPassed: 0 });
    expect((await viewer.get(`/api/v1/hr/people/${officerPersonnelId}/exam-progress`)).status).toBe(403); // braucht zusätzlich exam.view
  });
  it('Prüfung mit Versuchen kann nicht gelöscht werden (Nachweise bleiben)', async () => {
    const del = await admin.delete(`/api/v1/hr/exams/${examId}`);
    expect(del.status).toBe(409);
    expect(await prisma.hrExamAttempt.count({ where: { examId } })).toBeGreaterThanOrEqual(2);
  });
});

describe('Personalbedarfs- und Aktivitätsprognose', () => {
  it('nur für Berechtigte; kennzeichnet Schätzung, Datenbasis, kleine Stichproben', async () => {
    expect((await member.get('/api/v1/forecast')).status).toBe(403);
    const empty = await admin.get('/api/v1/forecast').query({ weeks: 4 });
    expect(empty.status).toBe(200);
    expect(empty.body.estimateNotice).toMatch(/Schätzungen/);
    expect(empty.body.basis).toMatchObject({ weeks: 4, timezone: 'Europe/Berlin' });
    expect(['NONE', 'LOW']).toContain(empty.body.confidence.duty.level);
  });
  it('rechnet mit erfassten Dienstzeiten und Einsätzen, erkennt geringe Besetzung und Auffälligkeiten', async () => {
    const to = weekStartOf(new Date());
    const day = 86_400_000;
    for (let w = 1; w <= 8; w++) {
      const monday = new Date(to.getTime() - w * 7 * day);
      // jede Woche Montag 18–20 Uhr zwei Beamte (lokal ≈ UTC+1/2), dazu Einsätze
      for (const u of [officerUserId]) await prisma.dutySession.create({ data: { userId: u, status: 'ON_DUTY', startedAt: new Date(monday.getTime() + 17 * 3_600_000), endedAt: new Date(monday.getTime() + 19 * 3_600_000) } });
      const n = w === 1 ? 20 : 3; // letzte Woche auffällig viele
      for (let i = 0; i < n; i++) await prisma.cadIncidentStat.create({ data: { incidentId: crypto.randomUUID(), number: `E-T-${w}-${i}`, priority: 'MEDIUM', status: 'CLOSED', source: 'MANUAL', createdAt: new Date(monday.getTime() + 2 * 3_600_000 + i * 60_000), closedAt: new Date(monday.getTime() + 3 * 3_600_000) } });
    }
    const r = await admin.get('/api/v1/forecast').query({ weeks: 8, minStaff: 1 });
    expect(r.status).toBe(200);
    const b = r.body;
    expect(b.weekly).toHaveLength(8);
    expect(b.weekly.every((w: { dutyHours: number }) => w.dutyHours >= 2)).toBe(true);
    expect(b.weekly.at(-1).incidents).toBe(20);
    expect(b.anomalies.incidents.at(-1)).toMatchObject({ value: 20, direction: 'up' });
    expect(b.estimates.nextWeeksIncidents[0]).toEqual(expect.objectContaining({ value: expect.any(Number), low: expect.any(Number), high: expect.any(Number) }));
    expect(b.lowStaffing.length).toBeGreaterThan(0);
    expect(b.hotspots.length).toBeGreaterThan(0); // Einsätze nachts ohne Besetzung
    expect(b.suggestions.join(' ')).toMatch(/Schicht verstärken prüfen/);
    expect(b.basis.dutySessions).toBeGreaterThanOrEqual(8);
    expect(b.byDepartment.find((d: { department: string }) => d.department === 'Streife')).toBeTruthy();
    // löst nichts aus: keine neuen Personalakten-Einträge oder Anträge
    expect(await prisma.hrRequest.count({ where: { personnelId: officerPersonnelId, number: { not: 'HR-TEST-1' } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'forecast.read' } })).toBeGreaterThanOrEqual(2);
  });
});
