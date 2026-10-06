import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
export interface RadioCodeInput {
    code?: string;
    meaning?: string;
    category?: string | null;
    description?: string | null;
    guildId?: string | null;
}
/** Gängige Funkcodes als Startpunkt („Standard-Codes einfügen“) – alles änderbar. */
export declare const DEFAULT_RADIO_CODES: {
    code: string;
    meaning: string;
    category: string;
}[];
/**
 * Funk-Codes je Server (Server getrennt) oder für alle Server. Im Server-Kontext sieht man die Codes dieses Servers
 * und die gemeinsamen; ein Server-Code überdeckt einen gemeinsamen mit gleichem Code.
 */
export declare class RadioCodesService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    list(q?: string, guildId?: string | null): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }[]>;
    private load;
    private uniq;
    /** (gemeinsame Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
    private assertFree;
    create(actor: Actor, d: Required<Pick<RadioCodeInput, 'code' | 'meaning'>> & RadioCodeInput): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }>;
    update(actor: Actor, id: string, d: RadioCodeInput): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    reorder(actor: Actor, ids: string[]): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }[]>;
    /** Standard-Codes für den gewählten Server (bzw. alle Server) einfügen – vorhandene Codes bleiben unverändert. */
    insertDefaults(actor: Actor): Promise<{
        added: number;
    }>;
}
