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

  it('police application via Discord: open check by Discord id, second one is rejected', async () => {
    const D = '300000000000000099';
    expect((await http().get(`/api/v1/bot/application/open?discordId=${D}`).set(bot())).body).toEqual({ open: false, number: null });
    const form = (await http().get('/api/v1/applications/form')).body as { key: string; required: boolean }[];
    const answers = Object.fromEntries(form.filter((f) => f.required).map((f) => [f.key, 'Antwort']));
    const r = await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Builderman', discordId: D, answers });
    expect(r.status).toBe(201);
    expect((await http().get(`/api/v1/bot/application/open?discordId=${D}`).set(bot())).body).toEqual({ open: true, number: r.body.number });
    expect((await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Builderman2', discordId: D, answers })).status).toBe(409);
  });

  it('setup edits the police application questions and panel texts in the same place', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const cur = (await admin.get('/api/v1/qualifications/config')).body;
    expect(cur.police.title).toContain('Bewerbung');
    expect(cur.policeForm.length).toBeGreaterThan(0);
    const policeForm = [{ key: 'experience', label: 'Was hast du schon erlebt?', required: true, maxLength: 500 }, { key: 'frage1', label: 'Hast du ein Mikrofon?', required: false, maxLength: 1000 }];
    const body = { title: cur.title, intro: cur.intro, units: cur.units, police: { title: 'Werde Polizist!', description: 'Text' }, policeForm };
    expect((await admin.put('/api/v1/qualifications/config').send({ ...body, policeForm: [policeForm[0], policeForm[0]] })).status).toBe(400);
    const r = await admin.put('/api/v1/qualifications/config').send(body);
    expect(r.status).toBe(200);
    expect((await http().get('/api/v1/applications/form')).body).toEqual(policeForm);
    expect((await http().get('/api/v1/bot/qualifications').set(bot())).body.police).toEqual({ title: 'Werde Polizist!', description: 'Text' });
    // ohne policeForm bleibt das Formular unverändert
    expect((await admin.put('/api/v1/qualifications/config').send({ ...body, policeForm: undefined })).status).toBe(200);
    expect((await http().get('/api/v1/applications/form')).body).toEqual(policeForm);
    await prisma.systemSetting.deleteMany({ where: { key: 'application.form' } }); // Standardformular für andere Tests
  });

  it('team view in Discord: details in the post, own channel per unit, decision with reason, history, police quick decision', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const cur = (await admin.get('/api/v1/qualifications/config')).body;
    const units = [{ key: 'flugstaffel', name: 'Flugstaffel', description: '', channelId: '600000000000000001', questions: ['Warum?'] }];
    expect((await admin.put('/api/v1/qualifications/config').send({ title: cur.title, intro: cur.intro, police: cur.police, units })).status).toBe(200);
    const D = '300000000000000055';
    const sub = await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: D, discordName: 'flieger', durationSec: 66, joinedAt: '2025-10-01T10:00:00Z', answers: [{ question: 'Warum?', answer: 'Fliegen' }] });
    expect(sub.status).toBe(201);
    const post = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.submitted', payload: { path: ['id'], equals: sub.body.id } } });
    expect(post.payload).toMatchObject({ channelId: '600000000000000001', durationSec: 66, joinedAt: '2025-10-01T10:00:00.000Z', discordName: 'flieger' });
    expect(String((post.payload as { dashboardUrl: string }).dashboardUrl)).toMatch(new RegExp(`/qualifications\\?id=${sub.body.id}$`));
    // Entscheidung mit Grund per Button (Bot im Namen der Leitung)
    const r = await http().post(`/api/v1/qualifications/applications/${sub.body.id}/decision`).set(bot(LEAD_D)).send({ status: 'REJECTED', reason: 'Bitte in 2 Wochen erneut' });
    expect(r.body).toMatchObject({ status: 'REJECTED', decidedByName: 'q_lead', reason: 'Bitte in 2 Wochen erneut' });
    const dm = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.decided', payload: { path: ['discordId'], equals: D } } });
    expect(dm.payload).toMatchObject({ reason: 'Bitte in 2 Wochen erneut' });
    const hist = await http().get(`/api/v1/qualifications/history?discordId=${D}`).set(bot(LEAD_D));
    expect(hist.body).toMatchObject([{ number: sub.body.number, status: 'REJECTED', decisionReason: 'Bitte in 2 Wochen erneut' }]);
    expect((await http().get(`/api/v1/qualifications/applications/${sub.body.id}`).set(bot(LEAD_D))).body.discordId).toBe(D);

    // Polizei-Bewerbung: Schnell-Entscheidung aus jedem offenen Status, Grund geht per DM, Rechte applications.decide
    const form = (await http().get('/api/v1/applications/form')).body as { key: string; required: boolean; label: string }[];
    const answers = Object.fromEntries(form.filter((f) => f.required).map((f) => [f.key, 'Antwort']));
    await prisma.systemSetting.update({ where: { key: 'discord.channels' }, data: { value: { qualifications: '400000000000000001', applications: '400000000000000002' } } });
    const P = '300000000000000066';
    const pa = await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Polizist', discordId: P, discordName: 'polizist', durationSec: 120, answers });
    const ppost = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.submitted', payload: { path: ['number'], equals: pa.body.number } } });
    expect(ppost.payload).toMatchObject({ discordName: 'polizist', durationSec: 120, answers: expect.arrayContaining([{ question: form.find((f) => f.required)!.label, answer: 'Antwort' }]) });
    const id = (ppost.payload as { id: string }).id;
    expect((await http().post(`/api/v1/applications/${id}/discord-decision`).set(bot(LEAD_D)).send({ status: 'ACCEPTED' })).status).toBe(403); // SEK Leitung hat kein applications.decide
    const a2 = (await login(app, 'q_admin')).agent;
    const ok = await a2.post(`/api/v1/applications/${id}/discord-decision`).send({ status: 'ACCEPTED', reason: 'Willkommen!' });
    expect(ok.body).toMatchObject({ status: 'ACCEPTED', reason: 'Willkommen!' });
    expect((await a2.post(`/api/v1/applications/${id}/discord-decision`).send({ status: 'REJECTED' })).status).toBe(409);
    expect((await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.decided', payload: { path: ['discordId'], equals: P } } })).payload).toMatchObject({ status: 'ACCEPTED', reason: 'Willkommen!' });
    expect((await a2.get(`/api/v1/applications/history?discordId=${P}`)).body).toMatchObject([{ status: 'ACCEPTED', decisionReason: 'Willkommen!' }]);
  });
});
