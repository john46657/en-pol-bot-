import { Body, Controller, Delete, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BotService } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit / Bewerbungsart. */
export const POLICE_UNIT = '@polizei';

type Db = Pick<PrismaService, 'applicationProgress'>;
/** Nach dem Einreichen: angefangene Bewerbung aus der Liste „in Bearbeitung“ entfernen. */
export const clearProgress = (prisma: Db, discordId: string | undefined, unit: string) =>
  discordId ? prisma.applicationProgress.deleteMany({ where: { discordId, unit } }).then(() => undefined, () => undefined) : Promise.resolve();
/** Angefangene Bewerbung merken bzw. Fortschritt aktualisieren (eine je Person und Bewerbung). */
export const saveProgress = (prisma: Db, p: { discordId: string; discordName: string; unit: string; unitName: string; guildId?: string | null; source: 'DISCORD' | 'WEB'; answered?: number | null; total?: number | null; startedAt?: Date; expiresAt: Date }) => {
  const data = { discordName: p.discordName, unitName: p.unitName, guildId: p.guildId ?? null, source: p.source, answered: p.answered ?? null, total: p.total ?? null, expiresAt: p.expiresAt };
  return prisma.applicationProgress.upsert({ where: { discordId_unit: { discordId: p.discordId, unit: p.unit } }, create: { discordId: p.discordId, unit: p.unit, ...data, ...(p.startedAt ? { startedAt: p.startedAt } : {}) }, update: { ...data, ...(p.startedAt ? { startedAt: p.startedAt } : {}) } });
};

const discordId = z.string().regex(/^\d{15,25}$/);
const progress = z.object({
  discordId, discordName: z.string().trim().min(1).max(100), unit: z.string().min(1).max(24), unitName: z.string().trim().min(1).max(120),
  guildId: z.string().regex(/^\d{15,25}$/).optional(), answered: z.number().int().min(0).max(500), total: z.number().int().min(1).max(500),
  startedAt: z.coerce.date(), expiresAt: z.coerce.date(),
});
const clearQ = z.object({ discordId, unit: z.string().min(1).max(24).optional() });

/** Dienst-Endpunkte für den Bot: laufende Bewerbungen per Direktnachricht melden (Anzeige im Dashboard). */
@ApiTags('bot')
@Controller('bot/application-progress')
export class BotApplicationProgressController {
  constructor(private readonly prisma: PrismaService) {}
  @BotService() @Post() @HttpCode(204)
  async save(@Body(zodBody(progress)) b: z.infer<typeof progress>) { await saveProgress(this.prisma, { ...b, source: 'DISCORD' }); }
  /** Abgebrochen oder abgelaufen (ohne `unit`: alle der Person). */
  @BotService() @Delete() @HttpCode(204)
  async clear(@Query(zodBody(clearQ)) q: z.infer<typeof clearQ>) { await this.prisma.applicationProgress.deleteMany({ where: { discordId: q.discordId, ...(q.unit ? { unit: q.unit } : {}) } }); }
  /** Bot-Neustart: laufende Bewerbungen im Speicher des Bots sind weg – also auch hier. */
  @BotService() @Post('reset') @HttpCode(204)
  async reset() { await this.prisma.applicationProgress.deleteMany({ where: { source: 'DISCORD' } }); }
}
