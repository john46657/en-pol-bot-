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
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }[]>, {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
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
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }>, "many">, {
        key: string;
        label: string;
        color?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[], {
        key: string;
        label: string;
        color?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
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
        label: string;
        emoji: string;
    }, {
        color: string;
        key: string;
        label: string;
        emoji: string;
    }>, "many">, {
        color: string;
        key: string;
        label: string;
        emoji: string;
    }[], {
        color: string;
        key: string;
        label: string;
        emoji: string;
    }[]>;
    map: z.ZodEffects<z.ZodUnknown, {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
    }, unknown>;
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
        event: z.ZodEnum<["incident.created", "incident.status", "incident.assigned", "incident.closed", "incident.feedback", "incident.support", "call.received", "announcement", "radio", "handover", "wanted.hit", "wanted.possible", "wanted.erlc"]>;
        channelIds: z.ZodArray<z.ZodString, "many">;
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        guildId: string;
        id: string;
        enabled: boolean;
        event: "radio" | "handover" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "incident.feedback" | "incident.support" | "call.received" | "announcement" | "wanted.hit" | "wanted.possible" | "wanted.erlc";
        channelIds: string[];
        pingRoleIds: string[];
    }, {
        guildId: string;
        id: string;
        event: "radio" | "handover" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "incident.feedback" | "incident.support" | "call.received" | "announcement" | "wanted.hit" | "wanted.possible" | "wanted.erlc";
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
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    map: {
        width: number;
        height: number;
        originX: number;
        originY: number;
        scale: number;
    };
    widgets: ("vehicles" | "units" | "map" | "persons" | "radio" | "activeIncidents" | "availableUnits" | "activeCalls" | "erlcStatus" | "dutyActivity")[];
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
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
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
        label: string;
        emoji: string;
    }[];
    routes: {
        guildId: string;
        id: string;
        enabled: boolean;
        event: "radio" | "handover" | "incident.created" | "incident.status" | "incident.assigned" | "incident.closed" | "incident.feedback" | "incident.support" | "call.received" | "announcement" | "wanted.hit" | "wanted.possible" | "wanted.erlc";
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
    unitTypes: {
        key: string;
        label: string;
        color?: string | undefined;
        layer?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
    }[];
    widgets: string[];
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
        emoji?: string | undefined;
        closed?: boolean | undefined;
    }[];
    unitStatuses: {
        key: string;
        label: string;
        color?: string | undefined;
        order?: number | undefined;
        emoji?: string | undefined;
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
        label: string;
        emoji: string;
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
    map?: unknown;
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
