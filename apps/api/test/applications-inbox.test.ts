import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, sup: Agent;
const ids: Record<string, string> = {};
const stamp = Date.now();

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'inbox_admin', ['System Administrator']);
  await makeUser(prisma, 'inbox_sup', ['Supervisor']); // applications.view, aber keine Einheiten-Bewerbungen
  admin = (await login(app, 'inbox_admin')).agent;
  sup = (await login(app, 'inbox_sup')).agent;
  const day = (d: number) => new Date(Date.UTC(2026, 0, d));
  ids.p1 = (await prisma.application.create({ data: { number: `IBX-P1-${stamp}`, answers: { roblox: 'x' }, robloxUsername: 'inboxRoblox', discordId: '710000000000000001', discordName: 'inbox_anna', source: 'DISCORD', createdAt: day(1) } })).id;
  ids.p2 = (await prisma.application.create({ data: { number: `IBX-P2-${stamp}`, answers: {}, robloxUsername: 'inboxRoblox2', status: 'REJECTED', createdAt: day(3) } })).id;
  ids.q1 = (await prisma.qualificationApplication.create({ data: { number: `IBX-Q1-${stamp}`, unit: 'flugstaffel', unitName: 'Flugstaffel', discordId: '710000000000000002', discordName: 'inbox_ben', answers: [{ question: 'Warum?', answer: 'Fliegen' }], createdAt: day(2) } })).id;
});
afterAll(async () => {
  await prisma.application.deleteMany({ where: { number: { startsWith: 'IBX-' } } });
  await prisma.qualificationApplication.deleteMany({ where: { number: { startsWith: 'IBX-' } } });
  await app.close();
});

describe('Bewerbungen – gemeinsame Liste', () => {
  it('lists police and unit applications together, sorted, with type filter and answer labels', async () => {
    const r = await admin.get('/api/v1/applications/inbox').query({ q: 'IBX-', pageSize: 10 });
    expect(r.status).toBe(200);
    expect(r.body.items.map((x: { number: string }) => x.number)).toEqual([`IBX-P2-${stamp}`, `IBX-Q1-${stamp}`, `IBX-P1-${stamp}`]); // neueste zuerst
    expect(r.body.total).toBe(3);
    const q1 = r.body.items[1];
    expect(q1).toMatchObject({ kind: 'qualification', typeKey: 'q:flugstaffel', typeName: 'Flugstaffel', answers: [{ label: 'Warum?', value: 'Fliegen' }] });
    expect(r.body.types.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['police', 'q:flugstaffel']));
    const oldest = await admin.get('/api/v1/applications/inbox').query({ q: 'IBX-', order: 'oldest', pageSize: 2, page: 2 });
    expect(oldest.body.items.map((x: { number: string }) => x.number)).toEqual([`IBX-P2-${stamp}`]);
    const onlyUnit = await admin.get('/api/v1/applications/inbox').query({ q: 'IBX-', type: 'q:flugstaffel' });
    expect(onlyUnit.body.items).toHaveLength(1);
    const open = await admin.get('/api/v1/applications/inbox').query({ q: 'IBX-', status: 'OPEN' });
    expect(open.body.items.map((x: { number: string }) => x.number).sort()).toEqual([`IBX-P1-${stamp}`, `IBX-Q1-${stamp}`]);
  });

  it('without qualifications.view only police applications are listed', async () => {
    const r = await sup.get('/api/v1/applications/inbox').query({ q: 'IBX-' });
    expect(r.status).toBe(200);
    expect(r.body.items.every((x: { kind: string }) => x.kind === 'police')).toBe(true);
    expect(r.body.types.map((t: { key: string }) => t.key)).toEqual(['police']);
  });

  it('deleting needs the delete permission and is audited', async () => {
    expect((await sup.delete(`/api/v1/applications/${ids.p2}`)).status).toBe(403);
    expect((await admin.delete(`/api/v1/applications/${ids.p2}`)).status).toBe(204);
    expect((await admin.delete(`/api/v1/qualifications/applications/${ids.q1}`)).status).toBe(204);
    expect(await prisma.application.findUnique({ where: { id: ids.p2! } })).toBeNull();
    expect(await prisma.qualificationApplication.findUnique({ where: { id: ids.q1! } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: { in: ['application.delete', 'qualifications.application.delete'] }, entityId: { in: [ids.p2!, ids.q1!] } } })).toBe(2);
  });
});
