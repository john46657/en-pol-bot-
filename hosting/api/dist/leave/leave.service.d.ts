import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
/** Abmeldungen (wie bei Melonly/ERM): Freigabe-Channel, Log-Channel, Rolle „abgemeldet“. */
export declare const leaveConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    approvalChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Längste erlaubte Abmeldung in Tagen. */
    maxDays: z.ZodDefault<z.ZodNumber>;
    /** Grund im Log-Kanal zeigen? Standard aus: Abwesenheitsgründe sind sensibel und gehören nicht in einen Kanal, den viele lesen. */
    logReason: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    roleIds: string[];
    enabled: boolean;
    maxDays: number;
    logReason: boolean;
    approvalChannelId?: string | null | undefined;
    logChannelId?: string | null | undefined;
}, {
    roleIds?: string[] | undefined;
    enabled?: boolean | undefined;
    approvalChannelId?: string | null | undefined;
    logChannelId?: string | null | undefined;
    maxDays?: number | undefined;
    logReason?: boolean | undefined;
}>;
export type LeaveConfig = z.infer<typeof leaveConfigSchema>;
export declare const LEAVE_STATUSES: readonly ["PENDING", "IN_REVIEW", "APPROVED", "DENIED", "CANCELLED", "ENDED"];
export declare class LeaveService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly perms;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, perms: PermissionService, notify: NotifyService);
    config(): Promise<LeaveConfig>;
    saveConfig(actor: Actor, input: LeaveConfig): Promise<{
        roleIds: string[];
        enabled: boolean;
        maxDays: number;
        logReason: boolean;
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
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
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
            reviewerId: string | null;
            reviewerName: string | null;
            reviewStartedAt: Date | null;
            days: number;
            extensionMinutes: number | null;
            extensionReason: string | null;
            extensionRequestedAt: Date | null;
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
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
    }>;
    /** „In Prüfung“ nehmen: Prüfer wird eingetragen (zuständiger Prüfer); entschieden wird danach wie gewohnt. */
    review(actor: Actor, id: string): Promise<{
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
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
    }>;
    /**
     * Genehmigte Abwesenheit ↔ Schichtplan: Zuweisungen in diesem Zeitraum bleiben bestehen (nichts wird automatisch geändert),
     * die Schichtleitung erfährt es aber sofort – ohne Grund.
     */
    private flagShiftConflicts;
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
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
    }>;
    /** Neues Ende nach einer Verlängerung prüfen: Höchstdauer und keine Überschneidung mit anderen Abmeldungen. */
    private checkExtension;
    private apply;
    /**
     * Verlängern (wie Trident „Extend“). Leitung (leave.manage) und noch offene Anträge: sofort.
     * Eigene genehmigte Abmeldung: Verlängerungsantrag an die Leitung (Freigabe-Channel, Annehmen/Ablehnen), bis dahin bleibt das Ende.
     */
    extend(actor: Actor, id: string, minutes: number, reason: string): Promise<{
        extensionPending: boolean;
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
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
    }>;
    /** Leitung entscheidet über eine beantragte Verlängerung; das Mitglied bekommt eine DM. */
    decideExtension(actor: Actor, id: string, status: 'APPROVED' | 'DENIED', reason?: string): Promise<{
        decidedByName: string | null;
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
        endedAt: Date | null;
        createdAt: Date;
        reviewerId: string | null;
        reviewerName: string | null;
        reviewStartedAt: Date | null;
        days: number;
        extensionMinutes: number | null;
        extensionReason: string | null;
        extensionRequestedAt: Date | null;
    }>;
    /** Jede Minute: Rolle zu Beginn vergeben, am Ende entfernen und die Abmeldung abschließen. */
    tick(): Promise<{
        started: number;
        ended: number;
    }>;
}
