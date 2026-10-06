import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { customFieldsConfig } from '../studio/custom-fields';
import { ACCENTS } from '../studio/studio.service';

const formField = z.object({ key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: z.string().min(1).max(300), required: z.boolean(), maxLength: z.number().int().min(1).max(5000) });
/** Eine oder mehrere Discord-IDs, mit Komma getrennt (z. B. Channels auf mehreren Servern). */
const singleId = () => z.string().regex(/^\d{15,25}$/).optional();
const idList = () => z.string().regex(/^\d{15,25}(\s*,\s*\d{15,25})*$/).optional();
/** Nur bekannte Settings-Keys mit striktem Schema werden akzeptiert. */
export const SETTING_SCHEMAS = {
  'org.name': z.string().min(1).max(100),
  'org.serverName': z.string().min(1).max(100),
  'org.timezone': z.string().min(3).max(64),
  'org.dateFormat': z.enum(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']),
  'retention.sessionDays': z.number().int().min(1).max(365),
  'retention.loginHistoryDays': z.number().int().min(30).max(3650),
  'retention.readNotificationDays': z.number().int().min(7).max(3650),
  'dashboard.defaultLayout': z.array(z.object({ widget: z.string().max(40), visible: z.boolean(), order: z.number().int() })).max(50),
  'studio.customFields': customFieldsConfig,
  'theme.accent': z.enum(ACCENTS),
  'discord.channels': z.object({ guildId: idList(), dispatch: idList(), wanted: idList(), announcements: idList(), applications: idList(), danger: idList(), sek: idList(), qualifications: idList(), duty: idList(), teamlist: singleId(), tickets: singleId(), staffRole: singleId(), radioRole: singleId(), sekRole: singleId(), dutyRole: idList(), breakRole: idList(), trainingRole: idList(), adminDutyRole: idList() }),
  'team.rankOrder': z.array(z.string().trim().min(1).max(64)).max(50),
  'application.form': z.array(formField).min(1).max(50),
  /** „Mit Discord anmelden“: neue Konten erlauben, nur Mitglieder des Discord-Servers, Discord-Rolle → Systemrolle. */
  'auth.discord': z.object({
    signup: z.boolean(), requireGuild: z.boolean(),
    roleMap: z.array(z.object({ discordRoleId: z.string().regex(/^\d{15,25}$/), role: z.string().trim().min(1).max(64) })).max(50),
  }),
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async getSettings() {
    const rows = await this.prisma.systemSetting.findMany();
    return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), allowedKeys: Object.keys(SETTING_SCHEMAS) };
  }

  async setSetting(actor: Actor, key: string, value: unknown) {
    const schema = SETTING_SCHEMAS[key as SettingKey];
    if (!schema) throw new AppError('VALIDATION_FAILED', `Unknown setting "${key}".`);
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Invalid setting value.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const row = await tx.systemSetting.upsert({ where: { key }, create: { key, value: parsed.data as Prisma.InputJsonValue }, update: { value: parsed.data as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: /^(application|dashboard|studio|theme|discord|team)\./.test(key) ? 'studio.config.changed' : 'settings.changed', module: 'settings', entityType: 'SystemSetting', entityId: key, before: before?.value, after: row.value }, tx);
      return { key, value: row.value };
    });
  }

  securityEvents(take = 100, type?: string) {
    return this.prisma.securityEvent.findMany({ where: type ? { type } : {}, orderBy: { createdAt: 'desc' }, take, select: { id: true, type: true, userId: true, ip: true, detail: true, requestId: true, createdAt: true } });
  }

  async getLayout(userId: string) {
    const [mine, def] = await Promise.all([this.prisma.userSettings.findUnique({ where: { userId } }), this.prisma.systemSetting.findUnique({ where: { key: 'dashboard.defaultLayout' } })]);
    return { layout: mine?.dashboardLayout ?? def?.value ?? null, isDefault: !mine?.dashboardLayout };
  }

  async setLayout(actor: Actor, layout: unknown[] | null) {
    const userId = actor.userId!;
    const parsed = layout === null ? null : SETTING_SCHEMAS['dashboard.defaultLayout'].parse(layout);
    await this.prisma.userSettings.upsert({ where: { userId }, create: { userId, dashboardLayout: parsed ?? Prisma.DbNull }, update: { dashboardLayout: parsed ?? Prisma.DbNull } });
    return this.getLayout(userId); // null = Layout zurücksetzen
  }

  /** Aufbewahrung: löscht nur operative Hilfsdaten. AuditLog ist per DB-Trigger unlöschbar und wird hier bewusst NICHT angefasst. */
  async runRetention(actor: Actor) {
    const get = async (k: SettingKey, d: number) => (((await this.prisma.systemSetting.findUnique({ where: { key: k } }))?.value as number | undefined) ?? d);
    const days = (n: number) => new Date(Date.now() - n * 86_400_000);
    const [sess, hist, notif] = await Promise.all([get('retention.sessionDays', 30), get('retention.loginHistoryDays', 365), get('retention.readNotificationDays', 90)]);
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.deleteMany({ where: { OR: [{ expiresAt: { lt: days(sess) } }, { revokedAt: { lt: days(sess) } }] } });
      const logins = await tx.loginHistory.deleteMany({ where: { createdAt: { lt: days(hist) } } });
      await tx.discordOutbox.deleteMany({ where: { OR: [{ sentAt: { lt: days(7) } }, { attempts: { gte: 5 }, createdAt: { lt: days(7) } }] } });
      const notifications = await tx.notification.deleteMany({ where: { OR: [{ readAt: { lt: days(notif) } }, { archivedAt: { lt: days(notif) } }] } });
      const result = { sessions: sessions.count, loginHistory: logins.count, notifications: notifications.count };
      await this.audit.record(actor, { action: 'retention.run', module: 'settings', after: result }, tx);
      return result;
    });
  }
}
