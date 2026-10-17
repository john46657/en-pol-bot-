import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionService } from '../authz/permission.service';
/** Abmeldungen (wie bei Melonly/ERM): Freigabe-Channel, Log-Channel, Rolle „abgemeldet“. */
export declare const leaveConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    approvalChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Längste erlaubte Abmeldung in Tagen. */
    maxDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    roleIds: string[];
    enabled: boolean;
    maxDays: number;
    approvalChannelId?: string | null | undefined;
    logChannelId?: string | null | undefined;
}, {
    roleIds?: string[] | undefined;
    enabled?: boolean | undefined;
    approvalChannelId?: string | null | undefined;
    logChannelId?: string | null | undefined;
    maxDays?: number | undefined;
}>;
export type LeaveConfig = z.infer<typeof leaveConfigSchema>;
export declare const LEAVE_STATUSES: readonly ["PENDING", "APPROVED", "DENIED", "CANCELLED", "ENDED"];
export declare class LeaveService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, perms: PermissionService);
    config(): Promise<LeaveConfig>;
    saveConfig(actor: Actor, input: LeaveConfig): Promise<{
        roleIds: string[];
        enabled: boolean;
        maxDays: number;
        approvalChannelId?: string | null | undefined;
        logChannelId?: string | null | undefined;
    }>;
    /** Discord-ID der Antragsteller dazuladen (Verknüpfung liegt in DiscordLink). */
    private withDiscord;
    private one;
    private view;
    /** Server, auf dem beantragt wurde (Kopfzeile der DMs wie bei Trident); sonst der Organisationsname. */
    private server;
    private payload;
    /** Eintrag im Log-Channel (angenommen, abgelehnt, begonnen, beendet, zurückgezogen). */
    private log;
    private roles;
    /** Mitglied per Discord-ID (Leitung, z. B. `/leave admin`). */
    private member;
    request(actor: Actor, d: {
        startsAt: Date;
        endsAt: Date;
        reason: string;
        guildId?: string;
        type?: string;
        comment?: string;
        forDiscordId?: string;
    }): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    private create;
    list(actor: Actor, f: {
        status?: string;
        mine?: boolean;
        discordId?: string;
    }): Promise<{
        items: {
            id: string;
            number: string;
            userId: string;
            name: string;
            discordId: string | null;
            startsAt: Date;
            endsAt: Date;
            reason: string;
            type: string | null;
            comment: string | null;
            status: string;
            active: boolean;
            guildId: string | null;
            decidedAt: Date | null;
            decisionReason: string | null;
            decidedByName: string | null;
            endedAt: Date | null;
            createdAt: Date;
            days: number;
        }[];
        member?: {
            userId: string;
            name: string;
        } | undefined;
        all: boolean;
    }>;
    private load;
    decide(actor: Actor, id: string, status: 'APPROVED' | 'DENIED', reason?: string): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    /** Zurückziehen (eigene) bzw. vorzeitig beenden (Leitung). Eine laufende Abmeldung endet sofort und die Rolle wird entfernt. */
    cancel(actor: Actor, id: string): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    /**
     * Verlängern (wie Trident „Extend“): eigene offene/laufende/geplante Abmeldung oder als Leitung jede.
     * Das neue Ende darf die Höchstdauer nicht überschreiten und sich mit keiner anderen Abmeldung überschneiden; steht im Log.
     */
    extend(actor: Actor, id: string, minutes: number): Promise<{
        id: string;
        number: string;
        userId: string;
        name: string;
        discordId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
        type: string | null;
        comment: string | null;
        status: string;
        active: boolean;
        guildId: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        decidedByName: string | null;
        endedAt: Date | null;
        createdAt: Date;
        days: number;
    }>;
    /** Jede Minute: Rolle zu Beginn vergeben, am Ende entfernen und die Abmeldung abschließen. */
    tick(): Promise<{
        started: number;
        ended: number;
    }>;
}
