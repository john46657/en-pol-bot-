import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';
import { currentGuild, scopedKey } from '../common/guild-context';

const sf = z.string().regex(/^\d{15,25}$/);
export const teamChanceSchema = z.object({
  open: z.boolean(),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  opensAt: z.string().datetime().nullable(),
  closesAt: z.string().datetime().nullable(),
  /** Höchstzahl Bewerbungen in dieser Team-Chance (0 = unbegrenzt) */
  slots: z.number().int().min(0).max(10_000),
  /** Ankündigung beim Öffnen/Schließen in diesen Channel (leer = keine) */
  channelId: sf.nullable(),
  pingRoleIds: z.array(sf).max(10),
  /** Bewerbungen nur während einer offenen Team-Chance annehmen */
  restrictApplications: z.boolean(),
}).refine((c) => !c.opensAt || !c.closesAt || c.opensAt < c.closesAt, 'closesAt must be after opensAt');
export type TeamChanceCfg = z.infer<typeof teamChanceSchema> & { openedAt?: string | null };

export const DEFAULT_TEAMCHANCE: TeamChanceCfg = { open: false, title: 'Team-Chance', description: 'Wir suchen Verstärkung für unser Team! Bewirb dich jetzt.', opensAt: null, closesAt: null, slots: 0, channelId: null, pingRoleIds: [], restrictApplications: false, openedAt: null };
const KEY = 'teamchance';

/**
 * Team-Chance: Die Leitung öffnet/schließt eine Bewerbungsphase für das Team (je Server getrennt), optional mit
 * Zeitfenster und Platzzahl. Beim Öffnen/Schließen: Ankündigung in Discord und Benachrichtigung im Dashboard.
 */
@Injectable()
export class TeamChanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly notify: NotifyService) {}

  async config(guildId: string | null = currentGuild()): Promise<TeamChanceCfg> {
    const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: scopedKey(KEY, guildId) } }) : null;
    const row = own ?? (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }));
    return { ...DEFAULT_TEAMCHANCE, ...((row?.value as Partial<TeamChanceCfg> | undefined) ?? {}) };
  }

  /** Ist die Team-Chance gerade offen? (Schalter + Zeitfenster + freie Plätze) */
  async status(guildId: string | null = currentGuild()) {
    const c = await this.config(guildId);
    const now = new Date();
    const used = c.slots && c.openedAt ? await this.prisma.application.count({ where: { createdAt: { gte: new Date(c.openedAt) }, ...(guildId ? { guildId } : {}) } }) : 0;
    const reason = !c.open ? 'closed' : c.opensAt && now < new Date(c.opensAt) ? 'not_started' : c.closesAt && now >= new Date(c.closesAt) ? 'ended' : c.slots && used >= c.slots ? 'full' : null;
    return { ...c, isOpen: !reason, reason, used, remaining: c.slots ? Math.max(0, c.slots - used) : null };
  }

  /** Für Bewerbungen: wenn eingestellt, nur während einer offenen Team-Chance. */
  async assertApplicationsAllowed(guildId: string | null) {
    const s = await this.status(guildId);
    if (s.restrictApplications && !s.isOpen) {
      throw new AppError('CONFLICT', s.reason === 'not_started' ? `Die Team-Chance startet am ${new Date(s.opensAt!).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.` : s.reason === 'full' ? 'Die Team-Chance ist voll – alle Plätze sind vergeben.' : 'Bewerbungen sind nur während einer Team-Chance möglich – derzeit ist keine offen.');
    }
  }

  async save(actor: Actor, input: z.infer<typeof teamChanceSchema>) {
    const guildId = currentGuild();
    const before = await this.config(guildId);
    const openedNow = input.open && !before.open;
    const value: TeamChanceCfg = { ...input, openedAt: openedNow ? new Date().toISOString() : input.open ? before.openedAt ?? new Date().toISOString() : null };
    const key = guildId ? scopedKey(KEY, guildId) : KEY;
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
    await this.audit.record(actor, { action: openedNow ? 'teamchance.opened' : before.open && !input.open ? 'teamchance.closed' : 'teamchance.updated', module: 'teamchance', entityType: 'SystemSetting', entityId: key, before, after: value });
    if (openedNow || (before.open && !input.open)) {
      if (value.channelId) await this.discord.enqueue('announcements', 'teamchance.changed', { open: input.open, title: value.title, description: value.description, closesAt: value.closesAt, slots: value.slots, channelId: value.channelId, pingRoleIds: value.pingRoleIds }, { always: true });
      if (openedNow) await this.notify.notifyPermission('teamchance.view', { type: 'TEAMCHANCE', title: `📣 Team-Chance geöffnet: ${value.title}`, body: value.description.slice(0, 300) }, { guildId, exceptUserId: actor.userId });
    }
    return this.status(guildId);
  }
}
