import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CadService } from '../src/cad/cad.service';

const TOKEN = 'test-bot-token-cad-handover-0123456789abc';
const HOME = '611000000000000001', CH = '621000000000000001', SEK_D = '631000000000000001';
const bot = (discordId: string) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': discordId });

let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const outbox = (type: string) => prisma.discordOutbox.findMany({ where: { type } });

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await prisma.systemSetting.deleteMany({ where: { key: 'cad.config' } });
  await makeUser(prisma, 'ho_admin', ['System Administrator']);
  await makeUser(prisma, 'ho_disp', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'ho_disp2', ['Police Member', 'Dispatch']);
  await makeUser(prisma, 'ho_member', ['Police Member']);
  const sek = await makeUser(prisma, 'ho_sek', ['SEK']);
  await prisma.discordLink.create({ data: { userId: sek.id, discordId: SEK_D } });
  const admin = (await login(app, 'ho_admin')).agent;
  const routes = ['incident.support', 'incident.feedback', 'handover'].map((event, i) => ({ id: `h${i}`, guildId: HOME, event, channelIds: [CH], pingRoleIds: [], enabled: true }));
  expect((await admin.put('/api/v1/cad/config').send({ homeGuildId: HOME, routes })).status).toBe(200);
});
afterAll(async () => { await prisma.systemSetting.deleteMany({ where: { key: 'cad.config' } }); delete process.env.BOT_API_TOKEN; await app.close(); });

describe('MDT: Einsatzaufträge und Rückmeldungen von SEK/K9', () => {
  let incidentId = '', unitId = '';
  it('Mitglied sieht seine Einheit und den zugewiesenen Einsatz; Rückmeldungen landen in der Chronik', async () => {
    const disp = (await login(app, 'ho_disp')).agent;
    const sek = (await login(app, 'ho_sek')).agent;
    const sekUser = await prisma.user.findUniqueOrThrow({ where: { username: 'ho_sek' } });
    const unit = await disp.post('/api/v1/cad/units').send({ callsign: 'SEK-91', type: 'SEK', status: 'AVAILABLE' });
    expect(unit.status).toBe(201);
    unitId = unit.body.id;
    expect((await disp.post('/api/v1/cad/members').send({ userId: sekUser.id, discordId: SEK_D, unitId })).status).toBe(201);
    const inc = await disp.post('/api/v1/cad/incidents').send({ title: 'Banküberfall Hauptstraße', priority: 'HIGH', location: 'Hauptstraße 1' });
    incidentId = inc.body.id;

    // noch kein Einsatz → Rückmeldung abgelehnt
    expect((await sek.post(`/api/v1/cad/units/${unitId}/feedback`).send({ kind: 'accepted' })).status).toBe(409);
    expect((await disp.post(`/api/v1/cad/incidents/${incidentId}/units`).send({ unitId })).status).toBe(200);

    const mdt = await sek.get('/api/v1/cad/mdt');
    expect(mdt.status).toBe(200);
    expect(mdt.body.units).toHaveLength(1);
    expect(mdt.body.units[0]).toMatchObject({ callsign: 'SEK-91' });
    expect(mdt.body.units[0].incidents.map((i: { id: string }) => i.id)).toEqual([incidentId]);
    expect(mdt.body.feedback.map((f: { key: string }) => f.key)).toContain('support');

    const r = await sek.post(`/api/v1/cad/units/${unitId}/feedback`).send({ kind: 'on_scene', note: 'Zwei Täter im Gebäude' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ number: inc.body.number, unitStatus: 'ON_SCENE' });
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unitId } })).status).toBe('ON_SCENE');
    const log = await prisma.cadIncidentLog.findMany({ where: { incidentId, kind: 'FEEDBACK' } });
    expect(log.map((l) => l.text)).toEqual(['SEK-91: 📍 Am Einsatzort – Zwei Täter im Gebäude']);
    // Rückmeldung ändert den Einsatz selbst nicht
    expect((await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } })).status).toBe('NEW');
    expect((await outbox('cad.incident.feedback')).length).toBe(1);
  });

  it('nur Besatzung oder Leitstelle; „Unterstützung benötigt“ benachrichtigt den Disponenten; auch aus Discord', async () => {
    const member = (await login(app, 'ho_member')).agent;
    expect((await member.post(`/api/v1/cad/units/${unitId}/feedback`).send({ kind: 'support' })).status).toBe(403);
    expect((await member.post(`/api/v1/cad/units/${unitId}/feedback`).send({ kind: 'unbekannt' })).status).toBe(400);
    const r = await http().post(`/api/v1/cad/units/${unitId}/feedback`).set(bot(SEK_D)).send({ kind: 'support', note: 'Schüsse' });
    expect(r.status).toBe(200);
    const disp = await prisma.user.findUniqueOrThrow({ where: { username: 'ho_disp' } });
    expect(await prisma.notification.count({ where: { userId: disp.id, type: 'INCIDENT_SUPPORT', entityId: incidentId } })).toBe(1);
    const sent = await outbox('cad.incident.support');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ callsign: 'SEK-91', note: 'Schüsse', channelIds: [CH] });
  });

  it('Schließen archiviert die Kennzahlen; sie überleben das Löschen nach einem Tag; Wiedereröffnen nimmt sie zurück', async () => {
    const disp = (await login(app, 'ho_disp')).agent;
    expect((await disp.post(`/api/v1/cad/incidents/${incidentId}/status`).send({ status: 'CLOSED' })).status).toBe(200);
    const stat = await prisma.cadIncidentStat.findUniqueOrThrow({ where: { incidentId } });
    expect(stat).toMatchObject({ priority: 'HIGH', status: 'CLOSED', units: ['SEK-91'], unitTypes: ['SEK'] });

    const other = await disp.post('/api/v1/cad/incidents').send({ title: 'Ruhestörung', priority: 'LOW', type: 'OTHER' });
    expect((await disp.post(`/api/v1/cad/incidents/${other.body.id}/status`).send({ status: 'CANCELLED' })).status).toBe(200);
    expect(await prisma.cadIncidentStat.count({ where: { incidentId: other.body.id } })).toBe(1);
    expect((await disp.post(`/api/v1/cad/incidents/${other.body.id}/status`).send({ status: 'NEW' })).status).toBe(200);
    expect(await prisma.cadIncidentStat.count({ where: { incidentId: other.body.id } })).toBe(0);

    await app.get(CadService).purgeClosedIncidents(0);
    expect(await prisma.incident.count({ where: { id: incidentId } })).toBe(0);
    expect(await prisma.cadIncidentStat.count({ where: { incidentId } })).toBe(1);
  });

  it('Statistik rechnet aus gespeicherten Daten; nur mit cad.view_stats', async () => {
    const member = (await login(app, 'ho_member')).agent;
    expect((await member.get('/api/v1/cad/stats')).status).toBe(403);
    const disp = (await login(app, 'ho_disp')).agent;
    const r = await disp.get('/api/v1/cad/stats?days=7');
    expect(r.status).toBe(200);
    expect(r.body.totals.closed).toBeGreaterThanOrEqual(1);
    expect(r.body.totals.created).toBeGreaterThanOrEqual(2);
    expect(r.body.totals.openNow).toBeGreaterThanOrEqual(1);
    expect(r.body.byDay).toHaveLength(8);
    expect(r.body.units).toContainEqual(expect.objectContaining({ key: 'SEK-91', value: 1 }));
    expect(r.body.byPriority).toContainEqual(expect.objectContaining({ key: 'HIGH', label: 'Hoch' }));
    expect(r.body.duty).toMatchObject({ totalHours: expect.any(Number) });
    expect((await disp.get('/api/v1/cad/stats?days=0')).status).toBe(400);
  });

  it('MDT-Historie zeigt abgeschlossene Einsätze der eigenen Einheit', async () => {
    const sek = (await login(app, 'ho_sek')).agent;
    const r = await sek.get('/api/v1/cad/mdt');
    expect(r.body.units[0].incidents).toEqual([]);
    expect(r.body.history.map((h: { incidentId: string }) => h.incidentId)).toContain(incidentId);
  });
});

describe('Schichtübergabe', () => {
  let id = '';
  it('Entwurf zeigt offenen Stand; vertrauliche Einsätze nur als Anzahl', async () => {
    const disp = (await login(app, 'ho_disp')).agent;
    const admin = (await login(app, 'ho_admin')).agent;
    const open = await disp.post('/api/v1/cad/incidents').send({ title: 'Verkehrsunfall B210', priority: 'MEDIUM' });
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'System Administrator' } });
    const secret = await admin.post('/api/v1/cad/incidents').send({ title: 'Verdeckte Maßnahme', restrictRoleIds: [role.id] });
    expect(secret.status).toBe(201);
    const d = await disp.get('/api/v1/cad/handovers/draft');
    expect(d.status).toBe(200);
    const numbers = d.body.snapshot.incidents.map((i: { number: string }) => i.number);
    expect(numbers).toContain(open.body.number);
    expect(numbers).not.toContain(secret.body.number);
    expect(d.body.snapshot.confidentialIncidents).toBeGreaterThanOrEqual(1);
    expect(d.body.snapshot.units.map((u: { callsign: string }) => u.callsign)).toContain('SEK-91');
  });

  it('anlegen nur mit cad.handover; bestätigen nur durch die nächste Schicht und nur einmal', async () => {
    const member = (await login(app, 'ho_member')).agent;
    expect((await member.post('/api/v1/cad/handovers').send({ notes: 'x' })).status).toBe(403);
    const disp = (await login(app, 'ho_disp')).agent;
    expect((await disp.post('/api/v1/cad/handovers').send({ notes: '' })).status).toBe(400);
    const r = await disp.post('/api/v1/cad/handovers').send({ notes: 'B210 noch gesperrt, Abschlepper ist bestellt.' });
    expect(r.status).toBe(201);
    id = r.body.id;
    expect((await outbox('cad.handover')).at(-1)!.payload).toMatchObject({ by: 'ho_disp', notes: 'B210 noch gesperrt, Abschlepper ist bestellt.', channelIds: [CH] });

    expect((await disp.post(`/api/v1/cad/handovers/${id}/acknowledge`).send({})).status).toBe(409);
    const disp2 = (await login(app, 'ho_disp2')).agent;
    const ack = await disp2.post(`/api/v1/cad/handovers/${id}/acknowledge`).send({ note: 'Übernommen.' });
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedAt).toBeTruthy();
    expect((await disp2.post(`/api/v1/cad/handovers/${id}/acknowledge`).send({})).status).toBe(409);

    const list = await member.get('/api/v1/cad/handovers');
    expect(list.status).toBe(200);
    expect(list.body[0]).toMatchObject({ id, createdByName: 'ho_disp', acknowledgedByName: 'ho_disp2', ackNote: 'Übernommen.' });
    expect(await prisma.auditLog.count({ where: { action: { in: ['cad.handover.create', 'cad.handover.acknowledge'] }, entityId: id } })).toBe(2);
    // Entwurf zeigt die vorige Übergabe (Notizen des vorigen Disponenten)
    expect((await disp2.get('/api/v1/cad/handovers/draft')).body.previous).toMatchObject({ id, notes: 'B210 noch gesperrt, Abschlepper ist bestellt.' });
  });
});
