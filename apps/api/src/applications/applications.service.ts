import { hireEvents } from '../common/hire-events';
import { settingsGuild } from '../common/guild-context';
import { TeamChanceService } from '../teamchance/teamchance.service';
import { NotifyService } from '../notifications/notify.service';
import { Injectable } from '@nestjs/common';
import { APPLICATION_TRANSITIONS, ApplicationStatus, checkAnswer, isValidRobloxUserId, type FormField } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { webUrl } from '../common/web-url';
import { policeSchema } from '../qualifications/qualifications.config';
import { cooldownLeft, decisionMessage, decisionRoles, LEFT_ACTOR, LEFT_REASON, submitRoles } from '../qualifications/decision';
import { RobloxService } from '../persons/roblox.service';
import { formatMinutes } from '@enrp/shared';

export type { FormField };
/** Die Beschriftungen sind zugleich die Fragen, die der Discord-Bot per Direktnachricht stellt. */
export const DEFAULT_FORM: FormField[] = [
  { key: 'experience', label: 'Welche Erfahrung hast du im Polizei-Roleplay (auch auf anderen Servern)?', required: true, maxLength: 2000 },
  { key: 'availability', label: 'Wann und wie oft kannst du aktiv sein?', required: true, maxLength: 500 },
  { key: 'motivation', label: 'Warum möchtest du zur EN Polizei?', required: true, maxLength: 3000 },
  { key: 'roleplayKnowledge', label: 'Was bedeutet für dich gutes Roleplay?', required: true, maxLength: 3000 },
  { key: 'erlcKnowledge', label: 'Wie gut kennst du ER:LC (Steuerung, Fahrzeuge, Regeln)?', required: false, maxLength: 3000 },
  { key: 'communication', label: 'Wie gehst du im Funk und mit Kollegen mit Konflikten um?', required: false, maxLength: 2000 },
];
const OPEN_STATUSES = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly notify: NotifyService, private readonly teamchance: TeamChanceService, private readonly roblox: RobloxService) {}

  /** Formular eines Servers (`application.form@<guildId>`), sonst das gemeinsame. */
  async form(guildId?: string | null): Promise<FormField[]> {
    const g = settingsGuild(guildId);
    const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `application.form@${g}` } }) : null;
    const s = own ?? await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
    return (s?.value as unknown as FormField[] | undefined) ?? DEFAULT_FORM;
  }

  /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
  async submit(d: { robloxUsername: string; robloxUserId?: string; answers: Record<string, string | string[]> }, meta: { discordId?: string; discordName?: string; durationSec?: number; joinedAt?: Date; guildId?: string } = {}) {
    if (d.robloxUserId && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Ungültige Roblox-Benutzer-ID.');
    const [form, police] = await Promise.all([this.form(meta.guildId), this.police(meta.guildId)]);
    if (!police.enabled) throw new AppError('CONFLICT', 'Bewerbungen sind derzeit geschlossen.');
    await this.teamchance.assertApplicationsAllowed(meta.guildId ?? null); // Team-Chance: ggf. nur während offener Phase
    const answers: Record<string, string> = {};
    const grantRoleIds = new Set<string>();
    for (const f of form) {
      const r = checkAnswer(f, d.answers[f.key]);
      if (!r.ok) throw new AppError('VALIDATION_FAILED', r.error);
      let text = r.text;
      // Frage „Roblox User“: Konto muss es bei Roblox geben; gespeichert mit richtiger Schreibweise + ID
      if (f.type === 'ROBLOX' && text) {
        const rb = await this.roblox.verifyName(text);
        if (rb === null) throw new AppError('VALIDATION_FAILED', `Den Roblox-Benutzer „${text}“ gibt es nicht.`);
        if (rb) {
          text = `${rb.name} (ID ${rb.id})`;
          if (!d.robloxUserId) d = { ...d, robloxUsername: rb.name, robloxUserId: rb.id };
        }
      }
      if (text) answers[f.key] = text;
      r.roleIds.forEach((x) => grantRoleIds.add(x));
    }
    if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
      throw new AppError('CONFLICT', 'Für diesen Roblox-Benutzer gibt es schon eine offene Bewerbung.');
    }
    if (meta.discordId && (await this.openForDiscord(meta.discordId)).open) throw new AppError('CONFLICT', 'Für dieses Discord-Konto gibt es schon eine offene Bewerbung.');
    if (meta.discordId) {
      const last = await this.prisma.application.findFirst({ where: { discordId: meta.discordId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const wait = cooldownLeft(police.settings, last?.createdAt);
      if (wait) throw new AppError('CONFLICT', `Du kannst dich erst in ${formatMinutes(wait)} erneut bewerben.`);
    }
    const a = await this.prisma.application.create({ data: { number: makeNumber('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, grantRoleIds: [...grantRoleIds], guildId: meta.guildId ?? null, discordId: meta.discordId, discordName: meta.discordName, durationSec: meta.durationSec, joinedAt: meta.joinedAt, source: meta.discordId ? 'DISCORD' : 'WEB' } });
    // 🔔 Neue Bewerbung → alle, die Bewerbungen prüfen dürfen (im Server der Bewerbung)
    await this.notify.notifyPermission('applications.review', { type: 'APPLICATION', title: `🔔 Neue Bewerbung ${a.number}`, body: `${d.robloxUsername}${meta.discordName ? ` · ${meta.discordName}` : ''}`, entityType: 'Application', entityId: a.id }, { guildId: meta.guildId ?? null });
    await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
    await this.discord.enqueue('applications', 'application.submitted', {
      id: a.id, pingRoleIds: police.pingRoleIds, ...(police.channelId ? { channelId: police.channelId } : {}), guildName: meta.guildId ? (await this.discord.guilds()).find((g) => g.id === meta.guildId)?.name ?? null : null, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId ?? null, discordId: meta.discordId ?? null, discordName: meta.discordName ?? null, source: a.source,
      answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })),
      durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: webUrl(`/applications/${a.id}`),
      ...(police.settings.staffThreads ? { thread: true } : {}),
    }, { always: !!police.channelId });
    const roles = submitRoles(police.settings);
    if (meta.discordId && (roles.add.length || roles.remove.length)) await this.discord.enqueue('applications', 'member.roles', { discordId: meta.discordId, ...roles, reason: `Bewerbung ${a.number}` }, { always: true });
    return { number: a.number, status: a.status };
  }

  /** Einstellungen der Polizei-Bewerbung (Qualifications/Applications → Setup). */
  async police(guildId?: string | null) {
    const g = settingsGuild(guildId);
    const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `qualifications.config@${g}` } }) : null;
    const v = (own ?? await this.prisma.systemSetting.findUnique({ where: { key: 'qualifications.config' } }))?.value as { police?: unknown } | undefined;
    const p = policeSchema.safeParse(v?.police ?? {});
    return p.success ? p.data : policeSchema.parse({});
  }

  /** Entscheidungs-DM mit Text und Rollen aus den Einstellungen. */
  private async decided(actor: Actor, a: { discordId: string | null; number: string; grantRoleIds: string[]; guildId: string | null }, to: 'ACCEPTED' | 'REJECTED', reason: string | null) {
    if (!a.discordId) return;
    const police = await this.police(a.guildId);
    const roles = decisionRoles(police.settings, to === 'ACCEPTED', a.grantRoleIds);
    const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
    const by = !link && actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    const decider = link ? `<@${link.discordId}>` : by?.displayName ?? 'dem Team';
    await this.discord.enqueue('applications', 'application.decided', {
      discordId: a.discordId, status: to, number: a.number, reason, roleIds: roles.add, removeRoleIds: roles.remove,
      message: decisionMessage(police.settings, to === 'ACCEPTED', { applicationName: police.name, number: a.number, decider, applicantId: a.discordId, reason }),
    }, { always: true });
  }

  /** Wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten (nur ohne Original-Nachricht in Discord). */
  private async archive(a: { id: string; number: string; robloxUsername: string; robloxUserId: string | null; discordId: string | null; discordName: string | null; guildId: string | null; answers: unknown; durationSec: number | null; joinedAt: Date | null; createdAt: Date; source: string }, to: 'ACCEPTED' | 'REJECTED', reason: string | null, decidedByName: string | null) {
    const police = await this.police(a.guildId);
    const channelId = to === 'ACCEPTED' ? police.acceptedChannelId : police.deniedChannelId;
    if (!channelId) return;
    // Gibt es die Bewerbungs-Nachricht in Discord, wird nur sie aktualisiert (markDecided) – keine zweite Nachricht
    if (await this.discord.hasTrackedMessage(`msg-a-${a.id}`)) return;
    const form = await this.form(a.guildId);
    const answers = (a.answers ?? {}) as Record<string, string>;
    await this.discord.enqueue('applications', 'application.archived', {
      id: a.id, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId, discordId: a.discordId, discordName: a.discordName, source: a.source,
      answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })), durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
      status: to, reason, decidedByName, channelId, guildName: a.guildId ? (await this.discord.guilds()).find((g) => g.id === a.guildId)?.name ?? null : null,
    }, { always: true });
  }

  /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
  async openForDiscord(discordId: string) {
    const a = await this.prisma.application.findFirst({ where: { discordId, status: { in: OPEN_STATUSES } }, select: { number: true } });
    return { open: !!a, number: a?.number ?? null };
  }

  async openTicket(actor: Actor, id: string) {
    return this.discord.applicantTicket(actor, { ...(await this.get(id)), unitName: 'EN Polizei' }, 'Application');
  }

  /** Bisherige Bewerbungen einer Discord-ID (Button „Verlauf“). */
  history(discordId: string) {
    return this.prisma.application.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, status: true, createdAt: true, decisionReason: true } });
  }

  /**
   * Schnell-Entscheidung aus Discord (Buttons Annehmen/Ablehnen): aus jedem offenen Status direkt angenommen/abgelehnt.
   * `reason` geht – anders als der interne Grund im Web-Workflow – per DM an die Person.
   */
  async discordDecide(actor: Actor, id: string, to: 'ACCEPTED' | 'REJECTED', reason?: string) {
    const after = await this.prisma.$transaction(async (tx) => {
      const a = await tx.application.findUnique({ where: { id } });
      if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
      if (!OPEN_STATUSES.includes(a.status)) throw new AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
      const claimed = await tx.application.updateMany({ where: { id, status: a.status, version: a.version }, data: { status: to, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null, version: { increment: 1 } } });
      if (claimed.count === 0) throw new AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
      await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason: reason || 'Entschieden über Discord' }, tx);
      return { ...a, status: to };
    });
    await this.decided(actor, after, to, reason || null);
    const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    await this.archive(after, to, reason || null, by?.displayName ?? null);
    await this.discord.markDecided('application', id, actor, to, reason || null);
    if (to === 'ACCEPTED') await this.hire(actor, after);
    return { id, number: after.number, status: to, decidedByName: by?.displayName ?? null, reason: reason || null };
  }

  /** Angenommen → Personal-/Dienstnummern-Automatik (Einstellungen → Dienstnummern). */
  private hire(actor: Actor, a: { id: string; number: string; discordId: string | null; discordName: string | null; robloxUsername: string; robloxUserId: string | null }) {
    return hireEvents.accepted(actor, { applicationId: a.id, number: a.number, kind: 'police', discordId: a.discordId, name: a.discordName || a.robloxUsername, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId });
  }

  /** „Action On User Leave“ der Polizei-Bewerbung: offene Bewerbungen einer Person, die den Discord-Server verlassen hat. */
  async memberLeft(guildId: string, discordId: string) {
    const open = await this.prisma.application.findMany({ where: { discordId, status: { in: OPEN_STATUSES }, OR: [{ guildId }, { guildId: null }] }, select: { id: true, guildId: true } });
    let denied = 0, withdrawn = 0;
    for (const a of open) {
      const action = (await this.police(a.guildId)).settings.onLeave;
      if (action === 'DENY') await this.discordDecide(LEFT_ACTOR, a.id, 'REJECTED', LEFT_REASON).then(() => denied++, () => undefined);
      else if (action === 'WITHDRAW') await this.transition(LEFT_ACTOR, a.id, 'WITHDRAWN', LEFT_REASON).then(() => withdrawn++, () => undefined);
    }
    return { denied, withdrawn };
  }

  async list(p: PageQuery, status?: string, guildId?: string) {
    const where = { ...(guildId ? { guildId } : {}), ...(status === 'OPEN' ? { status: { in: OPEN_STATUSES } } : status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { robloxUsername: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.application.count({ where })]);
    // wer entschieden hat (Name) – für die Karten-Ansicht
    const ids = [...new Set(items.map((a) => a.decidedById).filter((x): x is string => !!x))];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return pageResult(items.map((a) => ({ ...a, decidedByName: a.decidedById ? users.get(a.decidedById) ?? '—' : null })), total, p);
  }

  async get(id: string) {
    const a = await this.prisma.application.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
    return a;
  }

  async transition(actor: Actor, id: string, to: ApplicationStatus, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.application.findUnique({ where: { id } });
      if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
      nextStatus(APPLICATION_TRANSITIONS, a.status, to);
      if ((to === 'ACCEPTED' || to === 'REJECTED') && !reason) throw new AppError('VALIDATION_FAILED', 'Bitte eine Begründung angeben.');
      const after = await tx.application.update({ where: { id }, data: { status: to, decidedById: to === 'ACCEPTED' || to === 'REJECTED' ? actor.userId : a.decidedById, ...(to === 'ACCEPTED' || to === 'REJECTED' ? { decidedAt: new Date() } : {}), version: { increment: 1 } } });
      await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason }, tx);
      return after;
    }).then(async (after) => {
      // Entscheidung per Direktnachricht (nur bei Bewerbung über Discord). Der interne Grund wird NICHT mitgeschickt.
      if (to === 'ACCEPTED' || to === 'REJECTED') {
        await this.decided(actor, after, to, null); // der interne Grund aus dem Web bleibt intern
        const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        await this.archive(after, to, null, by?.displayName ?? null); // der interne Grund aus dem Web bleibt intern
      }
      // Discord-Nachricht anpassen (der interne Grund aus dem Web bleibt intern)
      if (to === 'ACCEPTED' || to === 'REJECTED' || to === 'WITHDRAWN') await this.discord.markDecided('application', id, actor, to, to === 'WITHDRAWN' ? reason ?? null : null);
      if (to === 'ACCEPTED') await this.hire(actor, after);
      return after;
    });
  }
}
