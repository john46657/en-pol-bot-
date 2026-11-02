import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Erweiterungspaket 4.0: Personalakte 2.0, Ausbildung/Prüfung (Qualifikationen, praktische Prüfungen, Lernmaterial),
 * Organigramm, Berechtigungsmatrix, Backup-Center 2.0, Hilfe-Center. Nur anonymisierte Testdaten (Präfix x4_).
 */
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, member: Agent, lead: Agent, trainer: Agent, dispatch: Agent;
const ids: Record<string, string> = {};
const id = (k: string) => ids[k]!;
const KEY = 'a'.repeat(64);

beforeAll(async () => {
  process.env.BACKUP_ENCRYPTION_KEY = KEY;
  ({ app, prisma } = await createTestApp());
  const a = await makeUser(prisma, 'x4_admin', ['System Administrator']);
  const m = await makeUser(prisma, 'x4_member', ['Police Member']);
  const l = await makeUser(prisma, 'x4_lead', ['Police Member']);
  const t = await makeUser(prisma, 'x4_trainer', ['Training Staff']);
  const d = await makeUser(prisma, 'x4_dispatch', ['Dispatch']);
  const target = await makeUser(prisma, 'x4_target', ['Police Member']);
  Object.assign(ids, { admin: a.id, member: m.id, lead: l.id, trainer: t.id, dispatch: d.id, target: target.id });
  // Führungskraft: nur „eigene Einheit“, keine allgemeine Personalakten-Sicht
  const role = await prisma.role.create({ data: { name: 'x4 Gruppenleitung', priority: 85, permissions: { create: ['personnel.view_unit', 'personnel.notes_view', 'personnel.notes_create', 'org.view'].map((permissionKey) => ({ permissionKey })) } } });
  await prisma.userRole.create({ data: { userId: l.id, roleId: role.id } });
  admin = (await login(app, 'x4_admin')).agent;
  member = (await login(app, 'x4_member')).agent;
  lead = (await login(app, 'x4_lead')).agent;
  trainer = (await login(app, 'x4_trainer')).agent;
  dispatch = (await login(app, 'x4_dispatch')).agent;
  for (const [k, uid] of [['pTarget', target.id], ['pLead', l.id], ['pMember', m.id], ['pTrainer', t.id]] as const) {
    const r = await admin.post('/api/v1/hr/people').send({ userId: uid, rank: 'Anwärter', department: k === 'pTarget' ? 'x4 Streife' : 'Polizei' });
    expect(r.status).toBe(201);
    ids[k] = r.body.id;
  }
});
afterAll(async () => {
  delete process.env.BACKUP_ENCRYPTION_KEY;
  await app.close();
});

describe('Organigramm', () => {
  it('creates units, enforces hierarchy rights, prevents cycles, keeps history', async () => {
    expect((await member.post('/api/v1/org/units').send({ name: 'x4 Führung', kind: 'LEADERSHIP' })).status).toBe(403);
    const top = await admin.post('/api/v1/org/units').send({ name: 'x4 Führung', kind: 'LEADERSHIP' });
    expect(top.status).toBe(201);
    const dg = await admin.post('/api/v1/org/units').send({ name: 'x4 Dienstgruppe A', kind: 'DUTY_GROUP', parentId: top.body.id, leaderPersonnelId: id('pLead'), departmentName: 'x4 Streife' });
    expect(dg.status).toBe(201);
    ids.top = top.body.id; ids.dg = dg.body.id;
    // Kreis
    expect((await admin.patch(`/api/v1/org/units/${id('top')}`).send({ parentId: id('dg') })).status).toBe(400);
    // Führung = Stellvertretung
    expect((await admin.patch(`/api/v1/org/units/${id('dg')}`).send({ deputyPersonnelId: id('pLead') })).status).toBe(400);
    // Zuordnung + Historie
    const as = await admin.post(`/api/v1/org/units/${id('dg')}/members`).send({ personnelId: id('pMember'), function: 'Streifenführer' });
    expect(as.status).toBe(201);
    expect((await admin.post(`/api/v1/org/units/${id('dg')}/members`).send({ personnelId: id('pMember') })).status).toBe(409);
    const units = await admin.get('/api/v1/org/units');
    const row = units.body.find((u: { id: string }) => u.id === id('dg'));
    expect(row.leader.id).toBe(id('pLead'));
    // Mitglieder: ausdrücklich zugeordnet + über die Abteilung
    expect(row.members.map((x: { id: string }) => x.id).sort()).toEqual([id('pMember'), id('pTarget')].sort());
    expect((await admin.delete(`/api/v1/org/units/${id('dg')}/members/${id('pMember')}`)).status).toBe(200);
    const detail = await admin.get(`/api/v1/org/units/${id('dg')}`);
    expect(detail.body.formerMembers[0].id).toBe(id('pMember'));
    expect(detail.body.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['org.unit.create', 'org.assign', 'org.unassign']));
    // Deaktivieren mit aktiver Untereinheit nicht möglich
    expect((await admin.post(`/api/v1/org/units/${id('top')}/deactivate`)).status).toBe(409);
    // Übersicht (MDT/Leitstelle/Bot) ohne Mitgliederlisten
    const summary = await member.get('/api/v1/org/summary');
    expect(summary.status).toBe(200);
    expect(summary.body[0].members).toBeUndefined();
  });

  it('imports configured departments once (nothing invented)', async () => {
    const r = await admin.post('/api/v1/org/import-departments').send({ parentId: id('top') });
    expect(r.status).toBe(200);
    expect(r.body.created).toEqual(expect.arrayContaining(['Polizei']));
    expect((await admin.post('/api/v1/org/import-departments').send({})).body.created).toEqual([]);
  });
});

describe('Personalakte 2.0', () => {
  it('unit leaders see only files of their unit; others answer 404', async () => {
    expect((await lead.get(`/api/v1/personnel-file/${id('pTarget')}`)).status).toBe(200);
    expect((await lead.get(`/api/v1/personnel-file/${id('pTrainer')}`)).status).toBe(404);
    expect((await member.get(`/api/v1/personnel-file/${id('pTarget')}`)).status).toBe(403);
    const mine = await lead.get('/api/v1/personnel-file/my-unit');
    expect(mine.body.map((p: { id: string }) => p.id)).toContain(id('pTarget'));
    expect(mine.body.map((p: { id: string }) => p.id)).not.toContain(id('pTrainer'));
    const full = await admin.get(`/api/v1/personnel-file/${id('pTarget')}`);
    expect(full.body).toMatchObject({ access: 'ALL', dutyStatus: { status: 'OFF_DUTY' } });
    expect(full.body.units.map((u: { name: string }) => u.name)).toContain('x4 Dienstgruppe A');
    expect(full.body.units[0].supervisor.id).toBe(id('pLead'));
  });

  it('notes: category, confidential visibility, revisions, audit without confidential content', async () => {
    const n = await lead.post(`/api/v1/personnel-file/${id('pTarget')}/notes`).send({ summary: 'Gutes Einsatzverhalten', category: 'Leistung' });
    expect(n.status).toBe(201);
    expect((await lead.post(`/api/v1/personnel-file/${id('pTarget')}/notes`).send({ summary: 'Vertraulich', confidential: true })).status).toBe(403);
    const c = await admin.post(`/api/v1/personnel-file/${id('pTarget')}/notes`).send({ summary: 'Vertrauliches Gespräch', category: 'Gespräch', confidential: true });
    expect(c.status).toBe(201);
    const leadNotes = await lead.get(`/api/v1/personnel-file/${id('pTarget')}/notes`);
    expect(leadNotes.body.map((x: { summary: string }) => x.summary)).toEqual(['Gutes Einsatzverhalten']);
    expect((await admin.get(`/api/v1/personnel-file/${id('pTarget')}/notes`)).body).toHaveLength(2);
    // Bearbeiten → Revision
    expect((await lead.patch(`/api/v1/personnel-file/notes/${n.body.id}`).send({ summary: 'Sehr gutes Einsatzverhalten', reason: 'Präzisiert' })).status).toBe(200);
    const revs = await lead.get(`/api/v1/personnel-file/notes/${n.body.id}/revisions`);
    expect(revs.body[0]).toMatchObject({ summary: 'Gutes Einsatzverhalten', reason: 'Präzisiert' });
    // vertraulicher Vermerk ist für die Führungskraft nicht vorhanden
    expect((await lead.patch(`/api/v1/personnel-file/notes/${c.body.id}`).send({ summary: 'xy' })).status).toBe(404);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'personnel.note.create', entityId: c.body.id } });
    expect(JSON.stringify(audit?.after)).not.toContain('Vertrauliches Gespräch');
    // alte Personalakten-Ansicht: vertrauliche Vermerke nur mit notes_confidential (Admin hat *)
    expect((await admin.get(`/api/v1/hr/people/${id('pTarget')}`)).body.notes.length).toBeGreaterThanOrEqual(2);
    // Aktivitäten
    const act = await admin.get(`/api/v1/personnel-file/${id('pTarget')}/activity`);
    expect(act.body.rows.map((r: { action: string }) => r.action)).toEqual(expect.arrayContaining(['personnel.note.create', 'personnel.note.update']));
    expect((await lead.get(`/api/v1/personnel-file/${id('pTarget')}/activity`)).status).toBe(403);
  });

  it('documents: upload, assign, protected download, archive', async () => {
    const up = await admin.post('/api/v1/media').field('linkedType', 'PersonnelDocument').field('linkedId', id('pTarget')).attach('file', Buffer.from('%PDF-1.4 x4 Nachweis'), { filename: 'nachweis.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    // generischer Download ist gesperrt – nur über die Personalakte
    expect((await admin.get(`/api/v1/media/${up.body.id}`)).status).toBe(404);
    const doc = await admin.post(`/api/v1/personnel-file/${id('pTarget')}/documents`).send({ mediaId: up.body.id, kind: 'TRAINING', title: 'Ausbildungsnachweis' });
    expect(doc.status).toBe(201);
    expect((await admin.post(`/api/v1/personnel-file/${id('pTrainer')}/documents`).send({ mediaId: up.body.id, kind: 'TRAINING', title: 'falsch' })).status).toBe(400);
    const dl = await admin.get(`/api/v1/personnel-file/documents/${doc.body.id}/download`);
    expect(dl.status).toBe(200);
    expect((await lead.get(`/api/v1/personnel-file/documents/${doc.body.id}/download`)).status).toBe(403);
    expect((await admin.post(`/api/v1/personnel-file/documents/${doc.body.id}/archive`)).status).toBe(200);
    expect((await admin.get(`/api/v1/personnel-file/${id('pTarget')}/documents`)).body).toHaveLength(0);
    expect((await admin.get(`/api/v1/personnel-file/${id('pTarget')}/documents?archived=1`)).body).toHaveLength(1);
  });

  it('status change notifies the person privately; directory for dispatch has no confidential data', async () => {
    expect((await admin.patch(`/api/v1/hr/people/${id('pTarget')}`).send({ status: 'LOA' })).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: id('target'), title: { contains: 'Personalstatus' } } })).toBe(1);
    await admin.patch(`/api/v1/hr/people/${id('pTarget')}`).send({ status: 'ACTIVE' });
    const dir = await dispatch.get('/api/v1/personnel-file/directory?q=x4_target');
    expect(dir.status).toBe(200);
    expect(dir.body.rows[0]).toMatchObject({ id: id('pTarget'), dutyStatus: 'OFF_DUTY' });
    expect(JSON.stringify(dir.body)).not.toContain('Vertraulich');
    expect((await member.get('/api/v1/personnel-file/directory')).status).toBe(200); // team.view
  });
});

describe('Ausbildung, Prüfung, Qualifikationen', () => {
  it('catalog + manual grant (no self-grant), suspend/revoke with reason, synced names', async () => {
    const def = await admin.post('/api/v1/qualification-registry/definitions').send({ name: 'x4 Verkehrskontrolle', operational: true, validDays: 365 });
    expect(def.status).toBe(201);
    ids.defVk = def.body.id;
    expect((await admin.post('/api/v1/qualification-registry/definitions').send({ name: 'x4 Verkehrskontrolle' })).status).toBe(409);
    expect((await member.post('/api/v1/qualification-registry').send({ personnelId: id('pTarget'), definitionId: id('defVk') })).status).toBe(403);
    expect((await trainer.post('/api/v1/qualification-registry').send({ personnelId: id('pTrainer'), definitionId: id('defVk') })).status).toBe(409); // sich selbst
    const g = await trainer.post('/api/v1/qualification-registry').send({ personnelId: id('pTarget'), definitionId: id('defVk') });
    expect(g.status).toBe(201);
    expect(g.body.expiresAt).toBeTruthy();
    expect((await prisma.personnel.findUnique({ where: { id: id('pTarget') } }))?.qualifications).toContain('x4 Verkehrskontrolle');
    expect((await admin.post(`/api/v1/qualification-registry/${g.body.id}/status`).send({ status: 'SUSPENDED' })).status).toBe(400); // Grund fehlt
    expect((await admin.post(`/api/v1/qualification-registry/${g.body.id}/status`).send({ status: 'SUSPENDED', reason: 'Nachschulung' })).status).toBe(200);
    expect((await prisma.personnel.findUnique({ where: { id: id('pTarget') } }))?.qualifications).not.toContain('x4 Verkehrskontrolle');
    expect((await admin.post(`/api/v1/qualification-registry/${g.body.id}/status`).send({ status: 'ACTIVE' })).status).toBe(200);
    // Leitstelle: einsatzrelevante, aktive Qualifikationen
    const ops = await dispatch.get(`/api/v1/qualification-registry/personnel/${id('pTarget')}`);
    expect(ops.body.map((q: { name: string }) => q.name)).toContain('x4 Verkehrskontrolle');
    expect((await member.get('/api/v1/qualification-registry')).status).toBe(403);
  });

  it('passed training creates a pending qualification that must be confirmed', async () => {
    const tr = await admin.post('/api/v1/hr/trainings').send({ name: 'x4 Festnahme und Durchsuchung' });
    expect(tr.status).toBe(201);
    const def = await admin.post('/api/v1/qualification-registry/definitions').send({ name: 'x4 Festnahme', trainingIds: [tr.body.id] });
    expect(def.status).toBe(201);
    const pass = await trainer.put('/api/v1/hr/training-progress').send({ trainingId: tr.body.id, personnelId: id('pTarget'), status: 'PASSED' });
    expect(pass.status).toBeLessThan(300);
    const pending = await prisma.personnelQualification.findFirst({ where: { personnelId: id('pTarget'), definitionId: def.body.id } });
    expect(pending).toMatchObject({ status: 'PENDING', source: 'TRAINING' });
    expect((await prisma.personnel.findUnique({ where: { id: id('pTarget') } }))?.qualifications).not.toContain('x4 Festnahme');
    expect((await trainer.post(`/api/v1/qualification-registry/${pending!.id}/status`).send({ status: 'ACTIVE' })).status).toBe(200);
    const after = await prisma.personnelQualification.findUnique({ where: { id: pending!.id } });
    expect(after).toMatchObject({ status: 'ACTIVE', issuedById: id('trainer') });
  });

  it('practical exam: criteria, examiner-only scoring, completion, result in personnel file + qualification', async () => {
    const def = await admin.post('/api/v1/qualification-registry/definitions').send({ name: 'x4 Führungsaufgabe', autoGrant: true });
    const ex = await trainer.post('/api/v1/training-ext/practical').send({
      title: 'x4 Praxis Führung', tasks: 'Lage führen', passPoints: 12, examinerIds: [id('trainer')], qualificationDefId: def.body.id,
      criteria: [{ id: 'k1', label: 'Eigensicherung', maxPoints: 10, required: true }, { id: 'k2', label: 'Kommunikation', maxPoints: 10 }],
    });
    expect(ex.status).toBe(201);
    expect((await trainer.post('/api/v1/training-ext/practical').send({ title: 'x4 kaputt', passPoints: 99, criteria: [{ id: 'k', label: 'x', maxPoints: 1 }] })).status).toBe(400);
    expect((await member.post(`/api/v1/training-ext/practical/${ex.body.id}/assessments`).send({ personnelId: id('pTarget') })).status).toBe(403);
    expect((await trainer.post(`/api/v1/training-ext/practical/${ex.body.id}/assessments`).send({ personnelId: id('pTrainer') })).status).toBe(409); // sich selbst
    const as = await trainer.post(`/api/v1/training-ext/practical/${ex.body.id}/assessments`).send({ personnelId: id('pTarget') });
    expect(as.status).toBe(201);
    expect((await trainer.post(`/api/v1/training-ext/practical/${ex.body.id}/assessments`).send({ personnelId: id('pTarget') })).status).toBe(409);
    expect((await trainer.put(`/api/v1/training-ext/assessments/${as.body.id}/scores`).send({ scores: { k1: { points: 11 } } })).status).toBe(400);
    expect((await trainer.put(`/api/v1/training-ext/assessments/${as.body.id}/scores`).send({ scores: { k1: { points: 8, note: 'sicher' } } })).status).toBe(200);
    expect((await trainer.post(`/api/v1/training-ext/assessments/${as.body.id}/complete`)).status).toBe(409); // k2 fehlt
    await trainer.put(`/api/v1/training-ext/assessments/${as.body.id}/scores`).send({ scores: { k1: { points: 8 }, k2: { points: 6 } }, remarks: 'Solide' });
    const done = await trainer.post(`/api/v1/training-ext/assessments/${as.body.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.result).toMatchObject({ total: 14, max: 20, passed: true });
    expect(await prisma.personnelRecord.count({ where: { personnelId: id('pTarget'), type: 'EXAM', summary: { contains: 'x4 Praxis Führung' } } })).toBe(1);
    expect(await prisma.personnelQualification.findFirst({ where: { personnelId: id('pTarget'), definitionId: def.body.id } })).toMatchObject({ status: 'ACTIVE', source: 'PRACTICAL' });
    const file = await admin.get(`/api/v1/personnel-file/${id('pTarget')}`);
    expect(file.body.practicalExams[0]).toMatchObject({ title: 'x4 Praxis Führung', passed: true });
    expect(await prisma.notification.count({ where: { userId: id('target'), title: { contains: 'praktische Prüfung' } } })).toBe(1);
  });

  it('learning materials: drafts only for editors', async () => {
    const m = await trainer.post('/api/v1/training-ext/materials').send({ title: 'x4 Regelwerk Verkehr', kind: 'RULES', body: '§1 …', published: false });
    expect(m.status).toBe(201);
    expect((await member.get(`/api/v1/training-ext/materials/${m.body.id}`)).status).toBe(403); // training.view fehlt dem Police Member
    const sup = await makeUser(prisma, 'x4_sup', ['Supervisor']);
    const supA = (await login(app, sup.username)).agent;
    expect((await supA.get(`/api/v1/training-ext/materials/${m.body.id}`)).status).toBe(404);
    await trainer.put(`/api/v1/training-ext/materials/${m.body.id}`).send({ title: 'x4 Regelwerk Verkehr', kind: 'RULES', body: '§1 neu', published: true, version: 1 });
    expect((await supA.get(`/api/v1/training-ext/materials/${m.body.id}`)).body.body).toBe('§1 neu');
    expect((await trainer.put(`/api/v1/training-ext/materials/${m.body.id}`).send({ title: 'x4 alt', kind: 'RULES', body: '', version: 1 })).status).toBe(409);
  });
});

describe('Berechtigungsmatrix', () => {
  it('sets access levels via existing role permissions; takes effect immediately; non-admins blocked', async () => {
    const pm = await prisma.role.findFirstOrThrow({ where: { name: 'Police Member', guildId: null } });
    const before = await member.get('/api/v1/help/categories');
    expect(before.status).toBe(200);
    const matrix = await admin.get('/api/v1/access-matrix');
    expect(matrix.body.roles.find((r: { id: string }) => r.id === pm.id).levels.help).toBe('view');
    expect((await member.put(`/api/v1/access-matrix/roles/${pm.id}/help`).send({ level: 'none' })).status).toBe(403);
    const prev = await admin.get(`/api/v1/access-matrix/preview?roleId=${pm.id}&area=help&level=blocked`);
    expect(prev.body).toEqual({ added: ['DENY:help.*'], removed: ['ALLOW:help.view'] });
    expect((await admin.put(`/api/v1/access-matrix/roles/${pm.id}/help`).send({ level: 'blocked' })).status).toBe(200);
    expect((await member.get('/api/v1/help/categories')).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'role.access_level', entityId: pm.id } })).toBe(1);
    await admin.put(`/api/v1/access-matrix/roles/${pm.id}/help`).send({ level: 'view' });
    expect((await member.get('/api/v1/help/categories')).status).toBe(200);
  });

  it('prevents self-lockout of the permission editor', async () => {
    const mgr = await makeUser(prisma, 'x4_rolemgr');
    const high = await prisma.role.create({ data: { name: 'x4 Rollenleitung', priority: 50, permissions: { create: [{ permissionKey: 'roles.view' }, { permissionKey: 'help.view' }] } } });
    const low = await prisma.role.create({ data: { name: 'x4 Rollenpflege', priority: 60, permissions: { create: [{ permissionKey: 'roles.manage' }, { permissionKey: 'roles.view' }] } } });
    await prisma.userRole.createMany({ data: [{ userId: mgr.id, roleId: high.id }, { userId: mgr.id, roleId: low.id }] });
    const ag = (await login(app, 'x4_rolemgr')).agent;
    const r = await ag.put(`/api/v1/access-matrix/roles/${low.id}/roles`).send({ level: 'none' });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('aussperren');
    expect(await prisma.rolePermission.count({ where: { roleId: low.id, permissionKey: 'roles.manage' } })).toBe(1);
  });
});

describe('Hilfe-Center', () => {
  it('drafts hidden, publish, search, revisions', async () => {
    const cat = await admin.post('/api/v1/help/categories').send({ name: 'x4 MDT' });
    expect(cat.status).toBe(201);
    expect((await member.post('/api/v1/help/categories').send({ name: 'x4 nope' })).status).toBe(403);
    const art = await admin.post('/api/v1/help/articles').send({ title: 'Wie melde ich mich im MDT an?', categoryId: cat.body.id, kind: 'GUIDE', body: 'Schritt 1: Dashboard öffnen …', tags: ['MDT'] });
    expect(art.status).toBe(201);
    expect(art.body.slug).toBe('wie-melde-ich-mich-im-mdt-an');
    expect((await member.get('/api/v1/help/articles?q=mdt')).body.total).toBe(0);
    expect((await member.get(`/api/v1/help/articles/${art.body.slug}`)).status).toBe(404);
    const pub = await admin.put(`/api/v1/help/articles/${art.body.id}`).send({ title: 'Wie melde ich mich im MDT an?', categoryId: cat.body.id, kind: 'GUIDE', body: 'Schritt 1: „MDT öffnen“ …', tags: ['MDT'], status: 'PUBLISHED', changeNote: 'Freigabe', version: 1 });
    expect(pub.status).toBe(200);
    const found = await member.get('/api/v1/help/articles?q=MDT');
    expect(found.body.rows[0].slug).toBe('wie-melde-ich-mich-im-mdt-an');
    expect((await member.get(`/api/v1/help/articles/${art.body.slug}`)).body.body).toContain('MDT öffnen');
    const revs = await admin.get(`/api/v1/help/articles/${art.body.id}/revisions`);
    expect(revs.body[0]).toMatchObject({ version: 1, status: 'DRAFT', changeNote: 'Freigabe' });
    expect((await member.get(`/api/v1/help/articles/${art.body.id}/revisions`)).status).toBe(403);
  });
});

describe('Backup-Center 2.0', () => {
  it('creates encrypted backups with checksum, verifies, detects corruption, archives', async () => {
    expect((await member.post('/api/v1/backups/data').send({})).status).toBe(403);
    const b = await admin.post('/api/v1/backups/data').send({});
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ encrypted: true, scope: 'DATABASE' });
    expect(b.body.name).toMatch(/\.json\.gz\.enc$/);
    ids.backup = b.body.name;
    const list = await admin.get('/api/v1/backups/data');
    expect(list.body.find((x: { name: string }) => x.name === b.body.name)).toMatchObject({ status: 'OK', createdBy: 'x4_admin', encrypted: true });
    expect((await admin.post(`/api/v1/backups/data/${b.body.name}/verify`)).body.status).toBe('OK');
    // Datei ist nicht im Klartext lesbar
    const file = path.resolve(process.env.STORAGE_DIR ?? './uploads', 'backups', b.body.name);
    const raw = await readFile(file);
    expect(raw.subarray(0, 4).toString()).toBe('ENPB');
    expect(raw.includes(Buffer.from('x4_admin'))).toBe(false);
    // Konfigurations-Backup + Modul-Backup
    const cfg = await admin.post('/api/v1/backups/data').send({ scope: 'CONFIG' });
    expect(cfg.status).toBe(201);
    const mod = await admin.post('/api/v1/backups/data').send({ scope: 'MODULE', modules: ['help'] });
    expect(mod.status).toBe(201);
    ids.helpBackup = mod.body.name;
    // Beschädigung erkennen
    const broken = Buffer.from(raw); broken[broken.length - 5] = (broken[broken.length - 5] ?? 0) ^ 0xff;
    await writeFile(file.replace(b.body.name, cfg.body.name), broken);
    const v = await admin.post(`/api/v1/backups/data/${cfg.body.name}/verify`);
    expect(v.body.status).toBe('CORRUPT');
    expect((await admin.post(`/api/v1/backups/data/${cfg.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN' })).status).toBe(409);
    expect((await admin.post(`/api/v1/backups/data/${b.body.name}/archive`).send({ archived: true })).status).toBe(200);
    expect((await admin.get('/api/v1/backups/data?archived=1')).body.map((x: { name: string }) => x.name)).toContain(b.body.name);
  });

  it('plan shows scope; newer data must be acknowledged; selective restore of a module; post-check', async () => {
    const before = await admin.get('/api/v1/help/articles?q=Urlaub');
    expect(before.body.total).toBe(0);
    await admin.post('/api/v1/help/articles').send({ title: 'Wie beantrage ich Urlaub?', body: 'Über „Abmeldung“.', status: 'PUBLISHED' });
    const plan = await admin.post(`/api/v1/backups/data/${id('helpBackup')}/plan`).send({ groups: ['help'] });
    expect(plan.status).toBe(200);
    expect(plan.body).toMatchObject({ scope: 'MODULE', restorable: true });
    expect(plan.body.newerRows).toBeGreaterThan(0);
    const r1 = await admin.post(`/api/v1/backups/data/${id('helpBackup')}/restore`).send({ confirm: 'WIEDERHERSTELLEN', groups: ['help'] });
    expect(r1.status).toBe(409);
    expect(r1.body.details.reason).toBe('NEWER_DATA');
    const r2 = await admin.post(`/api/v1/backups/data/${id('helpBackup')}/restore`).send({ confirm: 'WIEDERHERSTELLEN', groups: ['help'], acknowledgeNewer: true });
    expect(r2.status).toBe(200);
    expect(r2.body.check.ok).toBe(true);
    expect(r2.body.safety).toMatch(/^vor-wiederherstellung-/);
    expect((await admin.get('/api/v1/help/articles?q=Urlaub')).body.total).toBe(0);
    expect((await admin.get('/api/v1/help/articles?q=MDT')).body.total).toBe(1);
    // Personal lässt sich nicht selektiv wiederherstellen (andere Daten verweisen darauf)
    const p = await admin.post(`/api/v1/backups/data/${id('backup')}/plan`).send({ groups: ['personnel'] });
    expect(p.body.restorable).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'backup.data.restore' } })).toBeGreaterThan(0);
  });
});
