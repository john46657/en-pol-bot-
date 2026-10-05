import { logForwardRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { forwardAuditLogs } from '../src/index.js';

const G = 'logfwd-guild';
const [CH_TICKETS, CH_ALL] = ['800000000000310001', '800000000000310002'];
const t = (min: number) => new Date(Date.UTC(2026, 9, 5, 12, min));
const entry = (action: string, min: number, extra: object = {}) =>
  prisma.auditLog.create({ data: { guildId: G, actorType: 'USER', actorId: '900000000000310009', action, createdAt: t(min), result: 'success', ...extra } });
const sent = async (channelId: string) => (await prisma.notification.findMany({ where: { guildId: G, kind: 'log.forward', targetId: channelId }, orderBy: { createdAt: 'asc' } })).map((n) => (n.payload as any).embeds[0].title as string);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.logForwardCursor.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Logs', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.logForwardCursor.deleteMany({ where: { guildId: G } });
  await prisma.$disconnect();
});

describe('Log-Weiterleitung', () => {
  it('nur neue Einträge ab Aktivierung, nach Bereich getrennt, nie doppelt', async () => {
    await entry('ticket.closed', 0); // vor der Aktivierung: kein Verlauf
    await logForwardRepository.replace(G, [{ area: 'tickets', channelId: CH_TICKETS, enabled: true }, { area: '*', channelId: CH_ALL, enabled: true }], 'boss', t(5));
    await entry('ticket.claimed', 10, { reason: 'Test' });
    await entry('role.added', 11);
    const r = await forwardAuditLogs(t(20));
    expect(r.queued).toBe(3); // Ticket → 2 Kanäle, Rolle → nur „alle“
    expect(await sent(CH_TICKETS)).toEqual(['Tickets · ticket.claimed']);
    expect((await sent(CH_ALL)).sort()).toEqual(['Rollenänderungen · role.added', 'Tickets · ticket.claimed']);
    expect((await forwardAuditLogs(t(21))).queued).toBe(0); // zweiter Lauf: nichts Neues
    await entry('ticket.closed', 30);
    expect((await forwardAuditLogs(t(31))).queued).toBe(2);
  });

  it('deaktivierte Weiterleitung sendet nichts; Einträge mit gleicher Zeit gehen nicht verloren', async () => {
    await logForwardRepository.replace(G, [{ area: 'tickets', channelId: CH_TICKETS, enabled: false }], 'boss', t(0));
    await entry('ticket.claimed', 10);
    expect((await forwardAuditLogs(t(20))).queued).toBe(0);
    await logForwardRepository.replace(G, [{ area: 'tickets', channelId: CH_TICKETS, enabled: true }], 'boss', t(25));
    await Promise.all([entry('ticket.a', 30), entry('ticket.b', 30), entry('ticket.c', 30)]); // gleicher Zeitstempel
    expect((await forwardAuditLogs(t(40))).queued).toBe(3);
    expect(await sent(CH_TICKETS)).toHaveLength(3);
  });

  it('Inhalte (Vorher/Nachher) werden nicht mitgesendet', async () => {
    await logForwardRepository.replace(G, [{ area: '*', channelId: CH_ALL, enabled: true }], 'boss', t(0));
    await entry('personnel.edit', 10, { before: { geheim: 'A' }, after: { geheim: 'B' } });
    await forwardAuditLogs(t(20));
    const n = await prisma.notification.findFirstOrThrow({ where: { guildId: G, kind: 'log.forward' } });
    expect(JSON.stringify(n.payload)).not.toContain('geheim');
  });
});
