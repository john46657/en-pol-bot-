import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { ApplicationBansService } from './application-bans.service';
declare const createBody: z.ZodObject<{
    discordId: z.ZodUnion<[z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodLiteral<"">]>;
    roblox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    scopes: z.ZodArray<z.ZodString, "many">;
    reason: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    scopes: string[];
    discordId?: string | null | undefined;
    name?: string | null | undefined;
    expiresAt?: string | null | undefined;
    roblox?: string | null | undefined;
}, {
    reason: string;
    scopes: string[];
    discordId?: string | null | undefined;
    name?: string | null | undefined;
    expiresAt?: string | null | undefined;
    roblox?: string | null | undefined;
}>;
export declare class ApplicationBansController {
    private readonly s;
    constructor(s: ApplicationBansService);
    list(q: {
        all?: string;
    }): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }[]>;
    create(a: Actor, b: z.infer<typeof createBody>): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }>;
    lift(a: Actor, id: string): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }>;
}
/** Für den Bot: vor dem Start einer Bewerbung prüfen (auch ohne verknüpftes Konto). */
export declare class BotApplicationBansController {
    private readonly s;
    constructor(s: ApplicationBansService);
    check(q: {
        discordId: string;
        scope: string;
        name?: string;
        guildId?: string;
    }): Promise<{
        banned: boolean;
        message: string;
    } | {
        banned: boolean;
        message: null;
    }>;
}
export {};
