import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Zentrale Systemstatus-Übersicht: echte Prüfungen, nichts Nicht-Verbundenes als „ok“, Diagnose nur für globale Admins. */
let app: INestApplication; let prisma: PrismaService;
const BOT = 'test-bot-token-system-status-0123456789ab';
type Check = { key: string; state: string; detail: string; group: string };
const byKey = (b: { checks: Check[] }, k: string) => b.checks.find((c) => c.key === k)!;

beforeAll(async () => {
  process.env.BOT_API_TOKEN = BOT;
  delete process.env.GEMINI_API_KEY;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'sys_admin', ['System Administrator']);
  await makeUser(prisma, 'sys_member', ['Police Member']);
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('Systemstatus', () => {
  it('needs settings.view; plain officers get 403', async () => {
    const m = (await login(app, 'sys_member')).agent;
    expect((await m.get('/api/v1/system/status')).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/system/status')).status).toBe(401);
  });

  it('reports real states: database ok, bot not yet seen = error, AI not configured = off, ER:LC none = off', async () => {
    const a = (await login(app, 'sys_admin')).agent;
    const r = await a.get('/api/v1/system/status');
    expect(r.status).toBe(200);
    expect(byKey(r.body, 'database')).toMatchObject({ state: 'ok' });
    expect(byKey(r.body, 'backend').state).toBe('ok');
    expect(byKey(r.body, 'mdt').detail).toMatch(/dieselbe API, Anmeldung und Rechte/);
    expect(byKey(r.body, 'discord-bot')).toMatchObject({ state: 'error' }); // nicht verbunden → nie „ok“
    expect(byKey(r.body, 'ai')).toMatchObject({ state: 'off' });
    // ohne aktive ER:LC-Server „nicht eingerichtet“, sonst nie „off“ (andere Testdateien können Server angelegt haben)
    const erlcActive = await prisma.erlcServer.count({ where: { active: true } });
    expect(byKey(r.body, 'erlc').state === 'off').toBe(erlcActive === 0);
    // Funkdienst: ohne Zello-Work-API nie „ok“ (andere Testdateien können eine manuelle Anbindung angelegt haben)
    const radio = await prisma.radioIntegration.findUnique({ where: { id: 'default' } });
    if (!radio || radio.provider !== 'ZELLO_WORK') expect(byKey(r.body, 'radio').state).toBe('off');
    if (!radio || radio.provider === 'NONE') expect(byKey(r.body, 'radio').detail).toMatch(/keine Funkübertragung/);
    expect(r.body.overall).toBe('error'); // Bot noch nicht gemeldet
    expect(r.body.checks.some((c: Check) => c.group === 'Konfiguration')).toBe(false); // Diagnose nur auf Anfrage
    // Bot meldet sich (fragt die Outbox ab) → verbunden
    expect((await request(app.getHttpServer()).get('/api/v1/bot/outbox?limit=1').set('Authorization', `Bot ${BOT}`)).status).toBe(200);
    expect(byKey((await a.get('/api/v1/system/status')).body, 'discord-bot')).toMatchObject({ state: 'ok', detail: expect.stringMatching(/letzte Abfrage/) });
  });

  it('counts undeliverable Discord messages as a warning', async () => {
    const a = (await login(app, 'sys_admin')).agent;
    const failed = () => prisma.discordOutbox.count({ where: { sentAt: null, attempts: { gte: 5 }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    const before = await failed();
    await prisma.discordOutbox.create({ data: { type: 'x.test', channelKey: 'dispatch', payload: {}, attempts: 5, lastError: 'Missing Access' } });
    const c = byKey((await a.get('/api/v1/system/status')).body, 'discord-delivery');
    expect(c.state).toBe('warn');
    expect(c.detail).toContain(`${before + 1} in 24 h endgültig fehlgeschlagen`);
    expect(JSON.stringify(c)).not.toContain('Missing Access');
  });

  it('diagnosis (deep) only for global admins: config, storage and admin access, never secret values', async () => {
    const a = (await login(app, 'sys_admin')).agent;
    const r = await a.get('/api/v1/system/status?deep=1');
    expect(r.body.canDiagnose).toBe(true);
    expect(byKey(r.body, 'storage').state).toBe('ok');
    expect(byKey(r.body, 'perm-admin').state).toBe('ok');
    expect(byKey(r.body, 'cfg-bot')).toMatchObject({ state: 'ok' });
    expect(JSON.stringify(r.body)).not.toContain(BOT);
    // Rollen-Admin eines Servers (nicht global) sieht keine Diagnose
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'Supervisor' } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionKey: { roleId: role.id, permissionKey: 'settings.view' } }, create: { roleId: role.id, permissionKey: 'settings.view', effect: 'ALLOW' }, update: {} }).catch(() => undefined);
    await makeUser(prisma, 'sys_sup', ['Supervisor']);
    const s = (await login(app, 'sys_sup')).agent;
    const sr = await s.get('/api/v1/system/status?deep=1');
    if (sr.status === 200) {
      expect(sr.body.canDiagnose).toBe(false);
      expect(sr.body.checks.some((c: Check) => c.group === 'Konfiguration')).toBe(false);
    } else expect(sr.status).toBe(403);
  });
});
