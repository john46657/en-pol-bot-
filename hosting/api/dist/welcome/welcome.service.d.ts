import { z } from 'zod';
import { type WelcomeConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { ApplicationsService } from '../applications/applications.service';
import { QualificationsService } from '../qualifications/qualifications.service';
import { SupportTicketsService } from '../support-tickets/tickets.service';
import { MediaService } from '../media/media.service';
export declare const welcomeConfigSchema: z.ZodEffects<z.ZodObject<{
    welcome: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        channelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
        title: z.ZodDefault<z.ZodString>;
        message: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        showAvatar: z.ZodDefault<z.ZodBoolean>;
        pingUser: z.ZodDefault<z.ZodBoolean>;
        image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        imageMediaId: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    }, {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    }>>;
    dm: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        message: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        enabled: boolean;
    }, {
        message?: string | undefined;
        enabled?: boolean | undefined;
    }>>;
    autoRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    goodbye: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        channelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
        title: z.ZodDefault<z.ZodString>;
        message: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        showAvatar: z.ZodDefault<z.ZodBoolean>;
        pingUser: z.ZodDefault<z.ZodBoolean>;
        image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        imageMediaId: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    }, {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    dm: {
        message: string;
        enabled: boolean;
    };
    welcome: {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    };
    autoRoleIds: string[];
    goodbye: {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    };
}, {
    dm?: {
        message?: string | undefined;
        enabled?: boolean | undefined;
    } | undefined;
    welcome?: {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    } | undefined;
    autoRoleIds?: string[] | undefined;
    goodbye?: {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    } | undefined;
}>, {
    dm: {
        message: string;
        enabled: boolean;
    };
    welcome: {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    };
    autoRoleIds: string[];
    goodbye: {
        message: string;
        title: string;
        color: string;
        channelId: string | null;
        enabled: boolean;
        image: string;
        showAvatar: boolean;
        pingUser: boolean;
        imageMediaId: string;
    };
}, {
    dm?: {
        message?: string | undefined;
        enabled?: boolean | undefined;
    } | undefined;
    welcome?: {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    } | undefined;
    autoRoleIds?: string[] | undefined;
    goodbye?: {
        message?: string | undefined;
        title?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        enabled?: boolean | undefined;
        image?: string | undefined;
        showAvatar?: boolean | undefined;
        pingUser?: boolean | undefined;
        imageMediaId?: string | undefined;
    } | undefined;
}>;
/** Willkommen & Abschied je Discord-Server (`welcome.config@<guildId>`, sonst die gemeinsame Grundeinstellung) und was beim Verlassen passiert. */
export declare class WelcomeService {
    private readonly prisma;
    private readonly audit;
    private readonly applications;
    private readonly qualifications;
    private readonly tickets;
    private readonly media;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, applications: ApplicationsService, qualifications: QualificationsService, tickets: SupportTicketsService, media: MediaService);
    private keyOf;
    /** `own` = dieser Server hat eigene Einstellungen (sonst gilt die gemeinsame). */
    config(guildId?: string | null): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    save(actor: Actor, input: WelcomeConfig, guildId?: string | null): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame. */
    reset(actor: Actor, guildId: string): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    /** Hochgeladener Banner für den Bot (nur Bilder, die als Willkommens-Banner hochgeladen wurden). */
    /**
     * Test-Nachricht: der Bot schickt die gespeicherte Willkommens-/Abschiedsnachricht bzw. DM so, als wärst du gerade
     * beigetreten/gegangen (mit deinem Discord-Profil) – ohne Rollen oder Aktionen beim Verlassen.
     */
    test(actor: Actor, guildId: string | null, kind: 'welcome' | 'goodbye' | 'dm'): Promise<{
        queued: boolean;
    }>;
    banner(id: string): Promise<{
        mime: string;
        name: string;
        data: string;
    }>;
    /** Vom Bot: Mitglied hat den Server verlassen → offene Bewerbungen und Tickets nach Einstellung behandeln. Fehler eines Bereichs stoppen die anderen nicht. */
    memberLeft(guildId: string, discordId: string): Promise<{
        applications: {
            denied: number;
            withdrawn: number;
        };
        qualifications: {
            denied: number;
            withdrawn: number;
        };
        tickets: {
            closed: number;
        };
    }>;
}
