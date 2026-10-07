import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WorkflowsService } from '../src/workflows/workflows.service';

let app: INestApplication; let prisma: PrismaService; let wf: WorkflowsService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  wf = app.get(WorkflowsService);
  await makeUser(prisma, 'wf_admin', ['System Administrator']);
  await makeUser(prisma, 'wf_officer', ['Police Member']);
  await makeUser(prisma, 'wf_sup', ['Supervisor']);
});
afterAll(async () => { await app.close(); });

const later = () => new Date(Date.now() + 2000);

describe('studio workflows', () => {
  it('only studio.manage can create; input is validated', async () => {
    const officer = (await login(app, 'wf_officer')).agent;
    expect((await officer.get('/api/v1/studio/workflows')).status).toBe(403);
    const adm = (await login(app, 'wf_admin')).agent;
    expect((await adm.post('/api/v1/studio/workflows').send({ name: 'x', trigger: 'incident.create', actions: [{ type: 'notify_permission', permission: 'nope', title: 't' }] })).status).toBe(400);
    expect((await adm.post('/api/v1/studio/workflows').send({ name: 'x', trigger: 'DROP TABLE', actions: [{ type: 'notify_permission', permission: 'team.manage', title: 't' }] })).status).toBe(400);
    expect((await adm.post('/api/v1/studio/workflows').send({ name: 'x', trigger: 'incident.create', actions: [{ type: 'discord', channelIds: ['abc'], title: 't' }] })).status).toBe(400);
  });

  it('fires on matching events only, once, with rendered templates', async () => {
    const adm = (await login(app, 'wf_admin')).agent;
    const w = await adm.post('/api/v1/studio/workflows').send({
      name: 'Kritische Einsätze', trigger: 'incident.create', conditions: [{ field: 'priority', op: 'in', value: 'HIGH, CRITICAL' }],
      actions: [
        { type: 'notify_permission', permission: 'team.manage', title: 'Kritisch: {{title}}', body: 'von {{actor}} in {{location}}' },
        { type: 'discord', channelIds: ['123456789012345678'], pingRoleIds: ['223456789012345678'], title: '🚨 {{title}}', text: 'Priorität {{priority}}', color: '#ff0000' },
      ],
    });
    expect(w.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: 'studio.workflow.create', entityId: w.body.id } })).toBe(1);
    const officer = (await login(app, 'wf_officer')).agent;
    expect((await officer.post('/api/v1/incidents').send({ title: 'Banküberfall', priority: 'CRITICAL', location: 'Hauptstraße' })).status).toBe(201);
    expect((await officer.post('/api/v1/incidents').send({ title: 'Falschparker', priority: 'LOW' })).status).toBe(201);
    expect(await wf.tick(later())).toBe(1);
    expect(await wf.tick(later())).toBe(0); // nicht doppelt
    const sup = await prisma.user.findUniqueOrThrow({ where: { username: 'wf_sup' } });
    const n = await prisma.notification.findFirst({ where: { userId: sup.id, type: 'WORKFLOW' } });
    expect(n?.title).toBe('Kritisch: Banküberfall');
    expect(n?.body).toBe('von wf_officer in Hauptstraße');
    const off = await prisma.user.findUniqueOrThrow({ where: { username: 'wf_officer' } });
    expect(await prisma.notification.count({ where: { userId: off.id, type: 'WORKFLOW' } })).toBe(0); // ohne team.manage
    const out = await prisma.discordOutbox.findFirst({ where: { type: 'workflow.message' } });
    expect(out?.payload).toMatchObject({ channelIds: ['123456789012345678'], title: '🚨 Banküberfall', text: 'Priorität CRITICAL', workflow: 'Kritische Einsätze' });
    const runs = await adm.get(`/api/v1/studio/workflows/${w.body.id}/runs`);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].ok).toBe(true);
  });

  it('disabled workflows do not fire and re-enabling does not replay old events', async () => {
    const adm = (await login(app, 'wf_admin')).agent;
    const body = { name: 'Alle Berichte', trigger: 'incident.*', enabled: false, conditions: [], actions: [{ type: 'notify_permission', permission: 'team.manage', title: 'Neu: {{action}}' }] };
    const w = (await adm.post('/api/v1/studio/workflows').send(body)).body;
    const officer = (await login(app, 'wf_officer')).agent;
    await officer.post('/api/v1/incidents').send({ title: 'Ruhestörung' });
    expect(await wf.tick(later())).toBe(0);
    expect((await adm.put(`/api/v1/studio/workflows/${w.id}`).send({ ...body, enabled: true })).status).toBe(200);
    expect(await wf.tick(later())).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    await officer.post('/api/v1/incidents').send({ title: 'Diebstahl' });
    expect(await wf.tick(later())).toBe(1);
    expect((await adm.delete(`/api/v1/studio/workflows/${w.id}`)).status).toBe(204);
    expect(await prisma.workflowRun.count({ where: { workflowId: w.id } })).toBe(0);
  });
});
