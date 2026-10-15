import { Injectable } from '@nestjs/common';
import { assertTransition, TICKET_TRANSITIONS, TicketStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { linkPerson } from '../common/links';
import { makeNumber } from '../common/numbering';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { recordSpace } from '../common/guild-context';
import { ErlcService, type ErlcSnapshot } from '../cad/erlc.service';
import { NotifyService } from '../notifications/notify.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly erlc: ErlcService, private readonly notify: NotifyService) {}

  /**
   * Spieler, die gerade auf einem verbundenen ER:LC-Server sind (ohne Polizei/Sheriff) – für „Strafzettel an Spieler im Spiel“.
   * Mit Personenakte (sofern schon vorhanden), Ort und den Kennzeichen ihrer gespawnten Fahrzeuge.
   */
  async erlcPlayers() {
    const servers = await this.prisma.erlcServer.findMany({ where: { active: true }, select: { id: true, name: true, guildId: true, snapshot: true, features: true } });
    const out: { serverId: string; serverName: string; name: string; robloxUserId: string | null; team: string | null; location: string | null; plates: string[]; personId: string | null; canMessage: boolean }[] = [];
    for (const s of servers) {
      const snap = s.snapshot as ErlcSnapshot | null;
      for (const p of snap?.players ?? []) {
        if (['police', 'sheriff'].includes(p.team?.toLowerCase() ?? '')) continue;
        out.push({ serverId: s.id, serverName: s.name, name: p.name, robloxUserId: p.id, team: p.team, location: p.location ? [p.location.street, p.location.postal && `PLZ ${p.location.postal}`].filter(Boolean).join(' · ') || null : null,
          plates: (snap?.vehicles ?? []).filter((v) => v.owner.toLowerCase() === p.name.toLowerCase() && v.plate).map((v) => v.plate!), personId: null, canMessage: s.features.includes('commands') });
      }
    }
    const ids = out.map((p) => p.robloxUserId).filter((x): x is string => !!x);
    const persons = ids.length ? await this.prisma.person.findMany({ where: { status: 'ACTIVE', robloxUserId: { in: ids } }, select: { id: true, robloxUserId: true } }) : [];
    for (const p of out) p.personId = persons.find((x) => x.robloxUserId === p.robloxUserId)?.id ?? null;
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Personenakte zu einem Spieler aus ER:LC finden oder anlegen (wie der automatische Abgleich). */
  private async personForErlc(actor: Actor, p: { serverId: string; name: string }) {
    const srv = await this.prisma.erlcServer.findUnique({ where: { id: p.serverId }, select: { guildId: true, snapshot: true } });
    const player = ((srv?.snapshot as ErlcSnapshot | null)?.players ?? []).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (!srv || !player?.id) throw new AppError('NOT_FOUND', `„${p.name}“ ist gerade nicht im Spiel.`);
    const space = recordSpace(srv.guildId) ?? null;
    const hit = await this.prisma.person.findFirst({ where: { serverId: space, OR: [{ robloxUserId: player.id }, { robloxUsername: { equals: player.name, mode: 'insensitive' } }] } });
    if (hit) return { person: hit, player };
    const person = await this.prisma.$transaction(async (tx) => {
      const c = await tx.person.create({ data: { serverId: space, robloxUsername: player.name, robloxUserId: player.id, notes: 'Automatisch aus ER:LC angelegt (Strafzettel).' } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: c.id, action: 'person.created', summary: 'Personenakte aus ER:LC angelegt', actorId: actor.userId ?? null });
      await this.audit.record(actor, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: c.id, after: { robloxUsername: c.robloxUsername, robloxUserId: c.robloxUserId, source: 'ERLC' } }, tx);
      return c;
    });
    return { person, player };
  }

  /** Strafzettel – entweder für eine Personenakte oder direkt für einen Spieler im Spiel (ER:LC), optional mit Nachricht im Spiel. */
  async issue(actor: Actor, d: { personId?: string; erlcPlayer?: { serverId: string; name: string }; notifyInGame?: boolean; legalCodeId?: string; reason: string; amount?: number; notes?: string; reportId?: string }) {
    let personId = d.personId;
    let target: { serverId: string; name: string } | null = null;
    if (d.erlcPlayer) { const r = await this.personForErlc(actor, d.erlcPlayer); personId = r.person.id; target = { serverId: d.erlcPlayer.serverId, name: r.player.name }; }
    if (!personId) throw new AppError('VALIDATION_FAILED', 'Bitte eine Person oder einen Spieler im Spiel auswählen.');
    const ticket = await this.create(actor, { personId, legalCodeId: d.legalCodeId, reason: d.reason, amount: d.amount, notes: d.notes, reportId: d.reportId });
    // Im Spiel Bescheid geben (ER:LC-Befehl :pm) – ein Fehler hier macht den Strafzettel nicht ungültig
    let inGame: { ok: boolean; message: string } | null = null;
    if (d.notifyInGame) {
      if (!target) {
        const person = await this.prisma.person.findUnique({ where: { id: personId }, select: { robloxUsername: true, robloxUserId: true } });
        const online = (await this.erlcPlayers()).find((p) => (person?.robloxUserId && p.robloxUserId === person.robloxUserId) || p.name.toLowerCase() === person?.robloxUsername.toLowerCase());
        if (online) target = { serverId: online.serverId, name: online.name };
      }
      if (!target) inGame = { ok: false, message: 'Spieler ist gerade nicht im Spiel – keine Nachricht gesendet.' };
      else {
        const amount = Number(ticket.amount);
        const text = `Strafzettel ${ticket.number}: ${d.reason.replace(/[\r\n]+/g, ' ')}${amount ? ` - Betrag ${amount.toLocaleString('de-DE')}` : ''}`.slice(0, 400);
        try { await this.erlc.runCommand(actor, target.serverId, `:pm ${target.name} ${text}`, false); inGame = { ok: true, message: `${target.name} hat im Spiel eine Nachricht bekommen.` }; }
        catch (e) { inGame = { ok: false, message: e instanceof AppError ? `Nachricht im Spiel fehlgeschlagen: ${e.message}` : 'Nachricht im Spiel fehlgeschlagen.' }; }
      }
    }
    if (inGame && actor.userId) await this.notify.notify([actor.userId], { type: 'TICKET_ISSUED', title: `${inGame.ok ? '🎮' : '⚠️'} ${ticket.number}: ${inGame.message}`, entityType: 'Ticket', entityId: ticket.id });
    return { ...ticket, inGame };
  }

  async list(p: PageQuery, personId?: string) {
    const where = { ...(personId ? { personId } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { reason: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({ where, include: { person: { select: { id: true, robloxUsername: true } } }, orderBy: { issuedAt: 'desc' }, ...skipTake(p) }),
      this.prisma.ticket.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const t = await this.prisma.ticket.findUnique({ where: { id }, include: { person: true, legalCode: true } });
    if (!t) throw new AppError('NOT_FOUND', 'Ticket nicht gefunden.');
    return { ticket: t, timeline: await this.timeline.list('Ticket', id) };
  }

  /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
  async create(actor: Actor, d: { personId: string; legalCodeId?: string; reason: string; amount?: number; notes?: string; reportId?: string }) {
    if (!actor.userId) throw new AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
    const officerId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: d.personId } });
      if (!person || person.status !== 'ACTIVE') throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
      let amount = d.amount;
      if (d.legalCodeId) {
        const code = await tx.legalCode.findUnique({ where: { id: d.legalCodeId } });
        const now = new Date();
        if (!code || !code.active || code.effectiveDate > now || (code.expiresAt && code.expiresAt < now)) throw new AppError('VALIDATION_FAILED', 'Dieser Tatbestand ist nicht aktiv.');
        if (amount === undefined) amount = Number((code.penalty as { fine?: number }).fine ?? 0);
      }
      const ticket = await tx.ticket.create({ data: { number: makeNumber('T'), personId: d.personId, officerId, legalCodeId: d.legalCodeId, reason: d.reason, amount: amount ?? 0, notes: d.notes, reportId: d.reportId } });
      await linkPerson(tx, d.personId, 'Ticket', ticket.id, 'SUBJECT');
      await this.timeline.add(tx, { entityType: 'Ticket', entityId: ticket.id, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
      await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
      await this.audit.record(actor, { action: 'ticket.create', module: 'tickets', entityType: 'Ticket', entityId: ticket.id, after: ticket }, tx);
      await tx.notification.create({ data: { userId: officerId, type: 'TICKET_ISSUED', title: `Strafzettel ${ticket.number} ausgestellt`, entityType: 'Ticket', entityId: ticket.id } });
      return ticket;
    });
  }

  async void(actor: Actor, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.ticket.findUnique({ where: { id } });
      if (!t) throw new AppError('NOT_FOUND', 'Ticket nicht gefunden.');
      assertTransition(TICKET_TRANSITIONS, t.status as TicketStatus, 'VOID');
      const after = await tx.ticket.update({ where: { id }, data: { status: 'VOID', voidReason: reason, voidedById: actor.userId, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Ticket', entityId: id, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
      await this.timeline.add(tx, { entityType: 'Person', entityId: t.personId, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'ticket.void', module: 'tickets', entityType: 'Ticket', entityId: id, before: { status: t.status }, after: { status: after.status }, reason }, tx);
      return after;
    });
  }
}
