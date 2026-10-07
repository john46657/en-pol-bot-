import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RobloxService } from '../src/persons/roblox.service';

let app: INestApplication; let prisma: PrismaService; let http: Awaited<ReturnType<typeof createTestApp>>['http'];
beforeAll(async () => {
  ({ app, prisma, http } = await createTestApp());
  await makeUser(prisma, 'rq_admin', ['System Administrator']);
});
afterAll(async () => { await app.close(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('question type „Roblox User“', () => {
  it('can be configured without options and is checked on Roblox when applying', async () => {
    const adm = (await login(app, 'rq_admin')).agent;
    const form = [{ key: 'rb', label: 'Dein Roblox User', required: true, type: 'ROBLOX', maxLength: 20 }, { key: 'why', label: 'Warum?', required: true, maxLength: 200 }];
    expect((await adm.put('/api/v1/admin/settings/application.form').send({ value: form })).status).toBe(200);
    expect((await http().get('/api/v1/applications/form')).body[0]).toMatchObject({ type: 'ROBLOX', options: [] });
    const rb = app.get(RobloxService);
    // ungültiger Name → 400 ohne Roblox-Abfrage
    expect((await http().post('/api/v1/applications').send({ robloxUsername: 'x', answers: { rb: 'no spaces!', why: 'weil' } })).status).toBe(400);
    // gibt es nicht → 400
    vi.spyOn(rb, 'verifyName').mockResolvedValueOnce(null);
    const missing = await http().post('/api/v1/applications').send({ robloxUsername: 'Ghost', answers: { rb: 'GhostUser123', why: 'weil' } });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain('GhostUser123');
    // gefunden → richtige Schreibweise + ID, Roblox-ID der Bewerbung gesetzt
    vi.spyOn(rb, 'verifyName').mockResolvedValueOnce({ id: '156', name: 'Builderman' });
    const ok = await http().post('/api/v1/applications').send({ robloxUsername: 'builderman', answers: { rb: 'builderman', why: 'weil' } });
    expect(ok.status).toBe(201);
    const a = await prisma.application.findFirstOrThrow({ where: { robloxUserId: '156' } });
    expect(a.robloxUsername).toBe('Builderman');
    expect((a.answers as Record<string, string>).rb).toBe('Builderman (ID 156)');
  });

  it('verifyName distinguishes found / missing / Roblox unreachable', async () => {
    vi.stubEnv('ROBLOX_LOOKUP', 'on');
    const rb = app.get(RobloxService);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 1, name: 'Roblox' }] }), { status: 200 })));
    expect(await rb.verifyName('roblox')).toEqual({ id: '1', name: 'Roblox' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    expect(await rb.verifyName('NobodyHere99')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 503 })));
    expect(await rb.verifyName('Unclear_42')).toBeUndefined();
  });

  it('public account search returns only name, display name and picture', async () => {
    vi.spyOn(app.get(RobloxService), 'lookup').mockResolvedValueOnce({ id: '156', name: 'Builderman', displayName: 'Builder', description: 'x', created: null, isBanned: false, avatarUrl: 'https://tr.rbxcdn.com/a.png', profileUrl: 'https://www.roblox.com/users/156/profile', person: { id: 'secret', robloxUsername: 'Builderman' } });
    const r = await http().get('/api/v1/applications/roblox?q=builderman');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ profile: { id: '156', name: 'Builderman', displayName: 'Builder', avatarUrl: 'https://tr.rbxcdn.com/a.png' } });
    expect((await http().get('/api/v1/applications/roblox?q=a b')).status).toBe(400);
  });
});
