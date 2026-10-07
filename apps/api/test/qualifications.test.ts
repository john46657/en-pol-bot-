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
    // Reihenfolge der Outbox-Zeilen ist ohne Sortierung nicht festgelegt → über die Nummer suchen
    const mine = posted.find((x) => (x.payload as { number?: string }).number === r.body.number)!;
    expect(mine.payload).toMatchObject({ number: r.body.number, linkedName: 'q_off' });
    // die Fragen kommen aus der Einrichtung (nicht vom Bot), die Antworten wie eingereicht
    expect((mine.payload as { answers: { answer: string }[] }).answers.map((a) => a.answer)).toEqual(answers(n).map((a) => a.answer));
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
    // mehr als 15 Fragen sind erlaubt (bis 50), auch beim Einreichen
    const many = Array.from({ length: 30 }, (_, i) => `Frage Nummer ${i + 1}?`);
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cfg, units: [{ ...cfg.units[0], questions: many }] })).status).toBe(200);
    expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: '700000000000000077', discordName: 'viele', answers: many.map((q) => ({ question: q, answer: 'Ja' })) })).status).toBe(201);
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cfg, units: [{ ...cfg.units[0], questions: [...many, ...many] }] })).status).toBe(400); // 60 > 50
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
    expect((await http().get('/api/v1/applications/form')).body).toMatchObject(policeForm);
    expect((await http().get('/api/v1/bot/qualifications').set(bot())).body.police).toMatchObject({ title: 'Werde Polizist!', description: 'Text' });
    // ohne policeForm bleibt das Formular unverändert
    expect((await admin.put('/api/v1/qualifications/config').send({ ...body, policeForm: undefined })).status).toBe(200);
    expect((await http().get('/api/v1/applications/form')).body).toMatchObject(policeForm);
    await prisma.systemSetting.deleteMany({ where: { key: 'application.form' } }); // Standardformular für andere Tests
  });

  it('question types like Appy: multiple choice and role select are validated, chosen roles are given on acceptance, ping role in the post', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const cur = (await admin.get('/api/v1/qualifications/config')).body;
    const questions = [
      { key: 'warum', label: 'Warum möchtest du zur Flugstaffel?', required: true, type: 'TEXT', minLength: 10, maxLength: 200 },
      { key: 'erfahrung', label: 'Hast du Flugerfahrung?', required: true, type: 'CHOICE', options: [{ label: 'Ja' }, { label: 'Nein' }] },
      { key: 'rollen', label: 'Welche Bereiche interessieren dich?', required: false, type: 'ROLE', multiple: true, options: [{ label: 'Hubschrauber', roleId: '510000000000000001' }, { label: 'Flugzeug', roleId: '510000000000000002' }] },
    ];
    const units = [{ key: 'flugstaffel', name: 'Flugstaffel', description: '', roleId: '510000000000000009', pingRoleIds: ['520000000000000001'], questions }];
    // Rollen-Auswahl ohne Rollen-ID und Auswahl ohne Optionen werden abgelehnt
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units: [{ ...units[0], questions: [{ ...questions[2], options: [{ label: 'X' }] }] }] })).status).toBe(400);
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units: [{ ...units[0], questions: [{ ...questions[1], options: [] }] }] })).status).toBe(400);
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units })).status).toBe(200);
    const send = (D: string, a: unknown[]) => http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: D, discordName: 'flieger', answers: a.map((answer, i) => ({ question: questions[i]!.label, answer })) });
    const D = '300000000000000077';
    expect((await send(D, ['zu kurz', 'Ja', null])).status).toBe(400); // Mindestlänge
    expect((await send(D, ['Weil ich gern fliege', 'Vielleicht', null])).status).toBe(400); // keine gültige Option
    expect((await send(D, ['Weil ich gern fliege', ['Ja', 'Nein'], null])).status).toBe(400); // nur eine Auswahl erlaubt
    const ok = await send(D, ['Weil ich gern fliege', 'Ja', ['Hubschrauber', 'Flugzeug']]);
    expect(ok.status).toBe(201);
    const row = await prisma.qualificationApplication.findUniqueOrThrow({ where: { id: ok.body.id } });
    expect(row.grantRoleIds).toEqual(['510000000000000001', '510000000000000002']);
    expect((row.answers as { answer: string }[]).map((a) => a.answer)).toEqual(['Weil ich gern fliege', 'Ja', 'Hubschrauber, Flugzeug']);
    const post = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.submitted', payload: { path: ['id'], equals: ok.body.id } } });
    expect(post.payload).toMatchObject({ pingRoleIds: ['520000000000000001'] });
    expect((await admin.post(`/api/v1/qualifications/applications/${ok.body.id}/decision`).send({ status: 'ACCEPTED' })).status).toBe(200);
    const decided = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.decided', payload: { path: ['number'], equals: row.number } } });
    expect(decided.payload).toMatchObject({ status: 'ACCEPTED', roleIds: ['510000000000000009', '510000000000000001', '510000000000000002'], removeRoleIds: [] });
    expect((decided.payload as { message: string }).message).toContain('`Flugstaffel`');
    // alte Einrichtungen (Fragen als reiner Text) funktionieren weiter
    await prisma.systemSetting.update({ where: { key: 'qualifications.config' }, data: { value: { ...cur, units: [{ key: 'alt', name: 'Alt', description: '', questions: ['Eine alte Frage?'] }] } } });
    expect((await admin.get('/api/v1/qualifications/config')).body.units[0].questions[0]).toMatchObject({ key: 'q1', label: 'Eine alte Frage?', type: 'TEXT', required: true });
    expect((await admin.put('/api/v1/qualifications/config').send(cur)).status).toBe(200);
  });

  it('requirements like Appy: closed applications receive no submissions; decided ones go to the accepted/denied channel; police pending channel', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const cur = (await admin.get('/api/v1/qualifications/config')).body;
    const unit = { key: 'flugstaffel', name: 'Flugstaffel', description: '', questions: ['Warum?'], enabled: false, acceptedChannelId: '610000000000000001', deniedChannelId: '610000000000000002' };
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units: [unit], police: { ...cur.police, enabled: false, name: 'Polizeianwärter', channelId: '610000000000000010', acceptedChannelId: '610000000000000011' } })).status).toBe(200);
    const D = '300000000000000088';
    const send = () => http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: D, discordName: 'x', answers: [{ question: 'Warum?', answer: 'Darum' }] });
    expect((await send()).status).toBe(409);
    const form = (await http().get('/api/v1/applications/form')).body as { key: string; required: boolean }[];
    const answers = Object.fromEntries(form.filter((f) => f.required).map((f) => [f.key, 'Antwort']));
    expect((await http().post('/api/v1/applications').send({ robloxUsername: 'Closed_Test', answers })).status).toBe(409);
    // öffnen → Bewerbung geht in den eigenen Channel; Entscheidung landet im Channel „abgelehnt“
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units: [{ ...unit, enabled: true }], police: { ...cur.police, enabled: true, channelId: '610000000000000010', acceptedChannelId: '610000000000000011' } })).status).toBe(200);
    const ok = await send();
    expect(ok.status).toBe(201);
    expect((await admin.post(`/api/v1/qualifications/applications/${ok.body.id}/decision`).send({ status: 'REJECTED', reason: 'Zu wenig Erfahrung' })).status).toBe(200);
    const archived = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.archived', payload: { path: ['id'], equals: ok.body.id } } });
    expect(archived.payload).toMatchObject({ channelId: '610000000000000002', status: 'REJECTED', reason: 'Zu wenig Erfahrung', answers: [{ question: 'Warum?', answer: 'Darum' }] });
    const pol = await http().post('/api/v1/bot/application').set(bot()).send({ robloxUsername: 'Arch_Test', discordId: '300000000000000089', answers });
    expect(pol.status).toBe(201);
    const posted = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.submitted', payload: { path: ['number'], equals: pol.body.number } } });
    expect(posted.payload).toMatchObject({ channelId: '610000000000000010' });
    const row = await prisma.application.findFirstOrThrow({ where: { number: pol.body.number } });
    expect((await admin.post(`/api/v1/applications/${row.id}/discord-decision`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'application.archived', payload: { path: ['id'], equals: row.id } } })).payload).toMatchObject({ channelId: '610000000000000011', status: 'ACCEPTED' });
    expect((await admin.put('/api/v1/qualifications/config').send(cur)).status).toBe(200);
  });

  it('Appy settings: cooldown, pending roles on submit, staff thread, own accepted/denied text and roles', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const cur = (await admin.get('/api/v1/qualifications/config')).body;
    const settings = { messages: { denied: 'Bewerbung {number} als {applicationName} abgelehnt von {user}.' }, roles: { pending: ['620000000000000001'], removeOnSubmit: ['620000000000000002'], denied: ['620000000000000003'], deniedRemove: ['620000000000000004'] }, staffThreads: true, cooldownMinutes: 60 * 24 * 14 };
    expect((await admin.put('/api/v1/qualifications/config').send({ ...cur, units: [{ key: 'flugstaffel', name: 'Flugstaffel', description: '', questions: ['Warum?'], settings }] })).status).toBe(200);
    expect((await admin.get('/api/v1/qualifications/config')).body.units[0].settings).toMatchObject({ timeLimitMinutes: 180, roles: { required: { ids: [], mode: 'ANY' } }, messages: { accepted: expect.stringContaining('{applicationName}') } });
    const D = '300000000000000099';
    const send = () => http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ unit: 'flugstaffel', discordId: D, discordName: 'x', answers: [{ question: 'Warum?', answer: 'Darum' }] });
    const ok = await send();
    expect(ok.status).toBe(201);
    const post = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.submitted', payload: { path: ['id'], equals: ok.body.id } } });
    expect(post.payload).toMatchObject({ thread: true });
    expect((await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'member.roles', payload: { path: ['discordId'], equals: D } } })).payload).toMatchObject({ add: ['620000000000000001'], remove: ['620000000000000002'] });
    expect((await admin.post(`/api/v1/qualifications/applications/${ok.body.id}/decision`).send({ status: 'REJECTED' })).status).toBe(200);
    const dec = (await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'qualification.decided', payload: { path: ['discordId'], equals: D } } })).payload as Record<string, unknown>;
    expect(dec).toMatchObject({ roleIds: ['620000000000000003'], removeRoleIds: ['620000000000000004', '620000000000000001'] });
    expect(dec.message).toMatch(/^Bewerbung Q-\S+ als Flugstaffel abgelehnt von /);
    // Cooldown (14 Tage) nach der letzten Bewerbung
    const again = await send();
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('14 Tage');
    expect((await admin.put('/api/v1/qualifications/config').send(cur)).status).toBe(200);
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
  it('per server: own settings with fallback to the shared ones, reset, bot reads by guild, list filter', async () => {
    const admin = (await login(app, 'q_admin')).agent;
    const G = '700000000000000001', G2 = '700000000000000002';
    const shared = (await admin.get('/api/v1/qualifications/config')).body;
    expect(shared.own).toBe(true);
    const viaG = (await admin.get(`/api/v1/qualifications/config?guildId=${G}`)).body;
    expect(viaG).toMatchObject({ own: false, title: shared.title });
    expect((await admin.get('/api/v1/qualifications/config?guildId=abc')).status).toBe(400);
    // eigener Server: andere Einheiten + Polizei-Name; das Formular wird von den gemeinsamen übernommen
    const units = [{ key: 'reiter', name: 'Reiterstaffel', description: '', questions: ['Pferd?'] }];
    const saved = await admin.put(`/api/v1/qualifications/config?guildId=${G}`).send({ title: 'Server 1', intro: shared.intro, police: { ...shared.police, name: 'Anwärter S1' }, units });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ own: true, title: 'Server 1', policeForm: shared.policeForm });
    expect((await admin.get('/api/v1/qualifications/config')).body.title).toBe(shared.title);
    expect((await http().get(`/api/v1/bot/qualifications?guildId=${G}`).set(bot())).body.units.map((u: { key: string }) => u.key)).toEqual(['reiter']);
    expect((await http().get(`/api/v1/bot/qualifications?guildId=${G2}`).set(bot())).body.title).toBe(shared.title);
    expect((await http().get(`/api/v1/applications/form?guildId=${G}`)).body).toEqual(shared.policeForm);
    // Bewerbung auf Server 1 nutzt dessen Einheiten; auf Server 2 gibt es die Einheit nicht
    const D = '300000000000000077';
    expect((await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ guildId: G2, unit: 'reiter', discordId: D, discordName: 'reiter', answers: [{ question: 'Pferd?', answer: 'Ja' }] })).status).toBe(404);
    const sub = await http().post('/api/v1/bot/qualifications/applications').set(bot()).send({ guildId: G, unit: 'reiter', discordId: D, discordName: 'reiter', answers: [{ question: 'Pferd?', answer: 'Ja' }] });
    expect(sub.status).toBe(201);
    const lead = (await login(app, 'q_admin')).agent;
    expect((await lead.get(`/api/v1/qualifications/applications?guildId=${G}`)).body.map((a: { id: string }) => a.id)).toEqual([sub.body.id]);
    expect((await lead.get(`/api/v1/qualifications/applications?guildId=${G2}`)).body).toEqual([]);
    // zurücksetzen: wieder die gemeinsamen Einstellungen
    expect((await (await login(app, 'q_lead')).agent.delete(`/api/v1/qualifications/config?guildId=${G}`)).status).toBe(403);
    const reset = await admin.delete(`/api/v1/qualifications/config?guildId=${G}`);
    expect(reset.body).toMatchObject({ own: false, title: shared.title });
    expect((await admin.delete('/api/v1/qualifications/config')).status).toBe(400);
  });
});

describe('application analytics', () => {
  it('KPIs, status breakdown, by name, reviewers and heatmap over police + qualification applications', async () => {
    const adminUser = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { name: 'System Administrator' } } } } });
    const now = Date.now();
    await prisma.qualificationApplication.createMany({ data: [
      { number: 'QA-STAT-1', unit: 'sek', unitName: 'SEK-Bewerbung', discordId: '880000000000000001', discordName: 'a', answers: [], status: 'ACCEPTED', decidedById: adminUser.id, createdAt: new Date(now - 3_600_000), decidedAt: new Date(now - 1_800_000) },
      { number: 'QA-STAT-2', unit: 'sek', unitName: 'SEK-Bewerbung', discordId: '880000000000000002', discordName: 'b', answers: [], status: 'OPEN', createdAt: new Date(now - 7_200_000) },
      { number: 'QA-STAT-3', unit: 'sek', unitName: 'SEK-Bewerbung', discordId: '880000000000000003', discordName: 'c', answers: [], status: 'REJECTED', decidedById: adminUser.id, createdAt: new Date(now - 40 * 86_400_000), decidedAt: new Date(now - 40 * 86_400_000 + 60_000) },
    ] });
    const admin = (await login(app, adminUser.username)).agent;
    const r = await admin.get('/api/v1/applications/analytics').query({ type: 'SEK-Bewerbung', days: 30 });
    expect(r.status).toBe(200);
    const k = Object.fromEntries(r.body.kpis.map((x: { key: string; value: number; change: number }) => [x.key, x]));
    expect(k.total).toMatchObject({ value: 2, change: 100 });
    expect(k.approvalRate.value).toBe(100);
    expect(k.pending.value).toBe(1);
    expect(Math.round(k.avgReviewMin.value)).toBe(30);
    expect(r.body.breakdown).toEqual({ APPROVED: 1, PENDING: 1, REJECTED: 0 });
    expect(r.body.byType[0]).toMatchObject({ type: 'SEK-Bewerbung', submitted: 2 });
    expect(r.body.reviewers[0]).toMatchObject({ reviewed: 1, approvalRate: 100 });
    expect(r.body.overTime).toHaveLength(30);
    expect(r.body.heat.flat().reduce((a: number, b: number) => a + b, 0)).toBe(2);
    expect((await admin.get('/api/v1/applications/analytics').query({ status: 'REJECTED', type: 'SEK-Bewerbung' })).body.kpis[0].value).toBe(0);
  });
});
