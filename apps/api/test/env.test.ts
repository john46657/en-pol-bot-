import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/x' };

describe('Port und Adresse der API (Hosting)', () => {
  it('Standard: Port 3000 auf 0.0.0.0', () => {
    expect(loadEnv({ ...base })).toMatchObject({ PORT: 3000, HOST: '0.0.0.0' });
  });
  it('PORT wird verwendet, wenn nur er gesetzt ist', () => {
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });
  it('SERVER_PORT (vom Panel zugewiesen) hat Vorrang vor einem alten PORT', () => {
    expect(loadEnv({ ...base, PORT: '3000', SERVER_PORT: '25025' }).PORT).toBe(25025);
    expect(loadEnv({ ...base, SERVER_PORT: '25025' }).PORT).toBe(25025);
  });
  it('leere Werte gelten als nicht gesetzt (Panel-Variablen ohne Wert)', () => {
    expect(loadEnv({ ...base, PORT: '8080', SERVER_PORT: '' }).PORT).toBe(8080);
  });
  it('ungültige Ports werden abgelehnt', () => {
    for (const bad of ['0', '70000', 'abc', '-1']) expect(() => loadEnv({ ...base, SERVER_PORT: bad }), bad).toThrow();
  });
  it('HOST lässt sich überschreiben', () => {
    expect(loadEnv({ ...base, HOST: '127.0.0.1' }).HOST).toBe('127.0.0.1');
  });
  it('DATABASE_URL ist Pflicht', () => {
    expect(() => loadEnv({})).toThrow();
  });
});
