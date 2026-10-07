import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_WELCOME_CONFIG, type WelcomeConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { ApplicationsService } from '../applications/applications.service';
import { QualificationsService } from '../qualifications/qualifications.service';
import { SupportTicketsService } from '../support-tickets/tickets.service';
import { MediaService } from '../media/media.service';

const KEY = 'welcome.config';
const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const message = (d: WelcomeConfig['welcome']) => z.object({
  enabled: z.boolean().default(d.enabled),
  channelId: sf.nullish().transform((v) => v ?? null),
  title: z.string().trim().max(256).default(d.title),
  message: z.string().trim().max(4000).default(d.message),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(d.color),
  showAvatar: z.boolean().default(d.showAvatar),
  pingUser: z.boolean().default(d.pingUser),
  image: z.union([z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Bild-URL muss mit https:// beginnen'), z.literal('')]).default(''),
  imageMediaId: z.union([z.string().uuid(), z.literal('')]).default(''),
}).default({});
export const welcomeConfigSchema = z.object({
  welcome: message(DEFAULT_WELCOME_CONFIG.welcome),
  dm: z.object({ enabled: z.boolean().default(false), message: z.string().trim().max(2000).default(DEFAULT_WELCOME_CONFIG.dm.message) }).default({}),
  autoRoleIds: z.array(sf).max(10).default([]),
  goodbye: message(DEFAULT_WELCOME_CONFIG.goodbye),
}).superRefine((c, ctx) => {
  if (c.welcome.enabled && !c.welcome.channelId) ctx.addIssue({ code: 'custom', path: ['welcome', 'channelId'], message: 'Wähle einen Kanal für die Willkommensnachricht.' });
  if (c.goodbye.enabled && !c.goodbye.channelId) ctx.addIssue({ code: 'custom', path: ['goodbye', 'channelId'], message: 'Wähle einen Kanal für die Abschiedsnachricht.' });
});

/** Willkommen & Abschied je Discord-Server (`welcome.config@<guildId>`, sonst die gemeinsame Grundeinstellung) und was beim Verlassen passiert. */
@Injectable()
export class WelcomeService {
  private readonly log = new Logger('Welcome');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly applications: ApplicationsService, private readonly qualifications: QualificationsService, private readonly tickets: SupportTicketsService, private readonly media: MediaService) {}

  private keyOf(guildId?: string | null) { return guildId ? `${KEY}@${guildId}` : KEY; }

  /** `own` = dieser Server hat eigene Einstellungen (sonst gilt die gemeinsame). */
  async config(guildId?: string | null): Promise<WelcomeConfig & { own: boolean }> {
    const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(guildId) } }) : null;
    const row = own ?? await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    const parsed = row ? welcomeConfigSchema.safeParse(row.value) : null;
    return { ...(parsed?.success ? parsed.data : welcomeConfigSchema.parse({})), own: !guildId || !!own };
  }

  async save(actor: Actor, input: WelcomeConfig, guildId?: string | null) {
    const key = this.keyOf(guildId);
    const value = input as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await this.audit.record(actor, { action: 'welcome.config', module: 'settings', entityType: 'SystemSetting', entityId: key, after: value as Record<string, unknown> }, tx);
    });
    return this.config(guildId);
  }

  /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame. */
  async reset(actor: Actor, guildId: string) {
    await this.prisma.systemSetting.deleteMany({ where: { key: this.keyOf(guildId) } });
    await this.audit.record(actor, { action: 'welcome.config.reset', module: 'settings', entityType: 'SystemSetting', entityId: this.keyOf(guildId) });
    return this.config(guildId);
  }

  /** Hochgeladener Banner für den Bot (nur Bilder, die als Willkommens-Banner hochgeladen wurden). */
  async banner(id: string) {
    const f = await this.media.welcomeBanner(id);
    return { mime: f.mime, name: f.name, data: f.data.toString('base64') };
  }

  /** Vom Bot: Mitglied hat den Server verlassen → offene Bewerbungen und Tickets nach Einstellung behandeln. Fehler eines Bereichs stoppen die anderen nicht. */
  async memberLeft(guildId: string, discordId: string) {
    const safe = <T>(label: string, p: Promise<T>, empty: T) => p.catch((e: Error) => { this.log.warn(`member left (${label}): ${e.message}`); return empty; });
    const [applications, qualifications, tickets] = await Promise.all([
      safe('applications', this.applications.memberLeft(guildId, discordId), { denied: 0, withdrawn: 0 }),
      safe('qualifications', this.qualifications.memberLeft(guildId, discordId), { denied: 0, withdrawn: 0 }),
      safe('tickets', this.tickets.memberLeft(guildId, discordId), { closed: 0 }),
    ]);
    return { applications, qualifications, tickets };
  }
}
