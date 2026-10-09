import { z } from 'zod';
import { type DangerConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
export interface DangerState {
    level: string;
    reason: string | null;
    setByName: string | null;
    at: string | null;
}
export declare const dangerConfigSchema: z.ZodObject<{
    panelTitle: z.ZodString;
    panelText: z.ZodString;
    buttonEmoji: z.ZodString;
    pingRoleIds: z.ZodArray<z.ZodString, "many">;
    levels: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodString;
        title: z.ZodString;
        text: z.ZodString;
        emoji: z.ZodString;
        color: z.ZodString;
        buttonStyle: z.ZodEnum<["primary", "secondary", "success", "danger"]>;
        /** zusätzlich nur bei dieser Stufe pingen */
        pingRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }, {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }>, "many">, {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }[], {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }[]>;
}, "strip", z.ZodTypeAny, {
    pingRoleIds: string[];
    panelTitle: string;
    panelText: string;
    buttonEmoji: string;
    levels: {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }[];
}, {
    pingRoleIds: string[];
    panelTitle: string;
    panelText: string;
    buttonEmoji: string;
    levels: {
        title: string;
        name: string;
        color: string;
        key: string;
        emoji: string;
        buttonStyle: "success" | "danger" | "primary" | "secondary";
        text: string;
        pingRoleIds?: string[] | undefined;
    }[];
}>;
/** Gefahrenstatus. Stufen/Texte/Farben/Pings kommen aus der Konfiguration (Dashboard); Änderungen sind auditiert und gehen live raus. */
export declare class DangerService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService, discord: DiscordService);
    config(): Promise<DangerConfig>;
    saveConfig(actor: Actor, input: DangerConfig): Promise<DangerConfig>;
    private state;
    /** Aktueller Status inkl. Stufe aus der Konfiguration und der Liste aller Stufen (für Buttons/Anzeige). */
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
    set(actor: Actor, level: string, reason?: string): Promise<{
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
    /** Wo das Button-Panel gerade steht (merkt sich der Bot). */
    panel(): Promise<{
        channelId: string | null;
        posted: boolean;
    }>;
    /** Panel vom Dashboard aus in einen Kanal schicken (der Bot postet es und löscht ein älteres Panel). */
    sendPanel(actor: Actor, channelId: string): Promise<{
        queued: boolean;
    }>;
}
