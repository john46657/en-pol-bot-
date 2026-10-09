import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '730000000000000001', B = '730000000000000002';
let app: INestApplication; let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'scope_admin', ['System Administrator']);
});
afterAll(async () => { await app.close(); });

describe('Daten je Discord-Server getrennt (Leitstelle bleibt gemeinsam)', () => {
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

  it('Leitstelle bleibt gemeinsam: Einsätze sind auf jedem Server sichtbar', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const i = await admin.post('/api/v1/cad/incidents').set('x-guild-id', A).send({ title: 'Gemeinsamer Einsatz' });
    expect(i.status).toBe(201);
    const list = (await admin.get('/api/v1/cad/incidents?active=true').set('x-guild-id', B)).body as { id: string }[];
    expect(list.map((x) => x.id)).toContain(i.body.id);
  });
});
