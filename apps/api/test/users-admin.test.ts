import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '810000000000000001';
let app: INestApplication; let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ua_admin', ['System Administrator']);
  await makeUser(prisma, 'ua_target', ['Police Member']);
  await makeUser(prisma, 'ua_off', []);
  await registerServer(prisma, A, (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
});
afterAll(async () => { await app.close(); });

describe('Benutzer & Rollen', () => {
  it('Rollen setzen lässt Discord-Zuweisungen und Rollen anderer Bereiche unberührt', async () => {
    const adm = (await login(app, 'ua_admin')).agent;
    const target = await prisma.user.findUniqueOrThrow({ where: { username: 'ua_target' } });
    const synced = (await adm.post('/api/v1/roles').set('X-Guild-Id', A).send({ name: 'UA Discord-Rolle' })).body as { id: string; name: string };
    const manual = (await adm.post('/api/v1/roles').set('X-Guild-Id', A).send({ name: 'UA Manuell' })).body as { id: string };
    const member = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'Police Member' } });
    await prisma.userRole.create({ data: { userId: target.id, roleId: synced.id, guildIds: [A] } }); // wie vom Discord-Abgleich

    // Oberfläche schickt alle gehaltenen Rollen mit – das darf weder scheitern noch die Discord-Rolle „festschreiben“
    const set = await adm.put(`/api/v1/users/${target.id}/roles`).set('X-Guild-Id', A).send({ roleIds: [synced.id, manual.id, member.id] });
    expect(set.status).toBe(200);
    const rows = await prisma.userRole.findMany({ where: { userId: target.id } });
    expect(rows.find((r) => r.roleId === synced.id)?.guildIds).toEqual([A]);
    expect(rows.find((r) => r.roleId === manual.id)?.guildIds).toEqual([]);
    expect(rows.some((r) => r.roleId === member.id)).toBe(true);

    // alles abwählen: nur die manuelle Server-Rolle fällt weg
    expect((await adm.put(`/api/v1/users/${target.id}/roles`).set('X-Guild-Id', A).send({ roleIds: [] })).status).toBe(200);
    const left = await prisma.userRole.findMany({ where: { userId: target.id }, include: { role: true } });
    expect(left.some((r) => r.roleId === manual.id)).toBe(false);
    expect(left.filter((r) => r.role.guildId === A).map((r) => r.roleId)).toEqual([synced.id]);
    expect(left.some((r) => r.roleId === member.id)).toBe(true);

    // Detailansicht im Server: nur die Rollen dieses Servers
    const detail = (await adm.get(`/api/v1/users/${target.id}`).set('X-Guild-Id', A)).body as { roles: { guildIds: string[]; role: { id: string } }[] };
    expect(detail.roles.map((r) => r.role.id)).toEqual([synced.id]);
    expect(detail.roles[0]!.guildIds).toEqual([A]);

    // Mitglieder der Rolle mit Herkunft
    const members = (await adm.get(`/api/v1/roles/${synced.id}/members`).set('X-Guild-Id', A)).body as { id: string; source: string }[];
    expect(members).toEqual([expect.objectContaining({ id: target.id, source: 'DISCORD' })]);
  });

  it('wirksame Rechte zeigen Herkunft (Rolle, Sonderrecht) wie die Rechteprüfung', async () => {
    const adm = (await login(app, 'ua_admin')).agent;
    const target = await prisma.user.findUniqueOrThrow({ where: { username: 'ua_target' } });
    const role = await prisma.role.findFirstOrThrow({ where: { guildId: A, name: 'UA Discord-Rolle' } });
    await adm.patch(`/api/v1/roles/${role.id}/permissions`).set('X-Guild-Id', A).send({ permission: 'audit.view', effect: 'ALLOW' });
    type Eff = { roles: { name: string }[]; entries: { key: string; allowed: boolean; source: string; via: string[] }[] };
    const get = async () => (await adm.get(`/api/v1/users/${target.id}/permissions`).set('X-Guild-Id', A)).body as Eff;
    let eff = await get();
    expect(eff.roles.map((r) => r.name)).toEqual(['UA Discord-Rolle']);
    expect(eff.entries.find((e) => e.key === 'audit.view')).toEqual({ key: 'audit.view', allowed: true, source: 'ROLE_ALLOW', via: ['UA Discord-Rolle'] });

    await adm.put(`/api/v1/users/${target.id}/overrides`).set('X-Guild-Id', A).send({ permission: 'audit.view', effect: 'DENY', reason: 'Test' });
    eff = await get();
    expect(eff.entries.find((e) => e.key === 'audit.view')).toMatchObject({ allowed: false, source: 'USER_DENY', via: [] });
    // Sonderrecht gilt nur auf diesem Server – unter „Alle Server“ nicht sichtbar
    expect(((await adm.get(`/api/v1/users/${target.id}`)).body as { overrides: unknown[] }).overrides).toEqual([]);
    expect(((await adm.get(`/api/v1/users/${target.id}`).set('X-Guild-Id', A)).body as { overrides: { permissionKey: string }[] }).overrides.map((o) => o.permissionKey)).toEqual(['audit.view']);

    // ohne users.view kein Einblick
    const off = (await login(app, 'ua_off')).agent;
    expect((await off.get(`/api/v1/users/${target.id}/permissions`)).status).toBe(403);
  });

  it('Benutzerliste filtert nach Status, Rolle und Discord-Verknüpfung', async () => {
    const adm = (await login(app, 'ua_admin')).agent;
    const target = await prisma.user.findUniqueOrThrow({ where: { username: 'ua_target' } });
    const off = await prisma.user.findUniqueOrThrow({ where: { username: 'ua_off' } });
    await adm.put(`/api/v1/users/${off.id}/active`).send({ active: false });
    await prisma.discordLink.create({ data: { userId: target.id, discordId: '811000000000000001' } });
    const names = async (query: Record<string, string>) => ((await adm.get('/api/v1/users').query({ pageSize: 500, ...query })).body as { items: { username: string }[] }).items.map((u) => u.username);
    expect(await names({ status: 'inactive' })).toContain('ua_off');
    expect(await names({ status: 'active' })).not.toContain('ua_off');
    const member = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'Police Member' } });
    expect(await names({ roleId: member.id })).toContain('ua_target');
    expect(await names({ roleId: member.id })).not.toContain('ua_off');
    expect(await names({ linked: 'yes' })).toContain('ua_target');
    expect(await names({ linked: 'no' })).not.toContain('ua_target');
    expect(await names({ q: '811000000000000001' })).toEqual(['ua_target']);
    const row = ((await adm.get('/api/v1/users').query({ q: 'ua_target' })).body as { items: { discord: { discordId: string } | null }[] }).items[0];
    expect(row?.discord?.discordId).toBe('811000000000000001');
    expect((await adm.get('/api/v1/users').query({ status: 'kaputt' })).status).toBe(400);
  });
});
