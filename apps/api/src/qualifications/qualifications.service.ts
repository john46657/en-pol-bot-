import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { webUrl } from '../common/web-url';
import { appSettingsSchema, configSchema, DEFAULT_CONFIG, type QualificationConfig } from './qualifications.config';
import { checkAnswer, type FormField } from '@enrp/shared';
import { DEFAULT_FORM } from '../applications/applications.service';
import { cooldownLeft, decisionMessage, decisionRoles, LEFT_ACTOR, LEFT_REASON, submitRoles } from './decision';
import { RobloxService } from '../persons/roblox.service';
import { formatMinutes } from '@enrp/shared';

const KEY = 'qualifications.config';
const FORM_KEY = 'application.form';
export interface Answer { question: string; answer: string | string[] | null }

/**
 * Qualifikations-Bewerbungen (SEK, Flugstaffel, Ausbilder …): Discord-Panel → Fragen per DM → Team entscheidet (Web oder Button im Team-Channel).
 * Bei Annahme: Direktnachricht, optionale Discord-Rolle; für die Einheit `sek` zusätzlich SEK-Roster + System-Rolle „SEK“ (bei verknüpftem Konto).
 */
@Injectable()
export class QualificationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly roblox: RobloxService) {}

  /** Einstellungen eines Servers (`@<guildId>`) – ohne eigene gilt die gemeinsame Grundeinstellung. */
  private keyOf(base: string, guildId?: string | null) { return guildId ? `${base}@${guildId}` : base; }
  private async read(base: string, guildId?: string | null) {
    if (guildId) { const own = await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(base, guildId) } }); if (own) return { value: own.value, own: true }; }
    return { value: (await this.prisma.systemSetting.findUnique({ where: { key: base } }))?.value, own: false };
  }

  async config(guildId?: string | null): Promise<QualificationConfig> {
    const row = await this.read(KEY, guildId);
    const parsed = row.value ? configSchema.safeParse(row.value) : null;
    return parsed?.success ? parsed.data : DEFAULT_CONFIG;
  }

  /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
  async policeForm(guildId?: string | null): Promise<FormField[]> {
    return ((await this.read(FORM_KEY, guildId)).value as unknown as FormField[] | undefined) ?? DEFAULT_FORM;
  }

  /** Alles für „Setup“ an einem Ort; `own` = dieser Server hat eigene Einstellungen. */
  async setup(guildId?: string | null) {
    const own = guildId ? (await this.read(KEY, guildId)).own : true;
    return { ...(await this.config(guildId)), policeForm: await this.policeForm(guildId), own };
  }

  async saveConfig(actor: Actor, input: QualificationConfig & { policeForm?: FormField[] }, guildId?: string | null) {
    const { policeForm, ...c } = input;
    const key = this.keyOf(KEY, guildId), formKey = this.keyOf(FORM_KEY, guildId);
    // eigener Server ohne eigenes Formular: das gemeinsame Formular übernehmen, damit Server-Einstellungen vollständig sind
    const form = policeForm ?? (guildId && !(await this.prisma.systemSetting.findUnique({ where: { key: formKey } })) ? await this.policeForm(null) : undefined);
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value: c as unknown as Prisma.InputJsonValue }, update: { value: c as unknown as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'qualifications.config', module: 'qualifications', entityType: 'SystemSetting', entityId: key, after: { units: c.units.map((u) => u.key), guildId: guildId ?? null } }, tx);
      if (form) {
        await tx.systemSetting.upsert({ where: { key: formKey }, create: { key: formKey, value: form as unknown as Prisma.InputJsonValue }, update: { value: form as unknown as Prisma.InputJsonValue } });
        await this.audit.record(actor, { action: 'studio.config.changed', module: 'settings', entityType: 'SystemSetting', entityId: formKey, after: form as unknown as Prisma.InputJsonValue }, tx);
      }
    });
    return this.setup(guildId);
  }

  /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame Grundeinstellung. */
  async resetGuild(actor: Actor, guildId: string) {
    await this.prisma.systemSetting.deleteMany({ where: { key: { in: [this.keyOf(KEY, guildId), this.keyOf(FORM_KEY, guildId)] } } });
    await this.audit.record(actor, { action: 'qualifications.config.reset', module: 'qualifications', entityType: 'SystemSetting', entityId: this.keyOf(KEY, guildId) });
    return this.setup(guildId);
  }

  /** Für den Bot: läuft für diese Discord-ID schon eine offene Bewerbung (je Einheit)? */
  async openFor(discordId: string, unit?: string) {
    const open = await this.prisma.qualificationApplication.findFirst({ where: { discordId, status: 'OPEN', ...(unit ? { unit } : {}) }, select: { number: true, unitName: true } });
    return { open: !!open, number: open?.number ?? null, unitName: open?.unitName ?? null };
  }

  async submit(d: { unit: string; discordId: string; discordName: string; answers: Answer[]; durationSec?: number; joinedAt?: Date; guildId?: string }) {
    const cfg = await this.config(d.guildId);
    const unit = cfg.units.find((u) => u.key === d.unit);
    if (!unit) throw new AppError('NOT_FOUND', 'Unbekannte Einheit.');
    if (!unit.enabled) throw new AppError('CONFLICT', `Bewerbungen für ${unit.name} sind derzeit geschlossen.`);
    if (d.answers.length !== unit.questions.length) throw new AppError('VALIDATION_FAILED', `Es werden ${unit.questions.length} Antworten erwartet.`);
    // jede Antwort gegen ihre Frage prüfen (Pflicht, Länge, gültige Auswahl); gewählte Rollen merken
    const answers: { question: string; answer: string }[] = [];
    const grantRoleIds = new Set<string>();
    for (const [i, q] of unit.questions.entries()) {
      const r = checkAnswer(q, d.answers[i]?.answer);
      if (!r.ok) throw new AppError('VALIDATION_FAILED', r.error);
      let text = r.text;
      if (q.type === 'ROBLOX' && text) {
        const rb = await this.roblox.verifyName(text);
        if (rb === null) throw new AppError('VALIDATION_FAILED', `Den Roblox-Benutzer „${text}“ gibt es nicht.`);
        if (rb) text = `${rb.name} (ID ${rb.id})`;
      }
      answers.push({ question: q.label, answer: text || '—' });
      r.roleIds.forEach((x) => grantRoleIds.add(x));
    }
    if ((await this.openFor(d.discordId, unit.key)).open) throw new AppError('CONFLICT', `Für ${unit.name} gibt es schon eine offene Bewerbung.`);
    const last = await this.prisma.qualificationApplication.findFirst({ where: { discordId: d.discordId, unit: unit.key }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    const wait = cooldownLeft(unit.settings, last?.createdAt);
    if (wait) throw new AppError('CONFLICT', `Du kannst dich für ${unit.name} erst in ${formatMinutes(wait)} erneut bewerben.`);
    const user = await this.discord.resolveUser(d.discordId);
    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.qualificationApplication.create({ data: { number: makeNumber('Q'), unit: unit.key, unitName: unit.name, discordId: d.discordId, discordName: d.discordName, userId: user?.id, answers: answers as unknown as Prisma.InputJsonValue, grantRoleIds: [...grantRoleIds], guildId: d.guildId ?? null, durationSec: d.durationSec, joinedAt: d.joinedAt } });
      await this.audit.record({ userId: user?.id ?? null }, { action: 'qualifications.application.submit', module: 'qualifications', entityType: 'QualificationApplication', entityId: row.id, after: { number: row.number, unit: unit.key, discordId: d.discordId } }, tx);
      return row;
    });
    // Eigener Channel der Einheit (falls eingestellt) – sonst der allgemeine Qualifications-Channel
    await this.discord.enqueue('qualifications', 'qualification.submitted', {
      id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, linkedName: user?.displayName ?? null, answers, pingRoleIds: unit.pingRoleIds, guildName: d.guildId ? (await this.discord.guilds()).find((g) => g.id === d.guildId)?.name ?? null : null,
      durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: webUrl(`/qualifications?id=${a.id}`),
      ...(unit.channelId ? { channelId: unit.channelId } : {}), ...(unit.settings.staffThreads ? { thread: true } : {}),
    }, { always: !!unit.channelId });
    const roles = submitRoles(unit.settings);
    if (roles.add.length || roles.remove.length) await this.discord.enqueue('qualifications', 'member.roles', { discordId: d.discordId, ...roles, reason: `Bewerbung ${a.number}` }, { always: true });
    return { id: a.id, number: a.number, unitName: a.unitName };
  }

  async list(f: { unit?: string; status?: string; guildId?: string }) {
    const rows = await this.prisma.qualificationApplication.findMany({ where: { ...(f.unit ? { unit: f.unit } : {}), ...(f.status ? { status: f.status } : {}), ...(f.guildId ? { guildId: f.guildId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    const ids = [...new Set(rows.flatMap((r) => [r.userId, r.decidedById]).filter((x): x is string => !!x))];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ ...r, linkedName: r.userId ? users.get(r.userId) ?? null : null, decidedByName: r.decidedById ? users.get(r.decidedById) ?? '—' : null }));
  }

  async get(id: string) {
    const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
    return a;
  }

  async openTicket(actor: Actor, id: string) {
    return this.discord.applicantTicket(actor, await this.get(id), 'QualificationApplication');
  }

  /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
  history(discordId: string) {
    return this.prisma.qualificationApplication.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, unitName: true, status: true, createdAt: true, decisionReason: true } });
  }

  /** „Action On User Leave“: offene Bewerbungen einer Person, die den Discord-Server verlassen hat (Einstellung je Einheit). */
  async memberLeft(guildId: string, discordId: string) {
    const open = await this.prisma.qualificationApplication.findMany({ where: { discordId, status: 'OPEN', OR: [{ guildId }, { guildId: null }] } });
    let denied = 0, withdrawn = 0;
    for (const a of open) {
      const action = (await this.config(a.guildId)).units.find((u) => u.key === a.unit)?.settings.onLeave ?? 'NONE';
      if (action === 'DENY') { await this.decide(LEFT_ACTOR, a.id, 'REJECTED', LEFT_REASON).then(() => denied++, () => undefined); continue; }
      if (action !== 'WITHDRAW') continue;
      const claimed = await this.prisma.$transaction(async (tx) => {
        const r = await tx.qualificationApplication.updateMany({ where: { id: a.id, status: 'OPEN' }, data: { status: 'WITHDRAWN', decidedAt: new Date(), decisionReason: LEFT_REASON } });
        if (r.count) await this.audit.record(LEFT_ACTOR, { action: 'qualifications.application.withdraw', module: 'qualifications', entityType: 'QualificationApplication', entityId: a.id, before: { status: 'OPEN' }, after: { status: 'WITHDRAWN' }, reason: LEFT_REASON }, tx);
        return r.count;
      });
      withdrawn += claimed;
    }
    return { denied, withdrawn };
  }

  async decide(actor: Actor, id: string, status: 'ACCEPTED' | 'REJECTED', reason?: string) {
    const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
    if (a.status !== 'OPEN') throw new AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
    const ownLink = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
    if ((a.userId && a.userId === actor.userId) || ownLink?.discordId === a.discordId) throw new AppError('PERMISSION_DENIED', 'Über deine eigene Bewerbung kannst du nicht entscheiden.');
    const unit = (await this.config(a.guildId)).units.find((u) => u.key === a.unit);
    let addedToSek = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.qualificationApplication.updateMany({ where: { id, status: 'OPEN' }, data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null } });
      if (claimed.count === 0) throw new AppError('CONFLICT', 'Über diese Bewerbung wurde schon entschieden.');
      if (status === 'ACCEPTED' && a.unit === 'sek' && a.userId) {
        await tx.sekMember.upsert({ where: { userId: a.userId }, create: { userId: a.userId, addedById: actor.userId }, update: {} });
        // System-Rolle „SEK“ (Einsatzberichte schreiben), falls vorhanden
        const role = await tx.role.findUnique({ where: { name: 'SEK' } });
        if (role) await tx.userRole.upsert({ where: { userId_roleId: { userId: a.userId, roleId: role.id } }, create: { userId: a.userId, roleId: role.id }, update: {} });
        addedToSek = true;
      }
      if (a.userId) await tx.notification.create({ data: { userId: a.userId, type: 'QUALIFICATION', title: `Deine Bewerbung ${a.number} (${a.unitName}) wurde ${status === 'ACCEPTED' ? 'angenommen' : 'nicht angenommen'}` } });
      await this.audit.record(actor, { action: `qualifications.application.${status === 'ACCEPTED' ? 'accept' : 'reject'}`, module: 'qualifications', entityType: 'QualificationApplication', entityId: id, before: { status: 'OPEN' }, after: { status }, reason }, tx);
    });
    // wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten
    const archive = status === 'ACCEPTED' ? unit?.acceptedChannelId : unit?.deniedChannelId;
    if (archive) {
      const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
      await this.discord.enqueue('qualifications', 'qualification.archived', {
        id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, answers: a.answers, durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(),
        status, reason: reason || null, decidedByName: by?.displayName ?? null, channelId: archive, guildName: a.guildId ? (await this.discord.guilds()).find((g) => g.id === a.guildId)?.name ?? null : null,
      }, { always: true });
    }
    const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    const settings = unit?.settings ?? appSettingsSchema.parse({});
    const roles = decisionRoles(settings, status === 'ACCEPTED', [unit?.roleId, ...a.grantRoleIds]);
    const decider = ownLink ? `<@${ownLink.discordId}>` : by?.displayName ?? 'dem Team';
    await this.discord.enqueue('qualifications', 'qualification.decided', {
      discordId: a.discordId, status, number: a.number, unitName: a.unitName, roleIds: roles.add, removeRoleIds: roles.remove, reason: reason || null,
      message: decisionMessage(settings, status === 'ACCEPTED', { applicationName: a.unitName, number: a.number, decider, applicantId: a.discordId, reason }),
    }, { always: true });
    return { id, number: a.number, unitName: a.unitName, status, addedToSek, decidedByName: by?.displayName ?? null, reason: reason || null };
  }
}
