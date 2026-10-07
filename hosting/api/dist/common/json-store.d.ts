import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service';
/** Liste von Einstellungs-Dokumenten in einer SystemSetting-Zeile (Panels, Staff-Listen, Vorlagen …). Ungültige Einträge werden beim Lesen verworfen. */
export declare class JsonListStore<T extends {
    id: string;
}> {
    private readonly prisma;
    private readonly key;
    private readonly schema;
    private readonly max;
    constructor(prisma: PrismaService, key: string, schema: z.ZodType<T>, max?: number);
    all(): Promise<T[]>;
    get(id: string): Promise<T | undefined>;
    write(list: T[], tx?: Prisma.TransactionClient): Promise<void>;
    /** Einfügen oder ersetzen; liefert [neu, alt]. */
    upsert(doc: T, tx?: Prisma.TransactionClient): Promise<[T, T | undefined]>;
    remove(id: string, tx?: Prisma.TransactionClient): Promise<T | undefined>;
}
