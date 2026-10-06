import { currentGuild, scopedKey } from '../common/guild-context';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { CustomEntity, CustomFieldDef, CustomFieldsConfig, validateCustom } from './custom-fields';

export const ACCENTS = ['blue', 'green', 'amber', 'red', 'cyan', 'violet'] as const;

@Injectable()
export class StudioService {
  constructor(private readonly prisma: PrismaService) {}

  private async setting<T>(key: string, fallback: T): Promise<T> {
    const g = currentGuild(); // Server-eigener Wert (z. B. Name, Akzentfarbe) vor dem gemeinsamen
    const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: scopedKey(key, g) } }) : null;
    return ((own ?? (await this.prisma.systemSetting.findUnique({ where: { key } })))?.value as T | undefined) ?? fallback;
  }

  async config() {
    const [customFields, accent, name] = await Promise.all([
      this.setting<CustomFieldsConfig>('studio.customFields', { persons: [], vehicles: [] }),
      this.setting<string>('theme.accent', 'blue'),
      this.setting<string>('org.name', 'EN Polizei'),
    ]);
    return { org: { name }, theme: { accent }, customFields };
  }

  async defs(entity: CustomEntity): Promise<CustomFieldDef[]> {
    return (await this.setting<CustomFieldsConfig>('studio.customFields', { persons: [], vehicles: [] }))[entity] ?? [];
  }

  /** Liefert bereinigte Custom-Werte oder wirft 400 mit allen Fehlern. */
  async check(entity: CustomEntity, values: Record<string, unknown> | undefined, existing?: Record<string, unknown> | null) {
    const defs = await this.defs(entity);
    if (!defs.length && !values) return undefined;
    const r = validateCustom(defs, values, existing);
    if (!r.ok) throw new AppError('VALIDATION_FAILED', 'Custom field validation failed.', r.errors.map((m) => ({ path: 'custom', message: m })));
    return r.value;
  }
}
