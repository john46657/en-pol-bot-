import { Prisma } from '@prisma/client';
import { type ReportTemplate } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { JsonListStore } from '../common/json-store';
export interface ReportFilter {
    templateId?: string;
    authorId?: string;
    from?: string;
    to?: string;
    q?: string;
    status?: string;
    mine?: boolean;
}
/** Tages-/Wochenberichte: Vorlagen mit eigenen Feldern; ausfüllen, ansehen und bearbeiten im Dashboard und in Discord. */
export declare class DutyReportsService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly discord;
    readonly templates: JsonListStore<ReportTemplate>;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, discord: DiscordService);
    listTemplates(guildId: string | null, onlyActive?: boolean): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }[]>;
    saveTemplate(actor: Actor, t: ReportTemplate): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }>;
    duplicateTemplate(actor: Actor, id: string): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }>;
    removeTemplate(actor: Actor, id: string): Promise<void>;
    private template;
    private seeAll;
    list(actor: Actor, f: ReportFilter, page?: number, pageSize?: number): Promise<{
        items: ({
            author: {
                id: string;
                displayName: string;
            };
        } & {
            number: string;
            id: string;
            status: string;
            authorId: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            source: string;
            guildId: string | null;
            values: Prisma.JsonValue;
            templateId: string;
            templateName: string;
            period: string;
            periodStart: Date;
            reviewedById: string | null;
            reviewedAt: Date | null;
            reviewNote: string | null;
            editedById: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
        seeAll: boolean;
    }>;
    get(actor: Actor, idOrNumber: string): Promise<{
        template: {
            description: string;
            id: string;
            name: string;
            guildId: string | null;
            channelId: string | null;
            color: string;
            active: boolean;
            fields: {
                options: string[];
                label: string;
                required: boolean;
                maxLength: number;
                type: "number" | "select" | "long" | "short";
                id: string;
                placeholder: string;
                inline: boolean;
            }[];
            pingRoleIds: string[];
            emoji: string;
            period: "DAILY" | "WEEKLY" | "FREE";
            onePerPeriod: boolean;
            authorCanEdit: boolean;
        } | null;
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        reviewerName: string | null;
        canEdit: boolean;
        author: {
            id: string;
            displayName: string;
        };
        number: string;
        id: string;
        status: string;
        authorId: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        values: Prisma.JsonValue;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        editedById: string | null;
    }>;
    private canEdit;
    /** Neuer Bericht – bei „ein Bericht je Zeitraum“ wird der vorhandene des Zeitraums bearbeitet. */
    /** Dienstzeit des Zeitraums aus den Dienst-Sitzungen (Pausen abgezogen) – für Felder wie „Dienstzeit“. */
    dutyTime(userId: string, t: ReportTemplate, date?: string): Promise<string | null>;
    /** Vorbelegung fürs Formular (Dashboard und Discord): Dienstzeit-Felder automatisch. */
    prefill(actor: Actor, templateId: string, date?: string): Promise<{
        values: {
            [k: string]: string;
        };
    }>;
    create(actor: Actor, d: {
        templateId: string;
        periodStart?: string;
        values: Record<string, unknown>;
        source?: 'WEB' | 'DISCORD';
        guildId?: string | null;
    }): Promise<{
        merged: boolean;
        number: string;
        id: string;
        status: string;
        authorId: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        values: Prisma.JsonValue;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        editedById: string | null;
    }>;
    update(actor: Actor, id: string, d: {
        values: Record<string, unknown>;
        version?: number;
    }): Promise<{
        number: string;
        id: string;
        status: string;
        authorId: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        values: Prisma.JsonValue;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        editedById: string | null;
    }>;
    /**
     * Leitung bearbeitet den Bericht: „Geprüft“ (Anmerkung optional), „Zur Nachbesserung“ (Anmerkung Pflicht) oder zurück auf „eingereicht“.
     * Ohne `decision`: zwischen geprüft und eingereicht umschalten. Der Verfasser bekommt eine Benachrichtigung (und bei Nachbesserung eine DM).
     */
    review(actor: Actor, id: string, d?: {
        decision?: 'REVIEWED' | 'RETURNED' | 'SUBMITTED';
        note?: string;
    }): Promise<{
        number: string;
        id: string;
        status: string;
        authorId: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        source: string;
        guildId: string | null;
        values: Prisma.JsonValue;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        reviewNote: string | null;
        editedById: string | null;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Bericht in den Kanal der Vorlage posten bzw. die vorhandene Nachricht aktualisieren. */
    private publish;
}
