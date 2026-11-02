import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AnnouncementsService } from '../src/announcements/announcements.service';

let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, lead: Agent, sup: Agent, m1: Agent, m2: Agent;
const ids: Record<string, string> = {};
const H = 3_600_000;
const CH = '420000000000000001', ROLE = '420000000000000009';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ac_admin', ['System Administrator']);
  ids.lead = (await makeUser(prisma, 'ac_lead', ['Police Member', 'Police Administration'])).id;
  ids.sup = (await makeUser(prisma, 'ac_sup', ['Police Member', 'Supervisor'])).id;
  ids.m1 = (await makeUser(prisma, 'ac_m1', ['Police Member'])).id;
  ids.m2 = (await makeUser(prisma, 'ac_m2', ['Police Member'])).id;
  admin = (await login(app, 'ac_admin')).agent; lead = (await login(app, 'ac_lead')).agent; sup = (await login(app, 'ac_sup')).agent;
  m1 = (await login(app, 'ac_m1')).agent; m2 = (await login(app, 'ac_m2')).agent;
});
afterAll(async () => { await prisma.systemSetting.deleteMany({ where: { key: { in: ['stats.config', 'announce.config'] } } }); await app.close(); });

const ann = (o: Record<string, unknown> = {}) => ({ type: 'DIRECTIVE', channelId: CH, content: { title: 'Neue Dienstanweisung', description: 'Bitte @everyone beachten', links: [{ label: 'Details', url: 'https://example.org/x' }] }, ...o });

describe('Ankündigungen', () => {
  it('Rechte, Vorschau ohne Massen-Ping, Erwähnung nur mit Recht', async () => {
    expect((await m1.post('/api/v1/announcements').send(ann())).status).toBe(403);
    const pv = await lead.post('/api/v1/announcements/preview').send({ type: 'DIRECTIVE', content: ann().content, mentionRoleIds: [ROLE] });
    expect(pv.status).toBe(200);
    expect(JSON.stringify(pv.body.embeds)).not.toMatch(/@everyone/);
    expect(pv.body.mentionRoles).toEqual([ROLE]);
    expect((await lead.post('/api/v1/announcements').send(ann({ mentionRoleIds: ['1', '2'] }))).status).toBe(400);
    expect((await lead.post('/api/v1/announcements').send(ann({ content: { title: 'x', description: 'y', imageUrl: 'http://unsicher.de/a.png' } }))).status).toBe(400);
    const r = await lead.post('/api/v1/announcements').send(ann({ mentionRoleIds: [ROLE] }));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    ids.a1 = r.body.id;
  });
  it('veröffentlichen genau einmal; Versandhistorie; Bearbeiten aktualisiert dieselbe Nachricht', async () => {
    const p = await lead.post(`/api/v1/announcements/${ids.a1}/publish`);
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('PUBLISHED');
    expect((await lead.post(`/api/v1/announcements/${ids.a1}/publish`)).status).toBe(409);
    const posts = await prisma.discordOutbox.findMany({ where: { type: 'message.post', payload: { path: ['channelId'], equals: CH } } });
    expect(posts).toHaveLength(1);
    expect(JSON.stringify(posts[0]!.payload)).toMatch(new RegExp(`<@&${ROLE}>`));
    expect(await prisma.notification.count({ where: { event: 'announcement.new', entityId: ids.a1 } })).toBeGreaterThan(0);
    const cur = (await lead.get(`/api/v1/announcements/${ids.a1}`)).body;
    const u = await lead.patch(`/api/v1/announcements/${ids.a1}`).send({ ...ann({ mentionRoleIds: [ROLE] }), content: { title: 'Neue Dienstanweisung (korrigiert)', description: 'Text' }, version: cur.version });
    expect(u.status).toBe(200);
    expect(u.body.deliveries.map((d: { kind: string }) => d.kind)).toEqual(['UPDATE', 'PUBLISH']);
    const all = await prisma.discordOutbox.findMany({ where: { type: 'message.post', payload: { path: ['channelId'], equals: CH } }, orderBy: { createdAt: 'asc' } });
    expect((all[1]!.payload as { stateKey: string }).stateKey).toBe((all[0]!.payload as { stateKey: string }).stateKey); // gleiche Nachricht
    expect(JSON.stringify(all[1]!.payload)).not.toMatch(/<@&/); // Bearbeiten pingt nicht erneut
  });
  it('zurückziehen: bleibt erhalten, Discord-Nachricht wird markiert', async () => {
    expect((await m1.post(`/api/v1/announcements/${ids.a1}/retract`).send({ reason: 'falsch' })).status).toBe(403);
    const r = await lead.post(`/api/v1/announcements/${ids.a1}/retract`).send({ reason: 'Veraltet' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('RETRACTED');
    expect(await prisma.announcement.count({ where: { id: ids.a1 } })).toBe(1);
    const last = await prisma.discordOutbox.findFirst({ where: { type: 'message.post' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(last?.payload)).toMatch(/Zurückgezogen/);
    const cur = (await lead.get(`/api/v1/announcements/${ids.a1}`)).body;
    expect((await lead.patch(`/api/v1/announcements/${ids.a1}`).send({ ...ann(), version: cur.version })).status).toBe(409);
  });
  it('geplant + wiederkehrend: je Zeitpunkt genau einmal (auch bei doppeltem Lauf)', async () => {
    const s = await lead.post('/api/v1/announcements').send(ann({ type: 'MAINTENANCE', scheduledAt: new Date(Date.now() + H).toISOString(), recurrence: 'WEEKLY' }));
    expect((await lead.post(`/api/v1/announcements/${s.body.id}/publish`)).body.status).toBe('SCHEDULED');
    await prisma.announcement.update({ where: { id: s.body.id }, data: { scheduledAt: new Date(Date.now() - 1000) } });
    const svc = app.get(AnnouncementsService);
    const before = await prisma.discordOutbox.count({ where: { type: 'message.post' } });
    await Promise.all([svc.tick(), svc.tick()]);
    expect(await prisma.discordOutbox.count({ where: { type: 'message.post' } })).toBe(before + 1);
    const after = await prisma.announcement.findUniqueOrThrow({ where: { id: s.body.id } });
    expect(after.status).toBe('PUBLISHED');
    expect(after.scheduledAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * H); // nächste Woche
    await svc.tick();
    expect(await prisma.discordOutbox.count({ where: { type: 'message.post' } })).toBe(before + 1);
  });
  it('Kanal-Freigabe greift', async () => {
    await admin.put('/api/v1/announcements/config').send({ channelIds: ['420000000000000077'] });
    expect((await lead.post('/api/v1/announcements').send(ann())).status).toBe(400);
    await admin.put('/api/v1/announcements/config').send({ channelIds: [] });
  });
});

describe('Dokumente', () => {
  it('Upload mit Typ-/Signaturprüfung; nur Berechtigte', async () => {
    const docsBefore = await prisma.document.count();
    expect((await m1.post('/api/v1/documents').field('title', 'Regelwerk').field('category', 'RULES').attach('file', PDF, { filename: 'r.pdf', contentType: 'application/pdf' })).status).toBe(403);
    const fake = await lead.post('/api/v1/documents').field('title', 'Gefälscht').field('category', 'RULES').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    const html = await lead.post('/api/v1/documents').field('title', 'HTML').field('category', 'RULES').attach('file', Buffer.from('<html></html>'), { filename: 'x.html', contentType: 'text/html' });
    expect(html.status).toBe(400);
    expect(await prisma.document.count()).toBe(docsBefore); // fehlgeschlagene Uploads hinterlassen nichts
    const ok = await lead.post('/api/v1/documents').field('title', 'Regelwerk 2026').field('category', 'RULES').field('description', 'Gültig ab 1.1.').attach('file', PDF, { filename: 'regelwerk.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ currentVersion: 1, access: 'ALL' });
    ids.d1 = ok.body.id;
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'document.new' } })).toBe(1);
  });
  it('Versionen bleiben erhalten; Wiederherstellen = neue Version; Download im Audit', async () => {
    const v2 = await lead.post(`/api/v1/documents/${ids.d1}/versions`).field('note', 'Korrektur').attach('file', Buffer.from('%PDF-1.4\nv2'), { filename: 'regelwerk-v2.pdf', contentType: 'application/pdf' });
    expect(v2.status).toBe(201);
    expect(v2.body.currentVersion).toBe(2);
    const rs = await lead.post(`/api/v1/documents/${ids.d1}/versions/1/restore`);
    expect(rs.status).toBe(200);
    expect(rs.body.currentVersion).toBe(3);
    expect(rs.body.versions.map((v: { number: number }) => v.number)).toEqual([3, 2, 1]);
    const dl = await m1.get(`/api/v1/documents/${ids.d1}/download`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect(dl.headers['content-security-policy']).toMatch(/sandbox/);
    expect((dl.body as Buffer).equals(PDF)).toBe(true);
    expect((await m1.get(`/api/v1/documents/${ids.d1}/download?version=2`)).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'documents.download', entityId: ids.d1, actorUserId: ids.m1 } })).toBe(1);
  });
  it('Zugriffsgruppen serverseitig; Datei nie über /media abrufbar', async () => {
    const conf = await lead.post('/api/v1/documents').field('title', 'Ermittlungsakte').field('category', 'OTHER').field('access', 'CONFIDENTIAL').attach('file', PDF, { filename: 'geheim.pdf', contentType: 'application/pdf' });
    expect(conf.status).toBe(201);
    expect((await sup.post('/api/v1/documents').field('title', 'X').field('category', 'OTHER').field('access', 'CONFIDENTIAL').attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(403);
    expect((await m1.get('/api/v1/documents')).body.items.map((d: { id: string }) => d.id)).not.toContain(conf.body.id);
    expect((await m1.get(`/api/v1/documents/${conf.body.id}`)).status).toBe(404);
    expect((await m1.get(`/api/v1/documents/${conf.body.id}/download`)).status).toBe(404);
    expect(await prisma.notification.count({ where: { event: 'document.new', entityId: conf.body.id } })).toBe(0);
    const v = await prisma.documentVersion.findFirstOrThrow({ where: { documentId: conf.body.id } });
    expect((await admin.get(`/api/v1/media/${v.mediaId}`)).status).toBe(404);
    // Rollen-Zugriff
    const role = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'Supervisor' } });
    const cur = (await lead.get(`/api/v1/documents/${ids.d1}`)).body;
    expect((await lead.patch(`/api/v1/documents/${ids.d1}`).send({ title: cur.title, category: 'RULES', access: 'ROLES', roleIds: [role.id], version: cur.version })).status).toBe(200);
    expect((await m1.get(`/api/v1/documents/${ids.d1}`)).status).toBe(404);
    expect((await sup.get(`/api/v1/documents/${ids.d1}`)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'documents.access', entityId: ids.d1 } })).toBe(1);
  });
  it('Archivieren statt löschen; Suche', async () => {
    expect((await lead.post(`/api/v1/documents/${ids.d1}/archive`).send({ archived: true })).body.status).toBe('ARCHIVED');
    expect((await sup.get(`/api/v1/documents/${ids.d1}`)).status).toBe(404);
    expect((await lead.get('/api/v1/documents?archived=true')).body.items.map((d: { id: string }) => d.id)).toContain(ids.d1);
    await lead.post(`/api/v1/documents/${ids.d1}/archive`).send({ archived: false });
    expect((await lead.get('/api/v1/documents?q=regelwerk 2026')).body.items.map((d: { id: string }) => d.id)).toEqual([ids.d1]);
  });
});

describe('Statistiken und Ranglisten', () => {
  it('Kennzahlen aus gespeicherten Daten; eigene vs. fremde; nicht manipulierbar', async () => {
    const now = Date.now();
    await prisma.dutySession.create({ data: { userId: ids.m1!, status: 'ON_DUTY', startedAt: new Date(now - 3 * H), endedAt: new Date(now - H) } });
    await prisma.dutySession.create({ data: { userId: ids.m2!, status: 'ON_DUTY', startedAt: new Date(now - 2 * H), endedAt: new Date(now - H) } });
    await prisma.personnel.createMany({ data: [{ userId: ids.m1! }, { userId: ids.m2! }] });
    const mine = await m1.get('/api/v1/analytics/personal?period=today');
    expect(mine.status).toBe(200);
    expect(mine.body.stats.dutyMinutes).toBe(120);
    expect((await m1.get(`/api/v1/analytics/personal?period=today&userId=${ids.m2}`)).status).toBe(403);
    expect((await lead.get(`/api/v1/analytics/personal?period=today&userId=${ids.m2}`)).body.stats.dutyMinutes).toBe(60);
    expect((await m1.get('/api/v1/analytics/personal?period=custom&from=2026-10-10&to=2026-10-01')).status).toBe(400);
    // keine schreibende Route für Statistiken
    expect((await m1.post('/api/v1/analytics/personal').send({ dutyMinutes: 99999 })).status).toBe(404);
  });
  it('Ranglisten nur mit Recht, konfigurierbar; Export im Audit', async () => {
    expect((await m1.get('/api/v1/analytics/leaderboards?period=week')).status).toBe(403);
    const lb = await sup.get('/api/v1/analytics/leaderboards?period=week');
    expect(lb.status).toBe(200);
    const duty = lb.body.boards.find((b: { key: string }) => b.key === 'dutyMinutes');
    expect(duty.rows.slice(0, 2).map((r: { name: string; place: number }) => [r.name, r.place])).toEqual([['ac_m1', 1], ['ac_m2', 2]]);
    await admin.put('/api/v1/analytics/config').send({ leaderboards: ['trainings'], size: 5 });
    expect((await sup.get('/api/v1/analytics/leaderboards?period=week')).body.boards.map((b: { key: string }) => b.key)).toEqual(['trainings']);
    const team = await lead.get('/api/v1/analytics/team?period=month');
    expect(team.body.totals.dutyHours).toBeGreaterThanOrEqual(3);
    const csv = await lead.get('/api/v1/analytics/export?period=month');
    expect(csv.status).toBe(200);
    expect(csv.text).toMatch(/ac_m1;2;/);
    expect(await prisma.auditLog.count({ where: { action: 'analytics.export', actorUserId: ids.lead } })).toBe(1);
  });
});

describe('MDT und Leitstelle', () => {
  it('MDT: nur eigene Daten; Leitstelle braucht cad.view und zeigt keine Abwesenheitsgründe', async () => {
    await prisma.leaveRequest.create({ data: { number: 'LOA-AC-1', userId: ids.m2!, startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + 5 * H), reason: 'Familie privat', status: 'APPROVED' } });
    const mdt = await m1.get('/api/v1/workspace/mdt');
    expect(mdt.status).toBe(200);
    expect(mdt.body).toHaveProperty('shift');
    expect(mdt.body.leave).toBeNull();
    await prisma.userPermissionOverride.create({ data: { userId: ids.m2!, permissionKey: 'cad.view', effect: 'DENY' } });
    expect((await m2.get('/api/v1/workspace/dispatch')).status).toBe(403);
    const d = await m1.get('/api/v1/workspace/dispatch');
    expect(d.status).toBe(200);
    expect(JSON.stringify(d.body)).not.toMatch(/Familie/);
  });
});
