import { ApplicationStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PageQuery } from '../common/pagination';
export interface FormField {
    key: string;
    label: string;
    required: boolean;
    maxLength: number;
}
/** Die Beschriftungen sind zugleich die Fragen, die der Discord-Bot per Direktnachricht stellt. */
export declare const DEFAULT_FORM: FormField[];
export declare class ApplicationsService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    form(): Promise<FormField[]>;
    /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
    submit(d: {
        robloxUsername: string;
        robloxUserId?: string;
        answers: Record<string, string>;
    }, meta?: {
        discordId?: string;
    }): Promise<{
        number: string;
        status: string;
    }>;
    /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
    openForDiscord(discordId: string): Promise<{
        open: boolean;
        number: string | null;
    }>;
    list(p: PageQuery, status?: string): Promise<{
        items: {
            number: string;
            id: string;
            createdAt: Date;
            discordId: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            status: string;
            source: string;
            answers: import("@prisma/client/runtime/library").JsonValue;
            decidedById: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        status: string;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        decidedById: string | null;
    }>;
    transition(actor: Actor, id: string, to: ApplicationStatus, reason?: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        status: string;
        source: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        decidedById: string | null;
    }>;
}
