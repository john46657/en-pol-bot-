import type { Response } from 'express';
import { z } from 'zod';
import { RadioWhitelistService } from './radio-whitelist.service';
import type { Actor } from '../audit/audit.service';
declare const target: z.ZodEffects<z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["active", "suspended", "expired", "pending", "disabled", "revoked", "all", "open"]>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "all" | "pending" | "open" | "disabled" | "suspended" | "expired" | "revoked";
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    status?: "active" | "all" | "pending" | "open" | "disabled" | "suspended" | "expired" | "revoked" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const createB: z.ZodObject<{
    discordId: z.ZodString;
    discordName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    rank: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    department: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    externalName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    reason: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    status: z.ZodDefault<z.ZodEnum<["ACTIVE", "PENDING"]>>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "ACTIVE";
    reason: string;
    discordId: string;
    discordName: string | null;
    department: string | null;
    rank: string | null;
    externalName: string | null;
    expiresAt?: Date | null | undefined;
}, {
    reason: string;
    discordId: string;
    status?: "PENDING" | "ACTIVE" | undefined;
    expiresAt?: Date | null | undefined;
    discordName?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    externalName?: string | null | undefined;
}>;
declare const updateB: z.ZodObject<{
    version: z.ZodNumber;
    discordName: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>>;
    rank: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>>;
    department: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>>;
    externalName: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>>;
    reason: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>>;
}, "strip", z.ZodTypeAny, {
    version: number;
    reason?: string | null | undefined;
    discordName?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    externalName?: string | null | undefined;
}, {
    version: number;
    reason?: string | null | undefined;
    discordName?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    externalName?: string | null | undefined;
}>;
declare const activateB: z.ZodObject<{
    reason: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string | null;
    version?: number | undefined;
    expiresAt?: Date | null | undefined;
}, {
    version?: number | undefined;
    reason?: string | null | undefined;
    expiresAt?: Date | null | undefined;
}>;
declare const reasonB: z.ZodObject<{
    reason: z.ZodString;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    version?: number | undefined;
}, {
    reason: string;
    version?: number | undefined;
}>;
declare const extendB: z.ZodObject<{
    expiresAt: z.ZodNullable<z.ZodDate>;
    reason: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string | null;
    expiresAt: Date | null;
    version?: number | undefined;
}, {
    expiresAt: Date | null;
    version?: number | undefined;
    reason?: string | null | undefined;
}>;
declare const suspendB: z.ZodObject<{
    reason: z.ZodString;
    until: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    version?: number | undefined;
    until?: Date | null | undefined;
}, {
    reason: string;
    version?: number | undefined;
    until?: Date | null | undefined;
}>;
declare const unsuspendB: z.ZodObject<{
    reason: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason: string | null;
    version?: number | undefined;
}, {
    version?: number | undefined;
    reason?: string | null | undefined;
}>;
declare const restoreB: z.ZodObject<{
    reason: z.ZodString;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    expiresAt?: Date | null | undefined;
}, {
    reason: string;
    expiresAt?: Date | null | undefined;
}>;
declare const discordIdB: z.ZodObject<{
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    discordId: string;
}, {
    discordId: string;
}>;
declare const requestsQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["PENDING", "DONE", "ALL"]>>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "ALL" | "DONE";
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    status?: "PENDING" | "ALL" | "DONE" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const decideB: z.ZodObject<{
    decision: z.ZodEnum<["APPROVE", "REJECT"]>;
    reason: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    reason: string | null;
    decision: "APPROVE" | "REJECT";
    expiresAt?: Date | null | undefined;
}, {
    decision: "APPROVE" | "REJECT";
    reason?: string | null | undefined;
    expiresAt?: Date | null | undefined;
}>;
declare const rolesB: z.ZodObject<{
    roleSync: z.ZodObject<{
        enabled: z.ZodBoolean;
        roleOnly: z.ZodDefault<z.ZodBoolean>;
        grantRoleIds: z.ZodArray<z.ZodString, "many">;
        requiredRoleIds: z.ZodArray<z.ZodString, "many">;
        onRoleGain: z.ZodEnum<["ACTIVATE", "PENDING", "NONE"]>;
        onRoleLoss: z.ZodEnum<["REVOKE", "DISABLE", "NONE"]>;
        manualOnRoleLoss: z.ZodEnum<["KEEP", "DISABLE", "REVOKE"]>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        grantRoleIds: string[];
        requiredRoleIds: string[];
        roleOnly: boolean;
        onRoleGain: "PENDING" | "NONE" | "ACTIVATE";
        onRoleLoss: "NONE" | "REVOKE" | "DISABLE";
        manualOnRoleLoss: "REVOKE" | "DISABLE" | "KEEP";
    }, {
        enabled: boolean;
        grantRoleIds: string[];
        requiredRoleIds: string[];
        onRoleGain: "PENDING" | "NONE" | "ACTIVATE";
        onRoleLoss: "NONE" | "REVOKE" | "DISABLE";
        manualOnRoleLoss: "REVOKE" | "DISABLE" | "KEEP";
        roleOnly?: boolean | undefined;
    }>;
    radioRoleIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    roleSync: {
        enabled: boolean;
        grantRoleIds: string[];
        requiredRoleIds: string[];
        roleOnly: boolean;
        onRoleGain: "PENDING" | "NONE" | "ACTIVATE";
        onRoleLoss: "NONE" | "REVOKE" | "DISABLE";
        manualOnRoleLoss: "REVOKE" | "DISABLE" | "KEEP";
    };
    radioRoleIds: string[];
}, {
    roleSync: {
        enabled: boolean;
        grantRoleIds: string[];
        requiredRoleIds: string[];
        onRoleGain: "PENDING" | "NONE" | "ACTIVATE";
        onRoleLoss: "NONE" | "REVOKE" | "DISABLE";
        manualOnRoleLoss: "REVOKE" | "DISABLE" | "KEEP";
        roleOnly?: boolean | undefined;
    };
    radioRoleIds: string[];
}>;
declare const requestsB: z.ZodObject<{
    requests: z.ZodObject<{
        enabled: z.ZodBoolean;
        preventDuplicates: z.ZodBoolean;
        notifyChannelId: z.ZodNullable<z.ZodString>;
        approveRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        panel: z.ZodObject<{
            channelId: z.ZodNullable<z.ZodString>;
            title: z.ZodString;
            text: z.ZodString;
            buttonLabel: z.ZodString;
            color: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        }, {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        }>;
        form: z.ZodEffects<z.ZodEffects<z.ZodObject<{
            title: z.ZodString;
            fields: z.ZodArray<z.ZodObject<{
                key: z.ZodString;
                label: z.ZodString;
                placeholder: z.ZodDefault<z.ZodString>;
                paragraph: z.ZodBoolean;
                required: z.ZodBoolean;
                maxLength: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }, {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            title: string;
            fields: {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }[];
        }, {
            title: string;
            fields: {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }[];
        }>, {
            title: string;
            fields: {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }[];
        }, {
            title: string;
            fields: {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }[];
        }>, {
            title: string;
            fields: {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }[];
        }, {
            title: string;
            fields: {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }[];
        }>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        notifyChannelId: string | null;
        panel: {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        };
        form: {
            title: string;
            fields: {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }[];
        };
        preventDuplicates: boolean;
        approveRoleIds: string[];
    }, {
        enabled: boolean;
        notifyChannelId: string | null;
        panel: {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        };
        form: {
            title: string;
            fields: {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }[];
        };
        preventDuplicates: boolean;
        approveRoleIds?: string[] | undefined;
    }>;
    notifyMembers: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    requests: {
        enabled: boolean;
        notifyChannelId: string | null;
        panel: {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        };
        form: {
            title: string;
            fields: {
                key: string;
                label: string;
                placeholder: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
            }[];
        };
        preventDuplicates: boolean;
        approveRoleIds: string[];
    };
    notifyMembers: boolean;
}, {
    requests: {
        enabled: boolean;
        notifyChannelId: string | null;
        panel: {
            color: string;
            title: string;
            text: string;
            channelId: string | null;
            buttonLabel: string;
        };
        form: {
            title: string;
            fields: {
                key: string;
                label: string;
                required: boolean;
                maxLength: number;
                paragraph: boolean;
                placeholder?: string | undefined;
            }[];
        };
        preventDuplicates: boolean;
        approveRoleIds?: string[] | undefined;
    };
    notifyMembers: boolean;
}>;
declare const integrationB: z.ZodObject<{
    provider: z.ZodEnum<["NONE", "ZELLO_WORK", "ZELLO_APP", "OTHER_MANUAL"]>;
    displayName: z.ZodString;
    network: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    channel: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    adminUsername: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    password: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    clearCredentials: z.ZodOptional<z.ZodBoolean>;
    autoSync: z.ZodBoolean;
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
    channel: string | null;
    displayName: string;
    provider: "NONE" | "ZELLO_WORK" | "ZELLO_APP" | "OTHER_MANUAL";
    network: string | null;
    adminUsername: string | null;
    autoSync: boolean;
    password?: string | undefined;
    apiKey?: string | undefined;
    clearCredentials?: boolean | undefined;
}, {
    version: number;
    displayName: string;
    provider: "NONE" | "ZELLO_WORK" | "ZELLO_APP" | "OTHER_MANUAL";
    autoSync: boolean;
    channel?: string | null | undefined;
    network?: string | null | undefined;
    adminUsername?: string | null | undefined;
    password?: string | undefined;
    apiKey?: string | undefined;
    clearCredentials?: boolean | undefined;
}>;
declare const exportQ: z.ZodObject<{
    status: z.ZodDefault<z.ZodEnum<["active", "suspended", "expired", "pending", "disabled", "revoked", "all", "open"]>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "all" | "pending" | "open" | "disabled" | "suspended" | "expired" | "revoked";
}, {
    status?: "active" | "all" | "pending" | "open" | "disabled" | "suspended" | "expired" | "revoked" | undefined;
}>;
declare const importB: z.ZodObject<{
    csv: z.ZodString;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    csv: string;
    dryRun: boolean;
}, {
    csv: string;
    dryRun?: boolean | undefined;
}>;
declare const logsQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
type Z<T extends z.ZodTypeAny> = z.infer<T>;
/** 🎙️ Funk-Whitelist im Dashboard. Jede Route mit eigenem, granularem Recht (deny-by-default). */
export declare class RadioWhitelistController {
    private readonly s;
    constructor(s: RadioWhitelistService);
    list(q: Z<typeof listQ>): Promise<{
        items: {
            id: string;
            discordId: string | null;
            discordName: string | null;
            userId: string | null;
            userName: string | null;
            rank: string | null;
            department: string | null;
            externalName: string | null;
            status: string;
            effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
            authorized: boolean;
            source: string;
            reason: string | null;
            expiresAt: Date | null;
            suspendedUntil: Date | null;
            suspendReason: string | null;
            roleRevoked: boolean;
            grantedAt: Date | null;
            grantedByName: string | null;
            archivedAt: Date | null;
            externalStatus: string;
            externalSyncedAt: Date | null;
            externalError: string | null;
            version: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    summary(): Promise<{
        openRequests: number;
        manualTodo: number;
    }>;
    get(id: string): Promise<{
        history: {
            actorName: string;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            action: string;
            actorUserId: string | null;
        }[];
        requests: {
            decidedByName: string | null;
            id: string;
            status: string;
            createdAt: Date;
            reason: string;
            guildId: string | null;
            discordId: string;
            discordName: string | null;
            department: string | null;
            rank: string | null;
            decidedAt: Date | null;
            decidedById: string | null;
            decisionReason: string | null;
            answers: import("@prisma/client/runtime/library").JsonValue | null;
            grantExpiresAt: Date | null;
            grantId: string | null;
        }[];
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(a: Actor, b: Z<typeof createB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(a: Actor, id: string, b: Z<typeof updateB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    activate(a: Actor, id: string, b: Z<typeof activateB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deactivate(a: Actor, id: string, b: Z<typeof reasonB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    extend(a: Actor, id: string, b: Z<typeof extendB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    restore(a: Actor, id: string, b: Z<typeof restoreB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    discordId(a: Actor, id: string, b: Z<typeof discordIdB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    externalDone(a: Actor, id: string): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    suspend(a: Actor, id: string, b: Z<typeof suspendB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    unsuspend(a: Actor, id: string, b: Z<typeof unsuspendB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    revoke(a: Actor, id: string, b: Z<typeof reasonB>): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    requests(q: Z<typeof requestsQ>): Promise<{
        items: {
            decidedByName: string | null;
            id: string;
            status: string;
            createdAt: Date;
            reason: string;
            guildId: string | null;
            discordId: string;
            discordName: string | null;
            department: string | null;
            rank: string | null;
            decidedAt: Date | null;
            decidedById: string | null;
            decisionReason: string | null;
            answers: import("@prisma/client/runtime/library").JsonValue | null;
            grantExpiresAt: Date | null;
            grantId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    decide(a: Actor, id: string, b: Z<typeof decideB>): Promise<{
        decidedByName: string | null;
        id: string;
        status: string;
        createdAt: Date;
        reason: string;
        guildId: string | null;
        discordId: string;
        discordName: string | null;
        department: string | null;
        rank: string | null;
        decidedAt: Date | null;
        decidedById: string | null;
        decisionReason: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue | null;
        grantExpiresAt: Date | null;
        grantId: string | null;
    }>;
    config(): Promise<import("./radio-whitelist.service").RadioWhitelistConfig>;
    roles(a: Actor, b: Z<typeof rolesB>): Promise<import("./radio-whitelist.service").RadioWhitelistConfig>;
    requestConfig(a: Actor, b: Z<typeof requestsB>): Promise<import("./radio-whitelist.service").RadioWhitelistConfig>;
    requestPanel(a: Actor): Promise<{
        queued: boolean;
    }>;
    roleSyncStatus(): Promise<Record<string, unknown>>;
    roleSync(a: Actor): Promise<{
        queued: boolean;
    }>;
    integration(): Promise<{
        provider: string;
        displayName: string;
        network: string | null;
        channel: string | null;
        endpoint: string | null;
        adminUsername: string | null;
        hasPassword: boolean;
        hasApiKey: boolean;
        autoSync: boolean;
        status: string;
        apiSupported: boolean;
        lastTestAt: Date | null;
        lastSuccessAt: Date | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string | null;
        lastError: string | null;
        version: number;
        providers: readonly [{
            readonly key: "NONE";
            readonly name: "Kein Funkdienst angebunden";
            readonly apiSupported: false;
            readonly note: "Die Whitelist wird nur im Dashboard und in Discord geführt.";
        }, {
            readonly key: "ZELLO_WORK";
            readonly name: "Zello Work (Server-API)";
            readonly apiSupported: true;
            readonly note: "Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.";
            readonly verified: "Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.";
        }, {
            readonly key: "ZELLO_APP";
            readonly name: "Zello (kostenlose App, Kanal)";
            readonly apiSupported: false;
            readonly note: "Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.";
        }, {
            readonly key: "OTHER_MANUAL";
            readonly name: "Anderer Funkdienst (manuell)";
            readonly apiSupported: false;
            readonly note: "Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.";
        }];
    }>;
    saveIntegration(a: Actor, b: Z<typeof integrationB>): Promise<{
        provider: string;
        displayName: string;
        network: string | null;
        channel: string | null;
        endpoint: string | null;
        adminUsername: string | null;
        hasPassword: boolean;
        hasApiKey: boolean;
        autoSync: boolean;
        status: string;
        apiSupported: boolean;
        lastTestAt: Date | null;
        lastSuccessAt: Date | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string | null;
        lastError: string | null;
        version: number;
        providers: readonly [{
            readonly key: "NONE";
            readonly name: "Kein Funkdienst angebunden";
            readonly apiSupported: false;
            readonly note: "Die Whitelist wird nur im Dashboard und in Discord geführt.";
        }, {
            readonly key: "ZELLO_WORK";
            readonly name: "Zello Work (Server-API)";
            readonly apiSupported: true;
            readonly note: "Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.";
            readonly verified: "Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.";
        }, {
            readonly key: "ZELLO_APP";
            readonly name: "Zello (kostenlose App, Kanal)";
            readonly apiSupported: false;
            readonly note: "Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.";
        }, {
            readonly key: "OTHER_MANUAL";
            readonly name: "Anderer Funkdienst (manuell)";
            readonly apiSupported: false;
            readonly note: "Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.";
        }];
    }>;
    test(a: Actor): Promise<{
        ok: boolean;
        message: string;
    }>;
    sync(a: Actor): Promise<{
        ok: boolean;
        message: string;
        added: number;
        removed: number;
        failed: number;
    }>;
    export(q: Z<typeof exportQ>, res: Response): Promise<void>;
    import(a: Actor, b: Z<typeof importB>): Promise<{
        created: number;
        updated: number;
        unchanged: number;
        errors: {
            line: number;
            message: string;
        }[];
        dryRun: boolean;
    }>;
    logs(q: Z<typeof logsQ>): Promise<{
        items: {
            actorName: string;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            entityId: string | null;
            entityType: string | null;
            action: string;
            actorUserId: string | null;
            before: import("@prisma/client/runtime/library").JsonValue;
            after: import("@prisma/client/runtime/library").JsonValue;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    legacyList(): Promise<{
        id: string;
        userId: string | null;
        discordId: string | null;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        since: Date;
    }[]>;
    /** Nur Ja/Nein für eine Person (wie bisher für das ganze Team). */
    check(q: Z<typeof target>): Promise<{
        whitelisted: boolean;
        displayName: string;
    }>;
    add(a: Actor, b: Z<typeof target>): Promise<{
        userId: string | null;
        discordId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
    remove(a: Actor, b: Z<typeof target>): Promise<{
        userId: string | null;
        discordId: string | null;
        displayName: string;
        whitelisted: boolean;
    }>;
}
declare const botRequestB: z.ZodObject<{
    guildId: z.ZodNullable<z.ZodString>;
    discordId: z.ZodString;
    discordName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    rank: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    department: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    reason: z.ZodString;
    answers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    guildId: string | null;
    discordId: string;
    discordName: string | null;
    department: string | null;
    rank: string | null;
    answers?: Record<string, string> | undefined;
}, {
    reason: string;
    guildId: string | null;
    discordId: string;
    discordName?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    answers?: Record<string, string> | undefined;
}>;
declare const snapshotB: z.ZodObject<{
    guildId: z.ZodString;
    full: z.ZodDefault<z.ZodBoolean>;
    members: z.ZodArray<z.ZodObject<{
        discordId: z.ZodString;
        name: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
        roleIds: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string | null;
        roleIds: string[] | null;
        discordId: string;
    }, {
        roleIds: string[] | null;
        discordId: string;
        name?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    guildId: string;
    members: {
        name: string | null;
        roleIds: string[] | null;
        discordId: string;
    }[];
    full: boolean;
}, {
    guildId: string;
    members: {
        roleIds: string[] | null;
        discordId: string;
        name?: string | null | undefined;
    }[];
    full?: boolean | undefined;
}>;
/** Bot-Dienst (nur mit Bot-Token): Anträge aus Discord, Rollenstände für den Abgleich, Status für das Mitglied. */
export declare class RadioWhitelistBotController {
    private readonly s;
    constructor(s: RadioWhitelistService);
    request(b: Z<typeof botRequestB>): Promise<{
        id: string;
        status: string;
        createdAt: Date;
    }>;
    status(id: string): Promise<{
        status: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED" | null;
        authorized: boolean;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        pendingSince: Date | null;
        requestsEnabled: boolean;
        roleOnly: boolean;
        form: import("./radio-whitelist.service").RequestForm;
    }>;
    targets(): Promise<{
        enabled: boolean;
        guildId: string | null;
        roleIds: string[];
        discordIds: string[];
    }>;
    roles(b: Z<typeof snapshotB>): Promise<{
        enabled: boolean;
        checked: number;
        changed: number;
        failed: number;
    }>;
}
export {};
