import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CAD_EVENTS, CAD_WIDGETS, DEFAULT_CAD_CONFIG, type CadConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

const KEY = 'cad.config';
const sf = z.string().regex(/^\d{15,25}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const keyStr = z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Schlüssel: nur Buchstaben, Ziffern, _ und - (max. 32)');
const option = z.object({ key: keyStr, label: z.string().trim().min(1).max(60), emoji: z.string().max(16).optional(), color: color.optional(), order: z.number().int().optional() });
const uniqueKeys = <T extends { key: string }>(xs: T[]) => new Set(xs.map((x) => x.key.toUpperCase())).size === xs.length;
const list = <T extends z.ZodTypeAny>(item: T, min = 0, max = 50) => z.array(item).min(min).max(max).refine((xs) => uniqueKeys(xs as { key: string }[]), 'Schlüssel müssen eindeutig sein');

export const cadConfigSchema = z.object({
  homeGuildId: sf.nullish(),
  incidentNumberPrefix: z.string().trim().regex(/^[A-Z0-9]{1,6}$/).default('E'),
  incidentTypes: list(option, 0, 60),
  priorities: list(option, 1, 12),
  incidentStatuses: list(option.extend({ closed: z.boolean().optional() }), 2, 20).refine((xs) => xs.some((x) => x.closed) && xs.some((x) => !x.closed), 'Mindestens ein offener und ein abschließender Status'),
  unitStatuses: list(option, 2, 20),
  unitTypes: list(option.extend({ layer: z.string().max(32).optional() }), 0, 30),
  layers: list(z.object({ key: keyStr, label: z.string().trim().min(1).max(60), builtin: z.boolean().optional(), enabledByDefault: z.boolean().optional() }), 1, 40),
  markers: list(z.object({ key: keyStr, label: z.string().trim().min(1).max(60), emoji: z.string().min(1).max(16), color }), 1, 30),
  map: z.object({
    imageUrl: z.string().max(500).refine((v) => /^(https:\/\/|\/api\/v1\/media\/)/.test(v), 'Bild-Adresse muss mit https:// beginnen oder eine hochgeladene Datei sein').nullish(),
    width: z.number().int().min(100).max(20000), height: z.number().int().min(100).max(20000),
    originX: z.number().finite(), originY: z.number().finite(), scale: z.number().positive().max(100),
  }),
  routes: z.array(z.object({ id: z.string().min(1).max(40), guildId: sf, event: z.enum(CAD_EVENTS), channelIds: z.array(sf).max(10), pingRoleIds: z.array(sf).max(10).default([]), enabled: z.boolean().default(true) })).max(100),
  memberFields: list(z.object({ key: keyStr, label: z.string().trim().min(1).max(60), type: z.enum(['text', 'number', 'select']), options: z.array(z.string().max(60)).max(30).optional() }), 0, 20),
  widgets: z.array(z.enum(CAD_WIDGETS)).max(20),
});

/** Zentrale CAD-Konfiguration (eine Quelle für Backend, Dashboard und Bot). Fehlt etwas, gelten die Standardwerte. */
@Injectable()
export class CadConfigService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async get(): Promise<CadConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value as Partial<CadConfig> | undefined;
    const merged = { ...DEFAULT_CAD_CONFIG, ...(v ?? {}), map: { ...DEFAULT_CAD_CONFIG.map, ...(v?.map ?? {}) } };
    const r = cadConfigSchema.safeParse(merged);
    return (r.success ? r.data : DEFAULT_CAD_CONFIG) as CadConfig;
  }

  /** Teil-Update (Autosave schickt einzelne Bereiche). */
  async save(actor: Actor, patch: Partial<CadConfig>) {
    const before = await this.get();
    const r = cadConfigSchema.safeParse({ ...before, ...patch, ...(patch.map ? { map: { ...before.map, ...patch.map } } : {}) });
    if (!r.success) throw new AppError('VALIDATION_FAILED', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const value = r.data as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
      await this.audit.record(actor, { action: patch.map ? 'cad.map.config' : 'cad.config', module: 'cad', entityType: 'SystemSetting', entityId: KEY, before: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), after: patch }, tx);
    });
    return this.get();
  }
}
