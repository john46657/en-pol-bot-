import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createTestApp } from './helpers';

let app: INestApplication;
beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'enrp-web-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>ENRP</title><div id=root></div>');
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  process.env.WEB_DIST = dir;
  ({ app } = await createTestApp());
});
afterAll(async () => { delete process.env.WEB_DIST; await app.close(); });

describe('serving the web UI from the API (WEB_DIST)', () => {
  const http = () => request(app.getHttpServer());
  it('serves index and assets, falls back to index for client-side routes', async () => {
    expect((await http().get('/')).text).toContain('<title>ENRP</title>');
    expect((await http().get('/persons/123')).text).toContain('<title>ENRP</title>');
    expect((await http().get('/assets/app.js')).text).toContain('console.log');
  });
  it('does not shadow the API, health endpoints or missing files', async () => {
    const api = await http().get('/api/v1/persons');
    expect(api.status).toBe(401);
    expect(api.body.code).toBe('UNAUTHENTICATED');
    expect((await http().get('/health')).body).toEqual({ status: 'ok' });
    expect((await http().get('/assets/missing.js')).status).toBe(404);
    expect((await http().post('/persons/123').send({})).status).toBe(404); // nur GET-Navigation fällt auf index zurück
  });
});
