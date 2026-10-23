import { z } from 'zod';
import { type AiReviewSettings } from '@enrp/shared';
import type { Actor } from '../../audit/audit.service';
import type { AuthUser } from '../../common/request-context';
import { AiReviewService } from './ai-review.service';
declare const startBody: z.ZodObject<{
    force: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    force?: boolean | undefined;
}, {
    force?: boolean | undefined;
}>;
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
/** KI-Prüfung der Polizei-Bewerbung: Ansehen und Starten nur für Prüfer (applications.review) bzw. Discord-Manager-Rollen. */
export declare class PoliceAiReviewController {
    private readonly ai;
    constructor(ai: AiReviewService);
    /** Gespeicherter Stand – startet nie eine Analyse. */
    get(id: string): Promise<import("@enrp/shared").AiReviewState & {
        number: string;
        dashboardUrl: string;
    }>;
    /** Analyse ausdrücklich starten (`force` = trotz aktuellem Ergebnis neu analysieren). */
    start(a: Actor, u: AuthUser, id: string, b: z.infer<typeof startBody>): Promise<import("@enrp/shared").AiReviewState & {
        number: string;
        dashboardUrl: string;
        started: boolean;
    }>;
}
/** KI-Prüfung der Bewerbungen für Einheiten (SEK, Flugstaffel …): wer über sie entscheiden darf (qualifications.decide). */
export declare class QualificationAiReviewController {
    private readonly ai;
    constructor(ai: AiReviewService);
    get(id: string): Promise<import("@enrp/shared").AiReviewState & {
        number: string;
        dashboardUrl: string;
    }>;
    start(a: Actor, u: AuthUser, id: string, b: z.infer<typeof startBody>): Promise<import("@enrp/shared").AiReviewState & {
        number: string;
        dashboardUrl: string;
        started: boolean;
    }>;
}
/** Einstellungen (RP-Regeln, Auswahlkriterien, an/aus) je Server und Status (Schlüssel hinterlegt, Modell, Nutzung). */
export declare class AiReviewSettingsController {
    private readonly ai;
    constructor(ai: AiReviewService);
    status(q: z.infer<typeof guildQ>): Promise<{
        configured: boolean;
        enabled: boolean;
        provider: "gemini";
        model: string;
        dailyLimit: number;
        usedToday: number;
        maxConcurrent: number;
        maxInputChars: number;
        timeoutMs: number;
    }>;
    settings(q: z.infer<typeof guildQ>): Promise<{
        enabled: boolean;
        rules: string;
        criteria: string;
    } & {
        own: boolean;
    }>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: AiReviewSettings): Promise<{
        enabled: boolean;
        rules: string;
        criteria: string;
    } & {
        own: boolean;
    }>;
}
/** Integrationsdiagnose im Bot (`/system integrations`): nur ob eingerichtet, Modell und Nutzung – nie der Schlüssel. */
export declare class BotAiReviewController {
    private readonly ai;
    constructor(ai: AiReviewService);
    status(q: z.infer<typeof guildQ>): Promise<{
        configured: boolean;
        enabled: boolean;
        provider: "gemini";
        model: string;
        dailyLimit: number;
        usedToday: number;
        maxConcurrent: number;
        maxInputChars: number;
        timeoutMs: number;
    }>;
}
export {};
