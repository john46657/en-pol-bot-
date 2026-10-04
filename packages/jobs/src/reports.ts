import type { DiscordPort } from '@nexus/automation';
import { prisma } from '@nexus/database';
import { generate, publish } from '@nexus/reports';
import { periodRange } from '@nexus/shifts';

/** Zeitpunkt „Mittag Berlin“ des Vortags bzw. der Vorwoche – liegt sicher im richtigen Zeitraum. */
export const yesterdayNoon = (now: Date) => new Date(now.getTime() - 24 * 3600_000);
export const lastWeekNoon = (now: Date) => new Date(now.getTime() - 7 * 24 * 3600_000);
const berlin = (now: Date) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return { weekday: p.find((x) => x.type === 'weekday')?.value, hour: Number(p.find((x) => x.type === 'hour')?.value) };
};

/**
 * Tages- und Wochenberichte automatisch: Der **Tagesbericht des Vortags** wird ab 00:05 (Berlin) erzeugt und
 * veröffentlicht, der **Wochenbericht der Vorwoche** zusätzlich montags. Idempotent: Was schon veröffentlicht ist, wird
 * nicht erneut gepostet (jeder Lauf kann gefahrlos wiederholt werden, z. B. nach Ausfall).
 */
export async function dueReports(port: DiscordPort, now = new Date()): Promise<{ generated: number; published: number; skipped: number }> {
  const out = { generated: 0, published: 0, skipped: 0 };
  const guilds = await prisma.guild.findMany({ select: { id: true } });
  const { weekday } = berlin(now);
  const kinds: { kind: 'DAY' | 'WEEK'; on: Date }[] = [{ kind: 'DAY', on: yesterdayNoon(now) }, ...(weekday === 'Mon' ? [{ kind: 'WEEK' as const, on: lastWeekNoon(now) }] : [])];
  for (const g of guilds) {
    for (const k of kinds) {
      const { from } = periodRange(k.kind === 'DAY' ? 'day' : 'week', k.on);
      const existing = from ? await prisma.report.findUnique({ where: { guildId_kind_periodStart: { guildId: g.id, kind: k.kind, periodStart: from } } }) : null;
      if (existing?.messageId) {
        out.skipped++; // schon veröffentlicht – nichts neu berechnen oder posten
        continue;
      }
      const report = await generate(g.id, k.kind, k.on, null);
      out.generated++;
      const r = await publish(g.id, report.id, port);
      if (r.status === 'posted' || r.status === 'edited') out.published++;
    }
  }
  return out;
}
