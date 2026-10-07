import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { newVoiceRoom } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-voice-support-0123456789abcd';
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
const GUILD = '330000000000000001', OTHER_GUILD = '330000000000000002';
const WAIT = '430000000000000001', NOTIFY = '430000000000000002', TEAM = '530000000000000001';
const USER = '340000000000000001', SUP = '340000000000000002', RANDOM = '340000000000000003';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const room = { ...newVoiceRoom(randomUUID(), GUILD), name: 'test', waitingChannelId: WAIT, notifyChannelId: NOTIFY, teamRoleId: TEAM, rating: true };
const sup = { discordId: SUP, name: 'Supporter', roleIds: [TEAM] };

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'vs_admin', ['System Administrator']);
  await makeUser(prisma, 'vs_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'voice-support.rooms' } });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('voice support rooms', () => {
  it('are validated, saved per server and only with ticket.settings', async () => {
    const admin = (await login(app, 'vs_admin')).agent;
    const off = (await login(app, 'vs_off')).agent;
    expect((await off.put('/api/v1/voice-support/rooms').send([room])).status).toBe(403);
    expect((await admin.put('/api/v1/voice-support/rooms').send([{ ...room, ownChannels: true }])).status).toBe(400); // eigene Kanäle ohne Kanal
    expect((await admin.put('/api/v1/voice-support/rooms').send([room, { ...room, id: randomUUID() }])).status).toBe(400); // gleicher Warteraum
    expect((await admin.put('/api/v1/voice-support/rooms').send([{ ...room, times: [{ days: [1], from: '25:00', to: '10:00' }] }])).status).toBe(400);
    expect((await admin.put('/api/v1/voice-support/rooms').send([room])).status).toBe(200);
    const other = { ...room, id: randomUUID(), guildId: OTHER_GUILD, waitingChannelId: '430000000000000009' };
    // Server-Ansicht: nur Räume dieses Servers
    expect((await admin.put(`/api/v1/voice-support/rooms?guildId=${OTHER_GUILD}`).send([room])).status).toBe(400);
    expect((await admin.put(`/api/v1/voice-support/rooms?guildId=${OTHER_GUILD}`).send([other])).status).toBe(200);
    expect((await admin.get('/api/v1/voice-support/rooms')).body).toHaveLength(2);
    expect((await admin.get(`/api/v1/voice-support/rooms?guildId=${GUILD}`)).body.map((r: { id: string }) => r.id)).toEqual([room.id]);
  });
});

describe('voice support cases', () => {
  let id = '';
  it('joining the waiting room opens a case with the team ping and Übernehmen / Ablehnen / Nachricht', async () => {
    expect((await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: '430000000000000077', discordId: USER, userName: 'john' })).body).toEqual({ action: 'none' });
    const r = await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER, userName: 'john' });
    expect(r.body).toMatchObject({ action: 'notify', channelId: NOTIFY, message: { content: `<@&${TEAM}>`, mentionRoles: [TEAM] } });
    expect(r.body.message.buttons.map((b: { label: string }) => b.label)).toEqual(['Übernehmen', 'Ablehnen', 'Nachricht']);
    expect(r.body.message.embeds[0].description).toContain('Ein neuer Support-Fall');
    expect(r.body.message.embeds[0].description).toMatch(/Case-ID:\*\* `#S-[A-Z]{10}`/);
    id = r.body.caseId;
    await http().post(`/api/v1/bot/voice-support/cases/${id}/posted`).set(bot()).send({ messageId: '440000000000000001' }).expect(204);
    // nochmal beitreten → kein zweiter Fall
    expect((await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER, userName: 'john' })).body).toEqual({ action: 'none' });
  });

  it('"Nachricht" sends a DM, only the team role may act; claim gives the bot what it needs', async () => {
    const msg = (s: object) => http().post(`/api/v1/bot/voice-support/cases/${id}/message`).set(bot()).send({ ...s, text: 'Wir sind gleich bei dir.' });
    expect((await msg({ discordId: RANDOM, name: 'x', roleIds: [] })).status).toBe(403);
    const m = await msg(sup);
    expect(m.body).toMatchObject({ userId: USER, dm: { embeds: [{ description: 'Wir sind gleich bei dir.' }] }, edit: { channelId: NOTIFY, messageId: '440000000000000001' } });
    expect((await http().post(`/api/v1/bot/voice-support/cases/${id}/claim`).set(bot()).send({ discordId: RANDOM, name: 'x', roleIds: [] })).status).toBe(403);
    const c = await http().post(`/api/v1/bot/voice-support/cases/${id}/claim`).set(bot()).send(sup);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ case: { userId: USER, userName: 'john' }, room: { waitingChannelId: WAIT, teamRoleId: TEAM, notes: true, ownChannels: false } });
    expect(c.body.edit.message.buttons.map((b: { label: string }) => b.label)).toEqual(['Nachricht', 'Schließen']);
    expect(c.body.edit.message.content).toBeUndefined(); // kein erneuter Ping
    expect((await http().post(`/api/v1/bot/voice-support/cases/${id}/claim`).set(bot()).send({ ...sup, discordId: '340000000000000009' })).status).toBe(409);
    await http().post(`/api/v1/bot/voice-support/cases/${id}/channel`).set(bot()).send({ channelId: '450000000000000001', created: true, threadId: null }).expect(200);
    // Person wird verschoben → Warteraum verlassen ändert den übernommenen Fall nicht
    expect((await http().post('/api/v1/bot/voice-support/left').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER })).body.edits).toEqual([]);
  });

  it('the case closes when its channel is empty; created channels are deleted; rating once, only by the user', async () => {
    const r = await http().post('/api/v1/bot/voice-support/empty').set(bot()).send({ channelId: '450000000000000001' });
    expect(r.body).toMatchObject({ closed: true, deleteChannelId: '450000000000000001', userId: USER });
    expect(r.body.ratingDm.buttons).toHaveLength(5);
    expect((await http().post('/api/v1/bot/voice-support/empty').set(bot()).send({ channelId: '450000000000000001' })).body).toEqual({ closed: false });
    expect((await http().post(`/api/v1/bot/voice-support/cases/${id}/rating`).set(bot()).send({ discordId: SUP, stars: 5 })).status).toBe(403);
    expect((await http().post(`/api/v1/bot/voice-support/cases/${id}/rating`).set(bot()).send({ discordId: USER, stars: 4 })).body.edit.message.embeds[0].description).toContain('⭐⭐⭐⭐');
    expect((await http().post(`/api/v1/bot/voice-support/cases/${id}/rating`).set(bot()).send({ discordId: USER, stars: 1 })).status).toBe(409);
  });

  it('decline sends the reason by DM; leaving the waiting room before a claim marks the case', async () => {
    const a = await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER, userName: 'john' });
    const d = await http().post(`/api/v1/bot/voice-support/cases/${a.body.caseId}/decline`).set(bot()).send({ ...sup, reason: 'Bitte ein Ticket öffnen' });
    expect(d.body).toMatchObject({ userId: USER, dm: { embeds: [{ description: expect.stringContaining('Bitte ein Ticket öffnen') }] } });
    expect(d.body.edit).toBeNull(); // Meldung noch nicht gepostet
    const b = await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER, userName: 'john' });
    await http().post(`/api/v1/bot/voice-support/cases/${b.body.caseId}/posted`).set(bot()).send({ messageId: '440000000000000002' });
    const l = await http().post('/api/v1/bot/voice-support/left').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: USER });
    expect(l.body.edits[0].message.embeds[0].description).toContain('Warteraum verlassen');
    expect(l.body.edits[0].message.buttons).toEqual([]);
    const admin = (await login(app, 'vs_admin')).agent;
    const list = (await admin.get(`/api/v1/voice-support/cases?guildId=${GUILD}`)).body as { status: string }[];
    expect(list.map((x) => x.status).sort()).toEqual(['ABANDONED', 'CLOSED', 'DECLINED']);
  });

  it('outside the support times nobody is pinged; the person gets the times by DM', async () => {
    const admin = (await login(app, 'vs_admin')).agent;
    const now = new Date();
    const day = (now.getUTCDay() + 3) % 7; // ein anderer Tag → sicher geschlossen
    expect((await admin.put(`/api/v1/voice-support/rooms?guildId=${GUILD}`).send([{ ...room, times: [{ days: [day], from: '00:00', to: '23:59' }] }])).status).toBe(200);
    const r = await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: RANDOM, userName: 'late' });
    expect(r.body.action).toBe('closed');
    expect(r.body.dm.embeds[0].description).toContain('Supportzeiten');
    expect((await http().post('/api/v1/bot/voice-support/join').send({ guildId: GUILD, channelId: WAIT, discordId: RANDOM })).status).toBe(401);
  });

  it('the team acts from the dashboard (ticket.claim); the bot gets the Discord part via the outbox', async () => {
    const admin = (await login(app, 'vs_admin')).agent;
    const off = (await login(app, 'vs_off')).agent;
    await admin.put(`/api/v1/voice-support/rooms?guildId=${GUILD}`).send([room]); // wieder immer geöffnet
    const j = await http().post('/api/v1/bot/voice-support/join').set(bot()).send({ guildId: GUILD, channelId: WAIT, discordId: '340000000000000077', userName: 'web' });
    const id = j.body.caseId as string;
    await http().post(`/api/v1/bot/voice-support/cases/${id}/posted`).set(bot()).send({ messageId: '440000000000000077' });
    const act = (agent: typeof admin, body: object) => agent.post(`/api/v1/voice-support/cases/${id}/action`).send(body);
    expect((await act(off, { action: 'claim' })).status).toBe(403);
    expect((await act(admin, { action: 'message', text: '' })).status).toBe(400);
    expect((await act(admin, { action: 'message', text: 'Gleich da' })).body).toMatchObject({ status: 'WAITING', messages: 1 });
    const last = async () => (await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'voice.effects' }, orderBy: { createdAt: 'desc' } })).payload as Record<string, unknown>;
    expect(await last()).toMatchObject({ dm: { userId: '340000000000000077' }, edit: { messageId: '440000000000000077' } });
    const c = await act(admin, { action: 'claim' });
    expect(c.body).toMatchObject({ status: 'CLAIMED', claimedByName: 'vs_admin', claimedById: null });
    const p = await last();
    expect(p).toMatchObject({ provision: { case: { id, userId: '340000000000000077' }, room: { waitingChannelId: WAIT } }, staffDiscordId: null });
    // ohne Discord-Verknüpfung steht der Name in der Meldung
    expect(JSON.stringify(p)).toContain('vs_admin kümmert sich um');
    expect((await act(admin, { action: 'claim' })).status).toBe(409);
    await http().post(`/api/v1/bot/voice-support/cases/${id}/channel`).set(bot()).send({ channelId: '450000000000000077', created: true, threadId: null });
    expect((await act(admin, { action: 'close' })).body.status).toBe('CLOSED');
    expect(await last()).toMatchObject({ deleteChannelId: '450000000000000077', dm: { userId: '340000000000000077' } }); // Bewertung per DM
  });
});
