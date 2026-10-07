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
    expect(list.filter((m) => [uid('s_op'), uid('s_cop'), uid('s_lead')].includes(m.userId)).map((m) => m.userId)).toEqual([uid('s_op')]);
    expect(await prisma.auditLog.count({ where: { action: 'sek.member.add', entityId: uid('s_op') } })).toBe(1);
    // Auswahl „Beamten hinzufügen“: alle aktiven Benutzer ohne Personalakte/Dienststatus, ohne die schon im SEK
    expect((await cop.get('/api/v1/sek/candidates')).status).toBe(403);
    const cands = ((await lead.get('/api/v1/sek/candidates')).body as { userId: string; name: string; discordLinked: boolean }[]).map((c) => c.userId);
    expect(cands).toEqual(expect.arrayContaining([uid('s_cop'), uid('s_cop2'), uid('s_lead')]));
    expect(cands).not.toContain(uid('s_op'));
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
    expect(reports.find((x) => x.number === r.body.number)).toMatchObject({ authorName: 's_op' });
    expect(await prisma.discordOutbox.count({ where: { type: 'sek.report', channelKey: 'sek', payload: { path: ['number'], equals: r.body.number } } })).toBe(1);
  });
});
