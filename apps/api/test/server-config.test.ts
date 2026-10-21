import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ALL_PERMISSIONS, type ServerConfigData } from '@enrp/shared';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '700000000000000001', B = '700000000000000002';
let app: INestApplication; let prisma: PrismaService;
const uid: Record<string, string> = {}, srv: Record<'A' | 'B', string> = { A: '', B: '' };
const ADMIN = ['servers.view', 'servers.manage', 'modules.view', 'modules.manage', 'reports.*', 'dashboard.view'];
const MEMBER = ['dashboard.view', 'servers.view', 'reports.view', 'reports.create'];

/** Minimal gültige Bilddateien (Kopf genügt für die Prüfung) mit wählbaren Maßen. */
function png(w: number, h: number) {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w: number, h: number) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, ...Array(9).fill(0), 0xff, 0xd9]);
}

async function role(guildId: string, name: string, grants: string[]) {
  const keys = grants.flatMap((g) => (g.endsWith('.*') ? ALL_PERMISSIONS.filter((p) => p.startsWith(g.slice(0, -1))) : [g]));
  return (await prisma.role.create({ data: { guildId, name, priority: 20, permissions: { create: keys.map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) } } })).id;
}
const as = async (n: string) => (await login(app, n)).agent;
const up = (agent: ReturnType<typeof request.agent>, serverId: string, kind: string, buf: Buffer, name = 'bild.png', type = 'image/png') =>
  agent.post(`/api/v1/servers/${serverId}/assets`).field('kind', kind).attach('file', buf, { filename: name, contentType: type });

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  for (const n of ['sc_admina', 'sc_adminb', 'sc_membera', 'sc_outsider']) uid[n] = (await makeUser(prisma, n, [])).id;
  srv.A = (await registerServer(prisma, A, [uid.sc_admina!, uid.sc_membera!], 'Polizei Emden')).id;
  srv.B = (await registerServer(prisma, B, [uid.sc_adminb!], 'Polizei Leer')).id;
  const [adminA, adminB, memberA] = [await role(A, 'Serveradmin', ADMIN), await role(B, 'Serveradmin', ADMIN), await role(A, 'Mitglied', MEMBER)];
  await prisma.userRole.createMany({ data: [{ userId: uid.sc_admina!, roleId: adminA }, { userId: uid.sc_adminb!, roleId: adminB }, { userId: uid.sc_membera!, roleId: memberA }] });
});
afterAll(async () => { await app.close(); });

describe('per-server configuration with branding', () => {
  let logoA = '', cfgA: ServerConfigData;
  it('two servers store different names, logos, colors and modules independently', async () => {
    const a = await as('sc_admina'), b = await as('sc_adminb');
    const ga = (await a.get(`/api/v1/servers/${srv.A}/config`)).body;
    expect(ga.config).toMatchObject({ version: 0, saved: false, data: { general: { displayName: 'Polizei Emden' } } });
    expect(ga.canManage).toBe(true);
    const upload = await up(a, srv.A, 'logo', png(256, 256));
    expect(upload.status).toBe(201);
    logoA = upload.body.id;
    expect(upload.body).toMatchObject({ kind: 'logo', mime: 'image/png', width: 256, height: 256 });
    cfgA = { ...ga.config.data, general: { displayName: 'EN | POLIZEI – STADT EMDEN', shortName: 'EMD', dashboardTitle: 'Leitstelle Emden', welcomeText: 'Willkommen im Dienst!' }, branding: { ...ga.config.data.branding, logo: logoA }, design: { primary: '#0b1f4d', accent: '#3b82f6', mode: 'dark', useBackground: false } };
    const sa = await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: cfgA, version: 0 });
    expect(sa.status).toBe(200);
    expect(sa.body.version).toBe(1);
    const gb = (await b.get(`/api/v1/servers/${srv.B}/config`)).body;
    const logoB = (await up(b, srv.B, 'logo', jpeg(300, 300), 'leer.jpg', 'image/jpeg')).body.id;
    expect((await b.put(`/api/v1/servers/${srv.B}/config`).send({ data: { ...gb.config.data, general: { ...gb.config.data.general, displayName: 'Polizei Leer', shortName: 'LER' }, branding: { ...gb.config.data.branding, logo: logoB }, design: { primary: '#14532d', accent: '#22c55e', mode: 'light', useBackground: false } }, version: 0 })).status).toBe(200);
    // Module unabhängig: B schaltet „Berichte“ aus, A nicht
    const mod = (await b.get(`/api/v1/servers/${srv.B}/modules/reports`)).body;
    expect((await b.patch(`/api/v1/servers/${srv.B}/modules/reports`).send({ enabled: false, version: mod.version })).status).toBe(200);
    // Ergebnis: jeder Server sieht nur seine Werte
    const brandA = (await a.get(`/api/v1/servers/branding/${A}`)).body, brandB = (await b.get(`/api/v1/servers/branding/${B}`)).body;
    expect([brandA.displayName, brandA.design.primary, brandA.images.logo]).toEqual(['EN | POLIZEI – STADT EMDEN', '#0b1f4d', `/api/v1/servers/${srv.A}/assets/${logoA}`]);
    expect([brandB.displayName, brandB.design.mode, brandB.images.logo]).toEqual(['Polizei Leer', 'light', `/api/v1/servers/${srv.B}/assets/${logoB}`]);
    expect((await a.get(`/api/v1/servers/${srv.A}/modules/reports`)).body.enabled).toBe(true);
    expect((await b.get(`/api/v1/servers/${srv.B}/modules/reports`)).body.enabled).toBe(false);
  });

  it('changes on server A never affect server B', async () => {
    const a = await as('sc_admina'), b = await as('sc_adminb');
    const before = (await b.get(`/api/v1/servers/${srv.B}/config`)).body.config;
    const r = await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: { ...cfgA, general: { ...cfgA.general, welcomeText: 'Neuer Text nur für Emden' } }, version: 1 });
    expect(r.body.version).toBe(2);
    const after = (await b.get(`/api/v1/servers/${srv.B}/config`)).body.config;
    expect(after).toEqual(before);
  });

  it('unauthorized users cannot change or read another server; manipulated guild IDs and asset IDs reveal nothing', async () => {
    const member = await as('sc_membera'), out = await as('sc_outsider'), a = await as('sc_admina'), b = await as('sc_adminb');
    // Mitglied ohne servers.manage: lesen ja, ändern nein
    expect((await member.get(`/api/v1/servers/branding/${A}`)).status).toBe(200);
    expect((await member.put(`/api/v1/servers/${srv.A}/config`).send({ data: cfgA, version: 2 })).status).toBe(403);
    expect((await up(member, srv.A, 'logo', png(256, 256))).status).toBe(403);
    // Nichtmitglied bzw. Admin des anderen Servers: wie nicht vorhanden (auch mit gefälschtem X-Guild-Id-Header)
    for (const agent of [out, b]) {
      expect((await agent.get(`/api/v1/servers/${srv.A}/config`).set('X-Guild-Id', B)).status).toBe(404);
      expect((await agent.get(`/api/v1/servers/branding/${A}`).set('X-Guild-Id', B)).status).toBe(404);
      expect((await agent.put(`/api/v1/servers/${srv.A}/config`).set('X-Guild-Id', A).send({ data: cfgA, version: 2 })).status).toBe(404);
      expect((await agent.get(`/api/v1/servers/${srv.A}/assets/${logoA}`)).status).toBe(404);
    }
    // Bild von A über die Adresse von B abrufen bzw. in B's Konfiguration einsetzen → abgelehnt
    expect((await b.get(`/api/v1/servers/${srv.B}/assets/${logoA}`)).status).toBe(404);
    const gb = (await b.get(`/api/v1/servers/${srv.B}/config`)).body.config;
    const steal = await b.put(`/api/v1/servers/${srv.B}/config`).send({ data: { ...gb.data, branding: { ...gb.data.branding, banner: logoA } }, version: gb.version });
    expect(steal.status).toBe(400);
    expect(steal.body.details[0].path).toBe('branding.banner');
    // externe URLs statt eigener Bilder sind nicht möglich
    expect((await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: { ...cfgA, branding: { ...cfgA.branding, logo: 'https://evil.example/logo.png' } }, version: 2 })).status).toBe(400);
    // abgelehnte Zugriffe stehen im Audit
    expect(await prisma.auditLog.count({ where: { result: 'DENIED', serverId: A } })).toBeGreaterThan(0);
  });

  it('uploads are checked for real type, size and dimensions; SVG, disguised files and wrong slots are rejected', async () => {
    const a = await as('sc_admina');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>');
    expect((await up(a, srv.A, 'logo', svg, 'logo.svg', 'image/svg+xml')).body.message).toContain('kein SVG');
    expect((await up(a, srv.A, 'logo', svg, 'logo.png', 'image/png')).status).toBe(400); // getarnt als PNG
    expect((await up(a, srv.A, 'logo', png(256, 256), 'x.jpg', 'image/jpeg')).body.message).toContain('passen nicht'); // falsche Endung
    expect((await up(a, srv.A, 'logo', png(32, 32))).body.message).toContain('zu klein');
    expect((await up(a, srv.A, 'avatar', png(800, 200))).body.message).toContain('Seitenverhältnis');
    expect((await up(a, srv.A, 'banner', Buffer.concat([png(1500, 300), Buffer.alloc(6 * 1024 * 1024)]))).status).toBe(413);
    expect((await up(a, srv.A, '../../etc', png(256, 256))).status).toBe(400);
    const banner = await up(a, srv.A, 'banner', png(1500, 300), '../../../evil name.png');
    expect(banner.status).toBe(201);
    const row = await prisma.serverAsset.findUniqueOrThrow({ where: { id: banner.body.id } });
    expect(row.storageKey).toMatch(/^[0-9a-f-]{36}\.png$/); // zufälliger Name, kein Client-Pfad
    expect(row).toMatchObject({ guildId: A, serverId: srv.A, originalName: 'evil name.png' }); // nur Anzeigename, nie Pfad
    // gleiche Datei erneut → gleiches Bild (keine Doppel)
    expect((await up(a, srv.A, 'banner', png(1500, 300))).body.id).toBe(banner.body.id);
    // Bild im falschen Feld (Banner als Logo)
    expect((await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: { ...cfgA, branding: { ...cfgA.branding, logo: banner.body.id } }, version: 2 })).status).toBe(400);
    const img = await (await as('sc_membera')).get(`/api/v1/servers/${srv.A}/assets/${logoA}`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
  });

  it('replacing an image keeps the old one while a saved version uses it; unused images are removed only after confirmation', async () => {
    const a = await as('sc_admina');
    const newLogo = (await up(a, srv.A, 'logo', png(512, 512))).body.id;
    const r = await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: { ...cfgA, branding: { ...cfgA.branding, logo: newLogo } }, version: 2 });
    expect(r.body.version).toBe(3);
    // altes Logo gehört zu Version 1/2 → bleibt für die Wiederherstellung
    expect((await a.delete(`/api/v1/servers/${srv.A}/assets/${logoA}?confirm=true`)).body.message).toContain('früheren Version');
    expect((await a.delete(`/api/v1/servers/${srv.A}/assets/${newLogo}?confirm=true`)).body.message).toContain('aktuellen Konfiguration');
    const unused = (await up(a, srv.A, 'avatar', png(300, 300))).body.id;
    expect((await a.delete(`/api/v1/servers/${srv.A}/assets/${unused}`)).status).toBe(400); // ohne Bestätigung
    expect((await a.delete(`/api/v1/servers/${srv.A}/assets/${unused}?confirm=true`)).status).toBe(200);
    expect((await a.get(`/api/v1/servers/${srv.A}/assets/${unused}`)).status).toBe(404);
    expect((await prisma.serverAsset.findUniqueOrThrow({ where: { id: unused } })).deletedAt).not.toBeNull(); // Nachweis bleibt
    expect((await (await as('sc_adminb')).delete(`/api/v1/servers/${srv.A}/assets/${newLogo}?confirm=true`)).status).toBe(404);
  });

  it('stale views cannot overwrite newer settings; previous versions can be restored as a new version (incl. modules)', async () => {
    const a = await as('sc_admina'), b = await as('sc_adminb');
    expect((await a.put(`/api/v1/servers/${srv.A}/config`).send({ data: cfgA, version: 1 })).status).toBe(409);
    const revs = (await a.get(`/api/v1/servers/${srv.A}/config/revisions`)).body;
    expect(revs.map((x: { version: number }) => x.version)).toEqual([3, 2, 1]);
    const res = await a.post(`/api/v1/servers/${srv.A}/config/revisions/1/restore`).send({ version: 3, modules: false });
    expect(res.body).toMatchObject({ version: 4, data: { general: { welcomeText: 'Willkommen im Dienst!' }, branding: { logo: logoA } } });
    expect((await a.get(`/api/v1/servers/${srv.A}/config/revisions`)).body[0].note).toBe('Wiederhergestellt aus Version 1');
    // B: Modul-Zustand von damals (Berichte noch an) wiederherstellen
    const rb = (await b.get(`/api/v1/servers/${srv.B}/config/revisions`)).body;
    const cur = (await b.get(`/api/v1/servers/${srv.B}/config`)).body.config.version;
    expect(rb.at(-1).modules.reports).toBe(true);
    const restored = await b.post(`/api/v1/servers/${srv.B}/config/revisions/${rb.at(-1).version}/restore`).send({ version: cur, modules: true });
    expect(restored.body.modulesChanged).toBe(1);
    expect((await b.get(`/api/v1/servers/${srv.B}/modules/reports`)).body.enabled).toBe(true);
    expect((await (await as('sc_membera')).post(`/api/v1/servers/${srv.A}/config/revisions/1/restore`).send({ version: 4, modules: false })).status).toBe(403);
  });

  it('disabling a module hides it but keeps its data; enabling it again shows the same data', async () => {
    const a = await as('sc_admina');
    const rep = await a.post('/api/v1/reports').set('X-Guild-Id', A).send({ type: 'GENERAL', title: 'Bleibt erhalten', content: { text: 'x' } });
    expect(rep.status).toBe(201);
    let m = (await a.get(`/api/v1/servers/${srv.A}/modules/reports`)).body;
    await a.patch(`/api/v1/servers/${srv.A}/modules/reports`).send({ enabled: false, version: m.version });
    expect((await a.get(`/api/v1/reports/${rep.body.id}`).set('X-Guild-Id', A)).status).toBe(403);
    expect(await prisma.report.count({ where: { id: rep.body.id } })).toBe(1);
    m = (await a.get(`/api/v1/servers/${srv.A}/modules/reports`)).body;
    await a.patch(`/api/v1/servers/${srv.A}/modules/reports`).send({ enabled: true, version: m.version });
    expect((await a.get(`/api/v1/reports/${rep.body.id}`).set('X-Guild-Id', A)).body.report.title).toBe('Bleibt erhalten');
  });

  it('the setup wizard progress is stored and can be resumed; completing requires saved settings', async () => {
    const b = await as('sc_adminb');
    const nb = (await registerServer(prisma, '700000000000000003', [uid.sc_adminb!], 'Neuer Server')).id;
    await prisma.userRole.create({ data: { userId: uid.sc_adminb!, roleId: await role('700000000000000003', 'Serveradmin', ADMIN) } });
    expect((await b.post(`/api/v1/servers/${nb}/config/setup`).send({ step: 3 })).body.setupStep).toBe(3);
    expect((await b.post(`/api/v1/servers/${nb}/config/setup`).send({ step: 1 })).body.setupStep).toBe(3); // Fortschritt geht nicht verloren
    expect((await b.post(`/api/v1/servers/${nb}/config/setup`).send({ step: 7, complete: true })).status).toBe(400);
    const g = (await b.get(`/api/v1/servers/${nb}/config`)).body;
    expect(g.config.setupStep).toBe(3);
    expect(g.bot).toMatchObject({ present: false, missing: null }); // Bot hat (im Test) nichts gemeldet – nichts wird angenommen
    expect((await b.put(`/api/v1/servers/${nb}/config`).send({ data: g.config.data, version: g.config.version })).status).toBe(200);
    expect((await b.post(`/api/v1/servers/${nb}/config/setup`).send({ step: 7, complete: true })).body.setupCompletedAt).not.toBeNull();
  });
});

describe('persistence', () => {
  it('settings survive a restart of the application', async () => {
    await app.close();
    ({ app, prisma } = await createTestApp());
    const a = await as('sc_admina');
    const brand = (await a.get(`/api/v1/servers/branding/${A}`)).body;
    expect(brand).toMatchObject({ displayName: 'EN | POLIZEI – STADT EMDEN', configured: true, design: { primary: '#0b1f4d' } });
    expect((await a.get(brand.images.logo)).status).toBe(200);
  });
});
