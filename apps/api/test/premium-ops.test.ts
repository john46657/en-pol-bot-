import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CadService } from '../src/cad/cad.service';

let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, member: Agent, leader: Agent, linker: Agent;

/** Rolle mit genau diesen Rechten (Standard: alles andere verweigert). */
async function roleWith(name: string, perms: string[]) {
  return prisma.role.create({ data: { name, permissions: { create: perms.map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) } } });
}

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'po_admin', ['System Administrator']);
  await makeUser(prisma, 'po_member', ['Police Member']);
  await roleWith('PO Lage lesen', ['situation.view', 'cad.view']);
  await roleWith('PO Verknüpfer', ['cases.view', 'cases.manage', 'cad.view', 'reports.view', 'reports.review']);
  await makeUser(prisma, 'po_leader', ['PO Lage lesen']);
  await makeUser(prisma, 'po_linker', ['PO Verknüpfer']);
  admin = (await login(app, 'po_admin')).agent;
  member = (await login(app, 'po_member')).agent;
  leader = (await login(app, 'po_leader')).agent;
  linker = (await login(app, 'po_linker')).agent;
});
afterAll(async () => { await app.close(); });

describe('Berechtigungen (Standard: verweigert, serverseitig geprüft)', () => {
  it('ohne ausdrückliches Recht gibt es keinen Zugriff', async () => {
    for (const [method, path] of [['get', '/situation'], ['post', '/situation/reports'], ['get', '/cases'], ['post', '/cases'], ['get', '/quality/overview'], ['put', '/quality/config'], ['get', '/forecast'], ['get', '/integrations/overview'], ['get', '/backups/data'], ['post', '/backups/data']] as const) {
      const r = await (member as unknown as Record<string, (p: string) => { send: (b: unknown) => Promise<{ status: number }> }>)[method](`/api/v1${path}`).send({});
      expect([403], `${method} ${path}`).toContain(r.status);
    }
  });
  it('getrennte Rechte: Lage ansehen ≠ Lagebericht erstellen', async () => {
    expect((await leader.get('/api/v1/situation')).status).toBe(200);
    expect((await leader.post('/api/v1/situation/reports').send({})).status).toBe(403);
    expect((await leader.get('/api/v1/cases')).status).toBe(403);
  });
});

describe('Lageassistent', () => {
  let incidentId = '';
  it('fasst vorhandene Daten mit Zeitstempel und Quelle zusammen', async () => {
    const inc = await admin.post('/api/v1/cad/incidents').send({ title: 'Raub Tankstelle', priority: 'HIGH' });
    expect(inc.status).toBe(201);
    incidentId = inc.body.id;
    const u = await prisma.user.findFirstOrThrow({ where: { username: 'po_member' } });
    await prisma.dutySession.create({ data: { userId: u.id, status: 'ON_DUTY', startedAt: new Date(Date.now() - 30 * 60_000) } });
    const p = await prisma.person.create({ data: { robloxUsername: 'Gesuchter1' } });
    await admin.post('/api/v1/wanted').send({ personId: p.id, reason: 'Raub', description: 'kurz' });
    const r = await admin.get('/api/v1/situation');
    expect(r.status).toBe(200);
    const o = r.body;
    expect(Date.parse(o.generatedAt)).toBeGreaterThan(Date.now() - 60_000);
    for (const k of ['incidents', 'units', 'officers', 'wanted', 'reports', 'disruptions', 'tasks']) { expect(o[k].asOf).toBe(o.generatedAt); expect(o[k].source).toBeTruthy(); }
    const item = o.incidents.items.find((i: { id: string }) => i.id === incidentId);
    expect(item).toMatchObject({ title: 'Raub Tankstelle', units: [] });
    // fehlender Ort ist bei offenem Einsatz eine Warnung, kritische Priorität ohne Einheit wird hervorgehoben
    expect(item.warnings.map((w: { code: string }) => w.code)).toContain('incident.location');
    expect(o.critical.some((c: { id: string }) => c.id === incidentId)).toBe(true);
    expect(o.officers.items.some((x: { name: string }) => x.name === 'po_member')).toBe(true);
    expect(o.wanted.total).toBeGreaterThanOrEqual(1);
    expect(o.tasks.items.find((t: { key: string }) => t.key === 'incidents_unassigned').count).toBeGreaterThanOrEqual(1);
    // Notrufe nur aus tatsächlich gespeicherten ER:LC-Daten (nichts ergänzt)
    if (o.calls?.enabled) expect(o.calls.open).toBe(Math.min(100, await prisma.erlcEmergencyCall.count({ where: { status: 'OPEN' } })));
    else expect(o.calls === null || o.calls.open === 0).toBe(true);
  });
  it('Lagebericht auf Knopfdruck: gespeichert, unveränderlich, nur echte Daten', async () => {
    const r = await admin.post('/api/v1/situation/reports').send({ note: 'Schichtwechsel 20 Uhr' });
    expect(r.status).toBe(201);
    expect(r.body.text).toContain('## Personalsituation');
    expect(r.body.text).toContain('Raub Tankstelle');
    expect(r.body.text).toContain('Schichtwechsel 20 Uhr');
    for (const h of ['## Offene Einsätze', '## Aktive Fahndungen', '## Ausstehende Berichte', '## Technische Störungen', '## Offene Aufgaben der Führungsebene']) expect(r.body.text).toContain(h);
    const list = await leader.get('/api/v1/situation/reports');
    expect(list.body.some((x: { id: string }) => x.id === r.body.id)).toBe(true);
    await expect(prisma.situationReport.update({ where: { id: r.body.id }, data: { note: 'geändert' } })).rejects.toThrow(/unveränderlich/);
    await expect(prisma.situationReport.delete({ where: { id: r.body.id } })).rejects.toThrow(/unveränderlich/);
  });
});

describe('Vorgangsverknüpfung', () => {
  let incidentId = '', caseA = '', caseB = '', reportId = '';
  beforeAll(async () => {
    incidentId = (await admin.post('/api/v1/cad/incidents').send({ title: 'Einbruch Juwelier', priority: 'MEDIUM', location: 'Postal 210' })).body.id;
    reportId = (await admin.post('/api/v1/reports').send({ type: 'INCIDENT', title: 'Bericht Einbruch Juwelier', content: { body: 'Sachverhalt …' }, incidentId })).body.id;
  });
  it('legt einen Vorgang mit eindeutiger Nummer an und verknüpft Datensätze nachvollziehbar', async () => {
    const r = await linker.post('/api/v1/cases').send({ title: 'Einbruchserie Innenstadt', links: [{ entityType: 'INCIDENT', entityId: incidentId, role: 'BEZUG' }] });
    expect(r.status).toBe(201);
    caseA = r.body.id;
    expect(r.body.number).toMatch(/^V-\d{4}-\d{5}$/);
    const second = await linker.post('/api/v1/cases').send({ title: 'Anderer Vorgang' });
    expect(second.body.number).not.toBe(r.body.number);
    const dup = await linker.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'INCIDENT', entityId: incidentId });
    expect(dup.status).toBe(409);
    expect((await linker.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'REPORT', entityId: reportId })).status).toBe(201);
    const d = await linker.get(`/api/v1/cases/${caseA}`);
    expect(d.body.links.map((l: { entityType: string }) => l.entityType).sort()).toEqual(['INCIDENT', 'REPORT']);
    expect(d.body.events.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['CASE', 'LINK', 'RECORD']));
    // chronologisch
    const times = d.body.events.map((e: { at: string }) => Date.parse(e.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('lösen braucht eine Begründung und bleibt sichtbar (keine Löschung)', async () => {
    const d = await linker.get(`/api/v1/cases/${caseA}`);
    const link = d.body.links.find((l: { entityType: string }) => l.entityType === 'REPORT');
    expect((await linker.delete(`/api/v1/cases/${caseA}/links/${link.id}`).send({})).status).toBe(400);
    expect((await linker.delete(`/api/v1/cases/${caseA}/links/${link.id}`).send({ reason: 'falscher Bericht' })).status).toBe(204);
    const after = await linker.get(`/api/v1/cases/${caseA}`);
    expect(after.body.removedLinks).toHaveLength(1);
    expect(after.body.removedLinks[0]).toMatchObject({ removeReason: 'falscher Bericht', removedBy: 'po_linker' });
    expect(await prisma.caseLink.count({ where: { caseId: caseA } })).toBe(2);
    // danach erneut verknüpfbar (aktiv eindeutig)
    expect((await linker.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'REPORT', entityId: reportId })).status).toBe(201);
  });
  it('Suche nach Einsatznummer, Datum und Text', async () => {
    const inc = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
    const byNumber = await linker.get('/api/v1/cases').query({ incidentNumber: inc.number });
    expect(byNumber.body.items.map((c: { id: string }) => c.id)).toEqual([caseA]);
    const today = new Date().toISOString().slice(0, 10);
    expect((await linker.get('/api/v1/cases').query({ from: today, to: today, q: 'Einbruchserie' })).body.items).toHaveLength(1);
    expect((await linker.get('/api/v1/cases').query({ to: '2000-01-01' })).body.items).toHaveLength(0);
    expect((await linker.get(`/api/v1/cases/for/INCIDENT/${incidentId}`)).body.map((c: { id: string }) => c.id)).toEqual([caseA]);
  });
  it('Duplikate werden nur vorgeschlagen und erst nach manueller Entscheidung zusammengeführt', async () => {
    caseB = (await linker.post('/api/v1/cases').send({ title: 'Einbruch beim Juwelier', links: [{ entityType: 'INCIDENT', entityId: incidentId }] })).body.id;
    // ähnliche Namen allein führen nie zur automatischen Zusammenführung
    const p1 = await prisma.person.create({ data: { robloxUsername: 'MaxMuster' } });
    const p2 = await prisma.person.create({ data: { robloxUsername: 'MaxMuster1' } });
    const c1 = (await admin.post('/api/v1/cases').send({ title: 'Zeugenaussage Park', links: [{ entityType: 'PERSON', entityId: p1.id }] })).body.id;
    const c2 = (await admin.post('/api/v1/cases').send({ title: 'Diebstahl Hafen', links: [{ entityType: 'PERSON', entityId: p2.id }] })).body.id;
    const dups = (await linker.get('/api/v1/cases/duplicates')).body as { a: { id: string }; b: { id: string }; strength: string; reasons: string[] }[];
    const pair = dups.find((d) => [d.a.id, d.b.id].sort().join() === [caseA, caseB].sort().join());
    expect(pair?.strength).toBe('STRONG');
    expect(pair?.reasons.join(' ')).toMatch(/Beide verknüpfen/);
    expect(dups.some((d) => [d.a.id, d.b.id].includes(c1) && [d.a.id, d.b.id].includes(c2))).toBe(false);
    expect((await prisma.caseFile.findUniqueOrThrow({ where: { id: caseB } })).status).toBe('OPEN'); // nichts automatisch zusammengeführt
    const m = await linker.post('/api/v1/cases/duplicates/decide').send({ keepId: caseA, otherId: caseB, decision: 'MERGE', note: 'gleicher Einsatz' });
    expect(m.status).toBe(200);
    expect((await prisma.caseFile.findUniqueOrThrow({ where: { id: caseB } }))).toMatchObject({ status: 'CLOSED', mergedIntoId: caseA });
    expect((await linker.post(`/api/v1/cases/${caseB}/links`).send({ entityType: 'REPORT', entityId: reportId })).status).toBe(409); // schreibgeschützt
    expect((await linker.get('/api/v1/cases/duplicates')).body.some((d: { a: { id: string }; b: { id: string } }) => [d.a.id, d.b.id].includes(caseB))).toBe(false);
    expect((await linker.post('/api/v1/cases/duplicates/decide').send({ keepId: caseA, otherId: caseB, decision: 'NOT_DUPLICATE' })).status).toBe(409);
  });
  it('nur sichtbare Datensätze verknüpfbar; ohne Recht nur „Verknüpfung vorhanden“', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'System Administrator', guildId: null } });
    const secret = (await admin.post('/api/v1/cad/incidents').send({ title: 'Vertraulich', restrictRoleIds: [role.id] })).body.id;
    expect((await linker.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'INCIDENT', entityId: secret })).status).toBe(404);
    expect((await linker.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'HR_REQUEST', entityId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await admin.post(`/api/v1/cases/${caseA}/links`).send({ entityType: 'INCIDENT', entityId: secret })).status).toBe(201);
    const view = await linker.get(`/api/v1/cases/${caseA}`);
    const hidden = view.body.links.find((l: { visible: boolean }) => !l.visible);
    expect(hidden).toMatchObject({ entityId: null, label: expect.stringMatching(/keine Berechtigung/) });
    expect(JSON.stringify(view.body)).not.toContain('Vertraulich');
  });
  it('verknüpfte Einsätze werden beim täglichen Aufräumen nicht gelöscht', async () => {
    const cad = app.get(CadService);
    const loose = (await admin.post('/api/v1/cad/incidents').send({ title: 'Ohne Vorgang', location: 'Postal 1' })).body.id;
    const old = new Date(Date.now() - 3 * 86_400_000);
    await prisma.incident.updateMany({ where: { id: { in: [incidentId, loose] } }, data: { status: 'CLOSED', closedAt: old } });
    await cad.purgeClosedIncidents();
    expect(await prisma.incident.findUnique({ where: { id: incidentId } })).not.toBeNull();
    expect(await prisma.incident.findUnique({ where: { id: loose } })).toBeNull();
  });
});

describe('Qualitätsprüfer', () => {
  it('trennt Fehler und Warnungen, markiert Felder, gibt Hinweise – ohne Inhalte zu ändern', async () => {
    const r = await admin.post('/api/v1/reports').send({ type: 'ARREST', title: 'Fest', content: { body: 'TODO von 14:30 bis 13:10 E-2099-99999' } });
    const before = await prisma.reportVersion.findMany({ where: { reportId: r.body.id } });
    const q = await admin.get(`/api/v1/quality/check/REPORT/${r.body.id}`);
    expect(q.status).toBe(200);
    expect(q.body.ok).toBe(false);
    expect(q.body.errors.map((e: { code: string }) => e.code).sort()).toEqual(['report.incident_missing', 'report.title']);
    expect(q.body.warnings.map((e: { code: string }) => e.code)).toEqual(expect.arrayContaining(['report.body_short', 'report.placeholder', 'report.time_span', 'report.unknown_number']));
    for (const f of [...q.body.errors, ...q.body.warnings]) { expect(f.field).toBeTruthy(); expect(f.hint.length).toBeGreaterThan(10); }
    expect(await prisma.reportVersion.findMany({ where: { reportId: r.body.id } })).toEqual(before);
  });
  it('Pflichtprüfung vor dem Einreichen (konfigurierbar) und begründete Ausnahmen', async () => {
    const author = await makeUser(prisma, 'po_author', ['Police Member']);
    const a = (await login(app, 'po_author')).agent;
    const r = await a.post('/api/v1/reports').send({ type: 'ARREST', title: 'Festnahme Hauptstraße', content: { body: 'Person nach Diebstahl festgenommen, belehrt und zur Wache gebracht. Beweismittel gesichert und übergeben.' } });
    expect((await member.put('/api/v1/quality/config').send({ enforceReportSubmit: true })).status).toBe(403);
    expect((await admin.put('/api/v1/quality/config').send({ enforceReportSubmit: true })).status).toBe(200);
    const blocked = await a.post(`/api/v1/reports/${r.body.id}/submit`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.details.quality.errors[0].code).toBe('report.incident_missing');
    // Ausnahme braucht eigenes Recht und eine Begründung
    expect((await a.post('/api/v1/quality/exceptions').send({ targetType: 'REPORT', targetId: r.body.id, code: 'report.incident_missing', reason: 'Festnahme ohne CAD-Einsatz (Fußstreife)' })).status).toBe(403);
    expect((await admin.post('/api/v1/quality/exceptions').send({ targetType: 'REPORT', targetId: r.body.id, code: 'report.incident_missing', reason: 'kurz' })).status).toBe(400);
    expect((await admin.post('/api/v1/quality/exceptions').send({ targetType: 'REPORT', targetId: r.body.id, code: 'report.erfunden', reason: 'Diese Regel gibt es hier nicht' })).status).toBe(400);
    const ex = await admin.post('/api/v1/quality/exceptions').send({ targetType: 'REPORT', targetId: r.body.id, code: 'report.incident_missing', reason: 'Festnahme ohne CAD-Einsatz (Fußstreife)' });
    expect(ex.status).toBe(201);
    expect((await admin.post('/api/v1/quality/exceptions').send({ targetType: 'REPORT', targetId: r.body.id, code: 'report.incident_missing', reason: 'Festnahme ohne CAD-Einsatz (Fußstreife)' })).status).toBe(400);
    const check = await admin.get(`/api/v1/quality/check/REPORT/${r.body.id}`);
    expect(check.body.ok).toBe(true);
    expect(check.body.excepted[0].exception).toMatchObject({ reason: 'Festnahme ohne CAD-Einsatz (Fußstreife)', createdByName: 'po_admin' });
    expect((await a.post(`/api/v1/reports/${r.body.id}/submit`)).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: 'quality.exception.create', entityId: r.body.id } })).toBe(1);
    void author;
    await admin.put('/api/v1/quality/config').send({ enforceReportSubmit: false });
  });
  it('Pflichtangaben vor dem Einsatzabschluss; Abbrechen bleibt möglich', async () => {
    await admin.put('/api/v1/quality/config').send({ enforceIncidentClose: true, incidentReportRequired: 'ERROR' });
    const i = (await admin.post('/api/v1/cad/incidents').send({ title: 'Ruhestörung' })).body.id;
    const blocked = await admin.post(`/api/v1/cad/incidents/${i}/status`).send({ status: 'CLOSED' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.details.quality.errors.map((e: { code: string }) => e.code).sort()).toEqual(['incident.location', 'incident.report_missing']);
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: i } })).status).not.toBe('CLOSED');
    expect((await admin.post(`/api/v1/cad/incidents/${i}/status`).send({ status: 'CANCELLED' })).status).toBe(200);
    await admin.put('/api/v1/quality/config').send({});
  });
  it('Übersicht über Berichte, Fahndungen und Einsätze', async () => {
    const o = await admin.get('/api/v1/quality/overview');
    expect(o.status).toBe(200);
    expect(o.body.summary.WANTED.checked).toBeGreaterThanOrEqual(1);
    expect(o.body.items.some((x: { target: string; warnings: { code: string }[] }) => x.target === 'WANTED' && x.warnings.some((w) => w.code === 'wanted.description_short'))).toBe(true);
  });
});

describe('Einsatzkarte', () => {
  it('liefert verknüpfte Vorgänge, veraltete Einsätze und Einsätze ohne genaue Position', async () => {
    const placed = (await admin.post('/api/v1/cad/incidents').send({ title: 'Mit Position', mapX: 100, mapZ: -50, location: 'Park Street' })).body.id;
    const unplaced = (await admin.post('/api/v1/cad/incidents').send({ title: 'Ohne Position' })).body.id;
    const c = (await admin.post('/api/v1/cases').send({ title: 'Kartenvorgang', links: [{ entityType: 'INCIDENT', entityId: placed }] })).body;
    await prisma.incident.update({ where: { id: placed }, data: { updatedAt: new Date(Date.now() - 10 * 3_600_000) } });
    const m = await admin.get('/api/v1/cad/map');
    expect(m.status).toBe(200);
    const mk = m.body.incidents.find((i: { id: string }) => i.id === placed);
    expect(mk.cases.map((x: { number: string }) => x.number)).toEqual([c.number]);
    expect(mk.stale).toBe(true);
    expect(m.body.incidents.some((i: { id: string }) => i.id === unplaced)).toBe(false);
    expect(m.body.unplaced.incidents.some((i: { id: string }) => i.id === unplaced)).toBe(true);
    // ohne Vorgangs-Recht keine Vorgangsdaten auf der Karte
    const disp = await makeUser(prisma, 'po_disp', ['Police Member', 'Dispatch']);
    void disp;
    const d = (await login(app, 'po_disp')).agent;
    expect((await d.get('/api/v1/cad/map')).body.incidents.find((i: { id: string }) => i.id === placed).cases).toEqual([]);
  });
});
