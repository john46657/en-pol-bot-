import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_CONFIG } from '../src/qualifications/qualifications.config';

const TOKEN = 'test-bot-token-welcome-0123456789abcdef0123';
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
const GUILD = '310000000000000001', OTHER = '310000000000000002', CH = '410000000000000001', ROLE = '510000000000000001';
const LEAVER = '320000000000000001', STAYER = '320000000000000002';
let app: INestApplication; let prisma: PrismaService;
// Testdateien teilen sich die Datenbank: geänderte Einstellungen und eigene Outbox-Einträge danach zurücksetzen
const KEYS = ['qualifications.config', 'tickets.settings', 'welcome.config'];
let before: { key: string; value: unknown }[] = [];
const started = new Date();
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  before = await prisma.systemSetting.findMany({ where: { key: { in: KEYS } }, select: { key: true, value: true } });
  await makeUser(prisma, 'wel_admin', ['System Administrator']);
  await makeUser(prisma, 'wel_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { OR: [{ key: { in: KEYS } }, { key: { startsWith: 'welcome.config@' } }] } });
  for (const b of before) await prisma.systemSetting.create({ data: { key: b.key, value: b.value as never } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('welcome & goodbye settings', () => {
  it('test message: needs a server, a linked Discord account and a channel; queues a bot task', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    expect((await admin.post('/api/v1/welcome/test').send({ kind: 'welcome' })).status).toBe(400); // kein Server
    expect((await admin.post(`/api/v1/welcome/test?guildId=${GUILD}`).send({ kind: 'welcome' })).body.message).toMatch(/Discord/); // nicht verknüpft
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'wel_admin' } });
    await prisma.discordLink.upsert({ where: { userId: u.id }, create: { userId: u.id, discordId: '330000000000000001' }, update: {} });
    expect((await admin.post(`/api/v1/welcome/test?guildId=${GUILD}`).send({ kind: 'goodbye' })).body.message).toMatch(/Kanal/);
    const cur = (await admin.get(`/api/v1/welcome/config?guildId=${GUILD}`)).body;
    delete cur.own;
    expect((await admin.put(`/api/v1/welcome/config?guildId=${GUILD}`).send({ ...cur, welcome: { ...cur.welcome, channelId: CH } })).status).toBe(200);
    expect((await admin.post(`/api/v1/welcome/test?guildId=${GUILD}`).send({ kind: 'welcome' })).status).toBe(200);
    const task = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'bot.welcome-test', createdAt: { gte: started } } });
    expect(task.payload).toEqual({ guildId: GUILD, discordId: '330000000000000001', kind: 'welcome' });
    const off = (await login(app, 'wel_off')).agent;
    expect((await off.post(`/api/v1/welcome/test?guildId=${GUILD}`).send({ kind: 'welcome' })).status).toBe(403);
    await prisma.discordLink.delete({ where: { userId: u.id } });
    await prisma.systemSetting.deleteMany({ where: { key: `welcome.config@${GUILD}` } });
  });

  it('per server with fallback to the shared settings; validated; only settings.manage saves', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    const off = (await login(app, 'wel_off')).agent;
    expect((await off.get('/api/v1/welcome/config')).status).toBe(403);
    const shared = (await admin.get('/api/v1/welcome/config')).body;
    expect(shared).toMatchObject({ own: true, welcome: { enabled: false }, autoRoleIds: [] });
    // eingeschaltet ohne Kanal → abgelehnt
    expect((await admin.put('/api/v1/welcome/config').send({ ...shared, welcome: { ...shared.welcome, enabled: true } })).status).toBe(400);
    const own = { ...shared, welcome: { ...shared.welcome, enabled: true, channelId: CH }, autoRoleIds: [ROLE] };
    delete own.own;
    expect((await off.put(`/api/v1/welcome/config?guildId=${GUILD}`).send(own)).status).toBe(403);
    const saved = await admin.put(`/api/v1/welcome/config?guildId=${GUILD}`).send(own);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ own: true, welcome: { enabled: true, channelId: CH }, autoRoleIds: [ROLE] });
    // Bot liest je Server; anderer Server bekommt die gemeinsame Einstellung
    expect((await http().get(`/api/v1/bot/welcome?guildId=${GUILD}`).set(bot())).body).toMatchObject({ welcome: { enabled: true, channelId: CH } });
    expect((await http().get(`/api/v1/bot/welcome?guildId=${OTHER}`).set(bot())).body).toMatchObject({ own: false, welcome: { enabled: false } });
    expect((await http().get(`/api/v1/bot/welcome?guildId=${GUILD}`)).status).toBe(401);
    // zurück auf die gemeinsame Einstellung
    expect((await admin.delete(`/api/v1/welcome/config?guildId=${GUILD}`)).body).toMatchObject({ own: false, welcome: { enabled: false } });
  });
});

describe('welcome banner', () => {
  it('only images up to 8 MB; the bot gets uploaded banners (and nothing else)', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    const off = (await login(app, 'wel_off')).agent;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    expect((await off.post('/api/v1/media').field('linkedType', 'WelcomeBanner').field('linkedId', 'shared').attach('file', png, { filename: 'b.png', contentType: 'image/png' })).status).toBe(403);
    expect((await admin.post('/api/v1/media').field('linkedType', 'WelcomeBanner').field('linkedId', 'shared').attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(400);
    const up = await admin.post('/api/v1/media').field('linkedType', 'WelcomeBanner').field('linkedId', 'shared').attach('file', png, { filename: 'b.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const b = await http().get(`/api/v1/bot/welcome/banner/${up.body.id}`).set(bot());
    expect(b.body).toEqual({ mime: 'image/png', name: 'banner.png', data: png.toString('base64') });
    expect((await http().get(`/api/v1/bot/welcome/banner/${up.body.id}`)).status).toBe(401);
    // gespeichert wird die ID; eine falsche URL wird abgelehnt
    const cfg = (await admin.get('/api/v1/welcome/config')).body;
    delete cfg.own;
    expect((await admin.put('/api/v1/welcome/config').send({ ...cfg, welcome: { ...cfg.welcome, image: 'http://x.de/a.png' } })).status).toBe(400);
    expect((await admin.put('/api/v1/welcome/config').send({ ...cfg, welcome: { ...cfg.welcome, imageMediaId: up.body.id } })).body.welcome.imageMediaId).toBe(up.body.id);
  });
});

describe('action on user leave', () => {
  it('denies or withdraws open applications as configured; other people and servers stay untouched', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    // eigene, vollständige Einrichtung (andere Testdateien ändern die gemeinsame)
    const units = DEFAULT_CONFIG.units.map((u) => ({ ...u, enabled: true, settings: { ...u.settings, cooldownMinutes: 0, onLeave: u.key === 'sek' ? 'DENY' : u.key === 'flugstaffel' ? 'WITHDRAW' : 'DENY' } }));
    const police = { ...DEFAULT_CONFIG.police, enabled: true, settings: { ...DEFAULT_CONFIG.police.settings, cooldownMinutes: 0, onLeave: 'WITHDRAW' } };
    expect((await admin.put('/api/v1/qualifications/config').send({ title: DEFAULT_CONFIG.title, intro: DEFAULT_CONFIG.intro, units, police })).status).toBe(200);

    const answers = (unit: string) => Array.from({ length: DEFAULT_CONFIG.units.find((u) => u.key === unit)!.questions.length }, (_, i) => ({ question: `Q${i}`, answer: 'A' }));
    for (const [unit, discordId, guildId] of [['sek', LEAVER, GUILD], ['flugstaffel', LEAVER, GUILD], ['sek', STAYER, GUILD], ['ausbilder', LEAVER, OTHER]] as const) {
      expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit, discordId, discordName: 'x', answers: answers(unit), guildId })).status).toBe(201);
    }
    const form = (await http().get('/api/v1/applications/form')).body as { key: string; required: boolean }[];
    const pol = await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Leaver_RB', discordId: LEAVER, guildId: GUILD, answers: Object.fromEntries(form.filter((f) => f.required).map((f) => [f.key, 'Antwort'])) });
    expect(pol.status).toBe(201);

    const r = await http().post('/api/v1/bot/member-left').set(bot()).send({ guildId: GUILD, discordId: LEAVER });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ applications: { denied: 0, withdrawn: 1 }, qualifications: { denied: 1, withdrawn: 1 }, tickets: { closed: 0 } });
    const q = await prisma.qualificationApplication.findMany({ where: { discordId: { in: [LEAVER, STAYER] } }, select: { unit: true, discordId: true, guildId: true, status: true, decisionReason: true } });
    const st = (unit: string, d = LEAVER, g = GUILD) => q.find((x) => x.unit === unit && x.discordId === d && x.guildId === g)?.status;
    expect([st('sek'), st('flugstaffel'), st('sek', STAYER), st('ausbilder', LEAVER, OTHER)]).toEqual(['REJECTED', 'WITHDRAWN', 'OPEN', 'OPEN']);
    expect(q.find((x) => x.unit === 'sek' && x.discordId === LEAVER)?.decisionReason).toBe('Hat den Discord-Server verlassen.');
    expect((await prisma.application.findFirstOrThrow({ where: { number: pol.body.number } })).status).toBe('WITHDRAWN');
    // abgelehnt → Entscheidungs-DM wie bei einer normalen Ablehnung
    expect(await prisma.discordOutbox.count({ where: { type: 'qualification.decided', payload: { path: ['discordId'], equals: LEAVER } } })).toBe(1);
    // zweiter Austritt ändert nichts mehr
    expect((await http().post('/api/v1/bot/member-left').set(bot()).send({ guildId: GUILD, discordId: LEAVER })).body.qualifications).toEqual({ denied: 0, withdrawn: 0 });
    expect((await http().post('/api/v1/bot/member-left').send({ guildId: GUILD, discordId: LEAVER })).status).toBe(401);
  });

  it('closes the open support tickets of the person on that server when set under Tickets → General', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    const cfg = (await admin.get('/api/v1/support-tickets/config')).body;
    const support = cfg.categories.find((c: { name: string }) => c.name === 'Support');
    await prisma.ticketCategory.update({ where: { id: support.id }, data: { ratingEnabled: false, closeReasonMode: 'OPTIONAL', questions: [] } });
    const open = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ categoryId: support.id, guildId: GUILD, discordId: LEAVER, discordName: 'Leaver' });
    expect(open.status).toBe(201);
    const tid = open.body.ticket.id as string;
    await http().post(`/api/v1/bot/support-tickets/${tid}/channel`).set(bot()).send({ channelId: '930000000000000077', controlMessageId: null });
    const left = () => http().post('/api/v1/bot/member-left').set(bot()).send({ guildId: GUILD, discordId: LEAVER });
    expect((await left()).body.tickets).toEqual({ closed: 0 }); // Standard: nichts tun
    expect((await admin.put('/api/v1/support-tickets/settings').send({ ...cfg.settings, memberLeaveAction: 'CLOSE', memberLeaveReason: 'Server verlassen' })).status).toBe(200);
    expect((await http().post('/api/v1/bot/member-left').set(bot()).send({ guildId: OTHER, discordId: LEAVER })).body.tickets).toEqual({ closed: 0 }); // anderer Server
    expect((await left()).body.tickets).toEqual({ closed: 1 });
    expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } })).toMatchObject({ closeReason: 'Server verlassen', closedByName: 'Automatik' });
    expect(await prisma.discordOutbox.count({ where: { type: 'ticket.effects' } })).toBeGreaterThan(0);
  });

  it('"Ticket mit Bewerber öffnen" from the dashboard queues the job for the bot (like the Discord button)', async () => {
    const admin = (await login(app, 'wel_admin')).agent;
    const off = (await login(app, 'wel_off')).agent;
    const a = await prisma.qualificationApplication.findFirstOrThrow({ where: { discordId: STAYER } });
    expect((await off.post(`/api/v1/qualifications/applications/${a.id}/ticket`)).status).toBe(403);
    const r = await admin.post(`/api/v1/qualifications/applications/${a.id}/ticket`);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ queued: true, linked: false });
    const job = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.ticket' }, orderBy: { createdAt: 'desc' } });
    expect(job.payload).toMatchObject({ guildId: GUILD, discordId: STAYER, number: a.number, unitName: 'SEK', requesterId: null });
    // Web-Bewerbung ohne Discord → kein Ticket möglich
    const web = await prisma.application.create({ data: { number: 'APP-WEB-1', robloxUsername: 'WebOnly', answers: {}, source: 'WEB' } });
    expect((await admin.post(`/api/v1/applications/${web.id}/ticket`)).status).toBe(400);
  });
});
