import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
const id: Record<string, string> = {};
const uid = (n: string) => id[n] as string;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ s_lead: ['Police Member', 'SEK Leitung'], s_op: ['Police Member', 'SEK'], s_cop: ['Police Member'], s_cop2: ['Police Member'] })) id[n] = (await makeUser(prisma, n, roles)).id;
  await prisma.systemSetting.upsert({ where: { key: 'discord.channels' }, create: { key: 'discord.channels', value: { sek: '200000000000000001' } }, update: { value: { sek: '200000000000000001' } } });
});
afterAll(async () => { await app.close(); });

describe('SEK module', () => {
  it('roster: only sek.manage adds/removes; members need sek.view to be listed', async () => {
    const lead = (await login(app, 's_lead')).agent;
    const cop = (await login(app, 's_cop')).agent;
    expect((await cop.post('/api/v1/sek/members').send({ userId: uid('s_cop') })).status).toBe(403);
    expect((await cop.get('/api/v1/sek/members')).status).toBe(403);
    expect((await lead.post('/api/v1/sek/members').send({ userId: uid('s_op') })).status).toBe(200);
    expect((await lead.post('/api/v1/sek/members').send({ userId: uid('s_op') })).status).toBe(409);
    expect((await lead.post('/api/v1/sek/members').send({ userId: uid('s_op'), discordId: '100000000000000009' })).status).toBe(400);
    const list = (await lead.get('/api/v1/sek/members')).body as { userId: string }[];
    expect(list.map((m) => m.userId)).toEqual([uid('s_op')]);
    expect(await prisma.auditLog.count({ where: { action: 'sek.member.add', entityId: uid('s_op') } })).toBe(1);
  });

  it('mission reports: only SEK members (with sek.report) can file; queued for the SEK channel', async () => {
    const op = (await login(app, 's_op')).agent;
    const lead = (await login(app, 's_lead')).agent; // has sek.report via SEK Leitung, but is no member
    const body = { missionType: 'Zugriff', description: 'Zugriff auf Lagerhalle, 2 Festnahmen.' };
    expect((await lead.post('/api/v1/sek/reports').send(body)).status).toBe(403);
    const r = await op.post('/api/v1/sek/reports').send({ ...body, occurredAt: '2026-10-01T20:00:00.000Z' });
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^SEK-/);
    expect((await op.post('/api/v1/sek/reports').send({ missionType: 'x', description: '' })).status).toBe(400);
    const reports = (await lead.get('/api/v1/sek/reports')).body as { number: string; authorName: string }[];
    expect(reports[0]).toMatchObject({ number: r.body.number, authorName: 's_op' });
    expect(await prisma.discordOutbox.count({ where: { type: 'sek.report', channelKey: 'sek' } })).toBe(1);
  });

  it('applications: one open per officer, members cannot apply, accept adds to roster, no self-decision', async () => {
    const cop = (await login(app, 's_cop')).agent;
    const op = (await login(app, 's_op')).agent;
    const lead = (await login(app, 's_lead')).agent;
    const body = { serviceTime: '3 Monate', motivation: 'Ich möchte bei schweren Lagen helfen.' };
    expect((await op.post('/api/v1/sek/applications').send(body)).status).toBe(409); // already member
    const a = await cop.post('/api/v1/sek/applications').send(body);
    expect(a.status).toBe(201);
    expect((await cop.post('/api/v1/sek/applications').send(body)).status).toBe(409);
    expect((await cop.get('/api/v1/sek/me')).body).toMatchObject({ member: false, openApplication: { number: a.body.number } });
    expect((await cop.get('/api/v1/sek/applications')).status).toBe(403);
    const open = (await lead.get('/api/v1/sek/applications?status=OPEN')).body as { id: string; number: string }[];
    const app1 = open.find((x) => x.number === a.body.number)!;
    expect((await cop.post(`/api/v1/sek/applications/${app1.id}/decision`).send({ status: 'ACCEPTED' })).status).toBe(403);
    expect((await lead.post(`/api/v1/sek/applications/${app1.id}/decision`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await lead.post(`/api/v1/sek/applications/${app1.id}/decision`).send({ status: 'REJECTED' })).status).toBe(409);
    expect((await cop.get('/api/v1/sek/me')).body).toMatchObject({ member: true, openApplication: null });
    expect(await prisma.notification.count({ where: { userId: uid('s_cop'), type: 'SEK' } })).toBe(1);

    // eigene Bewerbung darf die Leitung nicht selbst entscheiden
    const own = await lead.post('/api/v1/sek/applications').send(body);
    const ownId = (await prisma.sekApplication.findUniqueOrThrow({ where: { number: own.body.number } })).id;
    expect((await lead.post(`/api/v1/sek/applications/${ownId}/decision`).send({ status: 'ACCEPTED' })).status).toBe(403);
    // Ablehnung, Discord-DM nur bei verknüpftem Konto
    await prisma.discordLink.create({ data: { userId: uid('s_cop2'), discordId: '100000000000000077' } });
    const cop2 = (await login(app, 's_cop2')).agent;
    const b = await cop2.post('/api/v1/sek/applications').send(body);
    const bId = (await prisma.sekApplication.findUniqueOrThrow({ where: { number: b.body.number } })).id;
    expect((await lead.post(`/api/v1/sek/applications/${bId}/decision`).send({ status: 'REJECTED' })).status).toBe(200);
    expect((await cop2.get('/api/v1/sek/me')).body.member).toBe(false);
    const dm = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'sek.application.decided' } });
    expect(dm.payload).toMatchObject({ discordId: '100000000000000077', status: 'REJECTED' });
  });
});
