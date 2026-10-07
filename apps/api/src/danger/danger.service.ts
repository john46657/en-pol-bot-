import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_DANGER_CONFIG, dangerLevelOf, type DangerConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';

export interface DangerState { level: string; reason: string | null; setByName: string | null; at: string | null }
const KEY = 'danger.current';
const CFG = 'danger.config';
const sf = z.string().regex(/^\d{15,25}$/);
export const dangerConfigSchema = z.object({
  panelTitle: z.string().trim().min(1).max(200),
  panelText: z.string().max(3000),
  buttonEmoji: z.string().max(16),
  pingRoleIds: z.array(sf).max(10),
  levels: z.array(z.object({
    key: z.string().trim().regex(/^[A-Z0-9_]{1,24}$/), name: z.string().trim().min(1).max(40), title: z.string().trim().max(200), text: z.string().max(3500),
    emoji: z.string().max(16), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), buttonStyle: z.enum(['primary', 'secondary', 'success', 'danger']),
  })).min(2).max(10).refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length, 'Schlüssel müssen eindeutig sein'),
});

/** Gefahrenstatus. Stufen/Texte/Farben/Pings kommen aus der Konfiguration (Dashboard); Änderungen sind auditiert und gehen live raus. */
@Injectable()
export class DangerService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService, private readonly discord: DiscordService) {}

  async config(): Promise<DangerConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: CFG } }))?.value;
    const r = dangerConfigSchema.safeParse({ ...DEFAULT_DANGER_CONFIG, ...((v ?? {}) as object) });
    return r.success ? r.data : DEFAULT_DANGER_CONFIG;
  }

  async saveConfig(actor: Actor, input: DangerConfig) {
    const before = await this.config();
    const value = input as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CFG }, create: { key: CFG, value }, update: { value } });
      await this.audit.record(actor, { action: 'danger.config', module: 'dispatch', entityType: 'SystemSetting', entityId: CFG, before, after: input }, tx);
    });
    this.rt.publish('dispatch', 'danger.changed', {});
    return this.config();
  }

  private async state(): Promise<DangerState> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    return (row?.value as unknown as DangerState | undefined) ?? { level: '', reason: null, setByName: null, at: null };
  }

  /** Aktueller Status inkl. Stufe aus der Konfiguration und der Liste aller Stufen (für Buttons/Anzeige). */
  async get() {
    const [s, cfg] = await Promise.all([this.state(), this.config()]);
    const def = dangerLevelOf(cfg, s.level);
    return { ...s, level: def.key, def, levels: cfg.levels.map((l) => ({ key: l.key, name: l.name, title: l.title, emoji: l.emoji, color: l.color, buttonStyle: l.buttonStyle })), panel: { title: cfg.panelTitle, text: cfg.panelText, buttonEmoji: cfg.buttonEmoji } };
  }

  async set(actor: Actor, level: string, reason?: string) {
    const cfg = await this.config();
    const want = level.trim().toUpperCase();
    const def = cfg.levels.find((l) => l.key === want || l.name.toUpperCase() === want);
    if (!def) throw new AppError('VALIDATION_FAILED', `Unbekannte Stufe. Möglich: ${cfg.levels.map((l) => l.name).join(', ')}`);
    const before = await this.get();
    const user = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    const state: DangerState = { level: def.key, reason: reason?.trim() || null, setByName: user?.displayName ?? null, at: new Date().toISOString() };
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: state as never }, update: { value: state as never } });
      await this.audit.record(actor, { action: 'danger.set', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, before: { level: before.level }, after: state, reason }, tx);
    });
    this.rt.publish('dispatch', 'danger.changed', { level: def.key });
    if (before.level !== def.key || !before.at) {
      await this.discord.enqueue('danger', 'danger.changed', {
        level: def.key, name: def.name, title: def.title, text: def.text, emoji: def.emoji, color: def.color,
        previous: before.at ? before.def.name : null, reason: state.reason, setBy: state.setByName, pingRoleIds: cfg.pingRoleIds,
      });
    }
    return this.get();
  }
}
