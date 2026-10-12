import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Endpunkte, die das Dashboard für Akademie-Teilnehmer, Fall-Beteiligte und die Discord-Verknüpfung braucht. */
let app: INestApplication; let prisma: PrismaService;
let trainee: { id: string };

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'conn_admin', ['System Administrator']);
  trainee = await makeUser(prisma, 'conn_trainee', ['Police Member']);
});
afterAll(async () => { await app.close(); });

describe('dashboard connections', () => {
  it('academy course detail lists participants with their latest grade', async () => {
    const admin = (await login(app, 'conn_admin')).agent;
    const course = (await admin.post('/api/v1/academy/courses').send({ title: 'Verbindungstest Kurs', passScore: 60 })).body as { id: string };
    const p = await prisma.personnel.create({ data: { userId: trainee.id } });
    const e = await admin.post(`/api/v1/academy/courses/${course.id}/enroll`).send({ personnelId: p.id });
    expect(e.status).toBe(201);
    let d = (await admin.get(`/api/v1/academy/courses/${course.id}`)).body;
    expect(d.enrollments).toEqual([expect.objectContaining({ personnelId: p.id, userId: trainee.id, name: 'conn_trainee', result: null })]);
    expect((await admin.post(`/api/v1/academy/enrollments/${e.body.id}/grade`).send({ score: 75 })).status).toBe(201);
    d = (await admin.get(`/api/v1/academy/courses/${course.id}`)).body;
    expect(d.enrollments[0].result).toMatchObject({ score: 75, passed: true });
    expect((await admin.get('/api/v1/academy/courses/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('investigation detail includes the names of linked persons', async () => {
    const admin = (await login(app, 'conn_admin')).agent;
    const person = await prisma.person.create({ data: { robloxUsername: 'conn_suspect' } });
    const inv = (await admin.post('/api/v1/investigations').send({ title: 'Verbindungstest Fall' })).body as { id: string };
    expect((await admin.post(`/api/v1/investigations/${inv.id}/persons`).send({ personId: person.id, role: 'SUSPECT' })).status).toBeLessThan(300);
    const d = (await admin.get(`/api/v1/investigations/${inv.id}`)).body;
    expect(d.links).toEqual([expect.objectContaining({ role: 'SUSPECT', person: { id: person.id, robloxUsername: 'conn_suspect' } })]);
  });

  it('user detail shows the Discord link, which an admin can remove', async () => {
    const admin = (await login(app, 'conn_admin')).agent;
    expect((await admin.get(`/api/v1/users/${trainee.id}`)).body.discord).toBeNull();
    await prisma.discordLink.create({ data: { userId: trainee.id, discordId: '790000000000000001' } });
    expect((await admin.get(`/api/v1/users/${trainee.id}`)).body.discord).toMatchObject({ discordId: '790000000000000001' });
    expect((await admin.delete(`/api/v1/discord/links/${trainee.id}`)).status).toBe(204);
    expect((await admin.get(`/api/v1/users/${trainee.id}`)).body.discord).toBeNull();
  });
});
