import { z } from 'zod';
import { type DnSettings, type HrConfig, type RangeInput, type RankInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService } from './hr-people.service';
import { HrRequestsService } from './hr-requests.service';
import { examSchema, HrTrainingService, trainingSchema } from './hr-training.service';
import { announcementSchema, HrCommsService, pollSchema } from './hr-comms.service';
import { ServiceNumbersService } from './service-numbers.service';
declare const reason: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
declare const overviewQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodEnum<["active", "inactive", "absent"]>>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    department?: string | undefined;
    state?: "active" | "inactive" | "absent" | undefined;
}, {
    status?: string | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    department?: string | undefined;
    state?: "active" | "inactive" | "absent" | undefined;
}>;
declare const createP: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodString>;
    joinDate: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    userId?: string | undefined;
    discordId?: string | undefined;
    status?: string | undefined;
    rank?: string | null | undefined;
    callsign?: string | null | undefined;
    joinDate?: string | undefined;
    department?: string | null | undefined;
}, {
    name?: string | undefined;
    userId?: string | undefined;
    discordId?: string | undefined;
    status?: string | undefined;
    rank?: string | null | undefined;
    callsign?: string | null | undefined;
    joinDate?: string | undefined;
    department?: string | null | undefined;
}>;
declare const updateP: z.ZodObject<{
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    office: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodString>;
    joinDate: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rank: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rankSince: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    rank?: string | null | undefined;
    callsign?: string | null | undefined;
    office?: string | null | undefined;
    joinDate?: string | undefined;
    rankSince?: string | undefined;
    department?: string | null | undefined;
}, {
    status?: string | undefined;
    rank?: string | null | undefined;
    callsign?: string | null | undefined;
    office?: string | null | undefined;
    joinDate?: string | undefined;
    rankSince?: string | undefined;
    department?: string | null | undefined;
}>;
declare const record: z.ZodObject<{
    type: z.ZodEnum<["NOTE", "WARNING", "AWARD", "RECOMMENDATION"]>;
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    severity: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    awardId: z.ZodOptional<z.ZodString>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "NOTE" | "AWARD" | "RECOMMENDATION" | "WARNING";
    summary: string;
    details?: string | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    attachments?: string[] | undefined;
    severity?: string | undefined;
    awardId?: string | undefined;
}, {
    type: "NOTE" | "AWARD" | "RECOMMENDATION" | "WARNING";
    summary: string;
    details?: string | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    attachments?: string[] | undefined;
    severity?: string | undefined;
    awardId?: string | undefined;
}>;
declare const editRecord: z.ZodObject<{
    summary: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "REVOKED"]>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    details?: string | null | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    status?: "ACTIVE" | "REVOKED" | undefined;
    summary?: string | undefined;
}, {
    details?: string | null | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    status?: "ACTIVE" | "REVOKED" | undefined;
    summary?: string | undefined;
}>;
export declare class HrController {
    private readonly core;
    private readonly people;
    constructor(core: HrCoreService, people: HrPeopleService);
    config(): Promise<{
        transfer: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
        };
        promotion: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            requireReason: boolean;
            requireRequirements: boolean;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
            announceTemplate: string;
            announceColor: string;
            statusLabels: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
                label: string;
                emoji: string;
            }>>;
        };
        awards: {
            description: string;
            id: string;
            name: string;
            color: string;
            active: boolean;
            icon: string;
            requirements: string;
            public: boolean;
            discordRoleId: string | null;
        }[];
        sections: Partial<Record<"history" | "awards" | "rank" | "overview" | "promotions" | "trainings" | "exams" | "warnings" | "absences" | "transfers" | "servicenumbers" | "notes", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        fields: Partial<Record<"status" | "rank" | "callsign" | "discordName" | "discordId" | "avatar" | "robloxName" | "robloxId" | "department" | "joinDate" | "serviceNumber", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        statuses: {
            key: string;
            label: string;
            color: string;
            active: boolean;
            emoji: string;
        }[];
        departments: {
            description: string;
            id: string;
            name: string;
            color: string;
            discordRoleIds: string[];
            dashboardRoleIds: string[];
        }[];
        absenceTypes: {
            key: string;
            label: string;
            emoji: string;
        }[];
        warningSeverities: {
            key: string;
            label: string;
            color: string;
            emoji: string;
            defaultDays: number;
        }[];
        warningCategories: string[];
        showAbsenceInTeam: boolean;
        notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed", {
            dashboard: boolean;
            dm: boolean;
            roleIds: string[];
            channelId: string | null;
        }>>;
        certificate: {
            organisation: string;
            logo: string;
            signature: string;
        };
    }>;
    /** Abwesenheitsarten für den Abmeldeantrag (alle im Dashboard). */
    absenceTypes(): Promise<{
        key: string;
        label: string;
        emoji: string;
    }[]>;
    saveConfig(a: Actor, b: HrConfig): Promise<{
        transfer: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
        };
        promotion: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            requireReason: boolean;
            requireRequirements: boolean;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
            announceTemplate: string;
            announceColor: string;
            statusLabels: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
                label: string;
                emoji: string;
            }>>;
        };
        awards: {
            description: string;
            id: string;
            name: string;
            color: string;
            active: boolean;
            icon: string;
            requirements: string;
            public: boolean;
            discordRoleId: string | null;
        }[];
        sections: Partial<Record<"history" | "awards" | "rank" | "overview" | "promotions" | "trainings" | "exams" | "warnings" | "absences" | "transfers" | "servicenumbers" | "notes", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        fields: Partial<Record<"status" | "rank" | "callsign" | "discordName" | "discordId" | "avatar" | "robloxName" | "robloxId" | "department" | "joinDate" | "serviceNumber", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        statuses: {
            key: string;
            label: string;
            color: string;
            active: boolean;
            emoji: string;
        }[];
        departments: {
            description: string;
            id: string;
            name: string;
            color: string;
            discordRoleIds: string[];
            dashboardRoleIds: string[];
        }[];
        absenceTypes: {
            key: string;
            label: string;
            emoji: string;
        }[];
        warningSeverities: {
            key: string;
            label: string;
            color: string;
            emoji: string;
            defaultDays: number;
        }[];
        warningCategories: string[];
        showAbsenceInTeam: boolean;
        notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed", {
            dashboard: boolean;
            dm: boolean;
            roleIds: string[];
            channelId: string | null;
        }>>;
        certificate: {
            organisation: string;
            logo: string;
            signature: string;
        };
    }>;
    overview(a: Actor, q: z.infer<typeof overviewQ>): Promise<{
        rows: {
            id: string;
            userId: string;
            name: string;
            username: string;
            discordName: string | null;
            discordId: string | null;
            avatar: string | null;
            robloxName: string | null;
            robloxId: string | null;
            rank: string | null;
            rankColor: string | null;
            rankIcon: string | null;
            rankPosition: number;
            department: string | null;
            status: string | null;
            joinDate: Date | null;
            serviceNumber: string | null;
            callsign: string | null;
            absentUntil: Date | null;
            counts: {
                promotions: number;
                awards: number;
                warnings: number | null;
                trainings: number;
            };
        }[];
        statuses: {
            key: string;
            label: string;
            color: string;
            active: boolean;
            emoji: string;
        }[];
        departments: {
            name: string;
            color: string;
        }[];
        ranks: {
            id: string;
            name: string;
            color: string;
            icon: string | null;
        }[];
    }>;
    create(a: Actor, b: z.infer<typeof createP>): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    profile(a: Actor, id: string): Promise<{
        id: string;
        userId: string;
        name: string;
        username: string;
        discordName: string | null;
        discordId: string | null;
        avatar: string | null;
        robloxName: string | null;
        robloxId: string | null;
        rank: string | null;
        rankInfo: {
            id: string;
            name: string;
            color: string;
            icon: string | null;
            description: string | null;
        } | null;
        rankSince: Date;
        department: string | null;
        office: string | null;
        status: string | null;
        joinDate: Date | null;
        serviceNumber: string | null;
        callsign: string | null;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
        sections: {
            [k: string]: boolean;
        };
        next: import("@enrp/shared").PromotionCheck[];
        promotions: {
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[] | null;
        transfers: {
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[] | null;
        requests: {
            internalNote: string | null;
            requesterName: string;
            number: string;
            id: string;
            reason: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            requesterId: string;
            status: string;
            decidedAt: Date | null;
            kind: string;
            attachments: string[];
            personnelId: string;
            fromValue: string | null;
            toValue: string;
            achievements: string | null;
            approvals: import("@prisma/client/runtime/library").JsonValue;
            executedById: string | null;
            executedAt: Date | null;
        }[];
        awards: {
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[] | null;
        warnings: {
            state: string;
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[] | null;
        notes: {
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[] | null;
        recommendations: {
            createdByName: string;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[];
        trainings: ({
            training: {
                id: string;
                name: string;
                certificate: boolean;
                validDays: number | null;
            };
        } & {
            id: string;
            expiresAt: Date | null;
            updatedAt: Date;
            status: string;
            startedAt: Date | null;
            note: string | null;
            personnelId: string;
            trainingId: string;
            progress: number;
            examinerId: string | null;
            completedAt: Date | null;
            certificateNo: string | null;
        })[] | null;
        exams: {
            answers: undefined;
            exam: {
                id: string;
                title: string;
                passPercent: number;
                showResult: boolean;
            };
            id: string;
            status: string;
            startedAt: Date;
            personnelId: string;
            score: number | null;
            passed: boolean | null;
            gradedById: string | null;
            examId: string;
            questionIds: string[];
            maxScore: number | null;
            gradedAt: Date | null;
            feedback: string | null;
            submittedAt: Date | null;
        }[] | null;
        absences: {
            id: string;
            number: string;
            startsAt: Date;
            endsAt: Date;
            type: string | null;
            status: string;
            reason: string | null;
            comment: string | null;
            decidedByName: string | null;
            createdAt: Date;
        }[] | null;
        serviceNumbers: {
            id: string;
            action: string;
            reason: string | null;
            createdAt: Date;
            userId: string | null;
            actorId: string | null;
            personnelId: string | null;
            display: string;
            oldDisplay: string | null;
            approverId: string | null;
        }[] | null;
        history: {
            id: string;
            action: string;
            at: Date;
            actor: string;
            before: import("@prisma/client/runtime/library").JsonValue;
            after: import("@prisma/client/runtime/library").JsonValue;
            reason: string | null;
        }[] | null;
        counts: {
            promotions: number;
            trainings: number;
            awards: number;
            warnings: number;
        };
    }>;
    update(a: Actor, id: string, b: z.infer<typeof updateP>): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    addRecord(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        data: import("@prisma/client/runtime/library").JsonValue | null;
        id: string;
        createdAt: Date;
        details: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        type: string;
        createdById: string;
        status: string | null;
        summary: string;
        attachments: string[];
        deletedAt: Date | null;
        personnelId: string;
    }>;
    editRecord(a: Actor, id: string, b: z.infer<typeof editRecord>): Promise<{
        data: import("@prisma/client/runtime/library").JsonValue | null;
        id: string;
        createdAt: Date;
        details: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        type: string;
        createdById: string;
        status: string | null;
        summary: string;
        attachments: string[];
        deletedAt: Date | null;
        personnelId: string;
    }>;
    deleteRecord(a: Actor, id: string, b: z.infer<typeof reason>): Promise<void>;
    check(a: Actor, id: string, req: string, b: {
        value: boolean;
    }): Promise<{
        [x: string]: boolean;
    }>;
    ranks(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        color: string;
        description: string | null;
        icon: string | null;
        discordRoleIds: string[];
        position: number;
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    createRank(a: Actor, b: RankInput): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        color: string;
        description: string | null;
        icon: string | null;
        discordRoleIds: string[];
        position: number;
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }>;
    order(a: Actor, b: {
        ids: string[];
    }): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        color: string;
        description: string | null;
        icon: string | null;
        discordRoleIds: string[];
        position: number;
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    saveRank(a: Actor, id: string, b: RankInput): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        color: string;
        description: string | null;
        icon: string | null;
        discordRoleIds: string[];
        position: number;
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }>;
    deleteRank(a: Actor, id: string): Promise<void>;
}
declare const reqQ: z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<["PROMOTION", "TRANSFER"]>>;
    status: z.ZodOptional<z.ZodString>;
    personnelId: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    requesterId: z.ZodOptional<z.ZodString>;
    approverId: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    requesterId?: string | undefined;
    status?: string | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    kind?: "PROMOTION" | "TRANSFER" | undefined;
    from?: string | undefined;
    department?: string | undefined;
    to?: string | undefined;
    personnelId?: string | undefined;
    approverId?: string | undefined;
}, {
    requesterId?: string | undefined;
    status?: string | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    kind?: "PROMOTION" | "TRANSFER" | undefined;
    from?: string | undefined;
    department?: string | undefined;
    to?: string | undefined;
    personnelId?: string | undefined;
    approverId?: string | undefined;
}>;
declare const createR: z.ZodObject<{
    kind: z.ZodEnum<["PROMOTION", "TRANSFER"]>;
    personnelId: z.ZodString;
    to: z.ZodString;
    reason: z.ZodDefault<z.ZodString>;
    achievements: z.ZodOptional<z.ZodString>;
    internalNote: z.ZodOptional<z.ZodString>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    kind: "PROMOTION" | "TRANSFER";
    to: string;
    personnelId: string;
    attachments?: string[] | undefined;
    achievements?: string | undefined;
    internalNote?: string | undefined;
}, {
    kind: "PROMOTION" | "TRANSFER";
    to: string;
    personnelId: string;
    reason?: string | undefined;
    attachments?: string[] | undefined;
    achievements?: string | undefined;
    internalNote?: string | undefined;
}>;
declare const editR: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
    achievements: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    internalNote: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
    version?: number | undefined;
    attachments?: string[] | undefined;
    achievements?: string | null | undefined;
    internalNote?: string | null | undefined;
}, {
    reason?: string | undefined;
    version?: number | undefined;
    attachments?: string[] | undefined;
    achievements?: string | null | undefined;
    internalNote?: string | null | undefined;
}>;
declare const decide: z.ZodObject<{
    decision: z.ZodEnum<["APPROVE", "REJECT", "REVIEW", "DEFER", "CANCEL"]>;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    decision: "REVIEW" | "APPROVE" | "REJECT" | "DEFER" | "CANCEL";
    comment?: string | undefined;
}, {
    decision: "REVIEW" | "APPROVE" | "REJECT" | "DEFER" | "CANCEL";
    comment?: string | undefined;
}>;
export declare class HrRequestsController {
    private readonly s;
    constructor(s: HrRequestsService);
    /** Liste braucht promotion.view ODER transfer.view – geprüft je Art */
    list(a: Actor, q: z.infer<typeof reqQ>): Promise<{
        internalNote: string | null;
        requesterName: string;
        fromLabel: string | null;
        toLabel: string | null;
        needed: number;
        personnel: {
            user: {
                displayName: string;
            };
            id: string;
            team: string | null;
            rank: string | null;
        };
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }[]>;
    stats(): Promise<{
        byStatus: {
            kind: string;
            status: string;
            count: number;
        }[];
        recent: {
            id: string;
            personnelId: string;
            name: string;
            summary: string;
            at: Date;
        }[];
    }>;
    get(a: Actor, id: string): Promise<{
        internalNote: string | null;
        requesterName: string;
        fromLabel: string | null;
        toLabel: string;
        check: import("@enrp/shared").PromotionCheck | null;
        stages: {
            roleIds: string[];
            id: string;
            name: string;
        }[];
        needed: number;
        next: {
            roleIds: string[];
            id: string;
            name: string;
        } | null;
        can: {
            approve: boolean;
            approveWhy: string | null;
            reject: boolean;
            review: boolean;
            execute: boolean;
            edit: boolean;
            cancel: boolean;
        };
        personnel: {
            user: {
                displayName: string;
            };
            id: string;
            userId: string;
            team: string | null;
            rank: string | null;
        };
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    create(a: Actor, b: z.infer<typeof createR>): Promise<{
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    edit(a: Actor, id: string, b: z.infer<typeof editR>): Promise<{
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    decide(a: Actor, id: string, b: z.infer<typeof decide>): Promise<{
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    execute(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        reason: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        requesterId: string;
        status: string;
        decidedAt: Date | null;
        kind: string;
        attachments: string[];
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
}
declare const progress: z.ZodObject<{
    trainingId: z.ZodString;
    personnelId: z.ZodString;
    status: z.ZodEnum<["NOT_STARTED", "IN_PROGRESS", "PASSED", "FAILED", "ABORTED", "EXPIRED"]>;
    progress: z.ZodOptional<z.ZodNumber>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "EXPIRED" | "PASSED" | "NOT_STARTED" | "IN_PROGRESS" | "FAILED" | "ABORTED";
    personnelId: string;
    trainingId: string;
    note?: string | null | undefined;
    progress?: number | undefined;
}, {
    status: "EXPIRED" | "PASSED" | "NOT_STARTED" | "IN_PROGRESS" | "FAILED" | "ABORTED";
    personnelId: string;
    trainingId: string;
    note?: string | null | undefined;
    progress?: number | undefined;
}>;
export declare class HrTrainingController {
    private readonly s;
    constructor(s: HrTrainingService);
    trainings(): Promise<{
        passed: number;
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        duration: string | null;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
    }[]>;
    create(a: Actor, b: z.infer<typeof trainingSchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        duration: string | null;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
    }>;
    save(a: Actor, id: string, b: z.infer<typeof trainingSchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        duration: string | null;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    progressOf(id: string): Promise<({
        personnel: {
            user: {
                displayName: string;
            };
            id: string;
            rank: string | null;
        };
    } & {
        id: string;
        expiresAt: Date | null;
        updatedAt: Date;
        status: string;
        startedAt: Date | null;
        note: string | null;
        personnelId: string;
        trainingId: string;
        progress: number;
        examinerId: string | null;
        completedAt: Date | null;
        certificateNo: string | null;
    })[]>;
    setProgress(a: Actor, b: z.infer<typeof progress>): Promise<{
        id: string;
        expiresAt: Date | null;
        updatedAt: Date;
        status: string;
        startedAt: Date | null;
        note: string | null;
        personnelId: string;
        trainingId: string;
        progress: number;
        examinerId: string | null;
        completedAt: Date | null;
        certificateNo: string | null;
    }>;
    certificate(a: Actor, no: string): Promise<{
        certificateNo: string;
        name: string;
        roblox: string | null;
        training: string;
        description: string | null;
        result: string;
        date: Date | null;
        expiresAt: Date | null;
        examiner: string;
        organisation: string;
        logo: string;
        signature: string;
        status: string;
    }>;
    exams(a: Actor): Promise<{
        questions: import("@prisma/client/runtime/library").JsonValue | undefined;
        questionTotal: number;
        myAttempts: {
            status: string;
            startedAt: Date;
            score: number | null;
            passed: boolean | null;
            examId: string;
            maxScore: number | null;
            submittedAt: Date | null;
        }[];
        id: string;
        createdAt: Date;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        title: string;
        trainingId: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        examinerIds: string[];
    }[]>;
    createExam(a: Actor, b: z.infer<typeof examSchema>): Promise<{
        id: string;
        createdAt: Date;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        title: string;
        questions: import("@prisma/client/runtime/library").JsonValue;
        trainingId: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        examinerIds: string[];
    }>;
    saveExam(a: Actor, id: string, b: z.infer<typeof examSchema>): Promise<{
        id: string;
        createdAt: Date;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        title: string;
        questions: import("@prisma/client/runtime/library").JsonValue;
        trainingId: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        examinerIds: string[];
    }>;
    deleteExam(a: Actor, id: string): Promise<void>;
    start(a: Actor, id: string): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        name: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grader: boolean;
        questions: {
            correct?: string[] | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER";
            text: string;
            options: string[];
            points: number;
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            score?: undefined;
            maxScore?: undefined;
            feedback?: undefined;
        } | null;
    }>;
    attempts(a: Actor, examId?: string): Promise<{
        answers: undefined;
        personnel: {
            user: {
                displayName: string;
            };
        };
        exam: {
            title: string;
        };
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        score: number | null;
        passed: boolean | null;
        gradedById: string | null;
        examId: string;
        questionIds: string[];
        maxScore: number | null;
        gradedAt: Date | null;
        feedback: string | null;
        submittedAt: Date | null;
    }[]>;
    attempt(a: Actor, id: string): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        name: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grader: boolean;
        questions: {
            correct?: string[] | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER";
            text: string;
            options: string[];
            points: number;
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            score?: undefined;
            maxScore?: undefined;
            feedback?: undefined;
        } | null;
    }>;
    answers(a: Actor, id: string, b: {
        answers: Record<string, unknown>;
    }): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        name: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grader: boolean;
        questions: {
            correct?: string[] | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER";
            text: string;
            options: string[];
            points: number;
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            score?: undefined;
            maxScore?: undefined;
            feedback?: undefined;
        } | null;
    } | {
        saved: boolean;
    }>;
    submit(a: Actor, id: string, b: {
        answers: Record<string, unknown>;
    }): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        name: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grader: boolean;
        questions: {
            correct?: string[] | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER";
            text: string;
            options: string[];
            points: number;
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            score?: undefined;
            maxScore?: undefined;
            feedback?: undefined;
        } | null;
    }>;
    grade(a: Actor, id: string, b: {
        scores: Record<string, number>;
        feedback?: string;
    }): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        name: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grader: boolean;
        questions: {
            correct?: string[] | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER";
            text: string;
            options: string[];
            points: number;
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            score?: undefined;
            maxScore?: undefined;
            feedback?: undefined;
        } | null;
    }>;
}
export declare class HrCommsController {
    private readonly s;
    constructor(s: HrCommsService);
    list(a: Actor, all?: string): Promise<{
        author: string;
        readAt: Date | null;
        readCount: number;
        audienceCount: number | null;
        id: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        priority: string;
        createdById: string;
        title: string;
        body: string;
        attachments: string[];
        audienceRoleIds: string[];
        publishAt: Date;
        requireAck: boolean;
        discordChannelId: string | null;
    }[]>;
    create(a: Actor, b: z.infer<typeof announcementSchema>): Promise<{
        id: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        priority: string;
        createdById: string;
        title: string;
        body: string;
        attachments: string[];
        audienceRoleIds: string[];
        publishAt: Date;
        requireAck: boolean;
        discordChannelId: string | null;
    }>;
    save(a: Actor, id: string, b: z.infer<typeof announcementSchema>): Promise<{
        id: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        priority: string;
        createdById: string;
        title: string;
        body: string;
        attachments: string[];
        audienceRoleIds: string[];
        publishAt: Date;
        requireAck: boolean;
        discordChannelId: string | null;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    ack(a: Actor, id: string): Promise<{
        readAt: Date;
    }>;
    readers(a: Actor, id: string): Promise<{
        total: number;
        read: number;
        people: {
            userId: string;
            name: string;
            readAt: Date | null;
        }[];
    }>;
    polls(a: Actor): Promise<{
        ended: boolean;
        open: boolean;
        myVote: string[] | null;
        totalVotes: number;
        canManage: boolean;
        results: {
            id: string;
            label: string;
            count: number;
            voters: string[] | null;
        }[] | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        createdById: string;
        options: import("@prisma/client/runtime/library").JsonValue;
        startsAt: Date;
        endsAt: Date | null;
        title: string;
        multiple: boolean;
        audienceRoleIds: string[];
        anonymous: boolean;
        showResults: string;
    }[]>;
    createPoll(a: Actor, b: z.infer<typeof pollSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        createdById: string;
        options: import("@prisma/client/runtime/library").JsonValue;
        startsAt: Date;
        endsAt: Date | null;
        title: string;
        multiple: boolean;
        audienceRoleIds: string[];
        anonymous: boolean;
        showResults: string;
    }>;
    savePoll(a: Actor, id: string, b: z.infer<typeof pollSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        createdById: string;
        options: import("@prisma/client/runtime/library").JsonValue;
        startsAt: Date;
        endsAt: Date | null;
        title: string;
        multiple: boolean;
        audienceRoleIds: string[];
        anonymous: boolean;
        showResults: string;
    }>;
    deletePoll(a: Actor, id: string): Promise<void>;
    vote(a: Actor, id: string, b: {
        optionIds: string[];
    }): Promise<{
        voted: boolean;
    }>;
}
declare const listQ: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "RESERVED", "FREE", "BLOCKED", "FORMER"]>>;
    rangeId: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit?: number | undefined;
    status?: "ACTIVE" | "FREE" | "RESERVED" | "BLOCKED" | "FORMER" | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    department?: string | undefined;
    rangeId?: string | undefined;
}, {
    limit?: number | undefined;
    status?: "ACTIVE" | "FREE" | "RESERVED" | "BLOCKED" | "FORMER" | undefined;
    rank?: string | undefined;
    q?: string | undefined;
    department?: string | undefined;
    rangeId?: string | undefined;
}>;
declare const assign: z.ZodObject<{
    personnelId: z.ZodString;
    display: z.ZodOptional<z.ZodString>;
    rangeId: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    personnelId: string;
    reason?: string | undefined;
    display?: string | undefined;
    rangeId?: string | undefined;
}, {
    personnelId: string;
    reason?: string | undefined;
    display?: string | undefined;
    rangeId?: string | undefined;
}>;
declare const change: z.ZodObject<{
    personnelId: z.ZodString;
    display: z.ZodOptional<z.ZodString>;
    rangeId: z.ZodOptional<z.ZodString>;
} & {
    reason: z.ZodString;
    approverId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    personnelId: string;
    display?: string | undefined;
    approverId?: string | null | undefined;
    rangeId?: string | undefined;
}, {
    reason: string;
    personnelId: string;
    display?: string | undefined;
    approverId?: string | null | undefined;
    rangeId?: string | undefined;
}>;
declare const status: z.ZodObject<{
    display: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    display: string;
    reason?: string | undefined;
    userId?: string | undefined;
}, {
    display: string;
    reason?: string | undefined;
    userId?: string | undefined;
}>;
export declare class ServiceNumbersController {
    private readonly s;
    constructor(s: ServiceNumbersService);
    list(q: z.infer<typeof listQ>): Promise<{
        id: string;
        display: string;
        value: number;
        status: string;
        rangeId: string;
        range: string;
        note: string | null;
        assignedAt: Date | null;
        reservedAt: Date | null;
        userId: string | null;
        name: string | null;
        roblox: string | null;
        discordId: string | null;
        personnelId: string | null;
        rank: string | null;
        department: string | null;
    }[]>;
    ranges(): Promise<{
        total: number;
        active: number;
        reserved: number;
        blocked: number;
        former: number;
        free: number;
        first: string;
        last: string;
        isActive: boolean;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        order: string;
        position: number;
        department: string | null;
        manual: boolean;
        end: number;
        start: number;
        prefix: string;
        suffix: string;
        padLength: number;
        autoAssign: boolean;
        reuse: boolean;
        releaseAs: string;
    }[]>;
    createRange(a: Actor, b: RangeInput): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        order: string;
        position: number;
        department: string | null;
        manual: boolean;
        end: number;
        start: number;
        prefix: string;
        suffix: string;
        padLength: number;
        autoAssign: boolean;
        reuse: boolean;
        releaseAs: string;
    }>;
    saveRange(a: Actor, id: string, b: RangeInput): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        order: string;
        position: number;
        department: string | null;
        manual: boolean;
        end: number;
        start: number;
        prefix: string;
        suffix: string;
        padLength: number;
        autoAssign: boolean;
        reuse: boolean;
        releaseAs: string;
    }>;
    deleteRange(a: Actor, id: string): Promise<void>;
    settings(): Promise<{
        dm: {
            title: string;
            color: string;
            template: string;
            enabled: boolean;
        };
        timing: "MANUAL" | "ACCEPT" | "COMPLETE";
        mappings: {
            roleIds: string[];
            kind: string;
            department: string | null;
            rangeId: string | null;
            rankId: string | null;
            createProfile: boolean;
        }[];
        nickname: {
            enabled: boolean;
            format: string;
        };
        rankRoles: boolean;
        departmentRoles: boolean;
        changeNeedsApprover: boolean;
    }>;
    saveSettings(a: Actor, b: DnSettings): Promise<{
        dm: {
            title: string;
            color: string;
            template: string;
            enabled: boolean;
        };
        timing: "MANUAL" | "ACCEPT" | "COMPLETE";
        mappings: {
            roleIds: string[];
            kind: string;
            department: string | null;
            rangeId: string | null;
            rankId: string | null;
            createProfile: boolean;
        }[];
        nickname: {
            enabled: boolean;
            format: string;
        };
        rankRoles: boolean;
        departmentRoles: boolean;
        changeNeedsApprover: boolean;
    }>;
    history(q: {
        display?: string;
        personnelId?: string;
        userId?: string;
    }): Promise<{
        name: string | null;
        actor: string;
        approver: string | null;
        id: string;
        action: string;
        reason: string | null;
        createdAt: Date;
        userId: string | null;
        actorId: string | null;
        personnelId: string | null;
        display: string;
        oldDisplay: string | null;
        approverId: string | null;
    }[]>;
    pending(): Promise<{
        name: string;
        personnelId: string | null;
        id: string;
        reason: string;
        createdAt: Date;
        userId: string;
        discordId: string | null;
        updatedAt: Date;
        status: string;
        kind: string;
        applicationId: string;
    }[]>;
    confirm(a: Actor, id: string, b: {
        display?: string;
    }): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            name: string;
            active: boolean;
            updatedAt: Date;
            order: string;
            position: number;
            department: string | null;
            manual: boolean;
            end: number;
            start: number;
            prefix: string;
            suffix: string;
            padLength: number;
            autoAssign: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    assign(a: Actor, b: z.infer<typeof assign>): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            name: string;
            active: boolean;
            updatedAt: Date;
            order: string;
            position: number;
            department: string | null;
            manual: boolean;
            end: number;
            start: number;
            prefix: string;
            suffix: string;
            padLength: number;
            autoAssign: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    change(a: Actor, b: z.infer<typeof change>): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            name: string;
            active: boolean;
            updatedAt: Date;
            order: string;
            position: number;
            department: string | null;
            manual: boolean;
            end: number;
            start: number;
            prefix: string;
            suffix: string;
            padLength: number;
            autoAssign: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    release(a: Actor, b: z.infer<typeof status> & {
        as: 'FREE' | 'FORMER';
    }): Promise<{
        display: string;
        status: "FREE" | "RESERVED" | "BLOCKED" | "FORMER";
    }>;
    block(a: Actor, b: z.infer<typeof status>): Promise<{
        display: string;
        status: "FREE" | "RESERVED" | "BLOCKED" | "FORMER";
    }>;
    unblock(a: Actor, b: z.infer<typeof status>): Promise<{
        display: string;
        status: "FREE" | "RESERVED" | "BLOCKED" | "FORMER";
    }>;
    reserve(a: Actor, b: z.infer<typeof status>): Promise<{
        display: string;
        status: "FREE" | "RESERVED" | "BLOCKED" | "FORMER";
    }>;
}
export {};
