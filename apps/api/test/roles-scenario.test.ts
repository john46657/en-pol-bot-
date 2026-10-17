import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const G = '666666666666666601';
const D = { praes: '760000000000000001', member: '760000000000000002' };
/** Nachgestelltes Discord: Rollen je Mitglied auf dem Server. */
const members = new Map<string, string[]>();
const realFetch = globalThis.fetch;
let app: INestApplication; let prisma: PrismaService;
const h = { 'X-Guild-Id': G };

beforeAll(async () => {
  process.env.DISCORD_TOKEN = `${Buffer.from('123456789012345678').toString('base64')}.xxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy`;
  process.env.DISCORD_GUILD_ID = G;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://discord.com/')) return realFetch(input, init);
    const m = url.match(/\/guilds\/(\d+)\/members\/(\d+)$/);
    const roles = m && m[1] === G ? members.get(m[2]!) : undefined;
    return new Response(JSON.stringify(roles ? { roles } : { message: 'Unknown Member' }), { status: roles ? 200 : 404 });
  });
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'sc_owner', ['System Administrator']);
  for (const [u, did, roles] of [['sc_lead', '770000000000000001', [D.praes]], ['sc_mem', '770000000000000002', [D.member]]] as const) {
    const user = await makeUser(prisma, u);
    await prisma.discordLink.create({ data: { userId: user.id, discordId: did } });
    members.set(did, [...roles]);
  }
  await registerServer(prisma, G, []);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.role.updateMany({ where: { discordRoleIds: { isEmpty: false } }, data: { discordRoleIds: [] } });
  delete process.env.DISCORD_TOKEN; delete process.env.DISCORD_GUILD_ID;
  await app.close();
});

describe('Rollen & Rechte im Server-Kontext', () => {
  it('neue Rollen kommen ganz unten (nicht gleichrangig), Sortierung liefert nur Rollen dieses Servers', async () => {
    const own = (await login(app, 'sc_owner')).agent;
    const a = await own.post('/api/v1/roles').set(h).send({ name: 'Szenario A', guildId: G });
    const b = await own.post('/api/v1/roles').set(h).send({ name: 'Szenario B', guildId: G });
    expect(a.status).toBe(201);
    expect(b.body.priority).toBeGreaterThan(a.body.priority);
    const lowest = Math.max(...((await own.get('/api/v1/roles').set(h)).body as { priority: number }[]).map((r) => r.priority));
    expect(b.body.priority).toBe(lowest);
    const order = await own.put('/api/v1/roles/order').set(h).send({ ids: [b.body.id, a.body.id] });
    expect(order.status).toBe(200);
    expect((order.body as { guildId: string | null }[]).every((r) => r.guildId === G)).toBe(true);
  });

  it('verknüpfte Discord-Rolle wirkt sofort, die Rechte gelten auf dem Server, Leitung verwaltet Rollen darunter', async () => {
    const own = (await login(app, 'sc_owner')).agent;
    const lead = (await login(app, 'sc_lead')).agent;
    expect((await lead.get('/api/v1/auth/me').set(h)).body.roles).toEqual([]); // noch nicht verknüpft (Abgleich gemerkt)

    const enp = (await own.post('/api/v1/roles').set(h).send({ name: 'enp Leitung', guildId: G })).body as { id: string };
    const roles = (await own.get('/api/v1/roles').set(h)).body as { id: string; name: string }[];
    const pm = roles.find((r) => r.name === 'Police Member')!;
    // ganz nach oben schieben (wie im Rollen-Editor), Rechte setzen, Discord-Rolle verknüpfen
    expect((await own.put('/api/v1/roles/order').set(h).send({ ids: [enp.id, ...roles.filter((r) => r.id !== enp.id).map((r) => r.id)] })).status).toBe(200);
    for (const p of ['dashboard.view', 'roles.view', 'roles.manage', 'cad.*']) expect((await own.patch(`/api/v1/roles/${enp.id}/permissions`).set(h).send({ permission: p, effect: 'ALLOW' })).status).toBe(200);
    expect((await own.patch(`/api/v1/roles/${enp.id}`).set(h).send({ discordRoleIds: [D.praes] })).status).toBe(200);

    const me = (await lead.get('/api/v1/auth/me').set(h)).body as { roles: string[]; permissions: string[] };
    expect(me.roles).toEqual(['enp Leitung']);
    expect(me.permissions).toEqual(expect.arrayContaining(['roles.manage', 'cad.view', 'cad.manage_settings']));
    expect((await lead.get('/api/v1/cad/incidents').set(h)).status).toBe(200);
    // Rollen darunter verwalten, eigene Rolle nicht
    expect((await lead.patch(`/api/v1/roles/${pm.id}/permissions`).set(h).send({ permission: 'cad.view', effect: 'ALLOW' })).status).toBe(200);
    expect((await lead.patch(`/api/v1/roles/${enp.id}/permissions`).set(h).send({ permission: 'cad.view', effect: 'DENY' })).status).toBe(403);

    // Leitung hat zusätzlich noch eine niedrigere Rolle mit ✕ – die höhere Rolle entscheidet, nichts geht verloren
    expect((await own.patch(`/api/v1/roles/${pm.id}/permissions`).set(h).send({ permission: 'cad.manage_settings', effect: 'DENY' })).status).toBe(200);
    expect((await own.patch(`/api/v1/roles/${pm.id}`).set(h).send({ discordRoleIds: [D.member] })).status).toBe(200);
    members.set('770000000000000001', [D.praes, D.member]);
    const both = (await lead.get('/api/v1/auth/me').set(h)).body as { roles: string[]; permissions: string[] };
    expect(both.roles).toEqual(expect.arrayContaining(['enp Leitung', 'Police Member']));
    expect(both.permissions).toContain('cad.manage_settings');
    // wer nur die niedrigere Rolle hat, bleibt ausgeschlossen
    expect((await (await login(app, 'sc_mem')).agent.get('/api/v1/auth/me').set(h)).body.permissions).not.toContain('cad.manage_settings');
    members.set('770000000000000001', [D.praes]);
    await own.patch(`/api/v1/roles/${pm.id}`).set(h).send({ discordRoleIds: [] });

    // Discord-Rolle verliert die Verknüpfung → Rolle sofort weg
    expect((await own.patch(`/api/v1/roles/${enp.id}`).set(h).send({ discordRoleIds: [] })).status).toBe(200);
    expect((await lead.get('/api/v1/auth/me').set(h)).body.roles).toEqual([]);
  });
});
