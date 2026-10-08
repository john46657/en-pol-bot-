import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { personnelOfServer } from '../common/guild-context';
import { AppError } from '../common/errors';

/** Funk-Freigabe: nur freigegebene Mitglieder gelten als funkberechtigt. Identifikation per Benutzer-ID oder verknüpfter Discord-ID. */
@Injectable()
export class RadioService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  private async resolve(t: { userId?: string; discordId?: string }) {
    const user = t.userId ? await this.prisma.user.findUnique({ where: { id: t.userId } }) : t.discordId ? await this.discord.resolveUser(t.discordId) : null;
    if (!user?.active) throw new AppError('NOT_FOUND', t.discordId ? 'Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft.' : 'Benutzer nicht gefunden.');
    return user;
  }

  async list() {
    const rows = await this.prisma.radioWhitelist.findMany({ orderBy: { createdAt: 'asc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, personnel: personnelOfServer({ callsign: true, rank: true }) } });
    return rows.map((r) => { const u = users.find((x) => x.id === r.userId); return { userId: r.userId, displayName: u?.displayName ?? '—', callsign: u?.personnel[0]?.callsign ?? null, rank: u?.personnel[0]?.rank ?? null, since: r.createdAt }; });
  }

  async check(t: { userId?: string; discordId?: string }) {
    const user = await this.resolve(t);
    return { whitelisted: !!(await this.prisma.radioWhitelist.findUnique({ where: { userId: user.id } })), displayName: user.displayName };
  }

  async add(actor: Actor, t: { userId?: string; discordId?: string }) {
    const user = await this.resolve(t);
    if (await this.prisma.radioWhitelist.findUnique({ where: { userId: user.id } })) throw new AppError('CONFLICT', `${user.displayName} steht schon auf der Funk-Whitelist.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.radioWhitelist.create({ data: { userId: user.id, addedById: actor.userId } });
      await tx.notification.create({ data: { userId: user.id, type: 'RADIO', title: 'Du bist jetzt für den Funk freigegeben' } });
      await this.audit.record(actor, { action: 'radio.add', module: 'team', entityType: 'User', entityId: user.id }, tx);
    });
    return { userId: user.id, displayName: user.displayName, whitelisted: true };
  }

  async remove(actor: Actor, t: { userId?: string; discordId?: string }) {
    const user = await this.resolve(t);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.radioWhitelist.deleteMany({ where: { userId: user.id } });
      if (r.count === 0) throw new AppError('NOT_FOUND', `${user.displayName} steht nicht auf der Funk-Whitelist.`);
      await this.audit.record(actor, { action: 'radio.remove', module: 'team', entityType: 'User', entityId: user.id }, tx);
    });
    return { userId: user.id, displayName: user.displayName, whitelisted: false };
  }
}
