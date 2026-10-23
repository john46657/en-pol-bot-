import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit / Bewerbungsart. */
export declare const POLICE_UNIT = "@polizei";
type Db = Pick<PrismaService, 'applicationProgress'>;
/** Nach dem Einreichen: angefangene Bewerbung aus der Liste „in Bearbeitung“ entfernen. */
export declare const clearProgress: (prisma: Db, discordId: string | undefined, unit: string) => Promise<void>;
/** Angefangene Bewerbung merken bzw. Fortschritt aktualisieren (eine je Person und Bewerbung). */
export declare const saveProgress: (prisma: Db, p: {
    discordId: string;
    discordName: string;
    unit: string;
    unitName: string;
    guildId?: string | null;
    source: "DISCORD" | "WEB";
    answered?: number | null;
    total?: number | null;
    startedAt?: Date;
    expiresAt: Date;
}) => import("@prisma/client").Prisma.Prisma__ApplicationProgressClient<{
    unit: string;
    guildId: string | null;
    id: string;
    updatedAt: Date;
    expiresAt: Date;
    source: string;
    startedAt: Date;
    discordId: string;
    discordName: string;
    unitName: string;
    answered: number | null;
    total: number | null;
}, never, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
declare const progress: z.ZodObject<{
    discordId: z.ZodString;
    discordName: z.ZodString;
    unit: z.ZodString;
    unitName: z.ZodString;
    guildId: z.ZodOptional<z.ZodString>;
    answered: z.ZodNumber;
    total: z.ZodNumber;
    startedAt: z.ZodDate;
    expiresAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    unit: string;
    expiresAt: Date;
    startedAt: Date;
    discordId: string;
    discordName: string;
    unitName: string;
    answered: number;
    total: number;
    guildId?: string | undefined;
}, {
    unit: string;
    expiresAt: Date;
    startedAt: Date;
    discordId: string;
    discordName: string;
    unitName: string;
    answered: number;
    total: number;
    guildId?: string | undefined;
}>;
declare const clearQ: z.ZodObject<{
    discordId: z.ZodString;
    unit: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    unit?: string | undefined;
}, {
    discordId: string;
    unit?: string | undefined;
}>;
/** Dienst-Endpunkte für den Bot: laufende Bewerbungen per Direktnachricht melden (Anzeige im Dashboard). */
export declare class BotApplicationProgressController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    save(b: z.infer<typeof progress>): Promise<void>;
    /** Abgebrochen oder abgelaufen (ohne `unit`: alle der Person). */
    clear(q: z.infer<typeof clearQ>): Promise<void>;
    /** Bot-Neustart: laufende Bewerbungen im Speicher des Bots sind weg – also auch hier. */
    reset(): Promise<void>;
}
export {};
