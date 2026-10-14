import { currentGuild, scopedKey } from '../common/guild-context';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors';
import { CustomEntity, CustomFieldDef, CustomFieldsConfig, validateCustom } from './custom-fields';

/** Vorgaben (Namen); zusätzlich ist jede eigene Farbe `#rrggbb` erlaubt (Studio → Design). */
export const ACCENTS = ['blue', 'green', 'amber', 'red', 'cyan', 'violet', 'orange', 'pink', 'indigo', 'teal', 'lime', 'sky', 'rose', 'emerald', 'gold', 'slate'] as const;

@Injectable()
export class StudioService {
  constructor(private readonly prisma: PrismaService) {}

  private async setting<T>(key: string, fallback: T): Promise<T> {
    const g = currentGuild(); // Server-eigener Wert (z. B. Name, Akzentfarbe) vor dem gemeinsamen
    const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: scopedKey(key, g) } }) : null;
    const v = (own ?? (await this.prisma.systemSetting.findUnique({ where: { key } })))?.value;
    // gespeicherter Wert mit falschem Typ (altes Format, kaputt) → Standardwert statt Absturz im Dashboard
    return v !== undefined && v !== null && typeof v === typeof fallback && Array.isArray(v) === Array.isArray(fallback) ? v as T : fallback;
  }

  async config() {
    const [customFields, accent, name, customAccents] = await Promise.all([
      this.setting<CustomFieldsConfig>('studio.customFields', { persons: [], vehicles: [] }),
      this.setting<string>('theme.accent', 'blue'),
      this.setting<string>('org.name', 'EN Polizei'),
      this.setting<{ name: string; hex: string }[]>('theme.customAccents', []),
    ]);
    const list = <X,>(x: unknown) => (Array.isArray(x) ? x as X[] : []);
    return { org: { name }, theme: { accent, customAccents: list<{ name: string; hex: string }>(customAccents).filter((a) => typeof a?.name === 'string' && typeof a?.hex === 'string') }, customFields: { ...customFields, persons: list<CustomFieldDef>(customFields.persons), vehicles: list<CustomFieldDef>(customFields.vehicles) } };
  }

  async defs(entity: CustomEntity): Promise<CustomFieldDef[]> {
    const d = (await this.setting<CustomFieldsConfig>('studio.customFields', { persons: [], vehicles: [] }))[entity];
    return Array.isArray(d) ? d : [];
  }

  /** Liefert bereinigte Custom-Werte oder wirft 400 mit allen Fehlern. */
  async check(entity: CustomEntity, values: Record<string, unknown> | undefined, existing?: Record<string, unknown> | null) {
    const defs = await this.defs(entity);
    if (!defs.length && !values) return undefined;
    const r = validateCustom(defs, values, existing);
    if (!r.ok) throw new AppError('VALIDATION_FAILED', 'Die Zusatzfelder sind ungültig.', r.errors.map((m) => ({ path: 'custom', message: m })));
    return r.value;
  }
}
