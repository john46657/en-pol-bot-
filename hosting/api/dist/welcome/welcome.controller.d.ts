import { z } from 'zod';
import type { WelcomeConfig } from '@enrp/shared';
import { WelcomeService } from './welcome.service';
import type { Actor } from '../audit/audit.service';
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
/** Admin → Welcome & Goodbye. */
export declare class WelcomeController {
    private readonly s;
    constructor(s: WelcomeService);
    config(): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    save(a: Actor, b: WelcomeConfig): Promise<WelcomeConfig & {
        own: boolean;
    }>;
    /** Test-Nachricht in Discord (gespeicherte Einstellungen, dein Profil als Beispiel-Mitglied). */
    test(a: Actor, b: {
        kind: 'welcome' | 'goodbye' | 'dm';
    }): Promise<{
        queued: boolean;
    }>;
}
/** Dienstweg des Bots: Einstellungen beim Beitritt lesen, Austritt melden. */
export declare class BotWelcomeController {
    private readonly s;
    constructor(s: WelcomeService);
    config(): Promise<WelcomeConfig & {
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
