import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ErlcService } from '../src/cad/erlc.service';
import { ErlcClient } from '../src/cad/erlc-client';
import { ErlcWantedService } from '../src/cad/erlc-wanted.service';
import { MonitorService } from '../src/integrations/monitor.service';
import { BackupService } from '../src/backup/backup.service';
import { preMigrationBackup } from '../src/backup/pre-migrate';

const SECRET_KEY = 'PremiumSecretServerKey-0987654321';
let app: INestApplication; let prisma: PrismaService; let erlc: ErlcService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, member: Agent, backupViewer: Agent;

/** Gefälschte ER:LC-API: Antworten der Reihe nach. */
let replies: (() => Response | Promise<Response>)[] = [];
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const server = (calls: unknown[]) => ({ Name: 'EN Prem', CurrentPlayers: 1, MaxPlayers: 40, Players: [{ Player: 'Caller:901', Team: 'Civilian', Permission: 'Normal', WantedStars: 0, Location: { LocationX: 120, LocationZ: -40, PostalCode: '218', StreetName: 'Park Street' } }], EmergencyCalls: calls });
const CALL_WITH_CALLER = { Team: 'Police', Caller: 901, Players: [], Position: [99999, 99999], StartedAt: 1774300000, CallNumber: 501, Description: 'Einbruch', PositionDescriptor: null };
const CALL_NO_POS = { Team: 'Police', Caller: 999, Players: [], Position: [], StartedAt: 1774300100, CallNumber: 502, Description: 'Hilferuf', PositionDescriptor: null };
function useFake(e: ErlcService) {
  e.useClient(new ErlcClient(async () => { const next = replies.shift(); if (!next) throw new Error('no fake reply'); return next(); }, 'https://erlc.test'));
}

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  erlc = app.get(ErlcService);
  useFake(erlc);
  await makeUser(prisma, 'ps_admin', ['System Administrator']);
  await makeUser(prisma, 'ps_member', ['Police Member']);
  await prisma.role.create({ data: { name: 'PS Backup lesen', permissions: { create: [{ permissionKey: 'backups.view', effect: 'ALLOW' }] } } });
  await makeUser(prisma, 'ps_bview', ['PS Backup lesen']);
  admin = (await login(app, 'ps_admin')).agent;
  member = (await login(app, 'ps_member')).agent;
  backupViewer = (await login(app, 'ps_bview')).agent;
});
afterAll(async () => { await app.close(); });

describe('Selbstheilende Integration: ER:LC', () => {
  let id = '';
  it('Ausfall wird erkannt, dauerhaft gezählt, nach Schwelle alarmiert – ohne Zugangsdaten preiszugeben', async () => {
    id = (await admin.post('/api/v1/erlc/servers').send({ name: 'Premium-Server', key: SECRET_KEY, pollSeconds: 10, features: ['players', 'emergencyCalls'] })).body.id;
    await admin.put('/api/v1/integrations/config').send({ alertAfterMinutes: 60, alertAfterFailures: 3, outboxStaleMinutes: 10 });
    replies = [json(500, { message: 'internal' }), () => { throw new Error('ECONNRESET'); }, json(500, { message: `bad ${SECRET_KEY}` })];
    for (let i = 0; i < 3; i++) { await erlc.poll(id, true); }
    const s = await prisma.erlcServer.findUniqueOrThrow({ where: { id } });
    expect(s.failureCount).toBe(3);
    expect(s.failingSince).not.toBeNull();
    const ev = await prisma.integrationEvent.findFirstOrThrow({ where: { source: 'ERLC', sourceId: id, status: 'OPEN' } });
    expect(ev.count).toBe(3); // zusammengefasst, nicht drei Einträge
    expect(ev.alertedAt).not.toBeNull();
    expect(JSON.stringify(ev)).not.toContain(SECRET_KEY);
    const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'ps_admin' } });
    expect(await prisma.notification.count({ where: { userId: adminUser.id, entityType: 'IntegrationEvent', entityId: ev.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'integration.alert', entityId: ev.id } })).toBe(1);
    const o = await admin.get('/api/v1/integrations/overview');
    expect(o.status).toBe(200);
    expect(JSON.stringify(o.body)).not.toContain(SECRET_KEY);
    expect(o.body.erlc.find((x: { id: string }) => x.id === id)).toMatchObject({ failureCount: 3, stale: true });
  });
  it('Rate-Limit: Retry-After wird eingehalten, keine Anfrage vor Ablauf', async () => {
    replies = [json(429, { message: 'slow down', retry_after: 30 }, { 'retry-after': '30' })];
    const r1 = await erlc.poll(id, true);
    expect(r1.status).toBe('LIMITED');
    replies = [json(200, server([]))];
    const r2 = await erlc.poll(id, true); // innerhalb des Retry-After: Client hält zurück, nichts gesendet
    expect(r2.ok).toBe(false);
    expect(replies).toHaveLength(1); // Antwort nicht verbraucht = keine Anfrage
    replies = [];
    erlc.client.forget(id);
    (erlc.client as unknown as { servers: Map<string, { blockedUntil: number }> }).servers.get(id)!.blockedUntil = 0; // Wartezeit „abgelaufen“
  });
  it('Neustart: Störung und Fehlerserie bleiben erhalten; nach Wiederverbindung behoben, Schritte laufen einzeln weiter', async () => {
    await app.close();
    ({ app, prisma } = await createTestApp());
    erlc = app.get(ErlcService);
    useFake(erlc);
    admin = (await login(app, 'ps_admin')).agent;
    expect((await prisma.erlcServer.findUniqueOrThrow({ where: { id } })).failureCount).toBeGreaterThanOrEqual(3);
    expect(await prisma.integrationEvent.count({ where: { source: 'ERLC', sourceId: id, status: 'OPEN' } })).toBe(1);
    // ein Verarbeitungsschritt scheitert – die anderen laufen weiter
    const wanted = app.get(ErlcWantedService);
    const orig = wanted.check.bind(wanted);
    wanted.check = async () => { throw new Error('DB kurz weg'); };
    replies = [json(200, server([CALL_WITH_CALLER, CALL_NO_POS]))];
    const r = await erlc.poll(id, true);
    expect(r.ok).toBe(true);
    const s = await prisma.erlcServer.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ failureCount: 0, failingSince: null, status: 'CONNECTED' });
    expect(await prisma.integrationEvent.count({ where: { source: 'ERLC', sourceId: id, status: 'OPEN' } })).toBe(0);
    expect((await prisma.integrationEvent.findFirstOrThrow({ where: { source: 'ERLC', sourceId: id } })).resolvedAt).not.toBeNull();
    expect(await prisma.integrationEvent.count({ where: { source: 'ERLC_STEP', sourceId: id, step: 'Fahndungsabgleich', status: 'OPEN' } })).toBe(1);
    expect(await prisma.erlcEmergencyCall.count({ where: { serverId: id } })).toBe(2); // Notrufe trotzdem übernommen
    // erneuter Abruf mit denselben Daten: keine doppelten Notrufe, Schritt erholt sich
    wanted.check = orig;
    replies = [json(200, server([CALL_WITH_CALLER, CALL_NO_POS]))];
    await erlc.poll(id, true);
    expect(await prisma.erlcEmergencyCall.count({ where: { serverId: id } })).toBe(2);
    expect(await prisma.integrationEvent.count({ where: { source: 'ERLC_STEP', sourceId: id, status: 'OPEN' } })).toBe(0);
  });
  it('Notruf-Positionen nur aus echten Ortsdaten; ohne Position ausdrücklich gekennzeichnet; nicht mehr gemeldet = veraltet', async () => {
    const withCaller = await prisma.erlcEmergencyCall.findFirstOrThrow({ where: { serverId: id, callNumber: 501 } });
    expect(withCaller).toMatchObject({ positionSource: 'CALLER', mapX: 120, mapZ: -40 }); // Standort laut API (per Roblox-ID), nicht die Off-Map-Position
    const noPos = await prisma.erlcEmergencyCall.findFirstOrThrow({ where: { serverId: id, callNumber: 502 } });
    expect(noPos).toMatchObject({ positionSource: 'NONE', mapX: null, mapZ: null });
    // Notruf 502 verschwindet aus der API → bleibt sichtbar, aber als „nicht mehr gemeldet“
    replies = [json(200, server([CALL_WITH_CALLER]))];
    await erlc.poll(id, true);
    const m = await admin.get('/api/v1/cad/map');
    expect(m.body.calls.find((c: { id: string }) => c.id === withCaller.id)).toMatchObject({ positionSource: 'CALLER', notReported: false });
    expect(m.body.unplaced.calls.find((c: { id: string }) => c.id === noPos.id)).toMatchObject({ notReported: true });
    expect(m.body.calls.some((c: { id: string }) => c.id === noPos.id)).toBe(false);
  });
  it('Wiederholung manuell anstoßen und Störungen quittieren (nur mit Recht)', async () => {
    const ev = await prisma.integrationEvent.findFirstOrThrow({ where: { source: 'ERLC', sourceId: id } });
    expect((await member.post(`/api/v1/integrations/events/${ev.id}/acknowledge`)).status).toBe(403);
    expect((await admin.post(`/api/v1/integrations/events/${ev.id}/acknowledge`)).body.acknowledgedAt).toBeTruthy();
    replies = [json(200, server([]))];
    expect((await admin.post(`/api/v1/integrations/erlc/${id}/retry`)).body).toMatchObject({ ok: true, status: 'CONNECTED' });
    expect((await member.post(`/api/v1/integrations/erlc/${id}/retry`)).status).toBe(403);
    const events = await admin.get('/api/v1/integrations/events');
    expect(events.status).toBe(200);
  });
  it('Discord-Ausgang: hängende Nachrichten werden als Störung erkannt', async () => {
    const monitor = app.get(MonitorService);
    await prisma.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: {}, createdAt: new Date(Date.now() - 60 * 60_000) } });
    await monitor.sweep();
    expect(await prisma.integrationEvent.count({ where: { source: 'OUTBOX', step: 'pending', status: 'OPEN' } })).toBe(1);
    await prisma.discordOutbox.updateMany({ where: { sentAt: null }, data: { sentAt: new Date() } });
    await monitor.sweep();
    expect(await prisma.integrationEvent.count({ where: { source: 'OUTBOX', step: 'pending', status: 'OPEN' } })).toBe(0);
  });
});

describe('Backups', () => {
  it('jede Sicherung mit Zeitpunkt und Ergebnis; getrennte Rechte', async () => {
    expect((await member.get('/api/v1/backups/data')).status).toBe(403);
    expect((await backupViewer.get('/api/v1/backups/data')).status).toBe(200);
    expect((await backupViewer.post('/api/v1/backups/data')).status).toBe(403);
    const made = await admin.post('/api/v1/backups/data');
    expect(made.status).toBe(201);
    const runs = await backupViewer.get('/api/v1/backups/runs');
    expect(runs.body[0]).toMatchObject({ action: 'CREATE', status: 'SUCCESS', fileName: made.body.name, createdByName: 'ps_admin' });
    expect(runs.body[0].finishedAt).toBeTruthy();
    // eine erzeugte Datei gilt nicht als geprüft
    expect((await backupViewer.get('/api/v1/backups/data')).body.find((f: { name: string }) => f.name === made.body.name).verify).toBeNull();
    expect((await backupViewer.post(`/api/v1/backups/data/${made.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN' })).status).toBe(403);
  });
  it('Wiederherstellungstest spielt wirklich ein, vergleicht und rollt zurück – Datenbestand bleibt unverändert', async () => {
    const made = (await admin.post('/api/v1/backups/data')).body;
    // nach dem Backup angelegter Datensatz muss den Test überleben (Beweis für das Zurückrollen)
    const later = await prisma.person.create({ data: { robloxUsername: 'NachDemBackup' } });
    const personsBefore = await prisma.person.count();
    const v = await admin.post(`/api/v1/backups/data/${made.name}/verify`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ ok: true, mismatches: [] });
    expect(v.body.rows).toBeGreaterThan(0);
    expect(await prisma.person.findUnique({ where: { id: later.id } })).not.toBeNull();
    expect(await prisma.person.count()).toBe(personsBefore);
    const list = (await admin.get('/api/v1/backups/data')).body;
    expect(list.find((f: { name: string }) => f.name === made.name).verify).toMatchObject({ status: 'SUCCESS' });
    // angemeldet bleiben: Sitzung existiert weiter
    expect((await admin.get('/api/v1/auth/me')).status).toBe(200);
  });
  it('fehlgeschlagener Wiederherstellungstest wird protokolliert und Administratoren werden benachrichtigt', async () => {
    const backups = app.get(BackupService);
    const dir = (backups as unknown as { dir: string }).dir;
    const name = 'manuell-20260101-000000.json.gz';
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), gzipSync(Buffer.from('{"kaputt":')));
    const v = await admin.post(`/api/v1/backups/data/${name}/verify`);
    expect(v.body.ok).toBe(false);
    const run = await prisma.backupRun.findFirstOrThrow({ where: { action: 'VERIFY', fileName: name } });
    expect(run).toMatchObject({ status: 'FAILED' });
    const ev = await prisma.integrationEvent.findFirstOrThrow({ where: { source: 'BACKUP', step: 'Wiederherstellungstest', status: 'OPEN' } });
    expect(ev.alertedAt).not.toBeNull(); // sofort alarmiert
    const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'ps_admin' } });
    expect(await prisma.notification.count({ where: { userId: adminUser.id, entityId: ev.id } })).toBe(1);
    // nächster erfolgreicher Test behebt die Störung
    const good = (await admin.post('/api/v1/backups/data')).body;
    expect((await admin.post(`/api/v1/backups/data/${good.name}/verify`)).body.ok).toBe(true);
    expect((await prisma.integrationEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe('RESOLVED');
  });
  it('Wiederherstellung behält Lageberichte, Störungsprotokoll und Backup-Verlauf', async () => {
    const made = (await admin.post('/api/v1/backups/data')).body;
    const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'ps_admin' } });
    const lage = await prisma.situationReport.create({ data: { number: 'L-TEST-1', data: {}, text: 'x', createdById: adminUser.id } });
    const runsBefore = await prisma.backupRun.count();
    const r = await admin.post(`/api/v1/backups/data/${made.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN' });
    expect(r.status).toBe(200);
    expect(await prisma.situationReport.findUnique({ where: { id: lage.id } })).not.toBeNull();
    expect(await prisma.backupRun.count()).toBeGreaterThan(runsBefore); // Verlauf nicht zurückgesetzt, Wiederherstellung protokolliert
    expect(await prisma.backupRun.findFirst({ where: { action: 'RESTORE', status: 'SUCCESS', fileName: made.name } })).not.toBeNull();
  });
});

describe('Sicherung vor Migrationen', () => {
  it('sichert vor ausstehenden Migrationen; Datei ist mit der normalen Wiederherstellung einspielbar', async () => {
    const migrations = mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    const storage = mkdtempSync(path.join(os.tmpdir(), 'store-'));
    const applied = (await prisma.$queryRawUnsafe<{ migration_name: string }[]>('SELECT migration_name FROM "_prisma_migrations"')).map((m) => m.migration_name);
    for (const m of applied) { mkdirSync(path.join(migrations, m)); writeFileSync(path.join(migrations, m, 'migration.sql'), '-- schon angewendet'); }
    expect((await preMigrationBackup(migrations, storage, () => undefined)).file).toBeNull(); // nichts ausstehend → keine Sicherung
    mkdirSync(path.join(migrations, '29991231000000_neu'));
    writeFileSync(path.join(migrations, '29991231000000_neu', 'migration.sql'), 'SELECT 1;');
    const r = await preMigrationBackup(migrations, storage, () => undefined);
    expect(r.file).toMatch(/vor-migration-\d{8}-\d{6}\.json\.gz$/);
    const marker = await prisma.person.create({ data: { robloxUsername: 'VorDerMigration' } });
    void marker;
    // Format kompatibel: über die normale Wiederherstellung (Upload) einspielbar
    const up = await admin.post('/api/v1/backups/data-upload/restore').field('confirm', 'WIEDERHERSTELLEN').attach('file', readFileSync(r.file!), 'vor-migration.json.gz');
    expect(up.status).toBe(200);
    expect(up.body.rows).toBeGreaterThan(0);
    expect(await prisma.person.findFirst({ where: { robloxUsername: 'VorDerMigration' } })).toBeNull(); // Stand von vor der „Migration“
    expect(await prisma.user.findFirst({ where: { username: 'ps_admin' } })).not.toBeNull();
  });
});
