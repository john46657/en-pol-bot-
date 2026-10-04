import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { METRICS, getWidgetData } from '../src/index.js';

const [A, B] = ['wdtest-a', 'wdtest-b'];
const all = async () => true;
const none = async () => false;
const only =
  (...perms: string[]) =>
  async (p: string) =>
    perms.includes(p);

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  for (const id of [A, B])
    await prisma.guild.create({ data: { id, name: id, settings: { create: {} } } });
  for (const [g, n] of [
    [A, 3],
    [B, 5],
  ] as const) {
    const cat = await prisma.ticketCategory.create({ data: { guildId: g, name: 'Support' } });
    for (let i = 1; i <= n; i++)
      await prisma.ticket.create({
        data: {
          guildId: g,
          number: i,
          categoryId: cat.id,
          userId: '900000000000770001',
          subject: `Ticket ${i}`,
          status: i === n ? 'CLOSED' : 'OPEN',
        },
      });
  }
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
});

describe('Widget-Daten', () => {
  it('ohne Rechte: alles null – keine erfundenen Zahlen', async () => {
    const d = await getWidgetData(A, none);
    expect(Object.values(d.metrics).every((v) => v === null)).toBe(true);
    expect(Object.values(d.charts).every((v) => v === null)).toBe(true);
    expect([d.tickets, d.applications, d.team, d.activity].every((v) => v === null)).toBe(true);
  });
  it('mit allen Rechten: echte Zahlen, nur dieser Server', async () => {
    const a = await getWidgetData(A, all);
    expect(a.metrics.openTickets).toBe(2); // 3 Tickets, eines geschlossen
    expect(a.tickets).toHaveLength(2);
    expect(a.tickets![0]).toMatchObject({ subject: expect.stringContaining('Ticket') });
    expect(a.charts.tickets).toEqual(
      expect.arrayContaining([
        { label: 'OPEN', count: 2 },
        { label: 'CLOSED', count: 1 },
      ]),
    );
    expect(a.metrics.onDuty).toBe(0);
    expect(a.team).toEqual([]);
    const b = await getWidgetData(B, all);
    expect(b.metrics.openTickets).toBe(4); // Server B zählt nur seine eigenen
    expect(JSON.stringify(a)).not.toContain('Ticket 4');
  });
  it('Rechte wirken je Bereich: nur Tickets sichtbar → nur Ticket-Daten', async () => {
    const d = await getWidgetData(A, only(METRICS.openTickets.permission));
    expect(d.metrics.openTickets).toBe(2);
    expect(d.metrics.onDuty).toBeNull();
    expect(d.metrics.pendingSubmissions).toBeNull();
    expect(d.tickets).toHaveLength(2);
    expect(d.applications).toBeNull();
    expect(d.charts.tickets).not.toBeNull();
    expect(d.charts.operations).toBeNull();
    expect(d.activity).toBeNull();
  });
  it('Rechte werden je Schlüssel nur einmal abgefragt', async () => {
    let calls = 0;
    await getWidgetData(A, async () => (calls++, true));
    expect(calls).toBeLessThanOrEqual(8);
  });
});
