import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * End-to-End über HTTP: die echte Nest-App (alle Module, Guards, Middleware, Filter) gegen die Test-Datenbank.
 * Nur Discord ist ersetzt: OAuth2/REST-Aufrufe (fetch) und der Rollen-Port. Reihenfolge = Nutzerweg im Dashboard.
 */
process.env['NODE_ENV'] = 'test';
process.env['AUTH_SECRET'] = 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
process.env['JWT_ISSUER'] = 'nexus-e2e';
process.env['DISCORD_CLIENT_ID'] = '100000000000000001';
process.env['DISCORD_CLIENT_SECRET'] = 'e2e-client-secret';
process.env['DISCORD_TOKEN'] = 'e2e-bot-token';
process.env['DASHBOARD_URL'] = 'http://localhost:3001';
process.env['API_URL'] = 'http://localhost:3000';

const G = '900000000000330001';
const ADMIN = '900000000000330010';
const OFFICER = '900000000000330011';
const NOBODY = '900000000000330012';
const APPLICANT = '900000000000330013';
const ROLE_ENTRY = '900000000000339001';
const ROLE_HIGHER = '900000000000339002';
const ROLE_ADMIN = '900000000000339003';

// Rollen-Attrappe für Annahme/Beförderung: Discord gibt „ok“, wir halten die Rollen im Speicher.
const memberRoles = new Map<string, Set<string>>();
const dms: Array<{ userId: string }> = [];
const fakePort = () => {
  const driver = {
    getRoleIds: async (u: string) => [...(memberRoles.get(u) ?? [])],
    add: async (u: string, r: string) => void memberRoles.set(u, (memberRoles.get(u) ?? new Set()).add(r)),
    remove: async (u: string, r: string) => void memberRoles.get(u)?.delete(r),
  };
  return {
    sendDm: async (userId: string) => void dms.push({ userId }),
    postMessage: async () => ({ id: '1' }),
    editMessage: async () => undefined,
    roleDriver: () => driver,
  };
};
vi.mock('@nexus/automation', async (orig) => ({ ...(await orig<object>()), restDiscordPort: () => fakePort() }));

// Discord-REST (OAuth2 + Server-Daten) – alles andere (localhost) geht echt durch.
const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('discord.com')) return realFetch(input, init);
  if (url.includes('/oauth2/token')) return json({ access_token: 'user-access-token', token_type: 'Bearer', scope: 'identify guilds', expires_in: 3600, refresh_token: 'r' });
  if (url.endsWith('/users/@me')) return json({ id: ADMIN, username: 'admin', global_name: 'Admin', avatar: null });
  if (url.endsWith('/users/@me/guilds')) return json([{ id: G, name: 'E2E-Server', icon: null, owner: false, permissions: String(0x20) }, { id: '900000000000339999', name: 'Fremd', icon: null, owner: false, permissions: '0' }]);
  if (url.endsWith(`/guilds/${G}/roles`))
    return json([
      { id: G, name: '@everyone', position: 0, permissions: '0', managed: false },
      { id: ROLE_ENTRY, name: 'Anwärter', position: 1, permissions: '0', managed: false },
      { id: ROLE_HIGHER, name: 'Oberkommissar', position: 2, permissions: '0', managed: false },
      { id: ROLE_ADMIN, name: 'Admin', position: 3, permissions: '0', managed: false },
    ]);
  if (url.endsWith('/members/@me')) return json({ user: { id: '900000000000330099' }, roles: [ROLE_ADMIN], nick: null });
  if (url.endsWith(`/guilds/${G}`)) return json({ id: G, name: 'E2E-Server', owner_id: '1', icon: null });
  return json({ message: 'nicht in der Attrappe' }, 404);
});

const { AppModule } = await import('../src/app.module.js');
const { DiscordRolesService } = await import('../src/modules/auth/discord-roles.service.js');
const { HttpExceptionFilter } = await import('../src/common/filters/http-exception.filter.js');
const { prisma } = await import('@nexus/database');
const { signSession } = await import('@nexus/auth');
const { saveRank, createRecord } = await import('@nexus/personnel');
const { saveType, startShift, getOpenShift, createUnit, endShift } = await import('@nexus/shifts');

let app: INestApplication;
let base = '';

/** Verwalter (ADMIN) darf alles, OFFICER/NOBODY gehen durch die zentrale Rechte-Engine. */
const fakeRoles = {
  getMember: async (_g: string, u: string) => ({ isMember: u !== APPLICANT, roleIds: u === ADMIN ? [ROLE_ADMIN] : u === OFFICER ? [ROLE_ENTRY] : [] }),
  getMemberRoles: async () => [],
  getMemberAccess: async (_g: string, u: string) => ({ isOwner: false, isAdmin: u === ADMIN, canManageGuild: u === ADMIN }),
};

const as = (user: string) => ({ 'x-dev-user-id': user, 'content-type': 'application/json' });
async function call(method: string, path: string, user: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    redirect: 'manual',
    headers: { ...(user ? as(user) : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

beforeAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'E2E-Server', settings: { create: {} } } });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DiscordRolesService).useValue(fakeRoles).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});
afterAll(async () => {
  await app?.close();
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Dashboard-Login & Serverauswahl', () => {
  let cookie = '';

  it('ohne Anmeldung: geschützte Routen → 401, Login leitet zu Discord mit state', async () => {
    expect((await call('GET', '/auth/me', null)).status).toBe(401);
    const login = await call('GET', '/auth/discord', null);
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toContain('discord.com');
    expect(login.headers.get('set-cookie')).toContain('nexus_oauth_state');
  });

  it('OAuth2-Callback: falscher state → zurück zum Login; richtiger state → Session-Cookie (httpOnly)', async () => {
    const login = await call('GET', '/auth/discord', null);
    const stateCookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const state = new URL(login.headers.get('location')!).searchParams.get('state')!;
    const bad = await call('GET', `/auth/discord/callback?code=abc&state=falsch`, null, undefined, { cookie: stateCookie });
    expect(bad.headers.get('location')).toContain('/login?error=state');
    const ok = await call('GET', `/auth/discord/callback?code=abc&state=${state}`, null, undefined, { cookie: stateCookie });
    expect(ok.status).toBe(302);
    expect(ok.headers.get('location')).toBe('http://localhost:3001/auth/callback');
    const session = ok.headers.getSetCookie().find((c) => c.startsWith('nexus_session='))!;
    expect(session).toContain('HttpOnly');
    cookie = session.split(';')[0]!;
  });

  it('mit Session-Cookie: /auth/me liefert den Benutzer ohne Access-Token; Serverauswahl zeigt nur berechtigte Server', async () => {
    const me = await call('GET', '/auth/me', null, undefined, { cookie });
    expect(me.status).toBe(200);
    expect(me.data).toMatchObject({ id: ADMIN, username: 'admin' });
    expect(JSON.stringify(me.data)).not.toContain('user-access-token');
    const guilds = await call('GET', '/auth/me/guilds', null, undefined, { cookie });
    expect(guilds.status).toBe(200);
    expect(guilds.data).toEqual([expect.objectContaining({ id: G, botPresent: true, canManage: true })]); // „Fremd“ (ohne Rechte) fehlt
  });

  it('Cookie-Schreibzugriffe brauchen Herkunft + Header (CSRF); mit beidem klappt es, Abmelden löscht das Cookie', async () => {
    expect((await call('POST', '/auth/logout', null, {}, { cookie })).status).toBe(403);
    const out = await call('POST', '/auth/logout', null, {}, { cookie, origin: 'http://localhost:3001', 'x-requested-with': 'nexus' });
    expect(out.status).toBe(201);
    expect(out.headers.getSetCookie().join(';')).toContain('nexus_session=;');
  });

  it('Bearer-Session (z. B. Skript) funktioniert ebenfalls; manipuliertes Token → 401', async () => {
    const token = await signSession({ sub: ADMIN, username: 'admin', avatar: null }, { secret: process.env['AUTH_SECRET']!, issuer: 'nexus-e2e' });
    expect((await call('GET', '/auth/me', null, undefined, { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await call('GET', '/auth/me', null, undefined, { authorization: `Bearer ${token}x` })).status).toBe(401);
  });
});

describe('Health', () => {
  it('/health ist öffentlich, zeigt jede Komponente und enthält keine Geheimnisse; /live antwortet ohne Abhängigkeiten', async () => {
    const r = await call('GET', '/health', null);
    expect(r.status).toBe(200); // Datenbank erreichbar (ohne Redis/Bot/Worker nur „eingeschränkt“)
    expect(Object.keys(r.data.components).sort()).toEqual(['api', 'bot', 'database', 'discord', 'redis', 'workers']);
    expect(r.data.components.database.state).toBe('up');
    expect(['up', 'degraded']).toContain(r.data.status);
    expect(JSON.stringify(r.data)).not.toMatch(/postgres|password|e2e-secret|e2e-bot-token/i);
    expect((await call('GET', '/health/live', null)).data).toEqual({ ok: true });
  });
});

describe('Server-Zugriff & Rollenauswahl', () => {
  it('Nicht-Mitglied und Mitglied ohne Rechte werden serverseitig abgewiesen', async () => {
    expect((await call('GET', `/guilds/${G}/applications`, APPLICANT)).status).toBe(403);
    expect((await call('GET', `/guilds/${G}/applications`, NOBODY)).status).toBe(403);
    expect((await call('GET', `/guilds/${G}/permissions`, NOBODY)).status).toBe(403); // nur Server-Verwalter
  });

  it('Rollenliste kommt von Discord; die Rolle „Anwärter“ erhält Rechte, danach darf OFFICER die Bewerbungen sehen', async () => {
    const roles = await call('GET', `/guilds/${G}/discord/roles`, ADMIN);
    expect(roles.status).toBe(200);
    expect(JSON.stringify(roles.data)).toContain('Oberkommissar');
    const set = await call('PUT', `/guilds/${G}/permissions/${ROLE_ENTRY}`, ADMIN, { permissions: ['applications.view', 'applications.submissions.view', 'operations.view', 'operations.create', 'operations.manage', 'promotions.view'] });
    expect(set.status, JSON.stringify(set.data)).toBe(200);
    expect((await call('GET', `/guilds/${G}/applications`, OFFICER)).status).toBe(200);
    // …aber nichts darüber hinaus
    expect((await call('POST', `/guilds/${G}/applications`, OFFICER, { name: 'X' })).status).toBe(403);
    // Änderung steht im Audit-Log
    const audit = await call('GET', `/guilds/${G}/audit?limit=20`, ADMIN);
    expect(audit.data.items.length).toBeGreaterThan(0);
  });
});

describe('Bewerbung erstellen & abschließen', () => {
  let applicationId = '';
  let submissionId = '';

  it('Bewerbung anlegen (Validierung greift: unbekannte Felder, leerer Name)', async () => {
    expect((await call('POST', `/guilds/${G}/applications`, ADMIN, { name: '' })).status).toBe(400);
    expect((await call('POST', `/guilds/${G}/applications`, ADMIN, { name: 'Polizei', boese: 1 })).status).toBe(400);
    const created = await call('POST', `/guilds/${G}/applications`, ADMIN, { name: 'Polizei', slug: 'polizei' });
    expect(created.status).toBe(201);
    applicationId = created.data.id;
    expect((await call('GET', `/guilds/${G}/applications/${applicationId}`, ADMIN)).data).toMatchObject({ name: 'Polizei' });
    expect((await call('POST', `/guilds/${G}/applications`, ADMIN, { name: 'Polizei', slug: 'polizei' })).status).toBeGreaterThanOrEqual(400); // Slug doppelt
  });

  it('eingereichte Bewerbung (Bot-Weg, Datenbank) → Dashboard annehmen: Status, Benachrichtigung, Verlauf', async () => {
    const version = await prisma.applicationVersion.create({ data: { applicationId, version: 1, questions: [], publishedById: ADMIN } });
    const sub = await prisma.applicationSubmission.create({
      data: { guildId: G, applicationId, versionId: version.id, userId: APPLICANT, usernameSnapshot: 'bewerber', displayNameSnapshot: 'Bewerber', status: 'SUBMITTED', submittedAt: new Date() },
    });
    submissionId = sub.id;
    expect((await call('GET', `/guilds/${G}/submissions`, ADMIN)).data.items.map((x: { id: string }) => x.id)).toContain(submissionId);
    // OFFICER darf ansehen, aber nicht entscheiden
    expect((await call('GET', `/guilds/${G}/submissions/${submissionId}`, OFFICER)).status).toBe(200);
    expect((await call('POST', `/guilds/${G}/submissions/${submissionId}/accept`, OFFICER, {})).status).toBe(403);

    const accepted = await call('POST', `/guilds/${G}/submissions/${submissionId}/accept`, ADMIN, { note: 'Willkommen!' });
    expect(accepted.status).toBe(201);
    expect(await prisma.applicationSubmission.findUniqueOrThrow({ where: { id: submissionId } })).toMatchObject({ status: 'ACCEPTED', reviewerUserId: ADMIN });
    expect(dms.some((d) => d.userId === APPLICANT)).toBe(true);
    // zweite Entscheidung wird abgelehnt (kein Doppel-Abschluss)
    expect((await call('POST', `/guilds/${G}/submissions/${submissionId}/accept`, ADMIN, {})).status).toBe(409);
    expect((await call('GET', `/guilds/${G}/submissions/${submissionId}/history`, ADMIN)).data.length).toBeGreaterThan(0);
  });
});

describe('Schicht, Einsatz und Beförderung', () => {
  let ranks: { entry: string; higher: string };

  it('Schicht starten (Bot-Weg) → im Dashboard sichtbar → Leitung beendet sie; Doppelstart nicht möglich', async () => {
    const type = await saveType(G, { name: 'Streife' }, ADMIN);
    const shift = await startShift({ guildId: G, userId: OFFICER, typeId: type.id, memberRoleIds: [] }, new Date(Date.now() - 90 * 60_000));
    await expect(startShift({ guildId: G, userId: OFFICER, typeId: type.id, memberRoleIds: [] })).rejects.toThrow();
    expect((await getOpenShift(G, OFFICER))?.id).toBe(shift.id);
    const list = await call('GET', `/guilds/${G}/shifts?status=ACTIVE`, ADMIN);
    expect(JSON.stringify(list.data)).toContain(shift.id);
    expect((await call('POST', `/guilds/${G}/shifts/${shift.id}/end`, NOBODY, {})).status).toBe(403);
    const ended = await call('POST', `/guilds/${G}/shifts/${shift.id}/end`, ADMIN, { reason: 'Dienstende' });
    expect(ended.status).toBe(201);
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(row.status).toBe('ENDED');
    expect(row.endedAt).not.toBeNull();
    expect((await call('GET', `/guilds/${G}/shifts/stats`, ADMIN)).status).toBe(200);
  });

  it('Einsatz erstellen → bearbeiten → Status bis Abschluss; Pflichtfelder und Rechte werden geprüft', async () => {
    expect((await call('POST', `/guilds/${G}/operations`, OFFICER, { kind: '', location: '' })).status).toBe(400);
    expect((await call('POST', `/guilds/${G}/operations`, NOBODY, { kind: 'Verkehrsunfall', location: 'A1' })).status).toBe(403);
    const created = await call('POST', `/guilds/${G}/operations`, OFFICER, { kind: 'Verkehrsunfall', location: 'Hauptstraße 1', priority: 'HIGH', description: 'Zwei Fahrzeuge' });
    expect(created.status).toBe(201);
    const id = created.data.id;
    const view = await call('GET', `/guilds/${G}/operations/${id}`, OFFICER);
    expect(view.data.operation).toMatchObject({ kind: 'Verkehrsunfall', location: 'Hauptstraße 1' });
    expect(view.data.events.length).toBeGreaterThan(0);
    // ohne Einheit darf der Einsatz nicht starten; die Einheit braucht einen Beamten im Dienst
    expect((await call('POST', `/guilds/${G}/operations/${id}/status`, OFFICER, { status: 'ACTIVE' })).status).toBe(409);
    const type = await prisma.shiftType.findFirstOrThrow({ where: { guildId: G } });
    const duty = await startShift({ guildId: G, userId: OFFICER, typeId: type.id, memberRoleIds: [] });
    const unit = await createUnit({ guildId: G, userId: OFFICER, callsign: 'Adam 1' });
    expect((await call('POST', `/guilds/${G}/operations/${id}/units`, OFFICER, { unitId: unit.id })).status).toBe(201);
    const status = await call('POST', `/guilds/${G}/operations/${id}/status`, OFFICER, { status: 'ACTIVE' });
    expect(status.status, JSON.stringify(status.data)).toBe(201);
    const done = await call('POST', `/guilds/${G}/operations/${id}/status`, OFFICER, { status: 'COMPLETED', report: 'Unfall aufgenommen', outcome: 'erledigt' });
    expect(done.status, JSON.stringify(done.data)).toBe(201);
    await endShift(G, duty.id, { actorId: OFFICER });
    expect((await call('GET', `/guilds/${G}/operations?open=true`, OFFICER)).data.items.some((o: { id: string }) => o.id === id)).toBe(false);
  });

  it('Beförderung: Antrag → Genehmigung durch Berechtigte; neue Rolle wird vergeben, alte entzogen; Rang ändert sich', async () => {
    ranks = {
      entry: (await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true, discordRoleId: ROLE_ENTRY }, ADMIN)).id,
      higher: (await saveRank(G, { name: 'Oberkommissar', order: 2, discordRoleId: ROLE_HIGHER }, ADMIN)).id,
    };
    await createRecord({ guildId: G, userId: OFFICER, rpName: 'Olaf Offizier', actorId: ADMIN, rankId: ranks.entry });
    memberRoles.set(OFFICER, new Set([ROLE_ENTRY]));
    // ohne Voraussetzungen-Regel ist der Antrag möglich; OFFICER hat promotions.create nicht → 403
    expect((await call('POST', `/guilds/${G}/promotions`, OFFICER, { userId: OFFICER, toRankId: ranks.higher })).status).toBe(403);
    const req = await call('POST', `/guilds/${G}/promotions`, ADMIN, { userId: OFFICER, toRankId: ranks.higher, reason: 'Bewährt' });
    expect(req.status, JSON.stringify(req.data)).toBe(201);
    const id = req.data.id;
    expect((await call('POST', `/guilds/${G}/promotions/${id}/approve`, OFFICER, {})).status).toBe(403);
    const ok = await call('POST', `/guilds/${G}/promotions/${id}/approve`, ADMIN, { reason: 'Glückwunsch' });
    expect(ok.status, JSON.stringify(ok.data)).toBe(201);
    const record = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: OFFICER } });
    expect(record.rankId).toBe(ranks.higher);
    expect([...(memberRoles.get(OFFICER) ?? [])].sort()).toEqual([ROLE_HIGHER]);
    // zweite Genehmigung derselben Anfrage geht nicht
    expect((await call('POST', `/guilds/${G}/promotions/${id}/approve`, ADMIN, {})).status).toBeGreaterThanOrEqual(400);
    expect((await call('GET', `/guilds/${G}/promotions/history/${OFFICER}`, ADMIN)).data.length).toBeGreaterThan(0);
  });

  it('alles Wichtige steht im Audit-Log (Bewerbung, Schicht, Einsatz, Beförderung)', async () => {
    const actions = new Set((await prisma.auditLog.findMany({ where: { guildId: G }, select: { action: true } })).map((a) => a.action));
    const joined = [...actions].join(' ');
    for (const part of ['shift', 'operation', 'promotion', 'role.change']) expect(joined, part).toContain(part);
    // Bewerbungs-Entscheidungen haben ihr eigenes, unveränderliches Ereignisprotokoll
    const events = (await prisma.applicationAuditEvent.findMany({ where: { guildId: G } })).map((e) => e.action).join(' ');
    expect(events).toContain('submission.accepted');
  });
});

describe('Ticket-Einstellungen & Transcript (Dashboard)', () => {
  it('Einstellungen lesen/ändern (nur mit Recht), Validierung → 400, Kategorie mit Kapazität/Farbe/Formular, Auslastung, HTML-Transcript als Download', async () => {
    expect((await call('GET', `/guilds/${G}/tickets/settings`, NOBODY)).status).toBe(403);
    const s = await call('GET', `/guilds/${G}/tickets/settings`, ADMIN);
    expect(s.status).toBe(200);
    expect(s.data).toMatchObject({ claimEnabled: true, deleteAfterMinutes: 10 });
    expect((await call('PUT', `/guilds/${G}/tickets/settings`, ADMIN, { deleteAfterMinutes: -5 })).status).toBe(400);
    expect((await call('PUT', `/guilds/${G}/tickets/settings`, ADMIN, { unbekannt: 1 })).status).toBe(400);
    const saved = await call('PUT', `/guilds/${G}/tickets/settings`, ADMIN, { panelTitle: '🔷 PrinceArmy Ticket-Support', claimExclusive: true, deleteAfterMinutes: 0 });
    expect(saved.data).toMatchObject({ panelTitle: '🔷 PrinceArmy Ticket-Support', claimExclusive: true });

    const cat = await call('PUT', `/guilds/${G}/tickets/categories`, ADMIN, { name: '💻 Technik', description: 'Probleme mit Bot, Website oder Server.', emoji: '💻', color: 0x5865f2, maxOpenTotal: 20, requiredRoleIds: [], formFields: [{ id: 'f0', label: 'Worum geht es?', style: 'paragraph', required: true }] });
    expect(cat.status, JSON.stringify(cat.data)).toBe(200);
    expect(cat.data).toMatchObject({ color: 0x5865f2, maxOpenTotal: 20 });
    expect((await call('PUT', `/guilds/${G}/tickets/categories`, ADMIN, { name: 'X', maxOpenTotal: 0 })).status).toBe(400);
    const loads = await call('GET', `/guilds/${G}/tickets/loads`, ADMIN);
    expect(loads.data.find((l: { id: string }) => l.id === cat.data.id)).toMatchObject({ open: 0, max: 20, percent: 0, level: 'low' });
    // Panel braucht einen Kanal
    expect((await call('POST', `/guilds/${G}/tickets/panel`, ADMIN, {})).status).toBe(400);

    const t = await prisma.ticket.create({ data: { guildId: G, number: 9001, categoryId: cat.data.id, userId: OFFICER, subject: 'x', status: 'CLOSED', closedAt: new Date(), transcriptHtml: '<!doctype html><title>t</title><b>Hi</b>' } });
    expect((await call('GET', `/guilds/${G}/tickets/${t.id}/transcript.html`, NOBODY)).status).toBe(403);
    const dl = await fetch(`${base}/api/v1/guilds/${G}/tickets/${t.id}/transcript.html`, { headers: as(ADMIN) });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-disposition')).toContain('attachment');
    expect(dl.headers.get('content-security-policy')).toContain('sandbox');
    expect(await dl.text()).toContain('<b>Hi</b>');
  });
});

describe('Dashboard-Design (Phase 37)', () => {
  const d = (p = '') => `/guilds/${G}/design${p}`;
  let themeId = '';

  it('wirksames Design: Dashboard-Zugang genügt, ohne Rechte nicht; Verwalter sieht alle Themes', async () => {
    expect((await call('GET', d('/effective'), NOBODY)).status).toBe(403);
    const eff = await call('GET', d('/effective'), OFFICER);
    expect(eff.status).toBe(200);
    expect(eff.data.config.colors.dark.primary).toBe('#5865F2');
    const all = await call('GET', d(), ADMIN);
    expect(all.status).toBe(200);
    expect(all.data.themes.map((t: { name: string }) => t.name)).toContain('Midnight');
    themeId = all.data.themes.find((t: { name: string }) => t.name === 'Purple').id;
  });

  it('Rechte werden serverseitig geprüft: ansehen ≠ bearbeiten', async () => {
    expect((await call('GET', d(), OFFICER)).status).toBe(403);
    const grant = (p: string[]) => call('PUT', `/guilds/${G}/permissions/${ROLE_ENTRY}`, ADMIN, { permissions: ['applications.view', 'operations.view', ...p] });
    expect((await grant(['design.view'])).status).toBe(200);
    expect((await call('GET', d(), OFFICER)).status).toBe(200);
    expect((await call('POST', d('/themes'), OFFICER, { name: 'Verboten' })).status).toBe(403);
    expect((await call('PUT', d('/overrides'), OFFICER, { overrides: { radius: 4 } })).status).toBe(403);
    expect((await grant(['design.view', 'design.edit'])).status).toBe(200);
    expect((await call('POST', d('/themes'), OFFICER, { name: 'Erlaubt' })).status).toBe(201);
  });

  it('Theme duplizieren, bearbeiten, aktivieren; Fehler kommen als 400/404/409 mit Details', async () => {
    const dup = await call('POST', d(`/themes/${themeId}/duplicate`), ADMIN);
    expect(dup.status).toBe(201);
    expect(dup.data.name).toBe('Purple Copy');
    const bad = await call('PUT', d(`/themes/${dup.data.id}`), ADMIN, { config: { colors: { dark: { primary: 'blau' } } } });
    expect(bad.status).toBe(400);
    expect(bad.data.details).toEqual(['colors.dark.primary']);
    expect((await call('PUT', d(`/themes/${dup.data.id}`), ADMIN, { config: { radius: 6 } })).data.version).toBe(2);
    expect((await call('PUT', d(`/themes/${themeId}`), ADMIN, { config: { radius: 6 } })).status).toBe(409); // Vorlage
    expect((await call('POST', d('/themes/gibts-nicht/activate'), ADMIN)).status).toBe(404);
    const act = await call('POST', d(`/themes/${dup.data.id}/activate`), ADMIN);
    expect(act.data.config.radius).toBe(6);
    expect((await call('GET', d('/effective'), OFFICER)).data.themeName).toBe('Purple Copy');
    expect((await call('DELETE', d(`/themes/${dup.data.id}`), ADMIN)).status).toBe(409); // aktiv
    expect((await call('GET', d(`/themes/${dup.data.id}/versions`), ADMIN)).data).toHaveLength(2);
  });

  it('Gesamtes Design zurücksetzen verlangt Bestätigung; Export enthält keine Kennungen', async () => {
    expect((await call('POST', d('/reset'), ADMIN, {})).status).toBe(400);
    expect((await call('POST', d('/reset'), ADMIN, { confirm: true })).data.themeName).toBe('Standard');
    const out = await call('GET', d(`/themes/${themeId}/export`), ADMIN);
    expect(JSON.stringify(out.data)).not.toContain(G);
    const prev = await call('POST', d('/import/preview'), ADMIN, { data: out.data });
    expect(prev.data.name).toBe('Purple');
    expect((await call('POST', d('/import'), ADMIN, { data: { format: 'x' } })).status).toBe(400);
    expect((await call('POST', d('/import'), ADMIN, { data: out.data })).data.name).toBe('Purple (2)');
  });

  it('Änderungen stehen im Audit-Log', async () => {
    const audit = await call('GET', `/guilds/${G}/audit?limit=100`, ADMIN);
    const actions = audit.data.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['design.theme.created', 'design.theme.updated', 'design.theme.activated', 'design.reset']));
  });
});
