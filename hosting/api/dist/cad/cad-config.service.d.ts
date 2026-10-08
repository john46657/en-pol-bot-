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
        emoji?: string | undefined;
        order?: number | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
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
        emoji?: string | undefined;
        order?: number | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
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
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }[]>, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
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
        emoji?: string | undefined;
        order?: number | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
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
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
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
        color: string;
        key: string;
        emoji: string;
        label: string;
    }, {
        color: string;
        key: string;
        emoji: string;
        label: string;
    }>, "many">, {
        color: string;
        key: string;
        emoji: string;
        label: string;
    }[], {
        color: string;
        key: string;
        emoji: string;
        label: string;
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
    routes: z.ZodPipeline<z.ZodEffects<z.ZodArray<z.ZodObject<{
        event: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        event: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        event: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, "many">, z.objectOutputType<{
        event: z.ZodString;
    }, z.ZodTypeAny, "passthrough">[], z.objectInputType<{
        event: z.ZodString;
    }, z.ZodTypeAny, "passthrough">[]>, z.ZodArray<z.ZodObject<{
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
        event: "announcement" | "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received";
        channelIds: string[];
        pingRoleIds: string[];
    }, {
        id: string;
        guildId: string;
        event: "announcement" | "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received";
        channelIds: string[];
        enabled?: boolean | undefined;
        pingRoleIds?: string[] | undefined;
    }>, "many">>;
    memberFields: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "number", "select"]>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "number" | "select" | "text";
        key: string;
        label: string;
        options?: string[] | undefined;
    }, {
        type: "number" | "select" | "text";
        key: string;
        label: string;
        options?: string[] | undefined;
    }>, "many">, {
        type: "number" | "select" | "text";
        key: string;
        label: string;
        options?: string[] | undefined;
    }[], {
        type: "number" | "select" | "text";
        key: string;
        label: string;
        options?: string[] | undefined;
    }[]>;
    widgets: z.ZodPipeline<z.ZodEffects<z.ZodArray<z.ZodString, "many">, ("vehicles" | "units" | "map" | "persons" | "radio" | "activeIncidents" | "availableUnits" | "activeCalls" | "erlcStatus" | "dutyActivity")[], string[]>, z.ZodArray<z.ZodEnum<["activeIncidents", "availableUnits", "activeCalls", "erlcStatus", "map", "units", "radio", "persons", "vehicles", "dutyActivity"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    map: {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
        imageUrl?: string | null | undefined;
    };
    widgets: ("vehicles" | "units" | "map" | "persons" | "radio" | "activeIncidents" | "availableUnits" | "activeCalls" | "erlcStatus" | "dutyActivity")[];
    incidentNumberPrefix: string;
    incidentTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    priorities: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    incidentStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
    }[];
    layers: {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[];
    markers: {
        color: string;
        key: string;
        emoji: string;
        label: string;
    }[];
    routes: {
        id: string;
        guildId: string;
        enabled: boolean;
        event: "announcement" | "radio" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "call.received";
        channelIds: string[];
        pingRoleIds: string[];
    }[];
    memberFields: {
        type: "number" | "select" | "text";
        key: string;
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
    widgets: string[];
    incidentTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    priorities: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    incidentStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
        closed?: boolean | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        order?: number | undefined;
    }[];
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
    }[];
    layers: {
        key: string;
        label: string;
        builtin?: boolean | undefined;
        enabledByDefault?: boolean | undefined;
    }[];
    markers: {
        color: string;
        key: string;
        emoji: string;
        label: string;
    }[];
    routes: z.objectInputType<{
        event: z.ZodString;
    }, z.ZodTypeAny, "passthrough">[];
    memberFields: {
        type: "number" | "select" | "text";
        key: string;
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
