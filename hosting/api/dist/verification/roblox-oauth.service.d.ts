import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { VerificationService } from './verification.service';
export declare const oauthSettingsSchema: z.ZodObject<{
    clientId: z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>;
    /** Leer lassen = bisheriges Secret behalten. */
    clientSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    clientSecret?: string | undefined;
}, {
    clientId: string;
    clientSecret?: string | undefined;
}>;
export type OAuthSettings = z.infer<typeof oauthSettingsSchema>;
export declare class RobloxOAuthFailure extends Error {
}
/**
 * „Mit Roblox anmelden“ (OAuth 2.0, Scopes `openid profile`) – wie bei RoVer: Das Mitglied meldet sich direkt bei Roblox an,
 * Roblox bestätigt das Konto, danach gibt es Rollen und Nickname. Der Vorgang gehört über einen einmaligen `state` zum Discord-Mitglied.
 */
export declare class RobloxOAuthService {
    private readonly prisma;
    private readonly audit;
    private readonly verification;
    private readonly env;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, verification: VerificationService);
    redirectUri(): string;
    private creds;
    enabled(): Promise<boolean>;
    /** Für das Dashboard – das Secret verlässt den Server nie. */
    settings(): Promise<{
        enabled: boolean;
        fromEnv: boolean;
        clientId: string;
        hasSecret: boolean;
        redirectUri: string;
    }>;
    save(actor: Actor, input: OAuthSettings): Promise<{
        enabled: boolean;
        fromEnv: boolean;
        clientId: string;
        hasSecret: boolean;
        redirectUri: string;
    }>;
    /** Bot: Anmelde-Link für ein Mitglied (10 Minuten, einmal verwendbar). */
    link(guildId: string | undefined, discordId: string, discordName?: string): Promise<{
        url: string;
        expiresAt: Date;
    }>;
    /** Rücksprung von Roblox: Code einlösen, Konto lesen, verknüpfen; Rollen setzt der Bot gleich auf allen Servern. */
    callback(code: string | undefined, state: string | undefined): Promise<{
        robloxName: string;
        displayName: string;
    }>;
    private fetchUser;
}
