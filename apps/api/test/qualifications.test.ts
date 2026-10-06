import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_CONFIG } from '../src/qualifications/qualifications.config';

const TOKEN = 'test-bot-token-qualifications-0123456789abcdef';
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const APPLICANT = '300000000000000001', LEAD_D = '300000000000000002', STRANGER = '300000000000000003';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const id: Record<string, string> = {};
const answers = (n: number) => Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}`, answer: `Antwort ${i + 1}` }));

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ q_lead: ['Police Member', 'SEK Leitung'], q_off: ['Police Member'], q_admin: ['System Administrator'] })) id[n] = (await makeUser(prisma, n, roles)).id;
  await prisma.discordLink.create({ data: { userId: id.q_off!, discordId: APPLICANT } });
  await prisma.discordLink.create({ data: { userId: id.q_lead!, discordId: LEAD_D } });
  await prisma.systemSetting.upsert({ where: { key: 'discord.channels' }, create: { key: 'discord.channels', value: { qualifications: '400000000000000001' } }, update: { value: { qualifications: '400000000000000001' } } });
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('qualification applications', () => {
  it('bot reads the default config (SEK, Flugstaffel, Ausbilder) without a user', async () => {
    const r = await http().get('/api/v1/bot/qualifications').set(bot());
    expect(r.status).toBe(200);
    expect(r.body.units.map((u: { key: string }) => u.key)).toEqual(['flugstaffel', 'sek', 'ausbilder']);
    expect((await http().get('/api/v1/bot/qualifications')).status).toBe(401);
  });

  it('submits via the bot (also for unlinked Discord users), one open application per unit', async () => {
    const n = DEFAULT_CONFIG.units[1]!.questions.length;
    expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'sek', discordId: APPLICANT, discordName: 'oscar', answers: answers(n - 1) })).status).toBe(400);
    expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'gsg9', discordId: APPLICANT, discordName: 'oscar', answers: answers(n) })).status).toBe(404);
    const r = await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'sek', discordId: APPLICANT, discordName: 'oscar', answers: answers(n) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ unitName: 'SEK' });
    expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'sek', discordId: APPLICANT, discordName: 'oscar', answers: answers(n) })).status).toBe(409);
    expect((await http().get(`/api/v1/bot/qualifications/open?discordId=${APPLICANT}&unit=sek`).set(bot())).body).toMatchObject({ open: true, unitName: 'SEK' });
    expect((await http().get(`/api/v1/bot/qualifications/open?discordId=${APPLICANT}&unit=flugstaffel`).set(bot())).body.open).toBe(false);
    const stranger = await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: STRANGER, discordName: 'gast', answers: answers(DEFAULT_CONFIG.units[0]!.questions.length) });
    expect(stranger.status).toBe(201);
    const posted = await prisma.discordOutbox.findMany({ where: { type: 'qualification.submitted' } });
    expect(posted).toHaveLength(2);
    expect(posted[0]!.payload).toMatchObject({ number: r.body.number, linkedName: 'q_off', answers: answers(n) });
  });

  it('decisions need qualifications.decide (web or bot button), accept adds SEK roster + DM with role', async () => {
    const off = (await login(app, 'q_off')).agent;
    const lead = (await login(app, 'q_lead')).agent;
    expect((await off.get('/api/v1/qualifications/applications')).status).toBe(403);
    const rows = (await lead.get('/api/v1/qualifications/applications?status=OPEN')).body as { id: string; unit: string; linkedName: string | null }[];
    const sek = rows.find((r) => r.unit === 'sek')!, flug = rows.find((r) => r.unit === 'flugstaffel')!;
    expect(sek.linkedName).toBe('q_off');
    // per Discord-Button: Anfrage als klickender Benutzer
    expect((await http().post(`/api/v1/qualifications/applications/${sek.id}/decision`).set(bot(APPLICANT)).send({ status: 'ACCEPTED' })).status).toBe(403);
    expect((await http().post(`/api/v1/qualifications/applications/${sek.id}/decision`).set(bot(LEAD_D)).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await lead.post(`/api/v1/qualifications/applications/${sek.id}/decision`).send({ status: 'REJECTED' })).status).toBe(409);
    expect(await prisma.sekMember.count({ where: { userId: id.q_off } })).toBe(1);
    expect((await lead.post(`/api/v1/qualifications/applications/${flug.id}/decision`).send({ status: 'REJECTED' })).status).toBe(200);
    const dms = await prisma.discordOutbox.findMany({ where: { type: 'qualification.decided' }, orderBy: { createdAt: 'asc' } });
    expect(dms.map((d) => d.payload)).toMatchObject([{ discordId: APPLICANT, status: 'ACCEPTED', unitName: 'SEK' }, { discordId: STRANGER, status: 'REJECTED' }]);
    expect(await prisma.notification.count({ where: { userId: id.q_off, type: 'QUALIFICATION' } })).toBe(1);
  });

  it('nobody decides on their own application; config is validated and only qualifications.manage saves it', async () => {
    const n = DEFAULT_CONFIG.units[2]!.questions.length;
    const own = await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'ausbilder', discordId: LEAD_D, discordName: 'lead', answers: answers(n) });
    const lead = (await login(app, 'q_lead')).agent;
    expect((await lead.post(`/api/v1/qualifications/applications/${own.body.id}/decision`).send({ status: 'ACCEPTED' })).status).toBe(403);
    const cfg = { title: 'Qualis', intro: 'x', units: [{ key: 'flugstaffel', name: 'Flugstaffel', description: '', roleId: '500000000000000001', questions: ['Frage eins?', 'Frage zwei?'] }] };
    expect((await lead.put('/api/v1/qualifications/config').send(cfg)).status).toBe(403);
    const admin = (await login(app, 'q_admin')).agent;
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cfg, units: [...cfg.units, cfg.units[0]] })).status).toBe(400);
    expect((await admin.put('/api/v1/qualifications/config').send(cfg)).status).toBe(200);
    expect((await http().get('/api/v1/bot/qualifications').set(bot())).body).toMatchObject({ title: 'Qualis', units: [{ key: 'flugstaffel', roleId: '500000000000000001' }] });
  });

  it('bot may call duty hours and SEK routes on behalf of linked users (allowlist)', async () => {
    expect((await http().get('/api/v1/team/me/hours?days=7').set(bot(APPLICANT))).status).toBe(200);
    expect((await http().get('/api/v1/sek/me').set(bot(APPLICANT))).body).toEqual({ member: true });
    expect((await http().get('/api/v1/sek/members').set(bot(LEAD_D))).status).toBe(200);
    expect((await http().post('/api/v1/sek/reports').set(bot(APPLICANT)).send({ missionType: 'Zugriff', description: 'Test über Discord' })).status).toBe(201); // angenommen → Roster + Rolle „SEK“
    expect((await http().get('/api/v1/qualifications/config').set(bot(LEAD_D))).status).toBe(403); // nicht auf der Allowlist
  });
});
