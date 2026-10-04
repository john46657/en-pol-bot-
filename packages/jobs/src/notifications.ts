import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, prisma, type Prisma } from '@nexus/database';
import type { MessagePayload } from '@nexus/discord';

/**
 * Benachrichtigungen mit Warteschlange: `enqueue` legt eine DM oder Kanalnachricht an (Doppelversand über
 * `dedupeKey` ausgeschlossen), `deliver` sendet fällige Einträge mit **Wiederholung und Backoff** (1, 5, 15, 60, 240 Min.,
 * danach FAILED mit Fehlertext). So gehen Erinnerungen auch bei kurzzeitigen Discord-Fehlern nicht verloren – und nie doppelt.
 */
export const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 15, 60, 240];

export interface EnqueueInput {
  guildId: string;
  target: { kind: 'USER' | 'CHANNEL'; id: string };
  kind: string;
  dedupeKey: string;
  payload: MessagePayload;
  at?: Date | undefined;
}

/** @returns `true`, wenn neu angelegt; `false`, wenn es diese Benachrichtigung schon gab. */
export async function enqueue(i: EnqueueInput): Promise<boolean> {
  try {
    await prisma.notification.create({ data: { guildId: assertGuildId(i.guildId), targetKind: i.target.kind, targetId: i.target.id, kind: i.kind, dedupeKey: i.dedupeKey, payload: i.payload as unknown as Prisma.InputJsonValue, ...(i.at ? { nextAttemptAt: i.at } : {}) } });
    return true;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) return false;
    throw e;
  }
}

export interface DeliverResult {
  sent: number;
  retried: number;
  failed: number;
}

export async function deliver(port: DiscordPort, now = new Date(), limit = 100): Promise<DeliverResult> {
  const due = await prisma.notification.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: 'asc' }, take: limit });
  const r: DeliverResult = { sent: 0, retried: 0, failed: 0 };
  for (const n of due) {
    // Beanspruchen: parallele Läufe senden nie doppelt
    const claimed = await prisma.notification.updateMany({ where: { id: n.id, status: 'PENDING', attempts: n.attempts }, data: { attempts: { increment: 1 } } });
    if (claimed.count === 0) continue;
    try {
      const payload = n.payload as unknown as MessagePayload;
      if (n.targetKind === 'USER') await port.sendDm(n.targetId, payload);
      else await port.postMessage(n.targetId, payload);
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: now, lastError: null } });
      r.sent++;
    } catch (e) {
      const attempts = n.attempts + 1;
      const error = e instanceof Error ? e.message.slice(0, 300) : 'Unbekannter Fehler';
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', lastError: error } });
        r.failed++;
      } else {
        await prisma.notification.update({ where: { id: n.id }, data: { lastError: error, nextAttemptAt: new Date(now.getTime() + (BACKOFF_MIN[attempts - 1] ?? 240) * 60_000) } });
        r.retried++;
      }
    }
  }
  return r;
}
