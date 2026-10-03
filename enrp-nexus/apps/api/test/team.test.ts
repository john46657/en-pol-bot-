import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
const id: Record<string, string> = {};
const uid = (n: string) => id[n] as string;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ t_admin: ['System Administrator'], t_off: ['Police Member'], t_sup: ['Police Member', 'Supervisor'], t_disp: ['Police Member', 'Dispatch'] })) id[n] = (await makeUser(prisma, n, roles)).id;
  const adm = (await login(app, 't_admin')).agent;
  await adm.post('/api/v1/personnel').send({ userId: uid('t_off'), rank: 'Officer', callsign: 't-1' });
  await adm.post('/api/v1/personnel').send({ userId: uid('t_sup'), rank: 'Sergeant', callsign: 't-s' });
});
afterAll(async () => { await app.close(); });

describe('team dashboard', () => {
  it('own status route is not shadowed by the supervisor route (regression)', async () => {
    const off = (await login(app, 't_off')).agent;
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' })).status).toBe(200);
  });

  it('overview shows rank, callsign, duty status, unit and current incident', async () => {
    const disp = (await login(app, 't_disp')).agent;
    const unit = (await disp.post('/api/v1/dispatch/units').send({ callsign: 'tm-1', memberIds: [uid('t_off')] })).body;
    await disp.put(`/api/v1/dispatch/units/${unit.id}/status`).send({ status: 'AVAILABLE' });
    const inc = (await disp.post('/api/v1/incidents').send({ title: 'Team test incident', priority: 'HIGH' })).body;
    await disp.post(`/api/v1/dispatch/incidents/${inc.id}/assign`).send({ unitId: unit.id });

    const sup = (await login(app, 't_sup')).agent;
    const rows = (await sup.get('/api/v1/team/overview')).body as { userId: string; callsign: string; rank: string; dutyStatus: string; unit: { callsign: string } | null; currentIncident: { number: string } | null; lastStatusChange: string | null }[];
    const o = rows.find((r) => r.userId === uid('t_off'))!;
    expect(o).toMatchObject({ callsign: 'T-1', rank: 'Officer', dutyStatus: 'ON_DUTY', unit: { callsign: 'TM-1' } });
    expect(o.currentIncident?.number).toMatch(/^I-/);
    expect(o.lastStatusChange).toBeTruthy();
    const s = rows.find((r) => r.userId === uid('t_sup'))!;
    expect(s).toMatchObject({ dutyStatus: 'OFF_DUTY', unit: null, currentIncident: null });
    // a closed incident no longer counts as "current"
    await disp.put(`/api/v1/dispatch/incidents/${inc.id}/status`).send({ status: 'CANCELLED' });
    const again = (await sup.get('/api/v1/team/overview')).body.find((r: { userId: string }) => r.userId === uid('t_off'));
    expect(again.currentIncident).toBeNull();
  });

  it('only team.manage may set other officers’ duty status; audited with the supervisor as actor', async () => {
    const off = (await login(app, 't_off')).agent;
    const sup = (await login(app, 't_sup')).agent;
    expect((await off.put(`/api/v1/team/${uid('t_sup')}/status`).send({ status: 'BREAK' })).status).toBe(403);
    expect((await sup.put(`/api/v1/team/${uid('t_off')}/status`).send({ status: 'BREAK' })).status).toBe(200);
    expect((await sup.put(`/api/v1/team/${uid('t_off')}/status`).send({ status: 'BREAK' })).status).toBe(409); // unchanged
    expect((await sup.put('/api/v1/team/00000000-0000-4000-8000-000000000000/status').send({ status: 'ON_DUTY' })).status).toBe(404);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'duty.status.set_by_supervisor', entityId: uid('t_off') } });
    expect(log.actorUserId).toBe(uid('t_sup'));
    const mine = (await off.get('/api/v1/team/me')).body;
    expect(mine.status).toBe('BREAK');
  });

  it('unit membership needs dispatch.assign and only accepts active users', async () => {
    const off = (await login(app, 't_off')).agent;
    const disp = (await login(app, 't_disp')).agent;
    const u = await prisma.unit.findFirstOrThrow({ where: { callsign: 'TM-1' } });
    expect((await off.put(`/api/v1/dispatch/units/${u.id}/members`).send({ userIds: [] })).status).toBe(403);
    expect((await disp.put(`/api/v1/dispatch/units/${u.id}/members`).send({ userIds: [uid('t_sup')] })).status).toBe(200);
    expect((await prisma.unitMember.findMany({ where: { unitId: u.id } })).map((m) => m.userId)).toEqual([uid('t_sup')]);
    const ghost = await makeUser(prisma, 't_ghost', []);
    await prisma.user.update({ where: { id: ghost.id }, data: { active: false } });
    expect((await disp.put(`/api/v1/dispatch/units/${u.id}/members`).send({ userIds: [ghost.id] })).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'unit.members', entityId: u.id } })).toBe(1);
  });
});
