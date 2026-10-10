import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, member: Agent, sup: Agent;
const ids: Record<string, string> = {} as Record<string, string>;
const id = (k: string) => ids[k]!;
const started = new Date();

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'hr_admin', ['System Administrator']);
  const m = await makeUser(prisma, 'hr_member', ['Police Member']);
  const s = await makeUser(prisma, 'hr_sup', ['Supervisor']);
  const t = await makeUser(prisma, 'hr_target', ['Police Member']);
  ids.member = m.id; ids.sup = s.id; ids.target = t.id;
  admin = (await login(app, 'hr_admin')).agent;
  member = (await login(app, 'hr_member')).agent;
  sup = (await login(app, 'hr_sup')).agent;
});
afterAll(async () => {
  await prisma.serviceNumberEvent.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.serviceNumber.deleteMany({});
  await prisma.serviceNumberRange.deleteMany({});
  await prisma.hrRequest.deleteMany({});
  await prisma.personnel.deleteMany({ where: { user: { username: { startsWith: 'hr_' } } } });
  await prisma.hrRank.deleteMany({ where: { name: { startsWith: 'T-' } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['hr.config', 'dienstnummer.settings'] } } });
  await app.close();
});

describe('Rangsystem & Beförderung', () => {
  it('ranks are created and ordered; only promotion.manage_ranks', async () => {
    expect((await member.post('/api/v1/hr/ranks').send({ name: 'T-Meister' })).status).toBe(403);
    const low = await admin.post('/api/v1/hr/ranks').send({ name: 'T-Meister', color: '#22c55e' });
    const high = await admin.post('/api/v1/hr/ranks').send({ name: 'T-Kommissar', discordRoleIds: ['470000000000000001'] });
    expect(low.status).toBe(201); expect(high.status).toBe(201);
    ids.low = low.body.id; ids.high = high.body.id;
    // Reihenfolge: Kommissar über Meister
    const ordered = await admin.put('/api/v1/hr/ranks/order').send({ ids: [ids.high, ids.low] });
    expect(ordered.body.findIndex((r: { id: string }) => r.id === ids.high)).toBeLessThan(ordered.body.findIndex((r: { id: string }) => r.id === ids.low));
    // Voraussetzungen: frei definierbar
    const req = randomUUID();
    const upd = await admin.put(`/api/v1/hr/ranks/${ids.high}`).send({ name: 'T-Kommissar', discordRoleIds: ['470000000000000001'], requirements: [{ id: req, type: 'CUSTOM', label: 'Empfehlung der Leitung' }, { id: randomUUID(), type: 'MIN_DAYS_IN_RANK', value: 0 }] });
    expect(upd.status).toBe(200);
    ids.req = req;
    expect((await prisma.auditLog.count({ where: { action: 'promotion.requirements.update', entityId: ids.high } }))).toBe(1);
  });

  it('profile shows next rank with requirement progress', async () => {
    const p = await admin.post('/api/v1/hr/people').send({ userId: ids.target, rank: 'T-Meister', department: 'Polizei' });
    expect(p.status).toBe(201);
    ids.p = p.body.id;
    const prof = await admin.get(`/api/v1/hr/people/${ids.p}`);
    expect(prof.status).toBe(200);
    expect(prof.body.next[0]).toMatchObject({ rankName: 'T-Kommissar', met: 1, total: 2, eligible: false });
    // abhaken → erfüllt
    expect((await admin.put(`/api/v1/hr/people/${ids.p}/checks/${ids.req}`).send({ value: true })).status).toBe(200);
    expect((await admin.get(`/api/v1/hr/people/${ids.p}`)).body.next[0].eligible).toBe(true);
  });

  it('request → approve → execute: rank, history, Discord roles, audit', async () => {
    expect((await member.post('/api/v1/hr/requests').send({ kind: 'PROMOTION', personnelId: ids.p, to: ids.high, reason: 'Sehr gute Leistungen' })).status).toBe(403);
    const r = await sup.post('/api/v1/hr/requests').send({ kind: 'PROMOTION', personnelId: ids.p, to: ids.high, reason: 'Sehr gute Leistungen', achievements: '10 Einsätze' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('OPEN');
    // doppelt geht nicht
    expect((await sup.post('/api/v1/hr/requests').send({ kind: 'PROMOTION', personnelId: ids.p, to: ids.high, reason: 'nochmal' })).status).toBe(409);
    // Supervisor darf nicht genehmigen (kein promotion.approve)
    expect((await sup.post(`/api/v1/hr/requests/${r.body.id}/decide`).send({ decision: 'APPROVE' })).status).toBe(403);
    const ok = await admin.post(`/api/v1/hr/requests/${r.body.id}/decide`).send({ decision: 'APPROVE', comment: 'passt' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('APPROVED');
    await prisma.discordLink.create({ data: { userId: id('target'), discordId: '480000000000000001' } });
    const ex = await admin.post(`/api/v1/hr/requests/${r.body.id}/execute`);
    expect(ex.status).toBe(200);
    expect(ex.body.status).toBe('EXECUTED');
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: ids.p } })).rank).toBe('T-Kommissar');
    const hist = await prisma.personnelRecord.findFirstOrThrow({ where: { personnelId: ids.p, type: 'PROMOTION' } });
    expect(hist.summary).toBe('T-Meister → T-Kommissar');
    const roles = await prisma.discordOutbox.findFirst({ where: { type: 'member.roles', createdAt: { gte: started } }, orderBy: { createdAt: 'desc' } });
    expect(roles?.payload).toMatchObject({ discordId: '480000000000000001', add: ['470000000000000001'] });
    expect(await prisma.auditLog.count({ where: { action: 'promotion.execute', entityId: ids.p } })).toBe(1);
    // zweites Durchführen nicht möglich
    expect((await admin.post(`/api/v1/hr/requests/${r.body.id}/execute`)).status).toBe(409);
  });

  it('sensitive data stays hidden without personnel.view_sensitive', async () => {
    await admin.post(`/api/v1/hr/people/${ids.p}/records`).send({ type: 'NOTE', summary: 'Interne Notiz' });
    const prof = await sup.get(`/api/v1/hr/people/${ids.p}`);
    expect(prof.status).toBe(200);
    expect(prof.body.notes).toBeNull();
    expect(prof.body.discordId).toBeNull();
  });
});

describe('Dienstnummern', () => {
  it('assigns atomically – never twice, even when parallel', async () => {
    const range = await admin.post('/api/v1/dienstnummern/ranges').send({ name: 'Polizei', start: 1000, end: 1004 });
    expect(range.status).toBe(201);
    ids.range = range.body.id;
    // überlappender Kreis wird abgelehnt
    expect((await admin.post('/api/v1/dienstnummern/ranges').send({ name: 'X', start: 1004, end: 1010 })).status).toBe(409);
    const people = [];
    for (let i = 0; i < 6; i++) {
      const u = await makeUser(prisma, `hr_dn${i}`);
      people.push(await prisma.personnel.create({ data: { userId: u.id } }));
    }
    const res = await Promise.all(people.map((p) => admin.post('/api/v1/dienstnummern/assign').send({ personnelId: p.id, rangeId: ids.range })));
    const ok = res.filter((r) => r.status === 200).map((r) => r.body.display as string);
    expect(ok.length).toBe(5); // 1000–1004
    expect(new Set(ok).size).toBe(5);
    expect(res.filter((r) => r.status === 409).length).toBe(1); // „Keine freie Dienstnummer verfügbar.“
    expect((await prisma.personnel.findMany({ where: { serviceNumber: { in: ok } } })).length).toBe(5);
  });

  it('change keeps history; old number becomes former; release makes it free again', async () => {
    const p = await prisma.personnel.findFirstOrThrow({ where: { serviceNumber: '1000' } });
    await admin.put('/api/v1/dienstnummern/ranges/' + ids.range).send({ name: 'Polizei', start: 1000, end: 1010 });
    const ch = await admin.post('/api/v1/dienstnummern/change').send({ personnelId: p.id, display: '1007', reason: 'Wunschnummer' });
    expect(ch.status).toBe(200);
    expect(ch.body).toMatchObject({ display: '1007', old: '1000' });
    expect((await prisma.serviceNumber.findUniqueOrThrow({ where: { display: '1000' } })).status).toBe('FORMER');
    // vergebene Nummer kann nicht manuell an jemand anderen gehen
    const other = await prisma.personnel.findFirstOrThrow({ where: { serviceNumber: '1001' } });
    expect((await admin.post('/api/v1/dienstnummern/change').send({ personnelId: other.id, display: '1007', reason: 'test' })).status).toBe(409);
    const hist = await admin.get('/api/v1/dienstnummern/history').query({ display: '1007' });
    expect(hist.body[0]).toMatchObject({ action: 'CHANGED', oldDisplay: '1000' });
    expect((await admin.post('/api/v1/dienstnummern/release').send({ display: '1000', as: 'FREE' })).status).toBe(200);
    expect((await admin.post('/api/v1/dienstnummern/block').send({ display: '1009', reason: 'gesperrt' })).status).toBe(200);
    const list = await admin.get('/api/v1/dienstnummern').query({ status: 'BLOCKED' });
    expect(list.body.map((r: { display: string }) => r.display)).toContain('1009');
  });

  it('assigns directly to a Discord member – the profile is created on the fly', async () => {
    expect((await admin.post('/api/v1/dienstnummern/assign').send({ display: '1008' })).status).toBe(400);
    const r = await admin.post('/api/v1/dienstnummern/assign').send({ discordId: '490000000000000009', name: 'hr_discordneu', display: '1008' });
    expect(r.status).toBe(200);
    const link = await prisma.discordLink.findUniqueOrThrow({ where: { discordId: '490000000000000009' } });
    expect((await prisma.personnel.findUniqueOrThrow({ where: { userId: link.userId } })).serviceNumber).toBe('1008');
    // zweite Vergabe an dieselbe Person: vorhandene Akte, keine zweite aktive Nummer
    expect((await admin.post('/api/v1/dienstnummern/assign').send({ discordId: '490000000000000009', display: '1006' })).status).toBe(409);
    expect((await member.get('/api/v1/dienstnummern/discord-members').query({ q: 'hr' })).status).toBe(403);
    expect((await admin.get('/api/v1/dienstnummern/discord-members').query({ q: 'x' })).body).toEqual([]);
  });

  it('accepted application → profile, number, DM, nickname', async () => {
    await admin.put('/api/v1/dienstnummern/settings').send({ timing: 'ACCEPT', mappings: [{ kind: 'police', rangeId: ids.range, department: 'Polizei', rankId: ids.low }], nickname: { enabled: true, format: '[{dienstnummer}] {name}' }, dm: { enabled: true } });
    const a = await prisma.application.create({ data: { number: `A-T-${Date.now()}`, answers: {}, robloxUsername: 'NeuRoblox', discordId: '490000000000000001', discordName: 'neuling', source: 'DISCORD' } });
    const r = await admin.post(`/api/v1/applications/${a.id}/discord-decision`).send({ status: 'ACCEPTED' });
    expect(r.status).toBe(200);
    const link = await prisma.discordLink.findUniqueOrThrow({ where: { discordId: '490000000000000001' } });
    const p = await prisma.personnel.findUniqueOrThrow({ where: { userId: link.userId } });
    expect(p.rank).toBe('T-Meister');
    expect(p.serviceNumber).toMatch(/^10\d\d$/);
    const tasks = (await prisma.discordOutbox.findMany({ where: { type: { in: ['bot.dm', 'bot.nickname'] }, createdAt: { gte: started } } })).filter((t) => (t.payload as { discordId?: string }).discordId === '490000000000000001');
    expect(tasks.map((t) => t.type).sort()).toEqual(['bot.dm', 'bot.nickname']);
    expect((tasks.find((t) => t.type === 'bot.nickname')!.payload as { nickname: string }).nickname).toBe(`[${p.serviceNumber}] neuling`);
  });

  it('police applications always get a profile; older acceptances can be taken over', async () => {
    // ohne eigene Zuordnung (z. B. gelöscht) legt eine angenommene Polizei-Bewerbung trotzdem die Personalakte an
    await admin.put('/api/v1/dienstnummern/settings').send({ timing: 'ACCEPT', mappings: [] });
    const a = await prisma.application.create({ data: { number: `A-T2-${Date.now()}`, answers: {}, robloxUsername: 'Zweit', discordId: '490000000000000002', discordName: 'hr_zweit', source: 'DISCORD' } });
    expect((await admin.post(`/api/v1/applications/${a.id}/discord-decision`).send({ status: 'ACCEPTED' })).status).toBe(200);
    const link = await prisma.discordLink.findUniqueOrThrow({ where: { discordId: '490000000000000002' } });
    expect(await prisma.personnel.findUnique({ where: { userId: link.userId } })).not.toBeNull();
    // ältere Annahme ohne Akte (vor der Automatik) → nachträglich übernehmen
    await prisma.application.create({ data: { number: `A-T3-${Date.now()}`, answers: {}, robloxUsername: 'Alt', discordId: '490000000000000003', discordName: 'hr_alt', source: 'DISCORD', status: 'ACCEPTED' } });
    expect((await member.post('/api/v1/dienstnummern/from-applications')).status).toBe(403);
    const r = await admin.post('/api/v1/dienstnummern/from-applications');
    expect(r.status).toBe(200);
    expect(r.body.created).toBeGreaterThanOrEqual(1);
    const old = await prisma.discordLink.findUniqueOrThrow({ where: { discordId: '490000000000000003' } });
    expect(await prisma.personnel.findUnique({ where: { userId: old.userId } })).not.toBeNull();
    expect((await admin.post('/api/v1/dienstnummern/from-applications')).body.created).toBe(0);
  });
});
