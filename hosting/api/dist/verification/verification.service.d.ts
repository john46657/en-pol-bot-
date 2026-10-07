import { z } from 'zod';
import { type VerifyConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { RobloxService } from '../persons/roblox.service';
export declare const verifyConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    verifiedRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    unverifiedRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    nickname: z.ZodDefault<z.ZodString>;
    autoOnJoin: z.ZodDefault<z.ZodBoolean>;
    logChannelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    panel: z.ZodDefault<z.ZodObject<{
        channelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
        title: z.ZodDefault<z.ZodString>;
        message: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        buttonLabel: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        color: string;
        channelId: string | null;
        title: string;
        buttonLabel: string;
    }, {
        message?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        title?: string | undefined;
        buttonLabel?: string | undefined;
    }>>;
    binds: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        groupId: z.ZodString;
        minRank: z.ZodNumber;
        maxRank: z.ZodNumber;
        roleIds: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }, {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    logChannelId: string | null;
    panel: {
        message: string;
        color: string;
        channelId: string | null;
        title: string;
        buttonLabel: string;
    };
    verifiedRoleIds: string[];
    unverifiedRoleIds: string[];
    nickname: string;
    autoOnJoin: boolean;
    binds: {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }[];
}, {
    enabled?: boolean | undefined;
    logChannelId?: string | null | undefined;
    panel?: {
        message?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        title?: string | undefined;
        buttonLabel?: string | undefined;
    } | undefined;
    verifiedRoleIds?: string[] | undefined;
    unverifiedRoleIds?: string[] | undefined;
    nickname?: string | undefined;
    autoOnJoin?: boolean | undefined;
    binds?: {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }[] | undefined;
}>, {
    enabled: boolean;
    logChannelId: string | null;
    panel: {
        message: string;
        color: string;
        channelId: string | null;
        title: string;
        buttonLabel: string;
    };
    verifiedRoleIds: string[];
    unverifiedRoleIds: string[];
    nickname: string;
    autoOnJoin: boolean;
    binds: {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }[];
}, {
    enabled?: boolean | undefined;
    logChannelId?: string | null | undefined;
    panel?: {
        message?: string | undefined;
        color?: string | undefined;
        channelId?: string | null | undefined;
        title?: string | undefined;
        buttonLabel?: string | undefined;
    } | undefined;
    verifiedRoleIds?: string[] | undefined;
    unverifiedRoleIds?: string[] | undefined;
    nickname?: string | undefined;
    autoOnJoin?: boolean | undefined;
    binds?: {
        id: string;
        groupId: string;
        roleIds: string[];
        minRank: number;
        maxRank: number;
    }[] | undefined;
}>;
/**
 * Roblox-Verifizierung wie bei RoVer: Mitglied nennt sein Roblox-Konto, bekommt ein paar Wörter, trägt sie in „Über mich“ ein,
 * der Bot prüft das öffentliche Profil. Danach gibt es Rollen (verifiziert, Gruppen-Ränge) und den Nickname nach Vorlage – auf allen Servern.
 */
export declare class VerificationService {
    private readonly prisma;
    private readonly audit;
    private readonly roblox;
    constructor(prisma: PrismaService, audit: AuditService, roblox: RobloxService);
    private keyOf;
    config(guildId?: string | null): Promise<VerifyConfig & {
        own: boolean;
        panelMessageId: string | null;
    }>;
    save(actor: Actor, input: VerifyConfig, guildId?: string | null): Promise<VerifyConfig & {
        own: boolean;
        panelMessageId: string | null;
    }>;
    /** Panel („Verifizieren“-Button) posten bzw. aktualisieren. */
    postPanel(actor: Actor, guildId: string | null): Promise<{
        queued: boolean;
    }>;
    panelPosted(guildId: string | null, channelId: string, messageId: string): Promise<{
        ok: boolean;
    }>;
    /** Schritt 1: Roblox-Konto nennen → Code. */
    start(guildId: string | undefined, discordId: string, input: string): Promise<{
        code: string;
        expiresAt: Date;
        roblox: {
            id: string;
            name: string;
            displayName: string;
            avatarUrl: string | null;
            profileUrl: string;
        };
    }>;
    /** Schritt 2: Steht der Code im Profil? Dann verknüpfen und Rollen/Nickname für diesen Server liefern. */
    check(guildId: string | undefined, discordId: string, discordName?: string): Promise<{
        enabled: boolean;
        link: {
            discordId: string;
            discordName: string | null;
            robloxId: string;
            robloxName: string;
            displayName: string;
            verifiedAt: Date;
            profileUrl: string;
        } | null;
        actions: {
            add: string[];
            remove: string[];
            nickname: string | null;
        } | null;
    }>;
    /** Verknüpfung + was der Bot auf diesem Server tun soll (Rollen, Nickname). */
    status(guildId: string | undefined, discordId: string, discordName?: string): Promise<{
        enabled: boolean;
        link: {
            discordId: string;
            discordName: string | null;
            robloxId: string;
            robloxName: string;
            displayName: string;
            verifiedAt: Date;
            profileUrl: string;
        } | null;
        actions: {
            add: string[];
            remove: string[];
            nickname: string | null;
        } | null;
    }>;
    unlink(actor: Actor | null, discordId: string): Promise<{
        ok: boolean;
    }>;
    /** Rollen/Nickname auf allen Servern neu setzen (nach Änderungen im Dashboard). */
    refresh(discordId: string): Promise<{
        queued: boolean;
    }>;
    list(q: {
        q?: string;
        page: number;
        pageSize: number;
    }): Promise<{
        items: {
            discordId: string;
            discordName: string | null;
            robloxId: string;
            robloxName: string;
            displayName: string;
            verifiedAt: Date;
            profileUrl: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    whois(discordId: string): Promise<{
        link: {
            discordId: string;
            discordName: string | null;
            robloxId: string;
            robloxName: string;
            displayName: string;
            verifiedAt: Date;
            profileUrl: string;
        } | null;
    }>;
    private view;
    /** Verknüpftes Dashboard-Konto und CAD-Zuordnung bekommen das bestätigte Roblox-Konto (falls dort noch keins/dasselbe steht). */
    private syncAccounts;
    private log;
}
