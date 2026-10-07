import type { Response } from 'express';
import { z } from 'zod';
import type { VerifyConfig } from '@enrp/shared';
import { VerificationService } from './verification.service';
import { RobloxOAuthService, type OAuthSettings } from './roblox-oauth.service';
import type { Actor } from '../audit/audit.service';
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
declare const member: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodString;
    discordName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    guildId?: string | undefined;
    discordName?: string | undefined;
}, {
    discordId: string;
    guildId?: string | undefined;
    discordName?: string | undefined;
}>;
/** Administration → Roblox-Verifizierung. */
export declare class VerificationController {
    private readonly s;
    private readonly oauth;
    constructor(s: VerificationService, oauth: RobloxOAuthService);
    oauthSettings(): Promise<{
        enabled: boolean;
        fromEnv: boolean;
        clientId: string;
        hasSecret: boolean;
        redirectUri: string;
    }>;
    saveOauth(a: Actor, b: OAuthSettings): Promise<{
        enabled: boolean;
        fromEnv: boolean;
        clientId: string;
        hasSecret: boolean;
        redirectUri: string;
    }>;
    config(q: z.infer<typeof guildQ>): Promise<VerifyConfig & {
        own: boolean;
        panelMessageId: string | null;
    }>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: VerifyConfig): Promise<VerifyConfig & {
        own: boolean;
        panelMessageId: string | null;
    }>;
    panel(a: Actor, q: z.infer<typeof guildQ>): Promise<{
        queued: boolean;
    }>;
    list(q: z.infer<typeof listQ>): Promise<{
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
    unlink(a: Actor, id: string): Promise<{
        ok: boolean;
    }>;
    refresh(id: string): Promise<{
        queued: boolean;
    }>;
}
/** Dienstweg des Bots: Verifizieren, Status (Beitritt, /aktualisieren), Panel-Ort melden. */
export declare class BotVerificationController {
    private readonly s;
    private readonly oauth;
    constructor(s: VerificationService, oauth: RobloxOAuthService);
    /** „Mit Roblox anmelden“: eingerichtet? Dann Anmelde-Link für dieses Mitglied. */
    oauthLink(b: z.infer<typeof member>): Promise<{
        url: string;
        expiresAt: Date;
        enabled: boolean;
    } | {
        enabled: boolean;
    }>;
    config(q: {
        guildId: string;
    }): Promise<VerifyConfig & {
        own: boolean;
        panelMessageId: string | null;
    }>;
    start(b: z.infer<typeof member> & {
        roblox: string;
    }): Promise<{
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
    check(b: z.infer<typeof member>): Promise<{
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
    status(b: z.infer<typeof member>): Promise<{
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
    whois(q: {
        discordId: string;
    }): Promise<{
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
    unlink(b: {
        discordId: string;
    }): Promise<{
        ok: boolean;
    }>;
    posted(b: {
        guildId?: string | null;
        channelId: string;
        messageId: string;
    }): Promise<{
        ok: boolean;
    }>;
}
/** Rücksprung von Roblox (diese Adresse muss in der Roblox-OAuth-App als Redirect-URL stehen). */
export declare class RobloxOAuthController {
    private readonly oauth;
    constructor(oauth: RobloxOAuthService);
    callback(code: string | undefined, state: string | undefined, error: string | undefined, res: Response): Promise<Response<any, Record<string, any>>>;
}
export {};
