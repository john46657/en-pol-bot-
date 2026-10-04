import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RestrictionError, assertNotRestricted, blockedMessage, createRestriction, expireDueRestrictions, getActive, listRestrictions, revokeRestriction } from '../src/index.js';

const G = 'restricttest-guild';
const G2 = 'restricttest-guild-2';
const U = '900000000000700001';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof RestrictionError && e.code === code);
const ban = (extra = {}) => createRestriction({ guildId: G, userId: U, type: 'APPLICATION', reason: 'Spam in Bewerbungen', actorId: 'admin', ...extra });
const inMin = (m: number) => new Date(Date.now() + m * 60_000);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [G, G2] } } });
  await prisma.guild.create({ data: { id: G, name: 'Sperren', settings: { create: {} } } });
  await prisma.guild.create({ data: { id: G2, name: 'Zwei', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [G, G2] } } });
  await prisma.$disconnect();
});

describe('Sperren verhängen und prüfen', () => {
  it('Pflichtfelder und Datumsregeln', async () => {
    await err(ban({ userId: 'abc' }), 'invalid');
    await err(ban({ type: 'BOOT' }), 'invalid');
    await err(ban({ reason: 'x' }), 'invalid');
    await err(ban({ reason: 'x'.repeat(301) }), 'invalid');
    await err(ban({ endsAt: new Date(Date.now() - 1000) }), 'invalid'); // Ende in der Vergangenheit
    await err(ban({ startsAt: inMin(60), endsAt: inMin(30) }), 'invalid'); // Ende vor Start
    await err(ban({ endsAt: new Date('x') }), 'invalid');
  });

  it('wirksam ab Start; unbefristet; gesperrt nur für die jeweilige Art und den jeweiligen Server', async () => {
    await ban();
    expect((await getActive(G, U, 'APPLICATION'))?.endsAt).toBeNull();
    expect(await getActive(G, U, 'TICKET')).toBeNull();
    expect(await getActive(G2, U, 'APPLICATION')).toBeNull(); // Servertrennung
    expect(await getActive(G, '900000000000700002', 'APPLICATION')).toBeNull();
    await err(assertNotRestricted(G, U, 'APPLICATION'), 'blocked');
    await assertNotRestricted(G, U, 'TICKET');
    // Startdatum in der Zukunft: noch nicht wirksam
    await createRestriction({ guildId: G, userId: U, type: 'RADIO', reason: 'später', actorId: 'a', startsAt: inMin(60), endsAt: inMin(120) });
    expect(await getActive(G, U, 'RADIO')).toBeNull();
    expect(await getActive(G, U, 'RADIO', inMin(90))).not.toBeNull();
  });

  it('verständliche Meldung mit Ende und Grund', async () => {
    const r = await ban({ endsAt: inMin(60) });
    const m = blockedMessage(r);
    expect(m).toContain('für Bewerbungen gesperrt');
    expect(m).toContain('Spam in Bewerbungen');
    expect(m).toMatch(/bis zum .+ Uhr/);
    expect(blockedMessage({ type: 'TICKET', reason: 'Missbrauch', endsAt: null })).toContain('bis auf Weiteres');
  });
});

describe('Ablauf und Aufheben', () => {
  it('abgelaufene Sperre: EXPIRED, Zugriff wieder frei, Audit „abgelaufen“; nichts doppelt', async () => {
    const r = await ban({ endsAt: inMin(10) });
    expect(await expireDueRestrictions(G, inMin(5))).toEqual({ expired: 0 });
    expect(await expireDueRestrictions(G, inMin(11))).toEqual({ expired: 1 });
    expect(await expireDueRestrictions(G, inMin(12))).toEqual({ expired: 0 });
    const row = await prisma.restriction.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe('EXPIRED');
    expect(row.expiredAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'restriction.expired' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'restriction.created' } })).toBe(1);
  });

  it('ohne Worker-Lauf ist eine abgelaufene Sperre trotzdem nicht mehr wirksam', async () => {
    const r = await ban({ endsAt: inMin(10) });
    await prisma.restriction.update({ where: { id: r.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await getActive(G, U, 'APPLICATION')).toBeNull();
    await assertNotRestricted(G, U, 'APPLICATION');
  });

  it('bei mehreren Sperren bleibt der Zugriff gesperrt, solange eine besteht', async () => {
    const short = await ban({ endsAt: inMin(10) });
    await ban({ endsAt: inMin(500) });
    await prisma.restriction.update({ where: { id: short.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await getActive(G, U, 'APPLICATION')).not.toBeNull();
    await err(assertNotRestricted(G, U, 'APPLICATION'), 'blocked');
  });

  it('Aufheben: Grund Pflicht, nur aktive, Audit; danach frei', async () => {
    const r = await ban();
    await err(revokeRestriction(G, r.id, '', 'a'), 'invalid');
    await err(revokeRestriction(G2, r.id, 'Fehler', 'a'), 'not-found'); // fremder Server
    const done = await revokeRestriction(G, r.id, 'Zu Unrecht verhängt', 'lead');
    expect(done.status).toBe('REVOKED');
    expect(done.revokedBy).toBe('lead');
    await err(revokeRestriction(G, r.id, 'nochmal', 'lead'), 'conflict');
    expect(await getActive(G, U, 'APPLICATION')).toBeNull();
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'restriction.revoked' } })).toBe(1);
  });
});

describe('Liste', () => {
  it('filtert nach Status, Art, Benutzer und Server', async () => {
    const a = await ban();
    await createRestriction({ guildId: G, userId: U, type: 'TICKET', reason: 'Missbrauch', actorId: 'a' });
    await createRestriction({ guildId: G2, userId: U, type: 'TICKET', reason: 'Anderer Server', actorId: 'a' });
    await revokeRestriction(G, a.id, 'erledigt', 'a');
    expect(await listRestrictions({ guildId: G })).toHaveLength(2);
    expect((await listRestrictions({ guildId: G, status: 'ACTIVE' })).map((r) => r.type)).toEqual(['TICKET']);
    expect((await listRestrictions({ guildId: G, type: 'APPLICATION' })).map((r) => r.status)).toEqual(['REVOKED']);
    expect(await listRestrictions({ guildId: G, userId: 'niemand' })).toHaveLength(0);
    expect((await listRestrictions({ guildId: G2 })).map((r) => r.reason)).toEqual(['Anderer Server']);
  });
});
