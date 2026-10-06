import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'c'.repeat(40);
const G = '810000000000000001';
let app: INestApplication; let prisma: PrismaService;
const id: Record<string, string> = {};

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ x_admin: ['System Administrator'], x_off: ['Police Member'], x_sup: ['Police Member', 'Supervisor'] })) id[n] = (await makeUser(prisma, n, roles)).id;
});
afterAll(async () => {
  delete process.env.BOT_API_TOKEN;
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'teamchance' } } });
  await app.close();
});

describe('Funk-Codes', () => {
  it('team sees codes, only radio.manage edits; per server with shared defaults; searchable via bot', async () => {
    const adm = (await login(app, 'x_admin')).agent;
    const off = (await login(app, 'x_off')).agent;
    expect((await adm.post('/api/v1/radio-codes/defaults')).body.added).toBeGreaterThan(10);
    expect((await adm.post('/api/v1/radio-codes/defaults')).body.added).toBe(0); // nicht doppelt
    const own = await adm.post('/api/v1/radio-codes').set('X-Guild-Id', G).send({ code: '10-4', meaning: 'Alles klar (Server A)' });
    expect(own.status).toBe(201);
    expect((await adm.post('/api/v1/radio-codes').send({ code: '10-4', meaning: 'doppelt' })).status).toBe(409);
    const shared = (await off.get('/api/v1/radio-codes').query({ q: '10-4' })).body;
    expect(shared).toEqual([expect.objectContaining({ code: '10-4', meaning: 'Verstanden', guildId: null })]);
    const inA = (await off.get('/api/v1/radio-codes').set('X-Guild-Id', G).query({ q: '10-4' })).body;
    expect(inA).toEqual([expect.objectContaining({ meaning: 'Alles klar (Server A)', guildId: G })]); // Server-Code überdeckt den gemeinsamen
    expect((await off.post('/api/v1/radio-codes').send({ code: 'X', meaning: 'nein' })).status).toBe(403);
    expect((await adm.patch(`/api/v1/radio-codes/${own.body.id}`).set('X-Guild-Id', G).send({ meaning: 'Verstanden!' })).body.meaning).toBe('Verstanden!');
    expect((await adm.patch(`/api/v1/radio-codes/${own.body.id}`).set('X-Guild-Id', '810000000000000009').send({ meaning: 'x' })).status).toBe(404);
    // Bot im Namen eines verknüpften Mitglieds
    await prisma.discordLink.create({ data: { userId: id.x_off!, discordId: '820000000000000001' } });
    const viaBot = await request(app.getHttpServer()).get('/api/v1/radio-codes?q=10-99').set({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': '820000000000000001' });
    expect(viaBot.body[0]).toMatchObject({ code: '10-99', meaning: 'Beamter in Not' });
  });
});

describe('Team-Chance', () => {
  const cfg = { open: true, title: 'Team-Chance Oktober', description: 'Wir suchen Supporter', opensAt: null, closesAt: null, slots: 1, channelId: '830000000000000001', pingRoleIds: [], restrictApplications: true };
  const apply = (name: string) => request(app.getHttpServer()).post('/api/v1/applications').send({ robloxUsername: name, answers: {} });

  it('opening announces in Discord and notifies staff; applications only while open and within the slots', async () => {
    const adm = (await login(app, 'x_admin')).agent;
    expect((await (await login(app, 'x_off')).agent.put('/api/v1/teamchance').send(cfg)).status).toBe(403);
    // geschlossen + nur während Team-Chance → Bewerbung abgelehnt
    expect((await adm.put('/api/v1/teamchance').send({ ...cfg, open: false })).status).toBe(200);
    const closed = await apply('TC_One');
    expect(closed.status).toBe(409);
    expect(closed.body.message).toContain('Team-Chance');
    // öffnen
    const opened = await adm.put('/api/v1/teamchance').send(cfg);
    expect(opened.body).toMatchObject({ isOpen: true, remaining: 1 });
    expect(await prisma.discordOutbox.count({ where: { type: 'teamchance.changed', payload: { path: ['open'], equals: true } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: id.x_sup!, type: 'TEAMCHANCE' } })).toBe(1); // Supervisor sieht Bewerbungen → Team-Chance
    expect((await request(app.getHttpServer()).get('/api/v1/teamchance/public')).body).toMatchObject({ isOpen: true, title: 'Team-Chance Oktober' });
    expect(JSON.stringify((await request(app.getHttpServer()).get('/api/v1/teamchance/public')).body)).not.toContain('830000000000000001');
    const form = (await request(app.getHttpServer()).get('/api/v1/applications/form')).body as { key: string; type: string; options?: string[] }[];
    const answers = Object.fromEntries(form.map((f) => [f.key, f.type === 'select' || f.type === 'multi' ? (f.options?.[0] ?? 'x') : 'Eine ausreichend lange Antwort für diese Frage.']));
    const ok = await request(app.getHttpServer()).post('/api/v1/applications').send({ robloxUsername: 'TC_Two', answers });
    expect(ok.status).toBe(201);
    // 🔔 Neue Bewerbung an alle mit applications.review
    expect(await prisma.notification.count({ where: { userId: id.x_sup!, type: 'APPLICATION' } })).toBe(1);
    // Platz vergeben → voll
    expect((await adm.get('/api/v1/teamchance')).body).toMatchObject({ isOpen: false, reason: 'full', remaining: 0 });
    expect((await request(app.getHttpServer()).post('/api/v1/applications').send({ robloxUsername: 'TC_Three', answers })).status).toBe(409);
    // schließen → Ankündigung „geschlossen“
    await adm.put('/api/v1/teamchance').send({ ...cfg, open: false });
    expect(await prisma.discordOutbox.count({ where: { type: 'teamchance.changed', payload: { path: ['open'], equals: false } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ['teamchance.opened', 'teamchance.closed'] } } })).toBe(2);
    await adm.put('/api/v1/teamchance').send({ ...cfg, open: false, restrictApplications: false });
  });
});

describe('notifications', () => {
  it('system notice reaches dashboard users; announcements notify readers; muted types stay hidden', async () => {
    const adm = (await login(app, 'x_admin')).agent;
    expect((await (await login(app, 'x_off')).agent.post('/api/v1/notifications/system').send({ title: 'Wartung' })).status).toBe(403);
    const r = await adm.post('/api/v1/notifications/system').send({ title: 'Wartung heute 22 Uhr', body: 'Kurze Unterbrechung' });
    expect(r.body.recipients).toBeGreaterThan(1);
    const off = (await login(app, 'x_off')).agent;
    expect((await off.get('/api/v1/notifications')).body.items.some((n: { title: string }) => n.title === '⚠️ Wartung heute 22 Uhr')).toBe(true);
    await adm.post('/api/v1/communication/channels/ANNOUNCEMENT/messages').send({ body: 'Neue Dienstvorschrift ist online.' });
    expect(await prisma.notification.count({ where: { userId: id.x_off!, type: 'MESSAGE' } })).toBe(1);
    await off.put('/api/v1/me/preferences').send({ preferences: { notifications: { muted: ['MESSAGE'] } } });
    expect((await off.get('/api/v1/notifications')).body.items.some((n: { type: string }) => n.type === 'MESSAGE')).toBe(false);
  });
});

describe('wanted from the dashboard goes to the Discord wanted channel', () => {
  it('new wanted record and status changes are queued for the configured channel (with dashboard link)', async () => {
    const adm = (await login(app, 'x_admin')).agent;
    await adm.put('/api/v1/admin/settings/discord.channels').send({ value: { wanted: '840000000000000001' } });
    const person = (await adm.post('/api/v1/persons').send({ robloxUsername: 'Bank_Robber', robloxUserId: '7770001' })).body;
    const pid = person.person?.id ?? person.id;
    const w = await adm.post('/api/v1/wanted').send({ personId: pid, reason: 'bank überfall', priority: 'CRITICAL', description: 'Bewaffnet' });
    expect(w.status).toBe(201);
    const created = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'wanted.created', payload: { path: ['id'], equals: w.body.id } } });
    expect(created).toMatchObject({ channelKey: 'wanted', payload: { reason: 'bank überfall', priority: 'CRITICAL', subject: 'Bank_Robber', description: 'Bewaffnet', createdBy: 'x_admin', dashboardUrl: expect.stringContaining(`/wanted/${w.body.id}`) } });
    expect((await adm.post(`/api/v1/wanted/${w.body.id}/clear`).send({ reason: 'Festgenommen' })).status).toBeLessThan(300);
    expect(await prisma.discordOutbox.findFirst({ where: { type: 'wanted.status', payload: { path: ['status'], equals: 'CLEARED' } } })).toMatchObject({ payload: { note: 'Festgenommen', subject: 'Bank_Robber' } });
    expect((await adm.get('/api/v1/discord/channel-status')).body).toMatchObject({ wanted: true, dispatch: false });
  });
});
