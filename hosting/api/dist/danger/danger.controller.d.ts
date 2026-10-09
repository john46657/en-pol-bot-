import { z } from 'zod';
import { dangerConfigSchema, DangerService } from './danger.service';
import type { Actor } from '../audit/audit.service';
declare const panelBody: z.ZodObject<{
    channelId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    channelId: string;
}, {
    channelId: string;
}>;
declare const body: z.ZodObject<{
    level: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    level: string;
    reason?: string | undefined;
}, {
    level: string;
    reason?: string | undefined;
}>;
export declare class DangerController {
    private readonly d;
    constructor(d: DangerService);
    get(): Promise<{
        level: string;
        def: import("@enrp/shared").DangerLevelDef;
        levels: {
            key: string;
            name: string;
            title: string;
            emoji: string;
            color: string;
            buttonStyle: "success" | "danger" | "primary" | "secondary";
        }[];
        panel: {
            title: string;
            text: string;
            buttonEmoji: string;
        };
        reason: string | null;
        setByName: string | null;
        at: string | null;
    }>;
    set(a: Actor, b: z.infer<typeof body>): Promise<{
        level: string;
        def: import("@enrp/shared").DangerLevelDef;
        levels: {
            key: string;
            name: string;
            title: string;
            emoji: string;
            color: string;
            buttonStyle: "success" | "danger" | "primary" | "secondary";
        }[];
        panel: {
            title: string;
            text: string;
            buttonEmoji: string;
        };
        reason: string | null;
        setByName: string | null;
        at: string | null;
    }>;
    /** Stufen, Texte, Farben, Buttons und Pings (Dashboard). */
    config(): Promise<import("@enrp/shared").DangerConfig>;
    /** Button-Panel (Status per Klick) in einen Discord-Kanal senden. */
    panel(): Promise<{
        channelId: string | null;
        posted: boolean;
    }>;
    sendPanel(a: Actor, b: z.infer<typeof panelBody>): Promise<{
        queued: boolean;
    }>;
    saveConfig(a: Actor, b: z.infer<typeof dangerConfigSchema>): Promise<import("@enrp/shared").DangerConfig>;
}
export {};
