import { Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;
const hash = (c: string) => createHash('sha256').update(c.toUpperCase().replace(/[\s-]/g, '')).digest('hex');
export const CHANNEL_KEYS = ['dispatch', 'wanted', 'announcements', 'applications', 'danger', 'sek', 'qualifications', 'duty', 'tickets', 'cad'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
/** Channel-/Rollen-IDs aus den Einstellungen. Die Benachrichtigungs-Channels dürfen Komma-Listen sein (mehrere Channels/Server). */
export interface DiscordGuildInfo {
  id: string; name: string; icon: string | null;
  channels: { id: string; name: string; type: 'text' | 'category' | 'voice' | 'other'; parentId: string | null; position: number }[];
  roles: { id: string; name: string; color: number; position: number }[];
}
const GUILDS_KEY = 'discord.guilds';
export interface DiscordChannels { guildId?: string; dispatch?: string; wanted?: string; announcements?: string; applications?: string; danger?: string; sek?: string; qualifications?: string; duty?: string; teamlist?: string; tickets?: string; cad?: string; staffRole?: string; radioRole?: string; sekRole?: string; dutyRole?: string; breakRole?: string; trainingRole?: string; adminDutyRole?: string }

@Injectable()
export class DiscordService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---- Verknüpfung (Web-Benutzer erzeugt Code, Bot löst ihn ein) ----
  async createLinkCode(actor: Actor) {
    const userId = actor.userId!;
    if (await this.prisma.discordLink.findUnique({ where: { userId } })) throw new AppError('CONFLICT', 'Dein Konto ist bereits mit Discord verknüpft. Hebe die Verknüpfung zuerst auf.');
    let raw = '';
    for (let i = 0; i < 8; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.discordLinkCode.deleteMany({ where: { userId, usedAt: null } }); // nur ein offener Code pro Benutzer
      await tx.discordLinkCode.create({ data: { userId, codeHash: hash(raw), expiresAt } });
      await this.audit.record(actor, { action: 'discord.link.code_created', module: 'discord', entityType: 'User', entityId: userId }, tx);
    });
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt };
  }

  /** Vom Bot aufgerufen. Einmalig, zeitlich begrenzt; ein Discord-Konto kann nur mit einem Benutzer verknüpft sein. */
  async redeem(code: string, discordId: string) {
    const row = await this.prisma.discordLinkCode.findUnique({ where: { codeHash: hash(code) }, });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user?.active) throw new AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.discordLinkCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
        if (claimed.count === 0) throw new AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
        await tx.discordLink.create({ data: { userId: row.userId, discordId } });
        await this.audit.record({ userId: row.userId, robloxUserId: user.robloxUserId }, { action: 'discord.link', module: 'discord', entityType: 'User', entityId: row.userId, after: { discordId } }, tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Dieses Discord-Konto bzw. dieser Benutzer ist bereits verknüpft.');
      throw e;
    }
    return { displayName: user.displayName, username: user.username };
  }

  async unlink(actor: Actor, userId: string) {
    const link = await this.prisma.discordLink.findUnique({ where: { userId } });
    if (!link) throw new AppError('NOT_FOUND', 'Keine Discord-Verknüpfung vorhanden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.discordLink.delete({ where: { userId } });
      await this.audit.record(actor, { action: 'discord.unlink', module: 'discord', entityType: 'User', entityId: userId, before: { discordId: link.discordId } }, tx);
    });
  }

  async status(userId: string) {
    const link = await this.prisma.discordLink.findUnique({ where: { userId } });
    return { linked: !!link, discordId: link?.discordId ?? null, linkedAt: link?.linkedAt ?? null };
  }

  /** Auflösung Discord-ID → aktiver Benutzer (für die Bot-Authentifizierung). */
  async resolveUser(discordId: string) {
    const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
    if (!link) return null;
    const user = await this.prisma.user.findUnique({ where: { id: link.userId } });
    return user?.active ? user : null;
  }

  // ---- Ausgangs-Warteschlange ----
  async channels(): Promise<DiscordChannels> {
    return ((await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as DiscordChannels | undefined) ?? {};
  }

  /** Nur Einreihen, wenn für den Kanal-Schlüssel ein Channel konfiguriert ist (kein Datenanfall ohne Bot). Fehler dürfen den Fachprozess nie stören. */
  async enqueue(channelKey: ChannelKey, type: string, payload: Record<string, unknown>, opts: { always?: boolean } = {}) {
    try {
      const ch = await this.channels();
      if (!ch[channelKey] && !opts.always) return; // `always`: z. B. Direktnachrichten brauchen keinen Channel
      await this.prisma.discordOutbox.create({ data: { type, channelKey, payload: payload as Prisma.InputJsonValue } });
    } catch { /* Benachrichtigung ist best effort */ }
  }

  /**
   * „Ticket mit Bewerber öffnen“ aus dem Dashboard: der Bot legt (wie beim Discord-Button) einen privaten Kanal mit Person, Team-Rolle und dir an.
   * Server: der der Bewerbung, sonst der eingestellte Haupt-Server.
   */
  async applicantTicket(actor: Actor, a: { id: string; number: string; discordId: string | null; discordName: string | null; guildId: string | null; unitName?: string | null; robloxUsername?: string | null }, entityType: string) {
    if (!a.discordId) throw new AppError('VALIDATION_FAILED', 'Diese Bewerbung kam nicht über Discord – es gibt keinen Discord-Benutzer für ein Ticket.');
    const guildId = a.guildId ?? (await this.channels()).guildId ?? (await this.guilds())[0]?.id;
    if (!guildId) throw new AppError('VALIDATION_FAILED', 'Kein Discord-Server bekannt – ist der Bot online?');
    const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.discordOutbox.create({ data: { type: 'application.ticket', channelKey: 'applications', payload: { guildId, discordId: a.discordId, userName: a.discordName ?? a.robloxUsername ?? a.discordId, number: a.number, unitName: a.unitName ?? null, requesterId: link?.discordId ?? null } } });
      await this.audit.record(actor, { action: 'application.ticket', module: 'applications', entityType, entityId: a.id, after: { guildId } }, tx);
    });
    return { queued: true, linked: !!link };
  }

  // ---- Bot-Zustand (z. B. IDs der selbst aktualisierenden Nachrichten) ----
  /** Server des Bots mit Channels und Rollen (meldet der Bot regelmäßig) – für Namen und Auswahllisten im Dashboard. */
  async guilds(): Promise<DiscordGuildInfo[]> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: GUILDS_KEY } }))?.value;
    return Array.isArray(v) ? (v as unknown as DiscordGuildInfo[]) : [];
  }
  async saveGuilds(guilds: DiscordGuildInfo[]) {
    const value = guilds as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({ where: { key: GUILDS_KEY }, create: { key: GUILDS_KEY, value }, update: { value } });
  }

  async getState(key: string): Promise<unknown> {
    return (await this.prisma.systemSetting.findUnique({ where: { key: `bot.state.${key}` } }))?.value ?? null;
  }
  async setState(key: string, value: unknown) {
    await this.prisma.systemSetting.upsert({ where: { key: `bot.state.${key}` }, create: { key: `bot.state.${key}`, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  }

  pending(limit: number) {
    return this.prisma.discordOutbox.findMany({ where: { sentAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: limit });
  }

  async ack(id: string, ok: boolean, error?: string) {
    const r = ok
      ? await this.prisma.discordOutbox.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } })
      : await this.prisma.discordOutbox.updateMany({ where: { id, sentAt: null }, data: { attempts: { increment: 1 }, lastError: (error ?? 'failed').slice(0, 300) } });
    if (r.count === 0) throw new AppError('NOT_FOUND', 'Ausgangseintrag nicht gefunden.');
  }
}
