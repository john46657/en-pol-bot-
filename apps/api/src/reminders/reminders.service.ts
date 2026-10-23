import { Injectable } from '@nestjs/common';
import { REMINDER_MAX_MS, REMINDER_MAX_PENDING, REMINDER_MIN_MS, REMINDER_SNOOZE_MINUTES, REMINDER_TEXT_MAX } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';

/** Ab dieser Verspätung (Bot/API waren aus) wird in der Erinnerung vermerkt, dass sie verspätet kommt. */
const LATE_MS = 2 * 60_000;
type Row = Awaited<ReturnType<PrismaService['reminder']['findFirstOrThrow']>>;
const view = (r: Row) => ({ id: r.id, text: r.text, dm: r.dm, dueAt: r.dueAt.toISOString(), status: r.status, fireCount: r.fireCount, channelId: r.channelId, createdAt: r.createdAt.toISOString() });

/**
 * Persönliche Erinnerungen (`/remind-me`). Gespeichert in der Datenbank → überstehen Neustarts von Bot und API.
 * `tick` legt fällige Erinnerungen genau einmal in die Bot-Warteschlange: Statuswechsel PENDING → SENT und Eintrag in die
 * Outbox passieren in einer Transaktion, nur wenn die Zeile noch unverändert ist (auch bei mehreren API-Instanzen).
 * Nach einem Ausfall werden verpasste Erinnerungen einmal (mit Hinweis „verspätet“) zugestellt, nie mehrfach.
 */
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(d: { discordId: string; guildId?: string | null; channelId?: string | null; text: string; dm: boolean; delayMs: number }, now = new Date()) {
    const text = d.text.trim();
    if (!text) throw new AppError('VALIDATION_FAILED', 'Bitte angeben, woran ich dich erinnern soll.');
    if (text.length > REMINDER_TEXT_MAX) throw new AppError('VALIDATION_FAILED', `Der Erinnerungstext darf höchstens ${REMINDER_TEXT_MAX} Zeichen lang sein.`);
    if (!Number.isFinite(d.delayMs) || d.delayMs < REMINDER_MIN_MS || d.delayMs > REMINDER_MAX_MS) throw new AppError('VALIDATION_FAILED', 'Die Zeit muss zwischen 1 Minute und 365 Tagen liegen.');
    // ohne Kanal (Befehl in einer Direktnachricht) bleibt nur die DM
    const dm = d.dm || !d.channelId;
    const dueAt = new Date(now.getTime() + d.delayMs);
    // gleiche Erinnerung kurz hintereinander (doppelt abgeschickt) → die vorhandene zurückgeben
    const dup = await this.prisma.reminder.findFirst({ where: { discordId: d.discordId, status: 'PENDING', text, createdAt: { gte: new Date(now.getTime() - 10_000) }, dueAt: { gte: new Date(dueAt.getTime() - 10_000), lte: new Date(dueAt.getTime() + 10_000) } } });
    if (dup) return { ...view(dup), duplicate: true };
    if ((await this.prisma.reminder.count({ where: { discordId: d.discordId, status: 'PENDING' } })) >= REMINDER_MAX_PENDING) {
      throw new AppError('CONFLICT', `Du hast schon ${REMINDER_MAX_PENDING} offene Erinnerungen. Lösche zuerst eine mit /erinnerungen.`);
    }
    const r = await this.prisma.reminder.create({ data: { discordId: d.discordId, guildId: d.guildId ?? null, channelId: d.channelId ?? null, text, dm, dueAt } });
    return { ...view(r), duplicate: false };
  }

  async list(discordId: string) {
    return (await this.prisma.reminder.findMany({ where: { discordId, status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: REMINDER_MAX_PENDING })).map(view);
  }

  private async own(id: string, discordId: string) {
    const r = await this.prisma.reminder.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Diese Erinnerung gibt es nicht mehr.');
    if (r.discordId !== discordId) throw new AppError('PERMISSION_DENIED', 'Das ist nicht deine Erinnerung.');
    return r;
  }

  async cancel(id: string, discordId: string) {
    await this.own(id, discordId);
    const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!n.count) throw new AppError('CONFLICT', 'Diese Erinnerung ist nicht mehr offen.');
    return { ok: true };
  }

  /**
   * Verschieben (Buttons 10 Min/30 Min/1 Std/1 Tag) bzw. erledigt. `fire` = Auslösung, zu der der Button gehört: nur der
   * erste Klick zählt, weitere (auch auf alten Nachrichten) werden mit Hinweis abgewiesen – keine doppelten Erinnerungen.
   */
  async snooze(id: string, discordId: string, fire: number, minutes: number, now = new Date()) {
    if (!REMINDER_SNOOZE_MINUTES.includes(minutes)) throw new AppError('VALIDATION_FAILED', 'Ungültige Zeit zum Verschieben.');
    const r = await this.own(id, discordId);
    const dueAt = new Date(now.getTime() + minutes * 60_000);
    const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'SENT', fireCount: fire }, data: { status: 'PENDING', dueAt } });
    if (!n.count) throw await this.conflict(id, 'Diese Erinnerung wurde bereits erledigt oder gelöscht.');
    return view({ ...r, status: 'PENDING', dueAt });
  }
  async done(id: string, discordId: string, fire: number) {
    await this.own(id, discordId);
    const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'SENT', fireCount: fire }, data: { status: 'DONE' } });
    if (!n.count) throw await this.conflict(id, 'Diese Erinnerung ist schon erledigt.');
    return { ok: true };
  }

  /** Klick ging ins Leere: mit dem aktuellen Stand erklären (z. B. zweiter, gleichzeitiger Klick). */
  private async conflict(id: string, otherwise: string) {
    const now = await this.prisma.reminder.findUnique({ where: { id }, select: { status: true } });
    return new AppError('CONFLICT', now?.status === 'PENDING' ? 'Diese Erinnerung wurde bereits verschoben.' : otherwise);
  }

  /** Fällige Erinnerungen genau einmal an den Bot übergeben. */
  async tick(now = new Date()) {
    const due = await this.prisma.reminder.findMany({ where: { status: 'PENDING', dueAt: { lte: now } }, orderBy: { dueAt: 'asc' }, take: 200 });
    let sent = 0;
    for (const r of due) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const c = await tx.reminder.updateMany({ where: { id: r.id, status: 'PENDING', fireCount: r.fireCount, dueAt: r.dueAt }, data: { status: 'SENT', sentAt: now, fireCount: { increment: 1 } } });
        if (!c.count) return false;
        const late = now.getTime() - r.dueAt.getTime();
        await tx.discordOutbox.create({ data: { type: 'reminder.due', channelKey: 'reminders', payload: {
          id: r.id, discordId: r.discordId, channelId: r.channelId, dm: r.dm, text: r.text, fire: r.fireCount + 1,
          createdAt: r.createdAt.toISOString(), dueAt: r.dueAt.toISOString(), ...(late >= LATE_MS ? { lateMinutes: Math.round(late / 60_000) } : {}),
        } } });
        return true;
      });
      if (claimed) sent++;
    }
    return { sent };
  }
}
