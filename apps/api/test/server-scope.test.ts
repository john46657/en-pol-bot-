import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '730000000000000001', B = '730000000000000002';
let app: INestApplication; let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'scope_admin', ['System Administrator']);
  // Multi-Server: verwendete Server registrieren, alle Testbenutzer als bestätigte Mitglieder
  for (const g of [A, B]) await registerServer(prisma, g, (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
});
afterAll(async () => { await app.close(); });

describe('Daten je Discord-Server getrennt (auch die Leitstelle)', () => {
  it('Berichte: nur auf dem eigenen Server sichtbar und abrufbar; ohne Server alle', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const r = await admin.post('/api/v1/reports').set('x-guild-id', A).send({ type: 'GENERAL', title: 'Bericht Server A', content: { text: 'Inhalt' } });
    expect(r.status).toBe(201);
    const ids = async (guild?: string) => ((await (guild ? admin.get('/api/v1/reports?pageSize=100').set('x-guild-id', guild) : admin.get('/api/v1/reports?pageSize=100'))).body.items as { id: string }[]).map((x) => x.id);
    expect(await ids(A)).toContain(r.body.id);
    expect(await ids(B)).not.toContain(r.body.id);
    expect(await ids()).toContain(r.body.id);
    expect((await admin.get(`/api/v1/reports/${r.body.id}`).set('x-guild-id', B)).status).toBe(404);
    expect((await admin.get(`/api/v1/reports/${r.body.id}`).set('x-guild-id', A)).status).toBe(200);
    const row = await prisma.report.findFirst({ where: { id: r.body.id } });
    expect(row?.serverId).toBeTruthy();
  });

  it('Leitstelle je Server: Einsätze eines Servers sind auf anderen Servern unsichtbar', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const i = await admin.post('/api/v1/cad/incidents').set('x-guild-id', A).send({ title: 'Einsatz nur Server A' });
    expect(i.status).toBe(201);
    const inA = (await admin.get('/api/v1/cad/incidents?active=true').set('x-guild-id', A)).body as { id: string }[];
    expect(inA.map((x) => x.id)).toContain(i.body.id);
    const inB = (await admin.get('/api/v1/cad/incidents?active=true').set('x-guild-id', B)).body as { id: string }[];
    expect(inB.map((x) => x.id)).not.toContain(i.body.id);
    expect((await admin.get(`/api/v1/cad/incidents/${i.body.id}`).set('x-guild-id', B)).status).toBe(404);
    // Nummern bleiben über alle Server eindeutig
    const j = await admin.post('/api/v1/cad/incidents').set('x-guild-id', B).send({ title: 'Einsatz nur Server B' });
    expect(j.status).toBe(201);
    expect(j.body.number).not.toBe(i.body.number);
  });
});
