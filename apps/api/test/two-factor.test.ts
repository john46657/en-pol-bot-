import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser, PASSWORD } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { base32Encode, hotp, STEP_SECONDS, verifyTotp } from '../src/auth/totp';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'tf_user', ['Police Member']);
  await makeUser(prisma, 'tf_admin', ['System Administrator']);
});
afterAll(async () => { await app.close(); });

const step = () => Math.floor(Date.now() / 1000 / STEP_SECONDS);

describe('TOTP', () => {
  it('matches the RFC 6238 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(hotp(secret, Math.floor(59 / 30))).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(1);
    expect(verifyTotp(secret, '287082', 59_000, 1)).toBeNull(); // nicht zweimal
  });
});

describe('two-factor login', () => {
  let secret = ''; let recovery: string[] = [];

  it('setup → enable with a valid code, returns recovery codes once', async () => {
    const { agent } = await login(app, 'tf_user');
    expect((await agent.get('/api/v1/auth/2fa')).body.enabled).toBe(false);
    const s = await agent.post('/api/v1/auth/2fa/setup');
    expect(s.status).toBe(200);
    secret = s.body.secret;
    expect(s.body.otpauthUrl).toContain('otpauth://totp/');
    expect((await agent.post('/api/v1/auth/2fa/enable').send({ code: '000000' })).status).toBe(400);
    const e = await agent.post('/api/v1/auth/2fa/enable').send({ code: hotp(secret, step()) });
    expect(e.status).toBe(200);
    recovery = e.body.recoveryCodes;
    expect(recovery).toHaveLength(10);
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_user' } });
    expect(u.totpSecret).not.toContain(secret); // verschlüsselt gespeichert
    expect(u.totpRecovery).not.toContain(recovery[0]); // nur Hash
    expect((await agent.get('/api/v1/auth/me')).body.twoFactor).toBe(true);
    expect((await agent.post('/api/v1/auth/2fa/setup')).status).toBe(409);
  });

  it('password alone gives no session; code completes the login', async () => {
    const { agent, res } = await login(app, 'tf_user');
    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(true);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: '123456' })).status).toBe(401);
    expect((await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket + 'x', code: hotp(secret, step() + 1) })).status).toBe(401);
    const ok = await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: hotp(secret, step() + 1) });
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe('tf_user');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    // derselbe Code ein zweites Mal → abgelehnt
    const again = await login(app, 'tf_user');
    expect((await request(app.getHttpServer()).post('/api/v1/auth/login/2fa').send({ ticket: again.res.body.ticket, code: hotp(secret, step() + 1) })).status).toBe(401);
  });

  it('recovery codes work exactly once', async () => {
    const { agent, res } = await login(app, 'tf_user');
    expect((await agent.post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: recovery[0] })).status).toBe(200);
    expect((await agent.get('/api/v1/auth/2fa')).body.recoveryLeft).toBe(9);
    const b = await login(app, 'tf_user');
    expect((await b.agent.post('/api/v1/auth/login/2fa').send({ ticket: b.res.body.ticket, code: recovery[0] })).status).toBe(401);
    await prisma.user.update({ where: { username: 'tf_user' }, data: { failedLogins: 0 } });
  });

  it('wrong codes lock the account', async () => {
    const { res } = await login(app, 'tf_user');
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: '999999' });
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_user' } });
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await request(app.getHttpServer()).post('/api/v1/auth/login/2fa').send({ ticket: res.body.ticket, code: recovery[1] })).status).toBe(401);
    await prisma.user.update({ where: { username: 'tf_user' }, data: { failedLogins: 0, lockedUntil: null } });
  });

  it('only users.manage can reset, never for oneself; reset disables 2FA', async () => {
    const tf = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_user' } });
    const adm = await prisma.user.findUniqueOrThrow({ where: { username: 'tf_admin' } });
    const b = await login(app, 'tf_user');
    const user = request.agent(app.getHttpServer());
    await user.post('/api/v1/auth/login/2fa').send({ ticket: b.res.body.ticket, code: recovery[2] });
    expect((await user.post(`/api/v1/users/${adm.id}/2fa/reset`)).status).toBe(403);
    const admin = (await login(app, 'tf_admin')).agent;
    expect((await admin.post(`/api/v1/users/${adm.id}/2fa/reset`)).status).toBe(409);
    expect((await admin.post(`/api/v1/users/${tf.id}/2fa/reset`)).status).toBe(204);
    expect((await prisma.auditLog.count({ where: { action: 'auth.2fa.reset', entityId: tf.id } }))).toBe(1);
    const c = await login(app, 'tf_user', PASSWORD);
    expect(c.res.body.username).toBe('tf_user');
  });

  it('disable needs a valid code', async () => {
    const { agent } = await login(app, 'tf_user');
    const s = await agent.post('/api/v1/auth/2fa/setup');
    const e = await agent.post('/api/v1/auth/2fa/enable').send({ code: hotp(s.body.secret, step()) });
    expect((await agent.post('/api/v1/auth/2fa/disable').send({ code: '000000' })).status).toBe(400);
    expect((await agent.post('/api/v1/auth/2fa/recovery').send({ code: e.body.recoveryCodes[0] })).body.recoveryCodes).toHaveLength(10);
    expect((await agent.post('/api/v1/auth/2fa/disable').send({ code: hotp(s.body.secret, step() + 1) })).status).toBe(204);
    expect((await agent.get('/api/v1/auth/2fa')).body.enabled).toBe(false);
  });
});
