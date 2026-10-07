import { z } from 'zod';
import { type CadConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
export declare const cadConfigSchema: z.ZodObject<{
    homeGuildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    incidentNumberPrefix: z.ZodDefault<z.ZodString>;
    incidentTypes: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[]>;
    priorities: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[]>;
    incidentStatuses: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodNumber>;
    } & {
        closed: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[]>, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[]>;
    unitStatuses: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[]>;
    unitTypes: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodNumber>;
    } & {
        layer: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }[]>;
    layers: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        builtin: z.ZodOptional<z.ZodBoolean>;
        enabledByDefault: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }, {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }>, "many">, {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[], {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[]>;
    markers: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodString;
        color: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }, {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }>, "many">, {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }[], {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }[]>;
    map: z.ZodObject<{
        imageUrl: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        originX: z.ZodNumber;
        originY: z.ZodNumber;
        scale: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
        imageUrl?: string | null | undefined;
    }, {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
        imageUrl?: string | null | undefined;
    }>;
    routes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        guildId: z.ZodString;
        event: z.ZodEnum<["incident.created", "incident.status", "incident.assigned", "incident.closed", "call.received", "announcement", "radio"]>;
        channelIds: z.ZodArray<z.ZodString, "many">;
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        guildId: string;
        enabled: boolean;
        event: "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received" | "announcement";
        channelIds: string[];
        pingRoleIds: string[];
    }, {
        id: string;
        guildId: string;
        event: "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received" | "announcement";
        channelIds: string[];
        enabled?: boolean | undefined;
        pingRoleIds?: string[] | undefined;
    }>, "many">;
    memberFields: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "number", "select"]>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }, {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }>, "many">, {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }[], {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }[]>;
    widgets: z.ZodArray<z.ZodEnum<["activeIncidents", "availableUnits", "erlcPlayers", "erlcQueue", "activeCalls", "staffOnline", "erlcStatus", "map", "units", "radio", "persons", "vehicles"]>, "many">;
}, "strip", z.ZodTypeAny, {
    map: {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
        imageUrl?: string | null | undefined;
    };
    widgets: ("map" | "persons" | "vehicles" | "radio" | "activeIncidents" | "availableUnits" | "erlcPlayers" | "erlcQueue" | "activeCalls" | "staffOnline" | "erlcStatus" | "units")[];
    incidentNumberPrefix: string;
    incidentTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    priorities: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    incidentStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }[];
    layers: {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[];
    markers: {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }[];
    routes: {
        id: string;
        guildId: string;
        enabled: boolean;
        event: "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received" | "announcement";
        channelIds: string[];
        pingRoleIds: string[];
    }[];
    memberFields: {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }[];
    homeGuildId?: string | null | undefined;
}, {
    map: {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
        imageUrl?: string | null | undefined;
    };
    widgets: ("map" | "persons" | "vehicles" | "radio" | "activeIncidents" | "availableUnits" | "erlcPlayers" | "erlcQueue" | "activeCalls" | "staffOnline" | "erlcStatus" | "units")[];
    incidentTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    priorities: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    incidentStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
        emoji?: string | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
    }[];
    layers: {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[];
    markers: {
        key: string;
        color: string;
        label: string;
        emoji: string;
    }[];
    routes: {
        id: string;
        guildId: string;
        event: "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received" | "announcement";
        channelIds: string[];
        enabled?: boolean | undefined;
        pingRoleIds?: string[] | undefined;
    }[];
    memberFields: {
        key: string;
        type: "number" | "select" | "text";
        label: string;
        options?: string[] | undefined;
    }[];
    homeGuildId?: string | null | undefined;
    incidentNumberPrefix?: string | undefined;
}>;
/** Zentrale CAD-Konfiguration (eine Quelle für Backend, Dashboard und Bot). Fehlt etwas, gelten die Standardwerte. */
export declare class CadConfigService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    get(): Promise<CadConfig>;
    /** Teil-Update (Autosave schickt einzelne Bereiche). */
    save(actor: Actor, patch: Partial<CadConfig>): Promise<CadConfig>;
}
