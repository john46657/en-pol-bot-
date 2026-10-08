import { z } from 'zod';
import type { WelcomeConfig } from '@enrp/shared';
import { WelcomeService } from './welcome.service';
import type { Actor } from '../audit/audit.service';
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
declare const memberBody: z.ZodObject<{
    guildId: z.ZodString;
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    guildId: string;
}, {
    discordId: string;
    guildId: string;
}>;
/** Admin → Welcome & Goodbye. Server = `guildId` oder der oben gewählte Server; ohne Server die gemeinsame Grundeinstellung. */
export declare class WelcomeController {
    private readonly s;
    constructor(s: WelcomeService);
    config(q: z.infer<typeof guildQ>): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: WelcomeConfig): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    /** Test-Nachricht in Discord (gespeicherte Einstellungen, dein Profil als Beispiel-Mitglied). */
    test(a: Actor, q: z.infer<typeof guildQ>, b: {
        kind: 'welcome' | 'goodbye' | 'dm';
    }): Promise<{
        queued: boolean;
    }>;
    reset(a: Actor, q: z.infer<typeof guildQ>): Promise<WelcomeConfig & {
        own: boolean;
    }>;
}
/** Dienstweg des Bots: Einstellungen beim Beitritt lesen, Austritt melden. */
export declare class BotWelcomeController {
    private readonly s;
    constructor(s: WelcomeService);
    config(q: {
        guildId: string;
    }): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    banner(id: string): Promise<{
        mime: string;
        name: string;
        data: string;
    }>;
    memberLeft(b: z.infer<typeof memberBody>): Promise<{
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
export {};
