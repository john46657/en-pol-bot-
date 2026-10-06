import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/** Schicht-Art (wie bei Melonly/ERM): Rolle im Dienst, Rolle in der Pause, Log-Channel. */
export declare const shiftTypeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    onShiftRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    onBreakRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    isDefault: boolean;
    onShiftRoleIds: string[];
    onBreakRoleIds: string[];
    logChannelId?: string | null | undefined;
}, {
    id: string;
    name: string;
    logChannelId?: string | null | undefined;
    isDefault?: boolean | undefined;
    onShiftRoleIds?: string[] | undefined;
    onBreakRoleIds?: string[] | undefined;
}>;
export declare const shiftsConfigSchema: z.ZodEffects<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    types: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        isDefault: z.ZodDefault<z.ZodBoolean>;
        onShiftRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        onBreakRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        logChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        logChannelId?: string | null | undefined;
    }, {
        id: string;
        name: string;
        logChannelId?: string | null | undefined;
        isDefault?: boolean | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    types: {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        logChannelId?: string | null | undefined;
    }[];
}, {
    enabled?: boolean | undefined;
    types?: {
        id: string;
        name: string;
        logChannelId?: string | null | undefined;
        isDefault?: boolean | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
    }[] | undefined;
}>, {
    enabled: boolean;
    types: {
        id: string;
        name: string;
        isDefault: boolean;
        onShiftRoleIds: string[];
        onBreakRoleIds: string[];
        logChannelId?: string | null | undefined;
    }[];
}, {
    enabled?: boolean | undefined;
    types?: {
        id: string;
        name: string;
        logChannelId?: string | null | undefined;
        isDefault?: boolean | undefined;
        onShiftRoleIds?: string[] | undefined;
        onBreakRoleIds?: string[] | undefined;
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
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
    /** Welche Schicht-Art gilt? Gewählte → bei Pause die laufende → Standard. `null`, wenn das Modul aus ist. */
    resolve(cfg: ShiftsConfig, requested: string | undefined, current: string | null | undefined): Promise<ShiftType | null>;
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
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
    save(a: Actor, b: ShiftsConfig): Promise<{
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
}
export declare class BotShiftsController {
    private readonly s;
    constructor(s: ShiftsService);
    config(): Promise<{
        enabled: boolean;
        types: {
            id: string;
            name: string;
            isDefault: boolean;
            onShiftRoleIds: string[];
            onBreakRoleIds: string[];
            logChannelId?: string | null | undefined;
        }[];
    }>;
}
