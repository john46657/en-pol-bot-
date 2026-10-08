import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { toCsv } from '../src/export/export.controller';

let app: INestApplication; let prisma: PrismaService; let storage: string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

beforeAll(async () => {
  storage = mkdtempSync(path.join(tmpdir(), 'enrp-media-'));
  process.env.STORAGE_DIR = storage;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'p_admin', ['System Administrator']);
  await makeUser(prisma, 'p_off', ['Police Member']);
  await makeUser(prisma, 'p_hr', ['Police Member', 'Police Administration']);
});
afterAll(async () => {
  // geteilte Test-DB: Konfiguration zurücksetzen, damit andere Testdateien nicht beeinflusst werden
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['application.form', 'dashboard.defaultLayout'] } } });
  await app.close();
});

describe('admin settings', () => {
  it('validates keys and values, audits changes, requires permission', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const off = (await login(app, 'p_off')).agent;
    expect((await off.put('/api/v1/admin/settings/org.name').send({ value: 'X' })).status).toBe(403);
    expect((await adm.put('/api/v1/admin/settings/evil.key').send({ value: 1 })).status).toBe(400);
    expect((await adm.put('/api/v1/admin/settings/retention.sessionDays').send({ value: -5 })).status).toBe(400);
    expect((await adm.put('/api/v1/admin/settings/org.name').send({ value: 'Liberty County PD' })).status).toBe(200);
    expect((await adm.get('/api/v1/admin/settings')).body.settings['org.name']).toBe('Liberty County PD');
    expect(await prisma.auditLog.count({ where: { action: 'settings.changed', entityId: 'org.name' } })).toBe(1);
    // studio-style config: application form is configurable and used by the public form
    const auditedBefore = await prisma.auditLog.count({ where: { action: 'studio.config.changed' } });
    const form = [{ key: 'why', label: 'Why join?', required: true, maxLength: 200 }];
    expect((await adm.put('/api/v1/admin/settings/application.form').send({ value: form })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'studio.config.changed' } })).toBe(auditedBefore + 1);
    const pub = await (await import('supertest')).default(app.getHttpServer()).get('/api/v1/applications/form');
    expect(pub.body).toMatchObject(form); // um Standardwerte ergänzt (Typ Text, keine Mindestlänge …)
  });
  it('dashboard layout: user override, admin default, reset', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const off = (await login(app, 'p_off')).agent;
    const def = [{ widget: 'incidents', visible: true, order: 1 }];
    await adm.put('/api/v1/admin/settings/dashboard.defaultLayout').send({ value: def });
    expect((await off.get('/api/v1/admin/dashboard/layout')).body).toMatchObject({ layout: def, isDefault: true });
    const mine = [{ widget: 'incidents', visible: false, order: 2 }];
    await off.put('/api/v1/admin/dashboard/layout').send({ layout: mine });
    expect((await off.get('/api/v1/admin/dashboard/layout')).body).toMatchObject({ layout: mine, isDefault: false });
    await off.put('/api/v1/admin/dashboard/layout').send({ layout: null });
    expect((await off.get('/api/v1/admin/dashboard/layout')).body.isDefault).toBe(true);
  });
  it('security events are visible only with audit.view and contain no secrets', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const off = (await login(app, 'p_off')).agent;
    await off.get('/api/v1/audit'); // generates PERMISSION_DENIED
    expect((await off.get('/api/v1/admin/security-events')).status).toBe(403);
    const ev = (await adm.get('/api/v1/admin/security-events?type=PERMISSION_DENIED')).body;
    expect(ev.length).toBeGreaterThan(0);
    expect(JSON.stringify(ev)).not.toMatch(/cookie|password/i);
  });
  it('retention prunes operational data, audits itself, and can never touch audit logs', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'p_off' } });
    await prisma.loginHistory.create({ data: { userId: u.id, username: 'p_off', success: true, createdAt: new Date(Date.now() - 4000 * 86_400_000) } });
    const auditBefore = await prisma.auditLog.count();
    const r = await adm.post('/api/v1/admin/retention/run');
    expect(r.status).toBe(201);
    expect(r.body.loginHistory).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.count()).toBeGreaterThanOrEqual(auditBefore + 1); // only grew (retention.run entry)
    expect(await prisma.auditLog.count({ where: { action: 'retention.run' } })).toBe(1);
  });
});

describe('export', () => {
  it('neutralizes CSV formula injection', () => {
    const row = toCsv([{ a: '=SUM(1)', b: '+1', c: 'ok, fine', d: 'say "hi"' }]).split('\n')[1];
    expect(row).toBe('\'=SUM(1),\'+1,"ok, fine","say ""hi"""');
  });
  it('exports only permitted entities, audits every export', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const off = (await login(app, 'p_off')).agent;
    await adm.post('/api/v1/persons').send({ robloxUsername: '=cmd|evil' });
    const csv = await adm.get('/api/v1/export/persons?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text).toContain("'=cmd|evil");
    expect((await adm.get('/api/v1/export/persons?format=json')).body.length).toBeGreaterThan(0);
    const pdf = await adm.get('/api/v1/export/persons?format=pdf').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await off.get('/api/v1/export/audit?format=csv')).status).toBe(403); // police member lacks audit.export
    expect((await off.get('/api/v1/export/persons?format=csv')).status).toBe(200);
    expect((await adm.get('/api/v1/export/secrets')).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'export' } })).toBeGreaterThanOrEqual(4);
  });
});

describe('media', () => {
  it('stores validated files with hash, random key, and permission-gated download', async () => {
    const adm = (await login(app, 'p_admin')).agent;
    const off = (await login(app, 'p_off')).agent;
    const hr = (await login(app, 'p_hr')).agent; // no complaints.view
    const uploadsBefore = await prisma.auditLog.count({ where: { action: 'media.upload' } }); // andere Testdateien laden auch hoch
    const person = (await adm.post('/api/v1/persons').send({ robloxUsername: 'MediaPerson' })).body.person;

    const ok = await off.post('/api/v1/media').field('linkedType', 'Person').field('linkedId', person.id).attach('file', PNG, { filename: '../../evil name.png', contentType: 'image/png' });
    // officers lack persons.edit
    expect(ok.status).toBe(403);
    const up = await adm.post('/api/v1/media').field('linkedType', 'Person').field('linkedId', person.id).attach('file', PNG, { filename: '../../evil name.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.originalName).not.toContain('/');
    expect(up.body.hash).toMatch(/^[0-9a-f]{64}$/);
    const files = readdirSync(storage);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}\.png$/);

    // type spoofing: claims PNG but is an HTML/script payload
    const spoof = await adm.post('/api/v1/media').field('linkedType', 'Person').field('linkedId', person.id).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'a.png', contentType: 'image/png' });
    expect(spoof.status).toBe(400);
    // disallowed type
    expect((await adm.post('/api/v1/media').field('linkedType', 'Person').field('linkedId', person.id).attach('file', Buffer.from('MZ....'), { filename: 'a.exe', contentType: 'application/x-msdownload' })).status).toBe(400);
    // too large
    const big = Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]);
    expect((await adm.post('/api/v1/media').field('linkedType', 'Person').field('linkedId', person.id).attach('file', big, { filename: 'big.png', contentType: 'image/png' })).status).toBeGreaterThanOrEqual(400);

    const dl = await adm.get(`/api/v1/media/${up.body.id}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);

    // attach to complaint; HR cannot read it
    const c = (await adm.post('/api/v1/complaints').send({ category: 'Conduct', description: 'Evidence photo attached here' })).body;
    const cm = await adm.post('/api/v1/media').field('linkedType', 'Complaint').field('linkedId', c.id).attach('file', PNG, { filename: 'c.png', contentType: 'image/png' });
    expect(cm.status).toBe(201);
    expect((await hr.get(`/api/v1/media/${cm.body.id}`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'media.upload' } })).toBe(uploadsBefore + 2);
  });
});
