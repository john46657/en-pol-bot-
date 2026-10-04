import { auditRepository, prisma } from '@nexus/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AREA_PERMISSIONS, LiveHub, allowedAreas, eventOf, startPublisher, subscribe, type LiveClient, type LiveEvent } from '../src/index.js';

const G = 'livetest-guild';
const REDIS = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 2000) => {
  const t = Date.now();
  while (!cond() && Date.now() - t < ms) await wait(20);
};

beforeAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Live', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Veröffentlichen → Abonnieren über Redis (prozessübergreifend)', () => {
  it('jeder Audit-Eintrag erscheint als schlankes Ereignis ohne Inhalte', async () => {
    const got: LiveEvent[] = [];
    const stopSub = await subscribe(REDIS, (e) => e.guildId === G && got.push(e));
    const stopPub = startPublisher(REDIS);
    await auditRepository.log({ guildId: G, actorId: 'u1', action: 'shift.started', resource: ['Shift', 's1'], after: { geheim: 'nicht weitergeben' } });
    await auditRepository.create({ guildId: G, actorType: 'USER', actorId: 'u1', action: 'ticket.opened', resourceType: 'Ticket', resourceId: 't1', after: { x: 1 } });
    await auditRepository.log({ guildId: G, actorId: 'u1', action: 'irgendwas.unbekanntes', resource: ['X', '1'], after: {} });
    await until(() => got.length >= 2);
    await wait(150);
    expect(got.map((e) => [e.area, e.action, e.resourceId])).toEqual([['shifts', 'shift.started', 's1'], ['tickets', 'ticket.opened', 't1']]);
    expect(JSON.stringify(got)).not.toContain('geheim'); // keine Inhalte im Ereignis
    expect(got[0]!.guildId).toBe(G);
    await stopPub();
    await stopSub();
  });

  it('ein nicht erreichbarer Redis stört die fachliche Aktion nicht', async () => {
    const stop = startPublisher('redis://127.0.0.1:1');
    const row = await auditRepository.log({ guildId: G, actorId: 'u1', action: 'ticket.claimed', resource: ['Ticket', 't2'], after: { ok: true } });
    expect(row.id).toBeTruthy();
    await stop();
  });

  it('Beobachter-Fehler brechen die Aktion nicht ab; Abmelden wirkt', async () => {
    const seen = vi.fn();
    const off = auditRepository.onLog(() => {
      throw new Error('kaputter Beobachter');
    });
    const off2 = auditRepository.onLog(seen);
    await auditRepository.log({ guildId: G, actorId: 'u', action: 'danger.level.set', resource: ['D', '1'], after: {} });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    off2();
    await auditRepository.log({ guildId: G, actorId: 'u', action: 'danger.level.set', resource: ['D', '1'], after: {} });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('Berechtigungen und Verteiler', () => {
  it('allowedAreas: nur Bereiche, für die mindestens ein Recht vorliegt', async () => {
    const has = new Set(['shifts.view', 'tickets.view']);
    const areas = await allowedAreas(async (keys) => keys.some((k) => has.has(k)));
    expect([...areas].sort()).toEqual(['shifts', 'tickets']);
    expect((await allowedAreas(async () => true)).size).toBe(Object.keys(AREA_PERMISSIONS).length);
    expect((await allowedAreas(async () => false)).size).toBe(0);
  });

  const client = (guildId: string, userId: string, areas: string[]): LiveClient & { got: LiveEvent[] } => {
    const got: LiveEvent[] = [];
    return { guildId, userId, areas: new Set(areas), send: (e) => void got.push(e), close: vi.fn(), got };
  };
  const ev = (area: string, guildId = 'g1'): LiveEvent => ({ guildId, area, action: `${area}.x`, resourceType: null, resourceId: null, at: new Date().toISOString() });

  it('verteilt nur an berechtigte Clients desselben Servers', () => {
    const hub = new LiveHub();
    const a = client('g1', 'u1', ['shifts', 'tickets']);
    const b = client('g1', 'u2', ['tickets']);
    const c = client('g2', 'u3', ['shifts']);
    [a, b, c].forEach((x) => hub.add(x));
    expect(hub.dispatch(ev('shifts'))).toBe(1);
    expect(hub.dispatch(ev('tickets'))).toBe(2);
    expect(hub.dispatch(ev('operations'))).toBe(0);
    expect(a.got).toHaveLength(2);
    expect(b.got).toHaveLength(1);
    expect(c.got).toHaveLength(0); // anderer Server
    hub.remove(a);
    expect(hub.dispatch(ev('shifts'))).toBe(0);
    expect(hub.size).toBe(2);
  });
  it('begrenzt Verbindungen je Benutzer; defekte Clients werden entfernt', () => {
    const hub = new LiveHub(2);
    expect(hub.add(client('g1', 'u1', ['shifts']))).toBe(true);
    expect(hub.add(client('g1', 'u1', ['shifts']))).toBe(true);
    expect(hub.add(client('g1', 'u1', ['shifts']))).toBe(false);
    expect(hub.add(client('g1', 'u2', ['shifts']))).toBe(true);
    const broken: LiveClient = { guildId: 'g1', userId: 'u9', areas: new Set(['shifts']), send: () => { throw new Error('zu'); }, close: vi.fn() };
    hub.add(broken);
    hub.dispatch(ev('shifts'));
    expect(hub.size).toBe(3);
  });
  it('begrenzt die Gesamtzahl der Verbindungen; Abmelden gibt Platz frei, doppeltes Entfernen zählt nicht doppelt', () => {
    const hub = new LiveHub(8, 3);
    const cs = [1, 2, 3].map((i) => client('g' + i, 'u' + i, ['shifts']));
    cs.forEach((c) => expect(hub.add(c)).toBe(true));
    expect(hub.add(client('g9', 'u9', ['shifts']))).toBe(false);
    hub.remove(cs[0]!);
    hub.remove(cs[0]!);
    expect(hub.size).toBe(2);
    expect(hub.add(client('g9', 'u9', ['shifts']))).toBe(true);
    expect(hub.size).toBe(3);
  });
  it('eventOf ordnet Aktionen Bereichen zu', () => {
    expect(eventOf({ guildId: 'g', action: 'operation.status', resourceType: 'Operation', resourceId: 'o', actorId: 'u', createdAt: new Date('2026-01-01T00:00:00Z') })).toMatchObject({ area: 'operations', at: '2026-01-01T00:00:00.000Z' });
  });
});
