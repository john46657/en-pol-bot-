import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
let staffId: string; const pids: string[] = []; const exams: string[] = [];

const questions = [
  { id: 'q1', type: 'SINGLE', text: 'Notruf der Polizei?', options: ['110', '112'], correct: ['0'], points: 1 },
  { id: 'q2', type: 'ORDER', text: 'Reihenfolge Festnahme', options: ['Ansprechen', 'Belehren', 'Durchsuchen'], points: 3, partial: true },
  { id: 'q3', type: 'MATCH', text: 'Zuordnen', options: ['Status 1', 'Status 3'], matches: ['einsatzbereit über Funk', 'Einsatz übernommen'], points: 2 },
  { id: 'q4', type: 'GAP', text: 'Innerorts gelten {{50|fünfzig}} km/h.', points: 1, explanation: 'StVO § 3' },
];

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  staffId = (await makeUser(prisma, 'ex_staff', ['Training Staff'])).id;
  await makeUser(prisma, 'ex_admin', ['System Administrator']);
  for (const n of ['ex_cadet', 'ex_cadet2']) {
    const u = await makeUser(prisma, n, ['Police Member']);
    pids.push((await prisma.personnel.create({ data: { userId: u.id, rank: 'Anwärter' } })).id);
  }
  await makeUser(prisma, 'ex_noprofile', ['Police Member']);
});
afterAll(async () => {
  await prisma.hrExam.deleteMany({ where: { id: { in: exams } } });
  await prisma.personnel.deleteMany({ where: { id: { in: pids } } });
  await app.close();
});

describe('Prüfungen: überarbeitetes System', () => {
  it('validiert Fragen, automatische Bewertung mit Teilpunkten, Einsicht mit Lösungen, Statistik', async () => {
    const staff = (await login(app, 'ex_staff')).agent;
    const cadet = (await login(app, 'ex_cadet')).agent;

    const bad = await staff.post('/api/v1/hr/exams').send({ title: 'Kaputt', questions: [{ id: 'x', type: 'GAP', text: 'ohne Lücke' }] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('Lücke');

    const created = await staff.post('/api/v1/hr/exams').send({ title: 'Streifendienst', category: 'Grundlagen', questions, passPercent: 60, reviewMode: 'SOLUTIONS', shuffleOptions: true, retryHours: 0, examinerIds: [staffId] });
    expect(created.status).toBe(201);
    const id = created.body.id as string; exams.push(id);

    const list = await cadet.get('/api/v1/hr/exams');
    const mine = list.body.find((e: { id: string }) => e.id === id);
    expect(mine).toMatchObject({ category: 'Grundlagen', questionTotal: 4, canEdit: false, canGrade: false, stats: null, me: { state: 'AVAILABLE', attemptsLeft: 3 } });
    expect(mine.questions).toBeUndefined();
    expect((await cadet.get(`/api/v1/hr/exams/${id}`)).status).toBe(404); // Fragen mit Lösungen nur für Prüfer

    const start = await cadet.post(`/api/v1/hr/exams/${id}/start`);
    expect(start.status).toBe(200);
    const v = start.body;
    // keine Lösungen, Lückentext maskiert, Reihenfolge gemischt (nie zufällig die Lösung)
    expect(JSON.stringify(v.questions)).not.toContain('fünfzig');
    expect(v.questions.find((q: { id: string }) => q.id === 'q4').text).toBe('Innerorts gelten {{}} km/h.');
    expect(v.questions.every((q: { correct?: unknown }) => q.correct === undefined)).toBe(true);
    const order = v.questions.find((q: { id: string }) => q.id === 'q2').options.map((o: { i: number }) => o.i);
    expect(order).not.toEqual([0, 1, 2]);
    expect([...order].sort()).toEqual([0, 1, 2]);

    // Fortsetzen liefert denselben Versuch; markierte Fragen werden gespeichert
    expect((await cadet.post(`/api/v1/hr/exams/${id}/start`)).body.id).toBe(v.id);
    expect((await cadet.put(`/api/v1/hr/attempts/${v.id}/answers`).send({ answers: { q1: '0', fremd: 'x' }, flagged: ['q3', 'gibt-es-nicht'] })).body).toEqual({ saved: true });
    expect((await cadet.get(`/api/v1/hr/attempts/${v.id}`)).body).toMatchObject({ answers: { q1: '0' }, flagged: ['q3'] });

    // q2 halb richtig (1 von 3 Positionen → 1 Punkt), q3 falsch, q4 richtig → 3 von 7 = 43 % → nicht bestanden
    const sub = await cadet.post(`/api/v1/hr/attempts/${v.id}/submit`).send({ answers: { q1: '0', q2: ['0', '2', '1'], q3: ['1', '0'], q4: [' Fünfzig '] } });
    expect(sub.status).toBe(200);
    expect(sub.body.result).toMatchObject({ score: 3, maxScore: 7, percent: 43, passed: false });
    const q4 = sub.body.questions.find((q: { id: string }) => q.id === 'q4');
    expect(q4).toMatchObject({ earned: 1, gaps: [['50', 'fünfzig']], explanation: 'StVO § 3' });
    expect(sub.body.questions.find((q: { id: string }) => q.id === 'q2').earned).toBe(1);

    const again = (await cadet.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === id);
    expect(again.me).toMatchObject({ state: 'AVAILABLE', attemptsUsed: 1, attemptsLeft: 2, bestPercent: 43 });

    const res = await staff.get(`/api/v1/hr/exams/${id}/results`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ participants: 1, attempts: 1, passed: 0, passRate: 0, avgPercent: 43 });
    expect(res.body.questions.find((q: { id: string }) => q.id === 'q1')).toMatchObject({ asked: 1, correctRate: 100 });
    expect(res.body.questions.find((q: { id: string }) => q.id === 'q3')).toMatchObject({ correctRate: 0 });
    expect((await cadet.get(`/api/v1/hr/exams/${id}/results`)).status).toBe(404);

    // Annullieren: Versuch zählt nicht mehr
    expect((await cadet.post(`/api/v1/hr/attempts/${v.id}/void`).send({ reason: 'selbst' })).status).toBe(403);
    const voided = await staff.post(`/api/v1/hr/attempts/${v.id}/void`).send({ reason: 'Technische Probleme' });
    expect(voided.status).toBe(200);
    expect(voided.body.voided).toMatchObject({ reason: 'Technische Probleme' });
    expect((await cadet.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === id).me).toMatchObject({ attemptsUsed: 0, attemptsLeft: 3 });
    expect((await staff.post(`/api/v1/hr/attempts/${v.id}/grade`).send({ scores: {} })).status).toBe(409);
  });

  it('Freitext → Prüfer wird benachrichtigt, Bewertung; Zielgruppe, Zeitfenster und Voraussetzung sperren den Start', async () => {
    const staff = (await login(app, 'ex_staff')).agent;
    const cadet2 = (await login(app, 'ex_cadet2')).agent;
    const base = (await staff.post('/api/v1/hr/exams').send({ title: 'Basis', questions: [{ id: 'a', type: 'TEXT', text: 'Erkläre den Funk.', points: 4 }], examinerIds: [staffId], passPercent: 50 })).body.id as string;
    exams.push(base);
    const adv = (await staff.post('/api/v1/hr/exams').send({ title: 'Aufbau', questions: [{ id: 'b', type: 'YESNO', text: 'Ok?', correct: ['ja'] }], requiredExamId: base })).body.id as string;
    exams.push(adv);

    const locked = (await cadet2.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === adv);
    expect(locked.me).toMatchObject({ state: 'LOCKED' });
    expect(locked.requiredExamTitle).toBe('Basis');
    expect((await cadet2.post(`/api/v1/hr/exams/${adv}/start`)).status).toBe(409);

    const a = (await cadet2.post(`/api/v1/hr/exams/${base}/start`)).body;
    const sub = await cadet2.post(`/api/v1/hr/attempts/${a.id}/submit`).send({ answers: { a: 'Funkdisziplin und Codes' } });
    expect(sub.body.status).toBe('SUBMITTED');
    expect(await prisma.notification.count({ where: { userId: staffId, entityType: 'HrExamAttempt', entityId: a.id } })).toBe(1);
    expect((await cadet2.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === base).me.state).toBe('PENDING');

    const pending = await staff.get('/api/v1/hr/attempts').query({ status: 'SUBMITTED', examId: base });
    expect(pending.body.map((r: { id: string }) => r.id)).toEqual([a.id]);
    const g = await staff.post(`/api/v1/hr/attempts/${a.id}/grade`).send({ scores: { a: 3 }, feedback: 'Gut' });
    expect(g.body.result).toMatchObject({ score: 3, passed: true, feedback: 'Gut' });
    expect((await cadet2.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === adv).me.state).toBe('AVAILABLE');

    // Zeitfenster
    const later = new Date(Date.now() + 86_400_000).toISOString();
    expect((await staff.put(`/api/v1/hr/exams/${adv}`).send({ title: 'Aufbau', questions: [{ id: 'b', type: 'YESNO', text: 'Ok?', correct: ['ja'] }], availableFrom: later })).status).toBe(200);
    expect((await cadet2.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === adv).me.state).toBe('NOT_YET');

    // Zielgruppe: Rolle, die der Anwärter nicht hat → Prüfung unsichtbar
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'Training Staff' } });
    expect((await staff.put(`/api/v1/hr/exams/${adv}`).send({ title: 'Aufbau', questions: [{ id: 'b', type: 'YESNO', text: 'Ok?', correct: ['ja'] }], audienceRoleIds: [role.id] })).status).toBe(200);
    expect((await cadet2.get('/api/v1/hr/exams')).body.some((e: { id: string }) => e.id === adv)).toBe(false);
    expect((await cadet2.post(`/api/v1/hr/exams/${adv}/start`)).status).toBe(404);

    // Duplizieren: inaktive Kopie mit denselben Fragen
    const copy = await staff.post(`/api/v1/hr/exams/${base}/duplicate`);
    expect(copy.status).toBe(201);
    exams.push(copy.body.id);
    expect(copy.body).toMatchObject({ title: 'Kopie von Basis', active: false });
    expect((await staff.get(`/api/v1/hr/exams/${copy.body.id}`)).body.questions).toHaveLength(1);
  });

  it('ohne Personalakte kein Start', async () => {
    const admin = (await login(app, 'ex_admin')).agent;
    const id = (await admin.post('/api/v1/hr/exams').send({ title: 'Akte nötig', questions: [{ id: 'a', type: 'YESNO', text: 'Ok?', correct: ['ja'] }] })).body.id as string;
    exams.push(id);
    const u = (await login(app, 'ex_noprofile')).agent;
    expect((await u.get('/api/v1/hr/exams')).body.find((e: { id: string }) => e.id === id).me.state).toBe('NO_PROFILE');
    expect((await u.post(`/api/v1/hr/exams/${id}/start`)).status).toBe(409);
  });
});
