import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService; let url: string;
const open: Socket[] = [];

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await app.listen(0);
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  await makeUser(prisma, 'w_disp', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'w_off', ['Police Member']);
  await makeUser(prisma, 'w_none', []);
});
afterAll(async () => { open.forEach((s) => s.close()); await app.close(); });

async function connect(username: string | null) {
  let cookie = '';
  if (username) {
    const { res } = await login(app, username);
    cookie = res.headers['set-cookie']![0]!.split(';')[0]!;
  }
  const s = io(url, { path: '/ws', extraHeaders: cookie ? { cookie } : {}, transports: ['websocket'], reconnection: false });
  open.push(s);
  if (username) await once(s, 'connect');
  return s;
}
function once<T>(s: Socket, ev: string) { return new Promise<T>((res, rej) => { s.once(ev, res); setTimeout(() => rej(new Error(`timeout ${ev}`)), 3000); }); }
const emit = <T>(s: Socket, ev: string, body: unknown) => s.timeout(3000).emitWithAck(ev, body) as Promise<T>;

describe('websocket authorization', () => {
  it('disconnects unauthenticated clients', async () => {
    const s = await connect(null);
    await once(s, 'disconnect');
    expect(s.connected).toBe(false);
  });
  it('authorizes every subscription server-side', async () => {
    const off = await connect('w_off');
    expect(await emit(off, 'subscribe', { room: 'dispatch' })).toEqual({ ok: true });
    expect(await emit(off, 'subscribe', { room: 'wanted-admin' })).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    expect(await emit(off, 'subscribe', { room: 'user:someone-else' })).toMatchObject({ ok: false }); // cannot join foreign user rooms
    expect(await emit(off, 'subscribe', { room: 'nonexistent' })).toMatchObject({ ok: false });
    const none = await connect('w_none');
    expect(await emit(none, 'subscribe', { room: 'dispatch' })).toMatchObject({ ok: false });
  });
  it('delivers events only to authorized subscribers', async () => {
    const off = await connect('w_off');
    const none = await connect('w_none');
    await emit(off, 'subscribe', { room: 'incidents' });
    await emit(none, 'subscribe', { room: 'incidents' }); // denied
    let leaked = false;
    none.on('incident.created', () => { leaked = true; });
    const got = once<{ number: string }>(off, 'incident.created');
    const { agent } = await login(app, 'w_disp');
    const inc = await agent.post('/api/v1/incidents').send({ title: 'WS test incident' });
    expect((await got).number).toBe(inc.body.number);
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
  });
  it('refuses subscriptions after the session was revoked', async () => {
    const off = await connect('w_off');
    await prisma.session.updateMany({ where: { user: { username: 'w_off' } }, data: { revokedAt: new Date() } });
    expect(await emit(off, 'subscribe', { room: 'dispatch' })).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });
});
