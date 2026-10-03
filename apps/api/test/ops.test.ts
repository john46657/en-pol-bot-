import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'o_admin', ['System Administrator']);
  await makeUser(prisma, 'o_officer', ['Police Member']);
  await makeUser(prisma, 'o_officer2', ['Police Member']);
  await makeUser(prisma, 'o_disp', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'o_sup', ['Police Member', 'Supervisor']);
});
afterAll(async () => { await app.close(); });

const person = async (agent: Awaited<ReturnType<typeof login>>['agent'], name: string) =>
  (await agent.post('/api/v1/persons').send({ robloxUsername: name })).body.person.id as string;

describe('dispatch & incidents', () => {
  it('runs a full incident workflow with unit assignment, status machine, timeline and audit', async () => {
    const disp = (await login(app, 'o_disp')).agent;
    const member = await prisma.user.findUniqueOrThrow({ where: { username: 'o_officer' } });
    const unit = (await disp.post('/api/v1/dispatch/units').send({ callsign: 'adam-1', memberIds: [member.id] })).body;
    expect(unit.callsign).toBe('ADAM-1');
    await disp.put(`/api/v1/dispatch/units/${unit.id}/status`).send({ status: 'AVAILABLE' });

    const pid = await person(disp, 'DispPerson');
    const inc = (await disp.post('/api/v1/incidents').send({ title: 'Robbery at bank', priority: 'HIGH', personIds: [pid, pid] })).body;
    expect(inc.number).toMatch(/^I-\d{4}-/);
    expect(await prisma.recordLink.count({ where: { personId: pid, entityType: 'Incident' } })).toBe(1); // dedupe

    const assigned = await disp.post(`/api/v1/dispatch/incidents/${inc.id}/assign`).send({ unitId: unit.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.status).toBe('ASSIGNED');
    expect(await prisma.notification.count({ where: { userId: member.id, type: 'INCIDENT_ASSIGNMENT' } })).toBe(1);
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe('BUSY');

    // illegal jump
    expect((await disp.put(`/api/v1/dispatch/incidents/${inc.id}/status`).send({ status: 'CLOSED' })).status).toBe(400); // CLOSED nur über /close (dispatch.close)
    expect((await disp.post(`/api/v1/dispatch/incidents/${inc.id}/close`)).status).toBe(409); // und nur aus CLEARING
    for (const s of ['EN_ROUTE', 'ON_SCENE', 'CLEARING']) expect((await disp.put(`/api/v1/dispatch/incidents/${inc.id}/status`).send({ status: s })).status).toBe(200);
    const closed = await disp.post(`/api/v1/dispatch/incidents/${inc.id}/close`);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.closedAt).toBeTruthy();
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe('AVAILABLE');
    expect((await disp.post(`/api/v1/dispatch/incidents/${inc.id}/assign`).send({ unitId: unit.id })).status).toBe(409);

    const detail = await disp.get(`/api/v1/incidents/${inc.id}`);
    expect(detail.body.timeline.length).toBeGreaterThanOrEqual(6);
    expect(await prisma.auditLog.count({ where: { entityId: inc.id } })).toBeGreaterThanOrEqual(6);
  });
  it('officers cannot dispatch', async () => {
    const o = (await login(app, 'o_officer')).agent;
    expect((await o.post('/api/v1/dispatch/units').send({ callsign: 'x1' })).status).toBe(403);
    expect((await o.post(`/api/v1/dispatch/incidents/${'0'.repeat(8)}-0000-4000-8000-000000000000/close`)).status).toBe(403);
  });
});

describe('reports', () => {
  it('versions every change, hashes content, enforces review flow and separation of duties', async () => {
    const o = (await login(app, 'o_officer')).agent;
    const sup = (await login(app, 'o_sup')).agent;
    const o2 = (await login(app, 'o_officer2')).agent;
    const pid = await person(o, 'ReportPerson');
    const r = (await o.post('/api/v1/reports').send({ type: 'PATROL', title: 'Night patrol', content: { body: 'v1' }, personIds: [pid] })).body;
    expect(await prisma.recordLink.count({ where: { personId: pid, entityType: 'Report' } })).toBe(1);

    // other officers cannot see a draft (indistinguishable from nonexistent)
    expect((await o2.get(`/api/v1/reports/${r.id}`)).status).toBe(404);
    expect((await o2.get('/api/v1/reports')).body.items.find((x: { id: string }) => x.id === r.id)).toBeUndefined();

    const e = await o.patch(`/api/v1/reports/${r.id}`).send({ version: r.version, content: { body: 'v2' }, changeSummary: 'Added details' });
    expect(e.status).toBe(200);
    expect((await o.patch(`/api/v1/reports/${r.id}`).send({ version: r.version, content: { body: 'stale' }, changeSummary: 'stale write' })).status).toBe(409);
    const versions = await prisma.reportVersion.findMany({ where: { reportId: r.id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0]!.content).toEqual({ body: 'v1' });
    expect(versions[0]!.contentHash).not.toBe(versions[1]!.contentHash);

    expect((await o.post(`/api/v1/reports/${r.id}/approve`)).status).toBe(403);
    expect((await o.post(`/api/v1/reports/${r.id}/submit`)).status).toBe(201);
    expect((await o.patch(`/api/v1/reports/${r.id}`).send({ version: e.body.version + 1, content: { body: 'x' }, changeSummary: 'locked' })).status).toBe(409);
    expect((await sup.post(`/api/v1/reports/${r.id}/approve`)).status).toBe(409); // must be UNDER_REVIEW first
    expect((await sup.post(`/api/v1/reports/${r.id}/start-review`)).status).toBe(201);
    expect((await sup.post(`/api/v1/reports/${r.id}/reject`).send({})).status).toBe(400);
    expect((await sup.post(`/api/v1/reports/${r.id}/reject`).send({ reason: 'Missing suspect details' })).status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: r.authorId, type: 'REPORT_REVIEW' } })).toBeGreaterThanOrEqual(2);
  });
});

describe('complaints', () => {
  it('walks the workflow, hides internal notes from non-investigators, blocks conflicts', async () => {
    const o = (await login(app, 'o_officer')).agent;
    const admin = (await login(app, 'o_admin')).agent;
    const subj = await person(o, 'ComplaintSubject');
    const accused = await prisma.user.findUniqueOrThrow({ where: { username: 'o_officer2' } });
    const c = await o.post('/api/v1/complaints').send({ subjectId: subj, officerId: accused.id, category: 'Conduct', description: 'Rude behaviour during stop' });
    expect(c.status).toBe(201);
    expect(await prisma.recordLink.count({ where: { personId: subj, entityType: 'Complaint' } })).toBe(1);
    expect((await o.get(`/api/v1/complaints/${c.body.id}`)).status).toBe(403); // complaints.view needed

    expect((await admin.post(`/api/v1/complaints/${c.body.id}/assign`).send({ investigatorId: accused.id })).status).toBe(409); // wrong state
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/screen`)).status).toBe(201);
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/assign`).send({ investigatorId: accused.id })).status).toBe(409); // involved officer
    const inv = await prisma.user.findUniqueOrThrow({ where: { username: 'o_admin' } });
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/assign`).send({ investigatorId: inv.id })).status).toBe(201);
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/investigate`).send({ internalNotes: 'secret note' })).status).toBe(201);
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/review`).send({})).status).toBe(201);
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/close`)).status).toBe(409); // must resolve first
    expect((await admin.post(`/api/v1/complaints/${c.body.id}/resolve`).send({ resolution: 'Verbal warning' })).status).toBe(201);

    // supervisor may view but has no investigate permission -> no internal notes
    const supAgent = (await login(app, 'o_sup')).agent;
    await prisma.userPermissionOverride.create({ data: { userId: (await prisma.user.findUniqueOrThrow({ where: { username: 'o_sup' } })).id, permissionKey: 'complaints.view', effect: 'ALLOW' } });
    const seen = await supAgent.get(`/api/v1/complaints/${c.body.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.complaint.internalNotes).toBeUndefined();
    expect((await admin.get(`/api/v1/complaints/${c.body.id}`)).body.complaint.internalNotes).toBe('secret note');
  });
});

describe('investigations, wanted, evidence', () => {
  it('investigation links persons by role and ties evidence via case number', async () => {
    const admin = (await login(app, 'o_admin')).agent;
    const p1 = await person(admin, 'Suspect1');
    const inv = (await admin.post('/api/v1/investigations').send({ title: 'Armed robbery', persons: [{ personId: p1, role: 'SUSPECT' }] })).body;
    expect(inv.caseNumber).toMatch(/^CASE-/);
    const ev = await admin.post('/api/v1/evidence').send({ type: 'Weapon', description: 'Pistol', caseRef: inv.caseNumber, personIds: [p1] });
    expect(ev.status).toBe(201);
    expect((await admin.post('/api/v1/evidence').send({ type: 'x1', description: 'ghost', caseRef: 'CASE-0000-NONE' })).status).toBe(404);
    const detail = await admin.get(`/api/v1/investigations/${inv.id}`);
    expect(detail.body.links).toHaveLength(1);
    expect(detail.body.evidence).toHaveLength(1);
    expect((await admin.put(`/api/v1/investigations/${inv.id}/status`).send({ status: 'CLOSED' })).status).toBe(400);
    expect((await admin.put(`/api/v1/investigations/${inv.id}/status`).send({ status: 'ACTIVE' })).status).toBe(200);
  });
  it('wanted: one active record per subject, clear needs permission+reason, expiry honoured', async () => {
    const admin = (await login(app, 'o_admin')).agent;
    const o = (await login(app, 'o_officer')).agent;
    const pid = await person(admin, 'WantedGuy');
    const w = await admin.post('/api/v1/wanted').send({ personId: pid, reason: 'Armed robbery' });
    expect(w.status).toBe(201);
    expect((await admin.post('/api/v1/wanted').send({ personId: pid, reason: 'again' })).status).toBe(409);
    expect((await admin.post('/api/v1/wanted').send({ reason: 'nobody' })).status).toBe(400);
    expect((await o.post(`/api/v1/wanted/${w.body.id}/clear`).send({ reason: 'surrendered' })).status).toBe(403);
    expect((await admin.post(`/api/v1/wanted/${w.body.id}/clear`).send({})).status).toBe(400);
    expect((await admin.post(`/api/v1/wanted/${w.body.id}/clear`).send({ reason: 'Arrested' })).status).toBe(201);
    expect(await prisma.timelineEvent.count({ where: { entityType: 'Person', entityId: pid, action: 'wanted.cleared' } })).toBe(1);

    const p2 = await person(admin, 'Expiring');
    const e = await prisma.wantedRecord.create({ data: { personId: p2, reason: 'old', createdById: (await prisma.user.findFirstOrThrow()).id, expiresAt: new Date(Date.now() - 1000) } });
    const active = await admin.get('/api/v1/wanted');
    expect(active.body.items.find((x: { id: string }) => x.id === e.id)).toBeUndefined();
    expect((await prisma.wantedRecord.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('EXPIRED');
  });
  it('evidence: custody chain, release permission, handover confirmation', async () => {
    const admin = (await login(app, 'o_admin')).agent;
    const o2 = await prisma.user.findUniqueOrThrow({ where: { username: 'o_officer2' } });
    const ev = (await admin.post('/api/v1/evidence').send({ type: 'Photo', description: 'Scene photo' })).body;
    expect((await admin.post(`/api/v1/evidence/${ev.id}/transfer`).send({ to: 'RELEASED', reason: 'nope' })).status).toBe(400);
    expect((await admin.post(`/api/v1/evidence/${ev.id}/transfer`).send({ to: 'STORED', reason: 'Locker 4', storageLocation: 'Locker 4' })).status).toBe(201);
    expect((await admin.post(`/api/v1/evidence/${ev.id}/transfer`).send({ to: 'TRANSFERRED', reason: 'to lab' })).status).toBe(400);
    expect((await admin.post(`/api/v1/evidence/${ev.id}/transfer`).send({ to: 'TRANSFERRED', toUserId: o2.id, reason: 'to officer2' })).status).toBe(201);
    const pending = await prisma.evidenceTransfer.findFirstOrThrow({ where: { evidenceId: ev.id, toState: 'TRANSFERRED' } });
    expect(pending.confirmed).toBe(false);
    const o2agent = (await login(app, 'o_officer2')).agent;
    expect((await admin.post(`/api/v1/evidence/${ev.id}/confirm`)).status).toBe(404); // only recipient
    await prisma.userPermissionOverride.create({ data: { userId: o2.id, permissionKey: 'evidence.transfer', effect: 'ALLOW' } });
    expect((await o2agent.post(`/api/v1/evidence/${ev.id}/confirm`)).status).toBe(201);
    expect((await o2agent.post(`/api/v1/evidence/${ev.id}/release`).send({ reason: 'case closed' })).status).toBe(403);
    expect((await admin.post(`/api/v1/evidence/${ev.id}/release`).send({ reason: 'case closed' })).status).toBe(201);
    const full = await admin.get(`/api/v1/evidence/${ev.id}`);
    expect(full.body.transfers.map((t: { toState: string }) => t.toState)).toEqual(['COLLECTED', 'STORED', 'TRANSFERRED', 'RELEASED']);
  });
});

describe('person merge (explicit admin confirmation)', () => {
  it('requires permission + confirm:true, moves links and archives the source', async () => {
    const admin = (await login(app, 'o_admin')).agent;
    const o = (await login(app, 'o_officer')).agent;
    const a = (await admin.post('/api/v1/persons').send({ robloxUsername: 'DupA' })).body.person;
    const b = (await admin.post('/api/v1/persons').send({ robloxUsername: 'DupA_alt', robloxUserId: '4242' })).body.person;
    await admin.post('/api/v1/tickets').send({ personId: a.id, reason: 'Parking violation' });
    expect((await o.post(`/api/v1/persons/${a.id}/merge`).send({ targetId: b.id, confirm: true, reason: 'same person' })).status).toBe(403);
    expect((await admin.post(`/api/v1/persons/${a.id}/merge`).send({ targetId: b.id, reason: 'same person' })).status).toBe(400); // no confirm
    expect((await admin.post(`/api/v1/persons/${a.id}/merge`).send({ targetId: b.id, confirm: true, reason: 'same person' })).status).toBe(201);
    expect(await prisma.ticket.count({ where: { personId: b.id } })).toBe(1);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('ARCHIVED');
    expect((await prisma.person.findUniqueOrThrow({ where: { id: b.id } })).aliases).toContain('DupA');
    expect((await admin.post(`/api/v1/persons/${a.id}/merge`).send({ targetId: b.id, confirm: true, reason: 'again' })).status).toBe(409);
  });
});
