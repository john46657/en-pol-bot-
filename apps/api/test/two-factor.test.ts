import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser, PASSWORD } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { base32Decode, base32Encode, hotp, STEP_SECONDS, totpNow, verifyTotp } from '../src/auth/totp';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'tf_admin', ['System Administrator']);
});
afterAll(async () => { await app.close(); });

/** Code für den nächsten Zeitschritt (der aktuelle ist nach dem Einrichten bereits verbraucht). */
const nextCode = (secret: string) => totpNow(secret, Date.now() + STEP_SECONDS * 1000);

async function enable(username: string) {
  await makeUser(prisma, username, ['Police Member']);
  const { agent } = await login(app, username);
  const setup = await agent.post('/api/v1/auth/2fa/setup').expect(200);
  const secret = setup.body.secret as string;
  expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  const en = await agent.post('/api/v1/auth/2fa/enable').send({ code: totpNow(secret) }).expect(200);
  return { agent, secret, recovery: en.body.recoveryCodes as string[] };
}

describe('TOTP', () => {
  it('matches the RFC 6238 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(hotp(secret, Math.floor(59 / 30))).toBe('287082');
    expect(hotp(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('accepts ±1 step and rejects reuse', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1111111109_000;
    const step = verifyTotp(secret, totpNow(secret, now - 30_000), now);
    expect(step).toBe(Math.floor(now / 30_000) - 1);
    expect(verifyTotp(secret, totpNow(secret, now), now, step)).not.toBeNull();
    expect(verifyTotp(secret, totpNow(secret, now - 30_000), now, step)).toBeNull();
    expect(verifyTotp(secret, totpNow(secret, now - 90_000), now)).toBeNull();
  });
});

describe('two-factor login', () => {
  it('enable fails with a bad code', async () => {
    await makeUser(prisma, 'tf_bad', ['Police Member']);
    const { agent } = await login(app, 'tf_bad');
    await agent.post('/api/v1/auth/2fa/setup').expect(200);
    await agent.post('/api/v1/auth/2fa/enable').send({ code: '000000' }).expect(400);
    expect((await agent.get('/api/v1/auth/2fa').expect(200)).body.enabled).toBe(false);
  });

  it('password alone gives only a ticket, the code completes the sign-in', async () => {
    const { secret, recovery } = await enable('tf_user');
    expect(recovery).toHaveLength(10);
    const { agent, res } = await login(app, 'tf_user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ twoFactorRequired: true, ticket: expect.any(String) });
    expect(res.headers['set-cookie']).toBeUndefined();
    await agent.get('/api/v1/auth/me').expect(401);

    await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: '123456' }).expect(401);
    const ok = await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: nextCode(secret) }).expect(200);
    expect(ok.body.username).toBe('tf_user');
    expect(ok.body.twoFactor).toBe(true);
    await agent.get('/api/v1/auth/me').expect(200);

    // Derselbe Code gilt kein zweites Mal
    const again = await login(app, 'tf_user');
    await again.agent.post('/api/v1/auth/login/2fa').send({ ticket: again.res.body.ticket, code: nextCode(secret) }).expect(401);
  });

  it('recovery codes work once; tampered or foreign tickets are rejected', async () => {
    const { recovery } = await enable('tf_rec');
    const a = await login(app, 'tf_rec');
    await a.agent.post('/api/v1/auth/login/2fa').send({ ticket: a.res.body.ticket, code: recovery[0]!.toUpperCase() }).expect(200);
    const b = await login(app, 'tf_rec');
    await b.agent.post('/api/v1/auth/login/2fa').send({ ticket: b.res.body.ticket, code: recovery[0] }).expect(401);
    expect((await a.agent.get('/api/v1/auth/2fa').expect(200)).body.recoveryCodesLeft).toBe(9);

    const other = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_admin' } });
    const [p, sig] = (b.res.body.ticket as string).split('.');
    const forged = `${Buffer.from(`${other.id}.${Date.now() + 60_000}`).toString('base64url')}.${sig}`;
    expect(p).toBeTruthy();
    await request(app.getHttpServer()).post('/api/v1/auth/login/2fa').send({ ticket: forged, code: recovery[1] }).expect(401);
  });

  it('wrong codes lock the account like wrong passwords', async () => {
    await enable('tf_lock');
    const { agent, res } = await login(app, 'tf_lock');
    for (let i = 0; i < 5; i++) await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: '000000' }).expect(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_lock' } });
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('disable needs a valid code; an admin can reset it and sessions end', async () => {
    const { agent, secret } = await enable('tf_off');
    await agent.post('/api/v1/auth/2fa/disable').send({ code: '000000' }).expect(400);
    await agent.post('/api/v1/auth/2fa/disable').send({ code: nextCode(secret) }).expect(204);
    expect((await login(app, 'tf_off')).res.body.username).toBe('tf_off');

    const { agent: victim } = await enable('tf_reset');
    const target = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_reset' } });
    const { agent: admin } = await login(app, 'tf_admin');
    const r = await admin.post(`/api/v1/users/${target.id}/2fa/reset`).send({ reason: 'Handy verloren' }).expect(200);
    expect(r.body.totpEnabledAt).toBeNull();
    await victim.get('/api/v1/auth/me').expect(401);
    expect((await login(app, 'tf_reset', PASSWORD)).res.body.username).toBe('tf_reset');
    expect(await prisma.auditLog.count({ where: { action: 'user.2fa.reset', entityId: target.id } })).toBe(1);
  });
});
