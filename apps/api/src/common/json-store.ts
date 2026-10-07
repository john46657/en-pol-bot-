import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service';

/** Liste von Einstellungs-Dokumenten in einer SystemSetting-Zeile (Panels, Staff-Listen, Vorlagen …). Ungültige Einträge werden beim Lesen verworfen. */
export class JsonListStore<T extends { id: string }> {
  constructor(private readonly prisma: PrismaService, private readonly key: string, private readonly schema: z.ZodType<T>, private readonly max = 100) {}

  async all(): Promise<T[]> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: this.key } }))?.value;
    return (Array.isArray(v) ? v : []).flatMap((x) => { const p = this.schema.safeParse(x); return p.success ? [p.data] : []; });
  }
  async get(id: string) { return (await this.all()).find((x) => x.id === id); }
  async write(list: T[], tx: Prisma.TransactionClient = this.prisma) {
    const value = list.slice(0, this.max) as unknown as Prisma.InputJsonValue;
    await tx.systemSetting.upsert({ where: { key: this.key }, create: { key: this.key, value }, update: { value } });
  }
  /** Einfügen oder ersetzen; liefert [neu, alt]. */
  async upsert(doc: T, tx?: Prisma.TransactionClient): Promise<[T, T | undefined]> {
    const list = await this.all();
    const old = list.find((x) => x.id === doc.id);
    await this.write(old ? list.map((x) => (x.id === doc.id ? doc : x)) : [...list, doc], tx);
    return [doc, old];
  }
  async remove(id: string, tx?: Prisma.TransactionClient) {
    const list = await this.all();
    const old = list.find((x) => x.id === id);
    if (old) await this.write(list.filter((x) => x.id !== id), tx);
    return old;
  }
}
