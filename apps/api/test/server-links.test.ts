import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ServerLinksService } from '../src/server-links/server-links.service';

const A = '350000000000000001', B = '350000000000000002', C = '350000000000000003', D = '350000000000000004';
let app: INestApplication; let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'link_admin', ['System Administrator']);
  await makeUser(prisma, 'link_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { OR: [{ key: 'servers.links' }, { key: { startsWith: 'welcome.config@35' } }] } });
  await prisma.person.deleteMany({ where: { robloxUsername: { startsWith: 'Link_' } } });
  await app.get(ServerLinksService).reload();
  await app.close();
});

describe('server links: Discord servers can be together, but do not have to', () => {
  it('validates groups; only settings.manage saves', async () => {
    const admin = (await login(app, 'link_admin')).agent;
    const off = (await login(app, 'link_off')).agent;
    expect((await off.put('/api/v1/server-links').send({ groups: [], sharedRecords: [] })).status).toBe(403);
    expect((await admin.put('/api/v1/server-links').send({ groups: [{ name: 'Allein', guildIds: [A] }] })).status).toBe(400); // min. 2
    expect((await admin.put('/api/v1/server-links').send({ groups: [{ name: 'X', guildIds: [A, B] }, { name: 'Y', guildIds: [B, C] }] })).status).toBe(400); // B doppelt
    expect((await admin.put('/api/v1/server-links').send({ groups: [{ name: 'X', guildIds: [A, B] }], sharedRecords: [A] })).status).toBe(400);
  });

  it('servers are separate by default; a group shares records; the common pool is opt-in', async () => {
    const admin = (await login(app, 'link_admin')).agent;
    const saved = await admin.put('/api/v1/server-links').send({ groups: [{ name: 'Polizei + SEK', guildIds: [A, B], shareRecords: true, shareSettings: true }], sharedRecords: [D] });
    expect(saved.status).toBe(200);
    expect(saved.body.groups[0]).toMatchObject({ name: 'Polizei + SEK', id: expect.any(String) });
    const create = (g: string, name: string, id: string) => admin.post('/api/v1/persons').set('X-Guild-Id', g).send({ robloxUsername: name, robloxUserId: id });
    expect((await create(A, 'Link_Group', '8800001')).status).toBe(201);
    // gleiche Roblox-ID in getrenntem Bereich erlaubt, im selben Bereich nicht
    expect((await create(C, 'Link_Group', '8800001')).status).toBe(201);
    expect((await create(B, 'Link_Group', '8800001')).status).toBe(409);
    const names = async (g?: string) => ((await (g ? admin.get('/api/v1/persons?q=Link_').set('X-Guild-Id', g) : admin.get('/api/v1/persons?q=Link_'))).body.items as { serverId: string | null }[]);
    expect(await names(A)).toHaveLength(1); // Gruppe A+B
    expect(await names(B)).toHaveLength(1);
    expect(await names(C)).toHaveLength(1); // ohne Gruppe: standardmäßig getrennt
    expect(await names('350000000000000009')).toHaveLength(0); // jeder andere Server auch
    expect((await create(D, 'Link_Group', '8800001')).status).toBe(201); // gemeinsamer Bestand (Opt-in)
    expect(await names(D)).toHaveLength(1);
    expect(await names('350000000000000009')).toHaveLength(0);
    expect(await names()).toHaveLength(3); // „Alle Server“
  });

  it('a group with shared settings reads and writes the settings of its main server', async () => {
    const admin = (await login(app, 'link_admin')).agent;
    const cfg = (await admin.get(`/api/v1/welcome/config?guildId=${A}`)).body;
    delete cfg.own;
    // Speichern auf B (zweiter Server der Gruppe) landet beim Haupt-Server A
    expect((await admin.put(`/api/v1/welcome/config?guildId=${B}`).send({ ...cfg, dm: { enabled: true, message: 'Gruppe!' } })).status).toBe(200);
    expect(await prisma.systemSetting.findUnique({ where: { key: `welcome.config@${A}` } })).not.toBeNull();
    expect(await prisma.systemSetting.findUnique({ where: { key: `welcome.config@${B}` } })).toBeNull();
    expect((await admin.get(`/api/v1/welcome/config?guildId=${A}`)).body.dm.message).toBe('Gruppe!');
    // Design über Admin-Einstellungen: theme.accent@B → beim Haupt-Server
    expect((await admin.put(`/api/v1/admin/settings/theme.accent@${B}`).send({ value: 'teal' })).body.key).toBe(`theme.accent@${A}`);
    await prisma.systemSetting.deleteMany({ where: { key: `theme.accent@${A}` } });
    // Overview zählt Akten je Bereich
    const o = (await admin.get('/api/v1/server-links')).body;
    expect(o.counts.shared).toMatchObject({ persons: expect.any(Number) });
  });
});
