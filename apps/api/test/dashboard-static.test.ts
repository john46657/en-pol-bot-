import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dashboardStatic } from '../src/dashboard-static.js';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base = '';

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexus-dash-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>NEXUS</title>');
  writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
  const app = express();
  for (const h of dashboardStatic(dir)) app.use(h);
  app.get('/api/v1/ping', (_req, res) => void res.json({ api: true }));
  app.use((_req, res) => void res.status(404).send('nicht gefunden'));
  await new Promise<void>((r) => (server = app.listen(0, r)));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => void server.close());

describe('Dashboard aus der API ausliefern (eine Domain)', () => {
  it('Startseite und Routen des Dashboards liefern index.html mit Sicherheits-Headern, ohne Zwischenspeicher', async () => {
    for (const p of ['/', '/guilds/123/wanted', '/auth/callback']) {
      const r = await fetch(base + p);
      expect(r.status, p).toBe(200);
      expect(await r.text()).toContain('<title>NEXUS</title>');
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('x-frame-options')).toBe('DENY');
    }
  });
  it('Dateien aus assets/ sind unveränderlich zwischengespeichert, andere Dateien nicht', async () => {
    const a = await fetch(`${base}/assets/app-abc123.js`);
    expect(a.status).toBe(200);
    expect(a.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/favicon.svg`)).headers.get('cache-control')).toBe('no-cache');
  });
  it('API, Uploads, Doku und Health werden nie durch index.html ersetzt; fehlende Dateien bleiben 404', async () => {
    expect(await (await fetch(`${base}/api/v1/ping`)).json()).toEqual({ api: true });
    for (const p of ['/api/v1/unbekannt', '/uploads/x', '/docs', '/health', '/assets/fehlt.js', '/bild.png']) {
      const r = await fetch(base + p);
      expect(r.status, p).toBe(404);
      expect(await r.text()).not.toContain('<title>NEXUS</title>');
    }
  });
  it('Schreibzugriffe (POST) fallen nie auf index.html zurück', async () => {
    const r = await fetch(`${base}/guilds/1/wanted`, { method: 'POST' });
    expect(r.status).toBe(404);
  });
  it('Ordner ohne index.html wird beim Start abgelehnt; Pfade außerhalb sind nicht erreichbar', async () => {
    expect(() => dashboardStatic(mkdtempSync(path.join(tmpdir(), 'leer-')))).toThrow(/index\.html/);
    const r = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect(r.status).not.toBe(200);
  });
});
