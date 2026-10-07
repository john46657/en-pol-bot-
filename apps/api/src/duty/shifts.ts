import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { BotService, CurrentActor, RequirePermission } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';

const KEY = 'shifts.config';
const sf = z.string().regex(/^\d{15,25}$/);
const roles = z.array(sf).max(25).default([]);

/** Schicht-Art (wie bei Melonly/ERM): Rolle im Dienst, Rolle in der Pause, Log-Channel. */
export const shiftTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(60),
  isDefault: z.boolean().default(false),
  onShiftRoleIds: roles,
  onBreakRoleIds: roles,
  logChannelId: sf.nullish(),
});
/** Erinnerung, wenn jemand „Im Dienst“ ist, aber länger nichts gemacht hat (Dashboard/MDT, Discord). */
export const reminderSchema = z.object({
  enabled: z.boolean().default(false),
  /** Minuten ohne Aktivität bis zur Erinnerung */
  afterMinutes: z.number().int().min(5).max(600).default(30),
  /** Minuten nach der Erinnerung ohne Reaktion → automatisch außer Dienst (0 = nie) */
  autoOffMinutes: z.number().int().min(0).max(600).default(0),
}).default({});
export const shiftsConfigSchema = z.object({ enabled: z.boolean().default(false), types: z.array(shiftTypeSchema).max(25).default([]), reminder: reminderSchema })
  .superRefine((c, ctx) => {
    if (new Set(c.types.map((t) => t.id)).size !== c.types.length) ctx.addIssue({ code: 'custom', path: ['types'], message: 'Die IDs der Schichtarten müssen eindeutig sein.' });
    if (new Set(c.types.map((t) => t.name.toLowerCase())).size !== c.types.length) ctx.addIssue({ code: 'custom', path: ['types'], message: 'Die Namen der Schichtarten müssen eindeutig sein.' });
    if (c.types.filter((t) => t.isDefault).length > 1) ctx.addIssue({ code: 'custom', path: ['types'], message: 'Nur eine Schichtart kann der Standard sein.' });
  });
export type ShiftType = z.infer<typeof shiftTypeSchema>;
export type ShiftsConfig = z.infer<typeof shiftsConfigSchema>;

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async config(): Promise<ShiftsConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const r = shiftsConfigSchema.safeParse(v ?? {});
    return r.success ? r.data : shiftsConfigSchema.parse({});
  }

  async save(actor: Actor, input: ShiftsConfig) {
    // ohne ausdrückliche Vorgabe wird die erste Art zur Standard-Schicht
    const types = input.types.length && !input.types.some((t) => t.isDefault) ? input.types.map((t, i) => ({ ...t, isDefault: i === 0 })) : input.types;
    const value = { ...input, types } as unknown as Prisma.InputJsonValue;
    const before = await this.config();
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'shifts.config', module: 'team', entityType: 'SystemSetting', entityId: KEY, before: before as unknown as Record<string, unknown>, after: value as Record<string, unknown> }, tx);
    });
    return this.config();
  }

  /** Welche Schicht-Art gilt? Gewählte → bei Pause die laufende → Standard. `null`, wenn das Modul aus ist. */
  async resolve(cfg: ShiftsConfig, requested: string | undefined, current: string | null | undefined): Promise<ShiftType | null> {
    if (!cfg.enabled || !cfg.types.length) {
      if (requested) throw new AppError('VALIDATION_FAILED', 'Schichtarten sind nicht aktiviert.');
      return null;
    }
    if (requested) {
      const t = cfg.types.find((x) => x.id === requested);
      if (!t) throw new AppError('NOT_FOUND', 'Unbekannte Schichtart.');
      return t;
    }
    return cfg.types.find((x) => x.id === current) ?? cfg.types.find((x) => x.isDefault) ?? cfg.types[0]!;
  }

  /** Discord-Rollen je Status: Schicht-Rolle im Dienst, Pausen-Rolle in der Pause; alle anderen Schicht-Rollen weg. */
  static roleChanges(cfg: ShiftsConfig, type: ShiftType | null, status: string): { add: string[]; remove: string[] } {
    const all = [...new Set(cfg.types.flatMap((t) => [...t.onShiftRoleIds, ...t.onBreakRoleIds]))];
    const add = !type || status === 'OFF_DUTY' ? [] : status === 'BREAK' ? type.onBreakRoleIds : type.onShiftRoleIds;
    return { add: [...new Set(add)], remove: all.filter((r) => !add.includes(r)) };
  }
}

@ApiTags('team')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly s: ShiftsService) {}
  /** Schicht-Arten (Auswahl beim Dienstbeginn). */
  @Get('config') @RequirePermission('team.view')
  config() { return this.s.config(); }
  @Put('config') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Body(zodBody(shiftsConfigSchema)) b: ShiftsConfig) { return this.s.save(a, b); }
}

@ApiTags('bot')
@Controller('bot/shifts')
export class BotShiftsController {
  constructor(private readonly s: ShiftsService) {}
  @BotService() @Get() config() { return this.s.config(); }
}
