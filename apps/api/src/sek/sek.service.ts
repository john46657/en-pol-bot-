import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';

export interface SekTarget { userId?: string; discordId?: string }

/** SEK (Spezialeinsatzkommando): Roster und Einsatzberichte (nur Mitglieder). Bewerbungen laufen über die Qualifikationen. */
@Injectable()
export class SekService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  private async resolve(t: SekTarget) {
    const user = t.userId ? await this.prisma.user.findUnique({ where: { id: t.userId } }) : t.discordId ? await this.discord.resolveUser(t.discordId) : null;
    if (!user?.active) throw new AppError('NOT_FOUND', t.discordId ? 'Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft.' : 'Benutzer nicht gefunden.');
    return user;
  }

  private async people(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true, personnel: { select: { callsign: true, rank: true } } } });
    return new Map(users.map((u) => [u.id, { displayName: u.displayName, callsign: u.personnel?.callsign ?? null, rank: u.personnel?.rank ?? null }]));
  }

  async isMember(userId: string) { return !!(await this.prisma.sekMember.findUnique({ where: { userId } })); }

  async me(userId: string) { return { member: await this.isMember(userId) }; }

  // ---- Roster ----
  async members() {
    const rows = await this.prisma.sekMember.findMany({ orderBy: { createdAt: 'asc' } });
    const p = await this.people(rows.map((r) => r.userId));
    return rows.map((r) => ({ userId: r.userId, ...(p.get(r.userId) ?? { displayName: '—', callsign: null, rank: null }), since: r.createdAt }));
  }

  async addMember(actor: Actor, t: SekTarget) {
    const user = await this.resolve(t);
    if (await this.isMember(user.id)) throw new AppError('CONFLICT', `${user.displayName} ist schon SEK-Mitglied.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.sekMember.create({ data: { userId: user.id, addedById: actor.userId } });
      await tx.notification.create({ data: { userId: user.id, type: 'SEK', title: 'Du bist jetzt Mitglied des SEK' } });
      await this.audit.record(actor, { action: 'sek.member.add', module: 'sek', entityType: 'User', entityId: user.id }, tx);
    });
    return { userId: user.id, displayName: user.displayName, member: true };
  }

  async removeMember(actor: Actor, t: SekTarget) {
    const user = await this.resolve(t);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.sekMember.deleteMany({ where: { userId: user.id } });
      if (r.count === 0) throw new AppError('NOT_FOUND', `${user.displayName} ist kein SEK-Mitglied.`);
      await this.audit.record(actor, { action: 'sek.member.remove', module: 'sek', entityType: 'User', entityId: user.id }, tx);
    });
    return { userId: user.id, displayName: user.displayName, member: false };
  }

  // ---- Einsatzberichte ----
  async reports(limit: number) {
    const rows = await this.prisma.sekReport.findMany({ orderBy: { occurredAt: 'desc' }, take: limit });
    const p = await this.people(rows.map((r) => r.authorId));
    return rows.map((r) => ({ ...r, authorName: p.get(r.authorId)?.displayName ?? '—', authorCallsign: p.get(r.authorId)?.callsign ?? null }));
  }

  async createReport(actor: Actor, d: { occurredAt?: Date; missionType: string; description: string }) {
    const userId = actor.userId!;
    if (!(await this.isMember(userId))) throw new AppError('PERMISSION_DENIED', 'Nur SEK-Mitglieder können SEK-Einsatzberichte schreiben.');
    const r = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.sekReport.create({ data: { number: makeNumber('SEK'), authorId: userId, occurredAt: d.occurredAt ?? new Date(), missionType: d.missionType, description: d.description } });
      await this.audit.record(actor, { action: 'sek.report.create', module: 'sek', entityType: 'SekReport', entityId: rep.id, after: { number: rep.number, missionType: rep.missionType } }, tx);
      return rep;
    });
    const author = (await this.people([userId])).get(userId);
    await this.discord.enqueue('sek', 'sek.report', { number: r.number, missionType: r.missionType, description: r.description, occurredAt: r.occurredAt.toISOString(), author: author?.callsign ?? author?.displayName ?? '—' });
    return r;
  }
}
