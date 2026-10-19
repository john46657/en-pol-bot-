import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_FORM, DEFAULT_PANEL, RadioWhitelistService } from '../src/radio/radio-whitelist.service';
import { ZelloError } from '../src/radio/zello-work.client';

const TOKEN = 'r'.repeat(40);
const G = '870000000000000001';
const RADIO_ROLE = '871000000000000001', GRANT_ROLE = '871000000000000002', OTHER_ROLE = '871000000000000003';
const M = (n: number) => `872000000000000${String(n).padStart(3, '0')}`;
let app: INestApplication; let prisma: PrismaService; let svc: RadioWhitelistService;
const http = () => request(app.getHttpServer());
const bot = { Authorization: `Bot ${TOKEN}` };
type Agent = Awaited<ReturnType<typeof login>>['agent'];
const as: Record<string, Agent> = {};
const day = 86_400_000;

async function role(name: string, perms: string[]) {
  const r = await prisma.role.create({ data: { name, priority: 50 } });
  await prisma.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId: r.id, permissionKey, effect: 'ALLOW' })) });
}

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  process.env.DISCORD_GUILD_ID = G;
  ({ app, prisma } = await createTestApp());
  svc = app.get(RadioWhitelistService);
  await role('RW Viewer', ['radiowhitelist.view']);
  await role('RW Granter', ['radiowhitelist.view', 'radiowhitelist.grant']);
  await role('RW Lead', ['radiowhitelist.view', 'radiowhitelist.grant', 'radiowhitelist.suspend', 'radiowhitelist.remove', 'radiowhitelist.requests', 'radiowhitelist.roles', 'radiowhitelist.logs']);
  for (const [n, roles] of Object.entries({ rw_admin: ['System Administrator'], rw_off: ['Police Member'], rw_view: ['RW Viewer'], rw_grant: ['RW Granter'], rw_lead: ['RW Lead'] })) {
    await makeUser(prisma, n, roles);
    as[n] = (await login(app, n)).agent;
  }
  await as.rw_admin!.put('/api/v1/radio-whitelist/config/roles').send({ roleSync: { enabled: false, grantRoleIds: [], requiredRoleIds: [], onRoleGain: 'ACTIVATE', onRoleLoss: 'REVOKE', manualOnRoleLoss: 'KEEP' }, radioRoleIds: [RADIO_ROLE] }).expect(200);
});
afterAll(async () => {
  delete process.env.BOT_API_TOKEN; delete process.env.DISCORD_GUILD_ID;
  await app.close();
});

const outbox = (type: string, discordId: string) => prisma.discordOutbox.findMany({ where: { type, payload: { path: ['discordId'], equals: discordId } }, orderBy: { createdAt: 'asc' } });

describe('Berechtigungen (deny-by-default, serverseitig)', () => {
  it('ohne ausdrückliches Recht kein Zugriff – jede Aktion braucht ihr eigenes Recht', async () => {
    for (const path of ['/grants', '/summary', '/requests', '/integration', '/logs', '/config', '/export']) expect((await as.rw_off!.get(`/api/v1/radio-whitelist${path}`)).status, path).toBe(403);
    expect((await as.rw_view!.get('/api/v1/radio-whitelist/grants')).status).toBe(200);
    expect((await as.rw_view!.post('/api/v1/radio-whitelist/grants').send({ discordId: M(1), reason: 'Test' })).status).toBe(403);
    const g = await as.rw_grant!.post('/api/v1/radio-whitelist/grants').send({ discordId: M(1), reason: 'Leitstelle' });
    expect(g.status).toBe(201);
    // Freischalten erlaubt, aber Sperren/Entziehen/Anträge/Rollen/Integration/Protokoll nicht
    expect((await as.rw_grant!.post(`/api/v1/radio-whitelist/grants/${g.body.id}/suspend`).send({ reason: 'Regelverstoß' })).status).toBe(403);
    expect((await as.rw_grant!.post(`/api/v1/radio-whitelist/grants/${g.body.id}/revoke`).send({ reason: 'Regelverstoß' })).status).toBe(403);
    expect((await as.rw_grant!.get('/api/v1/radio-whitelist/requests')).status).toBe(403);
    expect((await as.rw_grant!.put('/api/v1/radio-whitelist/config/roles').send({})).status).toBe(403);
    expect((await as.rw_lead!.put('/api/v1/radio-whitelist/integration').send({})).status).toBe(403); // integration nur ausdrücklich
    expect((await as.rw_grant!.get('/api/v1/radio-whitelist/logs')).status).toBe(403);
    expect((await as.rw_lead!.get('/api/v1/radio-whitelist/logs')).status).toBe(200);
    // Bot-Dienstrouten nur mit Bot-Token – nie per Sitzung
    expect((await as.rw_admin!.post('/api/v1/bot/radio-whitelist/requests').send({ guildId: G, discordId: M(2), reason: 'Ich möchte in den Funk' })).status).toBe(401);
    // verweigerte Zugriffe werden nicht zu Änderungen
    expect(await prisma.radioGrant.count({ where: { discordId: M(1) } })).toBe(1);
  });
});

describe('Freigaben: erstellen, ändern, sperren, entziehen', () => {
  it('voller Lebenszyklus mit Protokoll, Discord-Rolle, DM, Versionsschutz und Archiv statt Löschen', async () => {
    const lead = as.rw_lead!;
    const c = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(10), discordName: 'Max Muster', rank: 'POK', department: 'Autobahnpolizei', externalName: 'max_zello', reason: 'Dienstbeginn' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ status: 'ACTIVE', effectiveStatus: 'ACTIVE', authorized: true, source: 'MANUAL', grantedByName: 'rw_lead', version: 1 });
    expect((await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(10), reason: 'doppelt' })).status).toBe(409);
    expect((await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: 'Max Muster', reason: 'Name statt ID' })).status).toBe(400);
    expect((await outbox('member.roles', M(10)))[0]!.payload).toMatchObject({ add: [RADIO_ROLE], remove: [] });
    expect(await outbox('bot.dm', M(10))).toHaveLength(1);
    const id = c.body.id as string;

    // Suche nach ID, Name, Dienstgrad, Abteilung
    for (const q of [M(10), 'muster', 'POK', 'autobahn']) expect((await lead.get('/api/v1/radio-whitelist/grants').query({ q })).body.items.map((x: { id: string }) => x.id), q).toEqual([id]);

    // Ändern mit Versionsschutz
    expect((await lead.patch(`/api/v1/radio-whitelist/grants/${id}`).send({ version: 99, rank: 'PHK' })).status).toBe(409);
    const u = await lead.patch(`/api/v1/radio-whitelist/grants/${id}`).send({ version: 1, rank: 'PHK' });
    expect(u.body).toMatchObject({ rank: 'PHK', version: 2 });

    // deaktivieren → aktivieren
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/deactivate`).send({ reason: 'Urlaub' })).body).toMatchObject({ status: 'DISABLED', authorized: false });
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/deactivate`).send({ reason: 'Urlaub' })).status).toBe(409);
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/activate`).send({})).body).toMatchObject({ status: 'ACTIVE', authorized: true });

    // sperren (Begründung Pflicht) → nicht aktivierbar → entsperren
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/suspend`).send({ reason: '' })).status).toBe(400);
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/suspend`).send({ reason: 'Funkdisziplin' })).body).toMatchObject({ status: 'SUSPENDED', suspendReason: 'Funkdisziplin', authorized: false });
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/activate`).send({})).status).toBe(409);
    expect((await lead.get('/api/v1/radio-whitelist/grants').query({ status: 'suspended' })).body.items).toHaveLength(1);
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/unsuspend`).send({})).body).toMatchObject({ status: 'ACTIVE', suspendReason: null });

    // entziehen = archivieren; wiederherstellen behält Eintrag und Historie
    const r = await lead.post(`/api/v1/radio-whitelist/grants/${id}/revoke`).send({ reason: 'Austritt' });
    expect(r.body).toMatchObject({ status: 'REVOKED', effectiveStatus: 'REVOKED', archivedAt: expect.any(String) });
    expect((await lead.get('/api/v1/radio-whitelist/grants').query({ q: M(10) })).body.items).toHaveLength(0); // nicht mehr in der Standardliste
    expect((await lead.get('/api/v1/radio-whitelist/grants').query({ q: M(10), status: 'revoked' })).body.items).toHaveLength(1);
    expect(await prisma.radioGrant.count({ where: { discordId: M(10) } })).toBe(1);
    expect((await outbox('member.roles', M(10))).at(-1)!.payload).toMatchObject({ add: [], remove: [RADIO_ROLE] });
    const back = await lead.post(`/api/v1/radio-whitelist/grants/${id}/restore`).send({ reason: 'Wiedereinstieg' });
    expect(back.body).toMatchObject({ id, status: 'ACTIVE', archivedAt: null, rank: 'PHK' });

    const detail = (await lead.get(`/api/v1/radio-whitelist/grants/${id}`)).body;
    expect(detail.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['radio.grant.created', 'radio.grant.updated', 'radio.grant.deactivated', 'radio.grant.activated', 'radio.grant.suspended', 'radio.grant.unsuspended', 'radio.grant.revoked', 'radio.grant.restored']));
    expect(detail.history.find((h: { action: string }) => h.action === 'radio.grant.suspended')).toMatchObject({ actorName: 'rw_lead', reason: 'Funkdisziplin' });
  });

  it('befristete Freigaben laufen ab (auch verpasst), lassen sich verlängern; befristete Sperren enden automatisch', async () => {
    const lead = as.rw_lead!;
    expect((await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(20), reason: 'Probe', expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    const c = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(20), reason: 'Probezeit', expiresAt: new Date(Date.now() + 7 * day).toISOString() });
    expect(c.body.expiresAt).toBeTruthy();
    const id = c.body.id as string;
    // Zeit vergeht: Ablaufdatum liegt jetzt in der Vergangenheit – sofort als abgelaufen sichtbar, noch bevor die Aufgabe läuft
    await prisma.radioGrant.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await lead.get(`/api/v1/radio-whitelist/grants/${id}`)).body).toMatchObject({ status: 'ACTIVE', effectiveStatus: 'EXPIRED', authorized: false });
    expect((await lead.get('/api/v1/radio-whitelist/grants').query({ status: 'expired', q: M(20) })).body.items).toHaveLength(1);
    expect((await lead.get('/api/v1/radio-whitelist/grants').query({ status: 'active', q: M(20) })).body.items).toHaveLength(0);
    expect(await svc.tick()).toMatchObject({ expired: 1 });
    expect(await svc.tick()).toMatchObject({ expired: 0 }); // nicht doppelt
    expect(await prisma.radioGrant.findUnique({ where: { id } })).toMatchObject({ status: 'EXPIRED' });
    expect(await prisma.auditLog.count({ where: { action: 'radio.grant.expired', entityId: id, actorUserId: null } })).toBe(1);
    expect((await outbox('member.roles', M(20))).at(-1)!.payload).toMatchObject({ remove: [RADIO_ROLE] });
    // verlängern → wieder aktiv
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/extend`).send({ expiresAt: new Date(Date.now() - day).toISOString() })).status).toBe(400);
    const ext = await lead.post(`/api/v1/radio-whitelist/grants/${id}/extend`).send({ expiresAt: new Date(Date.now() + 30 * day).toISOString(), reason: 'bestanden' });
    expect(ext.body).toMatchObject({ status: 'ACTIVE', authorized: true });
    // unbefristet machen
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${id}/extend`).send({ expiresAt: null })).body).toMatchObject({ expiresAt: null, authorized: true });
    // befristete Sperre
    await lead.post(`/api/v1/radio-whitelist/grants/${id}/suspend`).send({ reason: 'Kurzsperre', until: new Date(Date.now() + day).toISOString() }).expect(200);
    await prisma.radioGrant.update({ where: { id }, data: { suspendedUntil: new Date(Date.now() - 1000) } });
    expect(await svc.tick()).toMatchObject({ unsuspended: 1 });
    expect(await prisma.radioGrant.findUnique({ where: { id } })).toMatchObject({ status: 'ACTIVE', suspendedUntil: null });
  });
});

describe('Anträge über Discord', () => {
  const ask = (discordId: string, reason = 'Ich bin neu bei der Autobahnpolizei und brauche Funk.') => http().post('/api/v1/bot/radio-whitelist/requests').set(bot).send({ guildId: G, discordId, discordName: `Mitglied ${discordId.slice(-3)}`, rank: 'PM', department: 'Streife', reason });

  it('Antrag stellen, doppelte verhindern (einstellbar), genehmigen mit DM, Status abfragen', async () => {
    const lead = as.rw_lead!;
    const a = await ask(M(30));
    expect(a.status).toBe(201);
    expect((await ask(M(30))).status).toBe(409);
    expect((await ask(M(30), 'x')).status).toBe(400);
    expect((await http().post('/api/v1/bot/radio-whitelist/requests').set(bot).send({ guildId: '870000000000000099', discordId: M(31), reason: 'Falscher Server Antrag' })).status).toBe(403);
    expect((await http().get(`/api/v1/bot/radio-whitelist/status/${M(30)}`).set(bot)).body).toMatchObject({ status: null, authorized: false, pendingSince: expect.any(String) });
    const list = (await lead.get('/api/v1/radio-whitelist/requests')).body;
    expect(list.items).toEqual([expect.objectContaining({ discordId: M(30), rank: 'PM', department: 'Streife', status: 'PENDING', createdAt: expect.any(String) })]);
    expect(await prisma.notification.count({ where: { type: 'RADIO_REQUEST' } })).toBeGreaterThan(0);

    const until = new Date(Date.now() + 14 * day).toISOString();
    const d = await lead.post(`/api/v1/radio-whitelist/requests/${a.body.id}/decision`).send({ decision: 'APPROVE', reason: 'Passt', expiresAt: until });
    expect(d.body).toMatchObject({ status: 'APPROVED', decidedByName: 'rw_lead', decisionReason: 'Passt', grantId: expect.any(String) });
    expect((await lead.post(`/api/v1/radio-whitelist/requests/${a.body.id}/decision`).send({ decision: 'REJECT', reason: 'zu spät' })).status).toBe(409);
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(30) } })).toMatchObject({ status: 'ACTIVE', source: 'REQUEST', rank: 'PM' });
    const dm = await outbox('bot.dm', M(30));
    expect(JSON.stringify(dm.at(-1)!.payload)).toContain('genehmigt');
    expect((await http().get(`/api/v1/bot/radio-whitelist/status/${M(30)}`).set(bot)).body).toMatchObject({ status: 'ACTIVE', authorized: true, pendingSince: null });
    expect((await ask(M(30))).status).toBe(409); // schon freigegeben
    // bearbeitete Anträge bleiben einsehbar
    expect((await lead.get('/api/v1/radio-whitelist/requests').query({ status: 'DONE' })).body.items.map((x: { id: string }) => x.id)).toContain(a.body.id);
  });

  it('ablehnen braucht eine Begründung und benachrichtigt; gesperrte Mitglieder können nicht beantragen; Einstellungen wirken', async () => {
    const lead = as.rw_lead!;
    const a = await ask(M(40));
    expect((await lead.post(`/api/v1/radio-whitelist/requests/${a.body.id}/decision`).send({ decision: 'REJECT' })).status).toBe(400);
    expect((await lead.post(`/api/v1/radio-whitelist/requests/${a.body.id}/decision`).send({ decision: 'REJECT', reason: 'Erst Ausbildung abschließen' })).body).toMatchObject({ status: 'REJECTED' });
    expect(JSON.stringify((await outbox('bot.dm', M(40))).at(-1)!.payload)).toContain('Erst Ausbildung abschließen');
    expect(await prisma.radioGrant.count({ where: { discordId: M(40) } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'radio.request.rejected', entityId: a.body.id } })).toBe(1);

    // Doppel-Anträge erlauben, wenn ausgeschaltet
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: false, notifyChannelId: '873000000000000001', panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true }).expect(200);
    expect((await ask(M(41))).status).toBe(201);
    expect((await ask(M(41))).status).toBe(201);
    expect(await prisma.discordOutbox.count({ where: { type: 'message.post', payload: { path: ['channelId'], equals: '873000000000000001' } } })).toBe(2);
    // Anträge aus
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: false, preventDuplicates: true, notifyChannelId: null, panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true }).expect(200);
    expect((await ask(M(42))).status).toBe(503);
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: null, panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true }).expect(200);
    // Rollen bei Genehmigung: nur bei Genehmigung zusätzlich vergeben, nicht bei Ablehnung
    const EXTRA = '871000000000000009';
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: null, approveRoleIds: [EXTRA], panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true }).expect(200);
    expect((await lead.get('/api/v1/radio-whitelist/config')).body.requests.approveRoleIds).toEqual([EXTRA]);
    const ok = await ask(M(44)), no = await ask(M(45));
    await lead.post(`/api/v1/radio-whitelist/requests/${ok.body.id}/decision`).send({ decision: 'APPROVE' }).expect(200);
    await lead.post(`/api/v1/radio-whitelist/requests/${no.body.id}/decision`).send({ decision: 'REJECT', reason: 'Noch nicht' }).expect(200);
    expect((await outbox('member.roles', M(44))).map((o) => o.payload)).toContainEqual(expect.objectContaining({ add: [EXTRA], remove: [] }));
    expect((await outbox('member.roles', M(45))).length).toBe(0);
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: null, approveRoleIds: [], panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true }).expect(200);
    // gesperrt → kein Antrag
    const g = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(43), reason: 'x-test' });
    await lead.post(`/api/v1/radio-whitelist/grants/${g.body.id}/suspend`).send({ reason: 'Sperre' }).expect(200);
    expect((await ask(M(43))).body.message).toContain('gesperrt');
  });
});

describe('Discord-Panels und eigenes Antragsformular', () => {
  const CH = '873000000000000002', PANEL_CH = '873000000000000003', LEAD_DISCORD = '874000000000000001';
  const form = { title: 'Funk beantragen', fields: [
    { key: 'reason', label: 'Warum?', placeholder: 'kurz begründen', paragraph: true, required: false, maxLength: 500 },
    { key: 'callsign', label: 'Funkrufname', placeholder: '', paragraph: false, required: true, maxLength: 20 },
  ] };
  it('Formular selbst gestalten; Antrag als Panel mit Buttons; Entscheidung per Discord-Button aktualisiert die Meldung', async () => {
    const lead = as.rw_lead!;
    // ungültige Formulare
    expect((await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: CH, panel: DEFAULT_PANEL, form: { title: 'x', fields: [form.fields[1]] } }, notifyMembers: true })).status).toBe(400); // ohne Begründung
    expect((await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: CH, panel: DEFAULT_PANEL, form: { title: 'x', fields: [...form.fields, ...['a', 'b', 'c', 'd'].map((k) => ({ ...form.fields[1], key: k }))] } }, notifyMembers: true })).status).toBe(400); // > 5 Felder
    await lead.put('/api/v1/radio-whitelist/config/requests').send({ requests: { enabled: true, preventDuplicates: true, notifyChannelId: CH, panel: { ...DEFAULT_PANEL, channelId: PANEL_CH, title: 'Funk', text: 'Hier beantragen', buttonLabel: 'Los', color: '#ff0000' }, form }, notifyMembers: true }).expect(200);
    const cfg = (await lead.get('/api/v1/radio-whitelist/config')).body;
    expect(cfg.requests.form.fields[0]).toMatchObject({ key: 'reason', required: true }); // Begründung bleibt Pflicht
    // der Bot bekommt das Formular mit dem Status
    expect((await http().get(`/api/v1/bot/radio-whitelist/status/${M(85)}`).set(bot)).body.form).toMatchObject({ title: 'Funk beantragen', fields: [{ key: 'reason' }, { key: 'callsign', required: true }] });

    // Antrags-Panel für Mitglieder
    expect((await as.rw_grant!.post('/api/v1/radio-whitelist/request-panel')).status).toBe(403);
    expect((await lead.post('/api/v1/radio-whitelist/request-panel')).status).toBe(202);
    const panel = (await prisma.discordOutbox.findFirst({ where: { type: 'message.post', payload: { path: ['channelId'], equals: PANEL_CH } } }))!.payload as { stateKey: string; message: { embeds: { title: string; color: number }[]; buttons: { id: string; label: string }[] } };
    expect(panel.stateKey).toBe('radio-request-panel');
    expect(panel.message.embeds[0]).toMatchObject({ title: 'Funk', color: 0xff0000 });
    expect(panel.message.buttons).toEqual([expect.objectContaining({ id: 'rwreq:open', label: 'Los' })]);

    // Antrag: Pflicht-Zusatzfeld fehlt → abgelehnt; mit Feld → gespeichert und als Panel mit Buttons gemeldet
    const ask = (answers?: Record<string, string>) => http().post('/api/v1/bot/radio-whitelist/requests').set(bot).send({ guildId: G, discordId: M(85), discordName: 'Panel Paula', reason: 'Neu im Team', ...(answers ? { answers } : {}) });
    expect((await ask()).body.message).toContain('Funkrufname');
    const a = await ask({ callsign: 'ADLER 12', unbekannt: 'wird ignoriert' });
    expect(a.status).toBe(201);
    expect((await prisma.radioRequest.findUniqueOrThrow({ where: { id: a.body.id } })).answers).toEqual([{ key: 'callsign', label: 'Funkrufname', value: 'ADLER 12' }]);
    const note = (await prisma.discordOutbox.findFirst({ where: { type: 'message.post', payload: { path: ['stateKey'], equals: `rwreq-${a.body.id}` } } }))!.payload as { channelId: string; message: { embeds: { description: string }[]; buttons: { id: string }[] } };
    expect(note.channelId).toBe(CH);
    expect(note.message.embeds[0]!.description).toContain('**Funkrufname:** ADLER 12');
    expect(note.message.buttons.map((b) => b.id)).toEqual([`rwreq:approve:${a.body.id}`, `rwreq:reject:${a.body.id}`]);

    // Entscheidung per Discord-Button: nur mit verknüpftem Konto UND Recht
    const viaBot = (discordId: string) => http().post(`/api/v1/radio-whitelist/requests/${a.body.id}/decision`).set({ ...bot, 'X-Discord-User': discordId }).send({ decision: 'APPROVE' });
    await prisma.discordLink.create({ data: { userId: (await prisma.user.findUniqueOrThrow({ where: { username: 'rw_off' } })).id, discordId: '874000000000000002' } });
    expect((await viaBot('874000000000000002')).status).toBe(403); // Police Member ohne radiowhitelist.requests
    await prisma.discordLink.create({ data: { userId: (await prisma.user.findUniqueOrThrow({ where: { username: 'rw_lead' } })).id, discordId: LEAD_DISCORD } });
    const ok = await viaBot(LEAD_DISCORD);
    expect(ok.body).toMatchObject({ status: 'APPROVED', decidedByName: 'rw_lead' });
    // Meldung wird aktualisiert: Entscheidung drin, Buttons weg
    const updated = (await prisma.discordOutbox.findMany({ where: { type: 'message.post', payload: { path: ['stateKey'], equals: `rwreq-${a.body.id}` } }, orderBy: { createdAt: 'asc' } })).at(-1)!.payload as { message: { embeds: { description: string; color: number }[]; buttons: unknown[] } };
    expect(updated.message.buttons).toEqual([]);
    expect(updated.message.embeds[0]!.description).toContain(`✅ Genehmigt von <@${LEAD_DISCORD}> (rw_lead)`);
    expect(updated.message.embeds[0]!.color).toBe(0x22c55e);
  });
});

describe('Discord-Rollenabgleich', () => {
  const snap = (members: { discordId: string; roleIds: string[] | null; name?: string }[], guildId = G) => http().post('/api/v1/bot/radio-whitelist/roles').set(bot).send({ guildId, members });

  it('Rolle gibt Freigabe, Verlust entzieht sie, Rückkehr stellt sie wieder her; manuelle Freigaben folgen ihrer Regel; Sperren bleiben', async () => {
    const lead = as.rw_lead!;
    expect((await snap([{ discordId: M(50), roleIds: [GRANT_ROLE] }])).body).toMatchObject({ enabled: false });
    expect(await prisma.radioGrant.count({ where: { discordId: M(50) } })).toBe(0);
    expect((await lead.post('/api/v1/radio-whitelist/role-sync/run')).status).toBe(400); // aus
    await lead.put('/api/v1/radio-whitelist/config/roles').send({ roleSync: { enabled: true, grantRoleIds: [GRANT_ROLE], requiredRoleIds: [], onRoleGain: 'ACTIVATE', onRoleLoss: 'REVOKE', manualOnRoleLoss: 'KEEP' }, radioRoleIds: [RADIO_ROLE] }).expect(200);
    expect((await snap([{ discordId: M(50), roleIds: [GRANT_ROLE] }], '870000000000000099')).status).toBe(403); // anderer Server
    expect((await snap([{ discordId: M(50), roleIds: [GRANT_ROLE], name: 'Rollen-Rita' }])).body).toMatchObject({ enabled: true, changed: 1, failed: 0 });
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(50) } })).toMatchObject({ status: 'ACTIVE', source: 'ROLE', discordName: 'Rollen-Rita' });
    expect((await snap([{ discordId: M(50), roleIds: [GRANT_ROLE, OTHER_ROLE] }])).body.changed).toBe(0);
    // Rolle weg → entzogen (archiviert), Rolle zurück → wieder aktiv
    await snap([{ discordId: M(50), roleIds: [OTHER_ROLE] }]);
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(50) } })).toMatchObject({ status: 'REVOKED', roleRevoked: true, archivedAt: expect.any(Date) });
    await snap([{ discordId: M(50), roleIds: [GRANT_ROLE] }]);
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(50) } })).toMatchObject({ status: 'ACTIVE', roleRevoked: false, archivedAt: null });
    // manuell entzogen → keine automatische Rückkehr
    const g50 = (await prisma.radioGrant.findUnique({ where: { discordId: M(50) } }))!;
    await lead.post(`/api/v1/radio-whitelist/grants/${g50.id}/revoke`).send({ reason: 'Disziplinarisch' }).expect(200);
    await snap([{ discordId: M(50), roleIds: [GRANT_ROLE] }]);
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(50) } })).toMatchObject({ status: 'REVOKED' });

    // manuelle Freigabe: KEEP → bleibt; DISABLE → deaktiviert
    const man = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(51), reason: 'manuell' });
    await snap([{ discordId: M(51), roleIds: [] }]);
    expect(await prisma.radioGrant.findUnique({ where: { id: man.body.id } })).toMatchObject({ status: 'ACTIVE' });
    await lead.put('/api/v1/radio-whitelist/config/roles').send({ roleSync: { enabled: true, grantRoleIds: [GRANT_ROLE], requiredRoleIds: [], onRoleGain: 'ACTIVATE', onRoleLoss: 'REVOKE', manualOnRoleLoss: 'DISABLE' }, radioRoleIds: [RADIO_ROLE] }).expect(200);
    await snap([{ discordId: M(51), roleIds: null }]); // Server verlassen
    expect(await prisma.radioGrant.findUnique({ where: { id: man.body.id } })).toMatchObject({ status: 'DISABLED', roleRevoked: true });

    // Sperre wird nie durch Rollen aufgehoben oder verändert
    const sus = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(52), reason: 'x-test' });
    await lead.post(`/api/v1/radio-whitelist/grants/${sus.body.id}/suspend`).send({ reason: 'Sperre' }).expect(200);
    await snap([{ discordId: M(52), roleIds: [] }, { discordId: M(52), roleIds: [GRANT_ROLE] }]);
    expect(await prisma.radioGrant.findUnique({ where: { id: sus.body.id } })).toMatchObject({ status: 'SUSPENDED' });

    // Ziele für den Bot, Abgleich anstoßen, Status
    const t = (await http().get('/api/v1/bot/radio-whitelist/sync-targets').set(bot)).body;
    expect(t).toMatchObject({ enabled: true, guildId: G, roleIds: [GRANT_ROLE] });
    expect(t.discordIds).toEqual(expect.arrayContaining([M(51), M(52)]));
    expect(t.discordIds).not.toContain(M(50)); // manuell entzogen → kein Ziel des Abgleichs mehr
    expect((await lead.post('/api/v1/radio-whitelist/role-sync/run')).status).toBe(202);
    expect(await prisma.discordOutbox.count({ where: { type: 'bot.radio.rolesync' } })).toBe(1);
    expect((await lead.get('/api/v1/radio-whitelist/role-sync')).body.last).toMatchObject({ ok: true });
    expect(await prisma.auditLog.count({ where: { action: { in: ['radio.grant.role_revoked', 'radio.grant.role_restored', 'radio.grant.role_disabled'] } } })).toBe(3);
  });

  it('Fehler beim Abgleich werden je Mitglied protokolliert, ohne den Rest abzubrechen', async () => {
    const orig = svc['applyMember'].bind(svc);
    svc['applyMember'] = async (r, m) => { if (m.discordId === M(60)) throw new Error('DB kaputt'); return orig(r, m); };
    try {
      const r = (await http().post('/api/v1/bot/radio-whitelist/roles').set(bot).send({ guildId: G, full: true, members: [{ discordId: M(60), roleIds: [GRANT_ROLE] }, { discordId: M(61), roleIds: [GRANT_ROLE] }] })).body;
      expect(r).toMatchObject({ checked: 2, changed: 1, failed: 1 });
    } finally { svc['applyMember'] = orig; }
    expect(await prisma.auditLog.count({ where: { action: 'radio.rolesync.failed', result: 'FAILED' } })).toBeGreaterThanOrEqual(2);
    expect((await as.rw_lead!.get('/api/v1/radio-whitelist/role-sync')).body.last).toMatchObject({ ok: false, failed: 1, errors: [expect.stringContaining('DB kaputt')] });
  });
});

describe('Externer Funkdienst', () => {
  const calls: string[] = [];
  let mode: 'ok' | 'badAuth' | 'down' | 'missingUser' = 'ok';
  beforeAll(async () => {
    await prisma.rolePermission.create({ data: { roleId: (await prisma.role.findFirstOrThrow({ where: { name: 'RW Lead' } })).id, permissionKey: 'radiowhitelist.integration', effect: 'ALLOW' } });
    svc.zelloFactory = (c) => ({
      async login() { calls.push(`login:${c.network}:${c.username}`); if (mode === 'badAuth') throw new ZelloError('Benutzername oder Passwort ist falsch (oder der API-Schlüssel passt nicht).', '303'); if (mode === 'down') throw new ZelloError('Der Funkdienst ist nicht erreichbar (Netzwerkname prüfen).'); },
      async logout() { calls.push('logout'); },
      async channelExists(ch) { calls.push(`channel:${ch}`); return ch === 'Polizei'; },
      async addToChannel(ch, l) { calls.push(`add:${ch}:${l.join('|')}`); if (mode === 'missingUser' && l.includes('ghost')) throw new ZelloError('Benutzer oder Kanal existiert im Zello-Work-Netzwerk nicht.', '404'); },
      async removeFromChannel(ch, l) { calls.push(`remove:${ch}:${l.join('|')}`); },
    });
  });
  const cur = async () => (await as.rw_lead!.get('/api/v1/radio-whitelist/integration')).body;

  it('Zugangsdaten nur verschlüsselt und nie in Antworten/Protokoll; Verbindung testen inkl. Fehlern', async () => {
    const lead = as.rw_lead!;
    const i0 = await cur();
    expect(i0).toMatchObject({ provider: 'NONE', status: 'NOT_CONFIGURED', hasPassword: false });
    expect(i0.providers.find((p: { key: string }) => p.key === 'ZELLO_APP')).toMatchObject({ apiSupported: false });
    expect((await lead.put('/api/v1/radio-whitelist/integration').send({ provider: 'ZELLO_WORK', displayName: 'Zello', network: 'bad name!', channel: 'Polizei', adminUsername: 'admin', autoSync: false, version: i0.version })).status).toBe(400);
    expect((await lead.put('/api/v1/radio-whitelist/integration').send({ provider: 'ZELLO_APP', displayName: 'Zello', autoSync: true, version: i0.version })).status).toBe(400); // ohne API kein Auto-Sync
    const saved = await lead.put('/api/v1/radio-whitelist/integration').send({ provider: 'ZELLO_WORK', displayName: 'Zello Work Emden', network: 'enpolizei', channel: 'Polizei', adminUsername: 'admin', password: 'GeheimesPasswort1', apiKey: 'SUPERSECRETAPIKEY', autoSync: true, version: i0.version });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ endpoint: 'https://enpolizei.zellowork.com', hasPassword: true, hasApiKey: true, status: 'NOT_CONFIGURED' });
    const raw = JSON.stringify(saved.body) + JSON.stringify(await cur());
    expect(raw).not.toContain('GeheimesPasswort1');
    expect(raw).not.toContain('SUPERSECRETAPIKEY');
    const row = (await prisma.radioIntegration.findUniqueOrThrow({ where: { id: 'default' } }));
    expect(row.passwordEnc).toMatch(/^v1:/);
    expect(row.passwordEnc).not.toContain('GeheimesPasswort1');
    const audits = JSON.stringify(await prisma.auditLog.findMany({ where: { module: 'radiowhitelist' } }));
    expect(audits).not.toContain('GeheimesPasswort1');
    expect(audits).not.toContain('SUPERSECRETAPIKEY');
    expect((await lead.put('/api/v1/radio-whitelist/integration').send({ provider: 'ZELLO_WORK', displayName: 'X', network: 'enpolizei', autoSync: true, version: 1 })).status).toBe(409); // veraltete Version

    mode = 'badAuth';
    expect((await lead.post('/api/v1/radio-whitelist/integration/test')).body).toMatchObject({ ok: false, message: expect.stringContaining('Passwort') });
    expect(await cur()).toMatchObject({ status: 'ERROR', lastError: expect.stringContaining('Passwort'), lastSuccessAt: null });
    mode = 'down';
    expect((await lead.post('/api/v1/radio-whitelist/integration/test')).body.message).toContain('nicht erreichbar');
    mode = 'ok';
    expect((await lead.post('/api/v1/radio-whitelist/integration/test')).body).toMatchObject({ ok: true });
    expect(await cur()).toMatchObject({ status: 'CONNECTED', lastError: null, lastSuccessAt: expect.any(String) });
    expect(calls).toContain('login:enpolizei:admin');
    expect(await prisma.auditLog.count({ where: { action: 'radio.integration.tested', result: 'FAILED' } })).toBe(2);
  });

  it('Synchronisierung: aktive rein, entzogene raus, fehlende Benutzer einzeln gemeldet, Verbindungsfehler protokolliert', async () => {
    const lead = as.rw_lead!;
    const a = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(70), externalName: 'anna', reason: 'sync' });
    const b = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(71), externalName: 'ghost', reason: 'sync' });
    await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(72), reason: 'ohne Zello-Namen' });
    await new Promise((r) => setTimeout(r, 50)); // automatische Einzel-Synchronisierung (läuft im Hintergrund)
    calls.length = 0;
    mode = 'missingUser';
    const s = (await lead.post('/api/v1/radio-whitelist/integration/sync')).body;
    expect(s).toMatchObject({ ok: false });
    expect(await prisma.radioGrant.findUnique({ where: { id: a.body.id } })).toMatchObject({ externalStatus: 'SYNCED', externalError: null });
    expect(await prisma.radioGrant.findUnique({ where: { id: b.body.id } })).toMatchObject({ externalStatus: 'FAILED', externalError: expect.stringContaining('existiert') });
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(72) } })).toMatchObject({ externalStatus: 'FAILED', externalError: expect.stringContaining('Benutzername') });
    expect(await cur()).toMatchObject({ lastSyncStatus: 'PARTIAL' });
    mode = 'ok';
    // Entzug → sofort (automatische Synchronisierung) aus dem Kanal entfernt
    calls.length = 0;
    await lead.post(`/api/v1/radio-whitelist/grants/${a.body.id}/revoke`).send({ reason: 'Austritt' }).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.startsWith('remove:Polizei:') && c.includes('anna'))).toBe(true);
    expect(await prisma.radioGrant.findUnique({ where: { id: a.body.id } })).toMatchObject({ externalStatus: 'NONE' });
    // Funkdienst nicht erreichbar → Fehler gespeichert, Status ERROR, nichts als synchron markiert
    mode = 'down';
    const f = (await lead.post('/api/v1/radio-whitelist/integration/sync')).body;
    expect(f).toMatchObject({ ok: false, message: expect.stringContaining('nicht erreichbar') });
    expect(await cur()).toMatchObject({ status: 'ERROR', lastSyncStatus: 'ERROR' });
    expect(await prisma.auditLog.count({ where: { action: 'radio.sync.failed' } })).toBeGreaterThanOrEqual(2);
    expect(await prisma.auditLog.count({ where: { action: 'radio.sync.success' } })).toBeGreaterThanOrEqual(1);
    mode = 'ok';
  });

  it('ohne API (Zello-App): keine automatische Synchronisierung, stattdessen manuelle Aufgabenliste und CSV', async () => {
    const lead = as.rw_lead!;
    const i = await cur();
    await lead.put('/api/v1/radio-whitelist/integration').send({ provider: 'ZELLO_APP', displayName: 'Zello Kanal EN Polizei', autoSync: false, version: i.version }).expect(200);
    const i2 = await cur();
    expect(i2).toMatchObject({ provider: 'ZELLO_APP', status: 'MANUAL', apiSupported: false, hasPassword: false, hasApiKey: false }); // Zugangsdaten verworfen
    expect((await lead.post('/api/v1/radio-whitelist/integration/sync')).status).toBe(503);
    expect((await lead.post('/api/v1/radio-whitelist/integration/test')).status).toBe(503);
    const g = await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(80), externalName: 'zello_berta', reason: 'manuell' });
    expect((await prisma.radioGrant.findUnique({ where: { id: g.body.id } }))!.externalStatus).toBe('MANUAL');
    expect((await lead.get('/api/v1/radio-whitelist/summary')).body.manualTodo).toBeGreaterThanOrEqual(1);
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${g.body.id}/external-done`)).body).toMatchObject({ externalStatus: 'MANUAL_DONE' });
    expect((await lead.post(`/api/v1/radio-whitelist/grants/${g.body.id}/external-done`)).status).toBe(409);
  });
});

describe('CSV-Export und -Import', () => {
  it('Export mit Schutz vor Formeln; Import legt an/ergänzt, ändert nie Status, Probelauf ändert nichts', async () => {
    const lead = as.rw_lead!;
    await lead.post('/api/v1/radio-whitelist/grants').send({ discordId: M(90), discordName: '=HYPERLINK("x")', externalName: 'csv_a', reason: 'Export' }).expect(201);
    const e = await lead.get('/api/v1/radio-whitelist/export').query({ status: 'all' });
    expect(e.headers['content-type']).toContain('text/csv');
    expect(e.text.startsWith('﻿discord_id,discord_name,external_name,status')).toBe(true);
    expect(e.text).toContain(`${M(90)},"'=HYPERLINK(""x"")",csv_a,ACTIVE`);

    const csv = `discord_id;discord_name;external_name;rank;expires_at;reason\n${M(90)};;csv_neu;PHM;;\n${M(91)};Import Ida;ida_z;PM;2099-12-31;Import\nkeine-id;x;;;;\n${M(91)};doppelt;;;;\n${M(92)};Alt;;;2001-01-01;`;
    const dry = (await lead.post('/api/v1/radio-whitelist/import').send({ csv, dryRun: true })).body;
    expect(dry).toMatchObject({ created: 1, updated: 1, dryRun: true });
    expect(dry.errors.map((x: { line: number }) => x.line)).toEqual([4, 5, 6]);
    expect(await prisma.radioGrant.count({ where: { discordId: M(91) } })).toBe(0);
    const real = (await lead.post('/api/v1/radio-whitelist/import').send({ csv, dryRun: false })).body;
    expect(real).toMatchObject({ created: 1, updated: 1 });
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(91) } })).toMatchObject({ status: 'ACTIVE', discordName: 'Import Ida', externalName: 'ida_z', expiresAt: expect.any(Date) });
    expect(await prisma.radioGrant.findUnique({ where: { discordId: M(90) } })).toMatchObject({ externalName: 'csv_neu', rank: 'PHM', status: 'ACTIVE' });
    expect((await lead.post('/api/v1/radio-whitelist/import').send({ csv: 'name\nx', dryRun: true })).status).toBe(400);
    expect((await as.rw_view!.post('/api/v1/radio-whitelist/import').send({ csv, dryRun: true })).status).toBe(403);
  });
});

describe('Protokoll', () => {
  it('zeigt wer was wann geändert hat und ist nicht änder- oder löschbar', async () => {
    const logs = (await as.rw_lead!.get('/api/v1/radio-whitelist/logs').query({ pageSize: 200 })).body;
    const actions = new Set(logs.items.map((l: { action: string }) => l.action));
    for (const a of ['radio.grant.created', 'radio.grant.revoked', 'radio.grant.suspended', 'radio.grant.unsuspended', 'radio.request.approved', 'radio.request.rejected', 'radio.config.roles', 'radio.config.requests', 'radio.integration.updated', 'radio.sync.success', 'radio.sync.failed']) expect(actions.has(a), a).toBe(true);
    expect(logs.items.find((l: { action: string }) => l.action === 'radio.grant.suspended')).toMatchObject({ actorName: expect.any(String) });
    // es gibt keine Route zum Bearbeiten/Löschen, und die Datenbank verweigert es selbst
    expect((await as.rw_admin!.delete(`/api/v1/radio-whitelist/logs/${logs.items[0].id}`)).status).toBe(404);
    await expect(prisma.auditLog.deleteMany({ where: { module: 'radiowhitelist' } })).rejects.toThrow();
    await expect(prisma.auditLog.updateMany({ where: { module: 'radiowhitelist' }, data: { reason: 'manipuliert' } })).rejects.toThrow();
    // kein Löschen von Freigaben über die API
    const any = (await prisma.radioGrant.findFirstOrThrow()).id;
    expect((await as.rw_admin!.delete(`/api/v1/radio-whitelist/grants/${any}`)).status).toBe(404);
  });
});

describe('Dauerhafte Speicherung und Neustart', () => {
  it('nach einem Neustart sind alle Daten da; verpasste Abläufe werden nachgeholt', async () => {
    const before = { grants: await prisma.radioGrant.count(), requests: await prisma.radioRequest.count(), integration: await prisma.radioIntegration.findUniqueOrThrow({ where: { id: 'default' } }), config: (await as.rw_lead!.get('/api/v1/radio-whitelist/config')).body };
    const g = await as.rw_lead!.post('/api/v1/radio-whitelist/grants').send({ discordId: M(99), reason: 'vor Neustart', expiresAt: new Date(Date.now() + day).toISOString() });
    await prisma.radioGrant.update({ where: { id: g.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); // läuft während der „Ausfallzeit“ ab
    await app.close();
    ({ app, prisma } = await createTestApp()); // neue Instanz, gleiche Datenbank (Seed läuft erneut)
    svc = app.get(RadioWhitelistService);
    expect(await prisma.radioGrant.count()).toBe(before.grants + 1);
    expect(await prisma.radioRequest.count()).toBe(before.requests);
    expect(await prisma.radioIntegration.findUniqueOrThrow({ where: { id: 'default' } })).toEqual(before.integration);
    const lead = (await login(app, 'rw_lead')).agent;
    expect((await lead.get('/api/v1/radio-whitelist/config')).body).toEqual(before.config);
    expect(await svc.tick()).toMatchObject({ expired: 1 });
    expect(await prisma.radioGrant.findUnique({ where: { id: g.body.id } })).toMatchObject({ status: 'EXPIRED' });
  });
});
