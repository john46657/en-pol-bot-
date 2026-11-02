import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createTestApp, login, makeUser } from './helpers';
import { autoBackupsToDelete } from '../src/backup/backup.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { loadEnv } from '../src/config/env';

const TOKEN = 'test-bot-token-backup-0123456789abcdef01234';
const G = '720000000000000001';
let app: INestApplication; let prisma: PrismaService; let guildsBefore: unknown;
const http = () => request(app.getHttpServer());
const bot = { Authorization: `Bot ${TOKEN}` };

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'bk_admin', ['System Administrator']);
  await makeUser(prisma, 'bk_off', ['Police Member']);
  // andere Testdateien setzen die Serverliste auch → vorherigen Stand merken und danach zurücksetzen
  guildsBefore = (await prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
  const value = [{ id: G, name: 'EN Test', icon: null, channels: [], roles: [] }];
  await prisma.systemSetting.upsert({ where: { key: 'discord.guilds' }, create: { key: 'discord.guilds', value }, update: { value } });
});
afterAll(async () => {
  await prisma.discordBackup.deleteMany({});
  if (guildsBefore !== undefined) await prisma.systemSetting.update({ where: { key: 'discord.guilds' }, data: { value: guildsBefore as never } }); else await prisma.systemSetting.deleteMany({ where: { key: 'discord.guilds' } });
  await rm(path.resolve(loadEnv().STORAGE_DIR, 'backups'), { recursive: true, force: true });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Backups', () => {
  it('dashboard data: create, list, download; restore brings the old state back (with a safety backup first)', async () => {
    const admin = (await login(app, 'bk_admin')).agent;
    const off = (await login(app, 'bk_off')).agent;
    expect((await off.post('/api/v1/backups/data')).status).toBe(403);
    const made = await admin.post('/api/v1/backups/data');
    expect(made.status).toBe(201);
    expect(made.body.rows).toBeGreaterThan(0);
    expect((await admin.get('/api/v1/backups/data')).body[0]).toMatchObject({ name: made.body.name, kind: 'manuell' });
    const dl = await admin.get(`/api/v1/backups/data/${made.body.name}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(dl.status).toBe(200);
    expect((dl.body as Buffer)[0]).toBe(0x1f); // gzip
    // nach dem Backup angelegt → nach dem Wiederherstellen weg
    await admin.post('/api/v1/persons').send({ robloxUsername: 'Bk_After_Backup' });
    expect((await admin.post(`/api/v1/backups/data/${made.body.name}/restore`).send({})).status).toBe(400); // Bestätigung fehlt
    // Backup-Center 2.0: neuere Daten werden nicht unbemerkt überschrieben – erst nach ausdrücklicher Bestätigung
    const blocked = await admin.post(`/api/v1/backups/data/${made.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.reason).toBe('NEWER_DATA');
    expect(await prisma.person.findFirst({ where: { robloxUsername: 'Bk_After_Backup' } })).not.toBeNull();
    const res = await admin.post(`/api/v1/backups/data/${made.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN', acknowledgeNewer: true });
    expect(res.status).toBe(200);
    expect(res.body.check.ok).toBe(true);
    expect(res.body.safety).toMatch(/^vor-wiederherstellung-/);
    expect(await prisma.person.findFirst({ where: { robloxUsername: 'Bk_After_Backup' } })).toBeNull();
    expect((await admin.get('/api/v1/auth/me')).status).toBe(200); // Sitzung bleibt
    // hochgeladene Datei ohne Bestätigung / kaputt
    expect((await admin.post('/api/v1/backups/data-upload/restore').attach('file', Buffer.from('kaputt'), 'x.json.gz').field('confirm', 'WIEDERHERSTELLEN')).status).toBe(400);
  });

  it('dashboard data: backups from before removed tables still restore (removed tables and their rights are skipped)', async () => {
    const admin = (await login(app, 'bk_admin')).agent;
    const made = await admin.post('/api/v1/backups/data');
    const dl = await admin.get(`/api/v1/backups/data/${made.body.name}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    const body = JSON.parse(gunzipSync(dl.body as Buffer).toString('utf8')) as { tables: Record<string, Record<string, unknown>[]> };
    // Stand eines älteren Backups: Mitteilungen/Abstimmungen samt Rechten gab es noch
    body.tables.HrPoll = [{ id: '00000000-0000-4000-8000-000000000001', title: 'Alt' }];
    body.tables.HrPollVote = []; body.tables.HrAnnouncement = []; body.tables.HrAnnouncementRead = [];
    body.tables.Permission = [...(body.tables.Permission ?? []), { key: 'polls.view', module: 'polls', description: 'alt' }];
    const res = await admin.post('/api/v1/backups/data-upload/restore').attach('file', gzipSync(JSON.stringify(body)), 'alt.json.gz').field('confirm', 'WIEDERHERSTELLEN');
    expect(res.status).toBe(200);
    expect(await prisma.permission.findUnique({ where: { key: 'polls.view' } })).toBeNull();
  });

  it('dashboard data: Verwaltungsmodule (Schichten, Termine, Besprechungen, Ankündigungen, Dokumente) werden gesichert und wiederhergestellt', async () => {
    const admin = (await login(app, 'bk_admin')).agent;
    const u = await prisma.user.findFirstOrThrow({ where: { username: 'bk_off' } });
    const shift = await prisma.plannedShift.create({ data: { name: 'BK-Schicht', startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), createdById: u.id, status: 'PUBLISHED', assignments: { create: { userId: u.id } } } });
    const ev = await prisma.calendarEvent.create({ data: { title: 'BK-Termin', category: 'MEETING', startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), organizerId: u.id, reminders: [60], participants: { create: { userId: u.id, status: 'ACCEPTED' } }, reminderLogs: { create: { startsAt: new Date(Date.now() + 86_400_000), minutesBefore: 1440 } } } });
    const m = await prisma.meeting.create({ data: { eventId: ev.id, notes: 'BK-Protokoll', tasks: { create: { title: 'BK-Aufgabe', createdById: u.id } } } });
    const a = await prisma.announcement.create({ data: { title: 'BK-Ankündigung', content: { title: 'BK', description: 'x' }, channelId: '430000000000000001', createdById: u.id, status: 'PUBLISHED', deliveries: { create: { kind: 'PUBLISH', stateKey: 'ann-bk' } } } });
    const media = await prisma.media.create({ data: { originalName: 'bk.pdf', mime: 'application/pdf', size: 1, hash: 'x', storageKey: 'bk-test.pdf', uploaderId: u.id, linkedType: 'Document' } });
    const d = await prisma.document.create({ data: { title: 'BK-Dokument', category: 'RULES', createdById: u.id, versions: { create: [{ number: 1, mediaId: media.id, createdById: u.id }, { number: 2, mediaId: media.id, createdById: u.id }] }, currentVersion: 2 } });
    const made = await admin.post('/api/v1/backups/data');
    expect(made.status).toBe(201);
    // danach geändert/gelöscht → nach dem Wiederherstellen wieder alter Stand
    await prisma.shiftAssignment.updateMany({ where: { shiftId: shift.id }, data: { status: 'WITHDRAWN' } });
    await prisma.documentVersion.deleteMany({ where: { documentId: d.id, number: 2 } });
    await prisma.meetingTask.deleteMany({ where: { meetingId: m.id } });
    // Backup-Center 2.0: nach dem Backup geänderte Daten werden nur nach ausdrücklicher Bestätigung überschrieben
    const res = await admin.post(`/api/v1/backups/data/${made.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN', acknowledgeNewer: true });
    expect(res.status).toBe(200);
    expect((await prisma.shiftAssignment.findFirstOrThrow({ where: { shiftId: shift.id } })).status).toBe('ACTIVE');
    expect(await prisma.documentVersion.count({ where: { documentId: d.id } })).toBe(2);
    expect(await prisma.meetingTask.count({ where: { meetingId: m.id } })).toBe(1);
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).notes).toBe('BK-Protokoll');
    expect(await prisma.calendarParticipant.count({ where: { eventId: ev.id } })).toBe(1);
    expect(await prisma.calendarReminderLog.count({ where: { eventId: ev.id } })).toBe(1);
    expect(await prisma.announcementDelivery.count({ where: { announcementId: a.id } })).toBe(1);
  });

  it('hourly data backups: last 48 hours kept in full, older ones thinned to one per day for `keep` days', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const list = Array.from({ length: 24 * 6 }, (_, i) => ({ createdAt: new Date(now.getTime() - i * 60 * 60_000).toISOString() }));
    const del = new Set(autoBackupsToDelete(list, 2, now));
    const kept = list.filter((f) => !del.has(f));
    expect(kept.filter((f) => new Date(f.createdAt).getTime() >= now.getTime() - 48 * 60 * 60_000)).toHaveLength(49);
    expect(kept.filter((f) => new Date(f.createdAt).getTime() < now.getTime() - 48 * 60 * 60_000).map((f) => f.createdAt)).toEqual(['2026-10-18T11:00:00.000Z', '2026-10-17T23:00:00.000Z']);
  });

  it('discord: the bot delivers the server data; restore is queued for the bot and the result is stored', async () => {
    const admin = (await login(app, 'bk_admin')).agent;
    const b = (await admin.post('/api/v1/backups/discord').send({ guildId: G, name: 'Vor Umbau' })).body;
    expect(b).toMatchObject({ status: 'PENDING', guildName: 'EN Test' });
    expect(await prisma.discordOutbox.findFirst({ where: { type: 'bot.backup.create', payload: { path: ['backupId'], equals: b.id } } })).not.toBeNull();
    expect((await admin.post(`/api/v1/backups/discord/${b.id}/restore`).send({ parts: ['roles'], confirm: 'WIEDERHERSTELLEN' })).status).toBe(409); // noch nicht fertig
    const data = { version: 1, guildId: G, everyonePermissions: '0', roles: [{ id: '1', name: 'Polizei', color: 0, hoist: false, mentionable: false, permissions: '0', position: 1 }], channels: [{ id: '2', name: 'leitstelle', type: 'category', parentId: null, position: 0, overwrites: [] }], settings: { name: 'EN', verificationLevel: 0, defaultMessageNotifications: 0, explicitContentFilter: 0, afkChannelId: null, afkTimeout: 300, systemChannelId: null } };
    expect((await http().post(`/api/v1/bot/discord-backups/${b.id}/data`).set(bot).send({ data })).status).toBe(204);
    expect((await admin.get('/api/v1/backups/discord')).body[0]).toMatchObject({ id: b.id, status: 'READY', stats: { roles: 1, categories: 1, channels: 0 } });
    expect((await admin.post(`/api/v1/backups/discord/${b.id}/restore`).send({ parts: ['roles', 'channels'], confirm: 'WIEDERHERSTELLEN' })).status).toBe(200);
    expect((await prisma.discordOutbox.findFirst({ where: { type: 'bot.backup.restore', payload: { path: ['backupId'], equals: b.id } } }))?.payload).toMatchObject({ guildId: G, parts: ['roles', 'channels'] });
    expect((await http().get(`/api/v1/bot/discord-backups/${b.id}`).set(bot)).body.data.roles[0].name).toBe('Polizei');
    expect((await http().post(`/api/v1/bot/discord-backups/${b.id}/result`).set(bot).send({ created: 2, updated: 0, failed: 0, errors: [], parts: ['roles'], at: new Date().toISOString() })).status).toBe(204);
    expect((await admin.get(`/api/v1/backups/discord/${b.id}`)).body.restoreResult).toMatchObject({ created: 2 });
    expect((await http().get(`/api/v1/bot/discord-backups/${b.id}`)).status).toBe(401);
  });
});
