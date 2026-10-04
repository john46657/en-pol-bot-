import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uploadsMiddleware } from '../src/modules/design/uploads.js';

/** Auslieferung hochgeladener Bilder: nur geprüfte Dateinamen, sichere Header, keine Pfadtricks. */
const dir = mkdtempSync(path.join(tmpdir(), 'nexus-serve-'));
let server: Server;
let base = '';
const GOOD = 'a'.repeat(24);

beforeAll(async () => {
  mkdirSync(path.join(dir, '900000000000000001'), { recursive: true });
  writeFileSync(
    path.join(dir, '900000000000000001', `${GOOD}.webp`),
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer(),
  );
  writeFileSync(path.join(dir, '900000000000000001', 'geheim.txt'), 'nicht ausliefern');
  writeFileSync(path.join(dir, 'top-secret.txt'), 'außerhalb');
  const app = express();
  app.use('/uploads', uploadsMiddleware(dir));
  app.use((_req, res) => res.status(418).end('weiter'));
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Auslieferung /uploads', () => {
  it('liefert ein Bild mit sicheren Headern und langer Zwischenspeicherung', async () => {
    const r = await fetch(`${base}/uploads/900000000000000001/${GOOD}.webp`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(10);
  });
  it('liefert nichts anderes: falsche Namen, andere Endungen, Verzeichnisse, Pfadtricks', async () => {
    for (const p of [
      '/uploads/900000000000000001/geheim.txt',
      '/uploads/900000000000000001/',
      '/uploads/900000000000000001',
      '/uploads/',
      '/uploads/..%2Ftop-secret.txt',
      '/uploads/%2e%2e/top-secret.txt',
      '/uploads/900000000000000001/..%2f..%2ftop-secret.txt',
      `/uploads/900000000000000001/${GOOD}.svg`,
      `/uploads/900000000000000001/${GOOD}.webp/../../x`,
      '/uploads/900000000000000001/%2e%2e',
      `/uploads/900000000000000002/${GOOD}.webp`, // anderer Server: Datei gibt es nicht
    ]) {
      const r = await fetch(`${base}${p}`);
      expect([404, 418], p).toContain(r.status); // 418 = Anfrage erreichte /uploads gar nicht (Pfad vom Client normalisiert)
      expect(await r.text(), p).not.toContain('außerhalb');
    }
  });
  it('nur Lesen: POST/PUT/DELETE abgelehnt', async () => {
    for (const m of ['POST', 'PUT', 'DELETE'])
      expect(
        (await fetch(`${base}/uploads/900000000000000001/${GOOD}.webp`, { method: m })).status,
        m,
      ).toBe(405);
  });
});
