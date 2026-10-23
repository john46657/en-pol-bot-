import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/** Schicht-Art (wie bei Melonly/ERM/Trident): Rolle im Dienst, Rolle in der Pause, Log-Channel, erlaubte Rollen. */
export declare const shiftTypeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    onShiftRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    onBreakRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Nur Mitglieder mit einer dieser Discord-Rollen dürfen die Schichtart starten (leer = alle). */
    permittedRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    isDefault: boolean;
    onShiftRoleIds: string[];
    onBreakRoleIds: string[];
    permittedRoleIds: string[];
    logChannelId?: string | null | undefined;
}, {
    id: string;
    name: string;
    isDefault?: boolean | undefined;
    logChannelId?: string | null | undefined;
    onShiftRoleIds?: string[] | undefined;
    onBreakRoleIds?: string[] | undefined;
    permittedRoleIds?: string[] | undefined;
}>;
/** Erinnerung, wenn jemand „Im Dienst“ ist, aber länger nichts gemacht hat (Dashboard/MDT, Discord). */
export declare const reminderSchema: z.ZodDefault<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Minuten ohne Aktivität bis zur Erinnerung */
    afterMinutes: z.ZodDefault<z.ZodNumber>;
    /** Minuten nach der Erinnerung ohne Reaktion → automatisch außer Dienst (0 = nie) */
    autoOffMinutes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    afterMinutes: number;
    autoOffMinutes: number;
}, {
    enabled?: boolean | undefined;
    afterMinutes?: number | undefined;
    autoOffMinutes?: number | undefined;
}>>;
export declare const shiftsConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    types: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        isDefault: z.ZodDefault<z.ZodBoolean>;
        onShiftRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        onBreakRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        /** Nur Mitglieder mit einer dieser Discord-Rollen dürfen die Schichtart starten (leer = alle). */
        permittedRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        permittedRoleIds: string[];
        logChannelId?: string | null | undefined;
    }, {
        id: string;
        name: string;
        isDefault?: boolean | undefined;
        logChannelId?: string | null | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
        permittedRoleIds?: string[] | undefined;
    }>, "many">>;
    reminder: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        /** Minuten ohne Aktivität bis zur Erinnerung */
        afterMinutes: z.ZodDefault<z.ZodNumber>;
        /** Minuten nach der Erinnerung ohne Reaktion → automatisch außer Dienst (0 = nie) */
        autoOffMinutes: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        afterMinutes: number;
        autoOffMinutes: number;
    }, {
        enabled?: boolean | undefined;
        afterMinutes?: number | undefined;
        autoOffMinutes?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    reminder: {
        enabled: boolean;
        afterMinutes: number;
        autoOffMinutes: number;
    };
    enabled: boolean;
    types: {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        permittedRoleIds: string[];
        logChannelId?: string | null | undefined;
    }[];
}, {
    reminder?: {
        enabled?: boolean | undefined;
        afterMinutes?: number | undefined;
        autoOffMinutes?: number | undefined;
    } | undefined;
    enabled?: boolean | undefined;
    types?: {
        id: string;
        name: string;
        isDefault?: boolean | undefined;
        logChannelId?: string | null | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
        permittedRoleIds?: string[] | undefined;
    }[] | undefined;
}>, {
    reminder: {
        enabled: boolean;
        afterMinutes: number;
        autoOffMinutes: number;
    };
    enabled: boolean;
    types: {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        permittedRoleIds: string[];
        logChannelId?: string | null | undefined;
    }[];
}, {
    reminder?: {
        enabled?: boolean | undefined;
        afterMinutes?: number | undefined;
        autoOffMinutes?: number | undefined;
    } | undefined;
    enabled?: boolean | undefined;
    types?: {
        id: string;
        name: string;
        isDefault?: boolean | undefined;
        logChannelId?: string | null | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
        permittedRoleIds?: string[] | undefined;
    }[] | undefined;
}>;
export type ShiftType = z.infer<typeof shiftTypeSchema>;
export type ShiftsConfig = z.infer<typeof shiftsConfigSchema>;
export declare class ShiftsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    config(): Promise<ShiftsConfig>;
    save(actor: Actor, input: ShiftsConfig): Promise<{
        reminder: {
            enabled: boolean;
            afterMinutes: number;
            autoOffMinutes: number;
        };
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            permittedRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
    /** Welche Schicht-Art gilt? Gewählte → bei Pause die laufende → Standard. `null`, wenn das Modul aus ist. */
    resolve(cfg: ShiftsConfig, requested: string | undefined, current: string | null | undefined): Promise<ShiftType | null>;
    /** Darf jemand mit diesen Discord-Rollen die Schichtart nutzen? Ohne erlaubte Rollen: alle. */
    static permitted(type: ShiftType, discordRoleIds: readonly string[]): boolean;
    /** Discord-Rollen je Status: Schicht-Rolle im Dienst, Pausen-Rolle in der Pause; alle anderen Schicht-Rollen weg. */
    static roleChanges(cfg: ShiftsConfig, type: ShiftType | null, status: string): {
        add: string[];
        remove: string[];
    };
}
export declare class ShiftsController {
    private readonly s;
    constructor(s: ShiftsService);
    /** Schicht-Arten (Auswahl beim Dienstbeginn). */
    config(): Promise<{
        reminder: {
            enabled: boolean;
            afterMinutes: number;
            autoOffMinutes: number;
        };
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            permittedRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
    save(a: Actor, b: ShiftsConfig): Promise<{
        reminder: {
            enabled: boolean;
            afterMinutes: number;
            autoOffMinutes: number;
        };
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            permittedRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
}
export declare class BotShiftsController {
    private readonly s;
    constructor(s: ShiftsService);
    config(): Promise<{
        reminder: {
            enabled: boolean;
            afterMinutes: number;
            autoOffMinutes: number;
        };
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            permittedRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
}
