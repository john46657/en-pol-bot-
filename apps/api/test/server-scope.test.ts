import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ServerLinksService, ownSpace } from '../src/server-links/server-links.service';

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

  it('Personal: Personalakte, Rang und Einträge je Server; dieselbe Person darf auf jedem Server eine Akte haben', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const u = await makeUser(prisma, 'scope_member');
    // gleicher Rangname auf beiden Servern erlaubt, je Server eindeutig
    expect((await admin.post('/api/v1/hr/ranks').set('x-guild-id', A).send({ name: 'Kommissar' })).status).toBe(201);
    expect((await admin.post('/api/v1/hr/ranks').set('x-guild-id', B).send({ name: 'Kommissar' })).status).toBe(201);
    expect((await admin.post('/api/v1/hr/ranks').set('x-guild-id', A).send({ name: 'kommissar' })).status).toBe(409);
    const pa = await admin.post('/api/v1/hr/people').set('x-guild-id', A).send({ userId: u.id, rank: 'Kommissar', callsign: 'A-1' });
    expect(pa.status).toBe(201);
    expect((await admin.post('/api/v1/hr/people').set('x-guild-id', A).send({ userId: u.id })).status).toBe(409);
    const pb = await admin.post('/api/v1/hr/people').set('x-guild-id', B).send({ userId: u.id, callsign: 'A-1' });
    expect(pb.status).toBe(201);
    expect(pb.body.id).not.toBe(pa.body.id);
    const people = async (g: string) => ((await admin.get('/api/v1/hr/people').set('x-guild-id', g)).body.rows as { id: string }[]).map((r) => r.id);
    expect(await people(A)).toContain(pa.body.id);
    expect(await people(A)).not.toContain(pb.body.id);
    expect((await admin.get(`/api/v1/hr/people/${pa.body.id}`).set('x-guild-id', B)).status).toBe(404);
    // Einträge hängen an der Akte: Verwarnung auf A ist auf B nicht in der Liste
    const w = await admin.post(`/api/v1/hr/people/${pa.body.id}/records`).set('x-guild-id', A).send({ type: 'NOTE', summary: 'Notiz nur auf A' });
    expect(w.status).toBe(201);
    expect((await admin.post(`/api/v1/hr/people/${pa.body.id}/records`).set('x-guild-id', B).send({ type: 'NOTE', summary: 'fremd' })).status).toBe(404);
    expect(await prisma.personnelRecord.count({ where: { personnelId: pa.body.id } })).toBe(1);
    const ranks = async (g: string) => ((await admin.get('/api/v1/hr/ranks').set('x-guild-id', g)).body as { name: string }[]).filter((r) => r.name === 'Kommissar').length;
    expect(await ranks(A)).toBe(1);
    expect(await ranks(B)).toBe(1);
  });

  it('Personal-Einstellungen je Server, sonst die gemeinsamen', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const base = (await admin.get('/api/v1/hr/config')).body;
    const own = { ...base, warnings: { ...base.warnings, limit: 7 } };
    expect((await admin.put('/api/v1/hr/config').set('x-guild-id', A).send(own)).status).toBe(200);
    expect((await admin.get('/api/v1/hr/config').set('x-guild-id', A)).body.warnings.limit).toBe(7);
    expect((await admin.get('/api/v1/hr/config').set('x-guild-id', B)).body.warnings.limit).toBe(base.warnings.limit);
    expect((await admin.get('/api/v1/hr/config')).body.warnings.limit).toBe(base.warnings.limit);
  });

  it('bestehende Einträge ohne Server: einmalig dem Heimat-Server zugeordnet, spätere bleiben im gemeinsamen Bestand', async () => {
    const admin = (await login(app, 'scope_admin')).agent;
    const links = app.get(ServerLinksService);
    await prisma.systemSetting.deleteMany({ where: { key: 'servers.legacyAssigned' } });
    const old = await makeUser(prisma, 'scope_legacy');
    const p1 = await prisma.personnel.create({ data: { userId: old.id } }); // ohne Server-Kontext → serverId null
    expect((await admin.put('/api/v1/cad/config').send({ homeGuildId: A })).status).toBe(200);
    expect(await links.assignLegacyRecords()).toBeGreaterThanOrEqual(1);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: p1.id } })).serverId).toBe(ownSpace(A));
    const later = await prisma.personnel.create({ data: { userId: (await makeUser(prisma, 'scope_later')).id } });
    expect(await links.assignLegacyRecords()).toBe(0);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: later.id } })).serverId).toBeNull();
  });
});
