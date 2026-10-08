import { type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
export declare const linksSchema: z.ZodEffects<z.ZodObject<{
    /** Verbundene Server: teilen Akten und/oder Einstellungen. Der erste Server ist der Haupt-Server (dessen Einstellungen gelten). */
    groups: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        guildIds: z.ZodArray<z.ZodString, "many">;
        shareRecords: z.ZodDefault<z.ZodBoolean>;
        shareSettings: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        guildIds: string[];
        shareRecords: boolean;
        shareSettings: boolean;
        id?: string | undefined;
    }, {
        name: string;
        guildIds: string[];
        id?: string | undefined;
        shareRecords?: boolean | undefined;
        shareSettings?: boolean | undefined;
    }>, "many">>;
    /** Server ohne Gruppe, die den gemeinsamen Bestand nutzen (Opt-in). Alle anderen Server ohne Gruppe sind getrennt (eigene Akten). */
    sharedRecords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    groups: {
        name: string;
        guildIds: string[];
        shareRecords: boolean;
        shareSettings: boolean;
        id?: string | undefined;
    }[];
    sharedRecords: string[];
}, {
    groups?: {
        name: string;
        guildIds: string[];
        id?: string | undefined;
        shareRecords?: boolean | undefined;
        shareSettings?: boolean | undefined;
    }[] | undefined;
    sharedRecords?: string[] | undefined;
}>, {
    groups: {
        name: string;
        guildIds: string[];
        shareRecords: boolean;
        shareSettings: boolean;
        id?: string | undefined;
    }[];
    sharedRecords: string[];
}, {
    groups?: {
        name: string;
        guildIds: string[];
        id?: string | undefined;
        shareRecords?: boolean | undefined;
        shareSettings?: boolean | undefined;
    }[] | undefined;
    sharedRecords?: string[] | undefined;
}>;
export type ServerLinks = z.infer<typeof linksSchema>;
/** Eigener Akten-Bereich eines einzelnen Servers als feste UUID (aus der Server-ID abgeleitet). */
export declare function ownSpace(guildId: string): string;
/**
 * Server-Verbund: Discord-Server sind standardmäßig getrennt (eigene Akten). Zusammen gehören sie nur, wenn das eingestellt
 * ist: als Gruppe (teilt Akten und/oder Einstellungen) oder per Opt-in in den gemeinsamen Bestand. Die Zuordnung liegt im Speicher, damit jede Anfrage sie ohne Datenbank-Zugriff kennt.
 */
export declare class ServerLinksService implements OnModuleInit {
    private readonly prisma;
    private readonly audit;
    private links;
    constructor(prisma: PrismaService, audit: AuditService);
    onModuleInit(): Promise<void>;
    reload(): Promise<void>;
    private groupOf;
    settingsGuild(guildId: string): string;
    space(guildId: string): string | null;
    get(): {
        groups: {
            name: string;
            guildIds: string[];
            shareRecords: boolean;
            shareSettings: boolean;
            id?: string | undefined;
        }[];
        sharedRecords: string[];
    };
    save(actor: Actor, input: ServerLinks): Promise<{
        counts: {
            shared: {
                persons: number;
                vehicles: number;
            } | undefined;
            groups: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
            own: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
        };
        groups: {
            name: string;
            guildIds: string[];
            shareRecords: boolean;
            shareSettings: boolean;
            id?: string | undefined;
        }[];
        sharedRecords: string[];
    }>;
    /** Für die Seite: Einstellungen + Zahl der Akten je Bereich (damit man sieht, was wohin gehört). */
    overview(): Promise<{
        counts: {
            shared: {
                persons: number;
                vehicles: number;
            } | undefined;
            groups: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
            own: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
        };
        groups: {
            name: string;
            guildIds: string[];
            shareRecords: boolean;
            shareSettings: boolean;
            id?: string | undefined;
        }[];
        sharedRecords: string[];
    }>;
    /** Bestehende gemeinsame Akten in einen Bereich verschieben (z. B. nach dem Trennen eines Servers). */
    moveShared(actor: Actor, guildId: string): Promise<{
        persons: number;
        vehicles: number;
    }>;
}
