import { z } from 'zod';
import { type DnSettings, type ExamInput, type HrConfig, type RangeInput, type RankInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService } from './hr-people.service';
import { HrRequestsService } from './hr-requests.service';
import { HrTrainingService, trainingSchema } from './hr-training.service';
import { HrExamService } from './hr-exam.service';
import { ServiceNumbersService } from './service-numbers.service';
import { HrTrainingSessionsService } from './hr-training-sessions.service';
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
    department?: string | undefined;
    rank?: string | undefined;
    state?: "active" | "inactive" | "absent" | undefined;
    q?: string | undefined;
}, {
    status?: string | undefined;
    department?: string | undefined;
    rank?: string | undefined;
    state?: "active" | "inactive" | "absent" | undefined;
    q?: string | undefined;
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
    status?: string | undefined;
    userId?: string | undefined;
    callsign?: string | null | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    joinDate?: string | undefined;
}, {
    status?: string | undefined;
    userId?: string | undefined;
    callsign?: string | null | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    joinDate?: string | undefined;
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
    callsign?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    office?: string | null | undefined;
    joinDate?: string | undefined;
    rankSince?: string | undefined;
}, {
    status?: string | undefined;
    callsign?: string | null | undefined;
    department?: string | null | undefined;
    rank?: string | null | undefined;
    office?: string | null | undefined;
    joinDate?: string | undefined;
    rankSince?: string | undefined;
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
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    attachments?: string[] | undefined;
    details?: string | undefined;
    severity?: string | undefined;
    awardId?: string | undefined;
}, {
    type: "NOTE" | "AWARD" | "RECOMMENDATION" | "WARNING";
    summary: string;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    attachments?: string[] | undefined;
    details?: string | undefined;
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
    status?: "ACTIVE" | "REVOKED" | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    summary?: string | undefined;
    details?: string | null | undefined;
}, {
    status?: "ACTIVE" | "REVOKED" | undefined;
    category?: string | undefined;
    expiresAt?: string | null | undefined;
    summary?: string | undefined;
    details?: string | null | undefined;
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
        warnings: {
            dm: boolean;
            channelId: string | null;
            template: string;
            limit: number;
            atLimit: {
                status: string | null;
                notifyRoleIds: string[];
                pingDiscordRoleIds: string[];
                removeDiscordRoleIds: string[];
            };
        };
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
        notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed" | "exam.submitted", {
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
        warnings: {
            dm: boolean;
            channelId: string | null;
            template: string;
            limit: number;
            atLimit: {
                status: string | null;
                notifyRoleIds: string[];
                pingDiscordRoleIds: string[];
                removeDiscordRoleIds: string[];
            };
        };
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
        notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed" | "exam.submitted", {
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
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        team: string | null;
        rank: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
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
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
        }[] | null;
        transfers: {
            createdByName: string;
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
        }[] | null;
        requests: {
            internalNote: string | null;
            requesterName: string;
            number: string;
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            reason: string;
            kind: string;
            personnelId: string;
            fromValue: string | null;
            toValue: string;
            achievements: string | null;
            attachments: string[];
            requesterId: string;
            approvals: import("@prisma/client/runtime/library").JsonValue;
            decidedAt: Date | null;
            executedById: string | null;
            executedAt: Date | null;
        }[];
        awards: {
            createdByName: string;
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
        }[] | null;
        warnings: {
            state: string;
            createdByName: string;
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
        }[] | null;
        notes: {
            createdByName: string;
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
        }[] | null;
        recommendations: {
            createdByName: string;
            id: string;
            status: string | null;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            type: string;
            expiresAt: Date | null;
            personnelId: string;
            attachments: string[];
            data: import("@prisma/client/runtime/library").JsonValue | null;
            summary: string;
            details: string | null;
            deletedAt: Date | null;
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
            status: string;
            updatedAt: Date;
            expiresAt: Date | null;
            startedAt: Date | null;
            personnelId: string;
            trainingId: string;
            note: string | null;
            progress: number;
            doneModules: string[];
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
            voidReason: string | null;
            voidedById: string | null;
            personnelId: string;
            examId: string;
            snapshot: import("@prisma/client/runtime/library").JsonValue | null;
            score: number | null;
            passed: boolean | null;
            gradedById: string | null;
            questionIds: string[];
            shuffle: import("@prisma/client/runtime/library").JsonValue;
            flagged: string[];
            questionScores: import("@prisma/client/runtime/library").JsonValue | null;
            voidedAt: Date | null;
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
            createdAt: Date;
            reason: string | null;
            userId: string | null;
            personnelId: string | null;
            display: string;
            action: string;
            actorId: string | null;
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
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        team: string | null;
        rank: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    /** Verwarnungen (Übersicht) und Verwarnen über Discord (/verwarnen). */
    warnings(a: Actor, q: {
        state?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ALL';
        q?: string;
    }): Promise<{
        limit: number;
        items: {
            id: string;
            personnelId: string;
            name: string;
            rank: string | null;
            summary: string;
            details: string | null;
            data: import("@prisma/client/runtime/library").JsonValue;
            createdAt: Date;
            expiresAt: Date | null;
            by: string;
            state: string;
            active: number;
        }[];
    }>;
    warnDiscord(a: Actor, b: {
        discordId: string;
        reason: string;
        severity?: string;
    }): Promise<{
        id: string;
        count: number;
        limit: number;
    }>;
    addRecord(a: Actor, id: string, b: z.infer<typeof record>): Promise<{
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        data: import("@prisma/client/runtime/library").JsonValue | null;
        summary: string;
        details: string | null;
        deletedAt: Date | null;
    }>;
    editRecord(a: Actor, id: string, b: z.infer<typeof editRecord>): Promise<{
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        data: import("@prisma/client/runtime/library").JsonValue | null;
        summary: string;
        details: string | null;
        deletedAt: Date | null;
    }>;
    deleteRecord(a: Actor, id: string, b: z.infer<typeof reason>): Promise<void>;
    check(a: Actor, id: string, req: string, b: {
        value: boolean;
    }): Promise<{
        [x: string]: boolean;
    }>;
    ranks(): import("@prisma/client").Prisma.PrismaPromise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        description: string | null;
        active: boolean;
        name: string;
        icon: string | null;
        position: number;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    createRank(a: Actor, b: RankInput): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        description: string | null;
        active: boolean;
        name: string;
        icon: string | null;
        position: number;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }>;
    order(a: Actor, b: {
        ids: string[];
    }): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        description: string | null;
        active: boolean;
        name: string;
        icon: string | null;
        position: number;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    saveRank(a: Actor, id: string, b: RankInput): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        description: string | null;
        active: boolean;
        name: string;
        icon: string | null;
        position: number;
        discordRoleIds: string[];
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
    status?: string | undefined;
    kind?: "PROMOTION" | "TRANSFER" | undefined;
    department?: string | undefined;
    rank?: string | undefined;
    personnelId?: string | undefined;
    requesterId?: string | undefined;
    approverId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    q?: string | undefined;
}, {
    status?: string | undefined;
    kind?: "PROMOTION" | "TRANSFER" | undefined;
    department?: string | undefined;
    rank?: string | undefined;
    personnelId?: string | undefined;
    requesterId?: string | undefined;
    approverId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    q?: string | undefined;
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
    personnelId: string;
    to: string;
    achievements?: string | undefined;
    internalNote?: string | undefined;
    attachments?: string[] | undefined;
}, {
    kind: "PROMOTION" | "TRANSFER";
    personnelId: string;
    to: string;
    reason?: string | undefined;
    achievements?: string | undefined;
    internalNote?: string | undefined;
    attachments?: string[] | undefined;
}>;
declare const editR: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
    achievements: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    internalNote: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
    reason?: string | undefined;
    achievements?: string | null | undefined;
    internalNote?: string | null | undefined;
    attachments?: string[] | undefined;
}, {
    version?: number | undefined;
    reason?: string | undefined;
    achievements?: string | null | undefined;
    internalNote?: string | null | undefined;
    attachments?: string[] | undefined;
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
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
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
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    create(a: Actor, b: z.infer<typeof createR>): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    edit(a: Actor, id: string, b: z.infer<typeof editR>): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    decide(a: Actor, id: string, b: z.infer<typeof decide>): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    execute(a: Actor, id: string): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        reason: string;
        kind: string;
        personnelId: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: import("@prisma/client/runtime/library").JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
}
declare const progress: z.ZodObject<{
    trainingId: z.ZodString;
    personnelId: z.ZodString;
    status: z.ZodEnum<["NOT_STARTED", "IN_PROGRESS", "PASSED", "FAILED", "ABORTED", "EXPIRED"]>;
    progress: z.ZodOptional<z.ZodNumber>;
    doneModules: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "FAILED" | "EXPIRED" | "PASSED" | "NOT_STARTED" | "IN_PROGRESS" | "ABORTED";
    personnelId: string;
    trainingId: string;
    note?: string | null | undefined;
    progress?: number | undefined;
    doneModules?: string[] | undefined;
}, {
    status: "FAILED" | "EXPIRED" | "PASSED" | "NOT_STARTED" | "IN_PROGRESS" | "ABORTED";
    personnelId: string;
    trainingId: string;
    note?: string | null | undefined;
    progress?: number | undefined;
    doneModules?: string[] | undefined;
}>;
export declare class HrTrainingController {
    private readonly s;
    constructor(s: HrTrainingService);
    trainings(): Promise<{
        passed: number;
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        active: boolean;
        name: string;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        duration: string | null;
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
        modules: string[];
    }[]>;
    create(a: Actor, b: z.infer<typeof trainingSchema>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        active: boolean;
        name: string;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        duration: string | null;
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
        modules: string[];
    }>;
    save(a: Actor, id: string, b: z.infer<typeof trainingSchema>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        active: boolean;
        name: string;
        position: number;
        requirements: string | null;
        instructorIds: string[];
        duration: string | null;
        examRequired: boolean;
        examId: string | null;
        certificate: boolean;
        audience: string | null;
        requiredRoleId: string | null;
        validDays: number | null;
        modules: string[];
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
        status: string;
        updatedAt: Date;
        expiresAt: Date | null;
        startedAt: Date | null;
        personnelId: string;
        trainingId: string;
        note: string | null;
        progress: number;
        doneModules: string[];
        examinerId: string | null;
        completedAt: Date | null;
        certificateNo: string | null;
    })[]>;
    setProgress(a: Actor, b: z.infer<typeof progress>): Promise<{
        id: string;
        status: string;
        updatedAt: Date;
        expiresAt: Date | null;
        startedAt: Date | null;
        personnelId: string;
        trainingId: string;
        note: string | null;
        progress: number;
        doneModules: string[];
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
}
declare const answersBody: z.ZodObject<{
    answers: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    flagged: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    answers: Record<string, unknown>;
    flagged?: string[] | undefined;
}, {
    answers: Record<string, unknown>;
    flagged?: string[] | undefined;
}>;
declare const gradeBody: z.ZodObject<{
    scores: z.ZodRecord<z.ZodString, z.ZodNumber>;
    feedback: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scores: Record<string, number>;
    feedback?: string | undefined;
}, {
    scores: Record<string, number>;
    feedback?: string | undefined;
}>;
declare const attemptsQ: z.ZodObject<{
    examId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["IN_PROGRESS", "SUBMITTED", "GRADED", "VOIDED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "SUBMITTED" | "GRADED" | "IN_PROGRESS" | "VOIDED" | undefined;
    examId?: string | undefined;
}, {
    status?: "SUBMITTED" | "GRADED" | "IN_PROGRESS" | "VOIDED" | undefined;
    examId?: string | undefined;
}>;
export declare class HrExamController {
    private readonly s;
    constructor(s: HrExamService);
    list(a: Actor): Promise<{
        id: string;
        title: string;
        description: string | null;
        instructions: string | null;
        category: string | null;
        active: boolean;
        questionTotal: number;
        questionsPerAttempt: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        layout: string;
        reviewMode: string;
        showResult: boolean;
        availableFrom: Date | null;
        availableUntil: Date | null;
        trainingId: string | null;
        trainingName: string | null;
        requiredExamId: string | null;
        requiredExamTitle: string | null;
        updatedAt: Date;
        canEdit: boolean;
        canGrade: boolean;
        me: {
            bestPercent: number | null;
            last: {
                status: string;
                passed: boolean | null;
                percent: number | null;
                at: Date;
            } | null;
            state: import("./hr-exam.service").ExamState;
            reason: string | null;
            nextTryAt: string | null;
            openAttemptId: string | null;
            attemptsUsed: number;
            attemptsLeft: number;
        };
        stats: {
            participants: number;
            attempts: number;
            passed: number;
            pending: number;
            running: number;
            avgPercent: number | null;
            passRate: number | null;
        } | null;
    }[]>;
    detail(a: Actor, id: string): Promise<{
        questions: {
            options: string[];
            type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            id: string;
            image: string | null;
            partial: boolean;
            matches: string[];
            correct: string[];
            points: number;
            tolerance: number;
            explanation: string | null;
        }[];
        attemptCount: number;
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: string | null;
        description: string | null;
        active: boolean;
        instructions: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        reviewMode: string;
        layout: string;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        examinerIds: string[];
        audienceRoleIds: string[];
        trainingId: string | null;
        requiredExamId: string | null;
        availableFrom: Date | null;
        availableUntil: Date | null;
        notifyExaminers: boolean;
    }>;
    create(a: Actor, b: ExamInput): Promise<{
        questions: {
            options: string[];
            type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            id: string;
            image: string | null;
            partial: boolean;
            matches: string[];
            correct: string[];
            points: number;
            tolerance: number;
            explanation: string | null;
        }[];
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: string | null;
        description: string | null;
        active: boolean;
        instructions: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        reviewMode: string;
        layout: string;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        examinerIds: string[];
        audienceRoleIds: string[];
        trainingId: string | null;
        requiredExamId: string | null;
        availableFrom: Date | null;
        availableUntil: Date | null;
        notifyExaminers: boolean;
    }>;
    save(a: Actor, id: string, b: ExamInput): Promise<{
        questions: {
            options: string[];
            type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            id: string;
            image: string | null;
            partial: boolean;
            matches: string[];
            correct: string[];
            points: number;
            tolerance: number;
            explanation: string | null;
        }[];
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: string | null;
        description: string | null;
        active: boolean;
        instructions: string | null;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        reviewMode: string;
        layout: string;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        examinerIds: string[];
        audienceRoleIds: string[];
        trainingId: string | null;
        requiredExamId: string | null;
        availableFrom: Date | null;
        availableUntil: Date | null;
        notifyExaminers: boolean;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    duplicate(a: Actor, id: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: string | null;
        description: string | null;
        active: boolean;
        instructions: string | null;
        questions: import("@prisma/client/runtime/library").JsonValue;
        questionCount: number;
        passPercent: number;
        timeLimitMin: number | null;
        maxAttempts: number;
        retryHours: number;
        autoGrade: boolean;
        showResult: boolean;
        reviewMode: string;
        layout: string;
        shuffleQuestions: boolean;
        shuffleOptions: boolean;
        examinerIds: string[];
        audienceRoleIds: string[];
        trainingId: string | null;
        requiredExamId: string | null;
        availableFrom: Date | null;
        availableUntil: Date | null;
        notifyExaminers: boolean;
    }>;
    results(a: Actor, id: string): Promise<{
        exam: {
            id: string;
            title: string;
            passPercent: number;
            maxAttempts: number;
            questionTotal: number;
            category: string | null;
        };
        stats: {
            voided: number;
            avgMinutes: number | null;
            bestPercent: number | null;
            participants: number;
            attempts: number;
            passed: number;
            pending: number;
            running: number;
            avgPercent: number | null;
            passRate: number | null;
        };
        people: {
            personnelId: string;
            name: string;
            rank: string | null;
            attempts: number;
            bestPercent: number | null;
            passed: boolean;
            pending: boolean;
            running: boolean;
            lastAt: Date;
        }[];
        attempts: {
            id: string;
            personnelId: string;
            name: string;
            rank: string | null;
            own: boolean;
            status: string;
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            startedAt: Date;
            submittedAt: Date | null;
            gradedAt: Date | null;
            voidReason: string | null;
            minutes: number | null;
        }[];
        questions: {
            id: string;
            text: string;
            type: string;
            points: number;
            asked: number;
            avgPercent: number | null;
            correctRate: number | null;
        }[];
    }>;
    start(a: Actor, id: string): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
    }>;
    attempts(a: Actor, q: z.infer<typeof attemptsQ>): Promise<{
        percent: number | null;
        own: boolean;
        personnel: {
            user: {
                displayName: string;
            };
            userId: string;
            rank: string | null;
        };
        id: string;
        status: string;
        startedAt: Date;
        voidReason: string | null;
        personnelId: string;
        examId: string;
        score: number | null;
        passed: boolean | null;
        maxScore: number | null;
        gradedAt: Date | null;
        submittedAt: Date | null;
        exam: {
            title: string;
            passPercent: number;
        };
    }[]>;
    attempt(a: Actor, id: string): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
    }>;
    answers(a: Actor, id: string, b: z.infer<typeof answersBody>): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
    } | {
        saved: boolean;
    }>;
    submit(a: Actor, id: string, b: z.infer<typeof answersBody>): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
    }>;
    grade(a: Actor, id: string, b: z.infer<typeof gradeBody>): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
    }>;
    void(a: Actor, id: string, b: {
        reason: string;
    }): Promise<{
        id: string;
        examId: string;
        title: string;
        description: string | null;
        instructions: string | null;
        status: string;
        startedAt: Date;
        submittedAt: Date | null;
        serverNow: Date;
        deadline: Date | null;
        timeLimitMin: number | null;
        passPercent: number;
        layout: string;
        reviewMode: string;
        name: string;
        rank: string | null;
        owner: boolean;
        grader: boolean;
        answers: Record<string, unknown> | null;
        flagged: string[];
        questions: {
            auto?: number | null | undefined;
            correct?: string[] | undefined;
            gaps?: string[][] | undefined;
            tolerance?: number | undefined;
            explanation?: string | null | undefined;
            correctAnswer?: boolean | undefined;
            earned?: number | null | undefined;
            id: string;
            type: "TEXT" | "YESNO" | "MULTI" | "SINGLE" | "NUMBER" | "ORDER" | "MATCH" | "GAP";
            text: string;
            image: string | null;
            points: number;
            partial: boolean;
            options: {
                i: number;
                text: string;
            }[];
            matches: {
                i: number;
                text: string;
            }[];
        }[];
        result: {
            score: number | null;
            maxScore: number | null;
            percent: number | null;
            passed: boolean | null;
            feedback: string | null;
        } | {
            passed: boolean | null;
            feedback: string | null;
            score?: undefined;
            maxScore?: undefined;
            percent?: undefined;
        } | null;
        gradedBy: string | null;
        gradedAt: Date | null;
        voided: {
            reason: string | null;
            at: Date | null;
            by: string | null;
        } | null;
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
    status?: "ACTIVE" | "FREE" | "RESERVED" | "BLOCKED" | "FORMER" | undefined;
    department?: string | undefined;
    rank?: string | undefined;
    rangeId?: string | undefined;
    limit?: number | undefined;
    q?: string | undefined;
}, {
    status?: "ACTIVE" | "FREE" | "RESERVED" | "BLOCKED" | "FORMER" | undefined;
    department?: string | undefined;
    rank?: string | undefined;
    rangeId?: string | undefined;
    limit?: number | undefined;
    q?: string | undefined;
}>;
/** Person per Personalakte oder direkt als Discord-Mitglied (Personalakte wird dann angelegt). */
declare const assign: z.ZodEffects<z.ZodObject<{
    display: z.ZodOptional<z.ZodString>;
    rangeId: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
} & {
    personnelId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    personnelId?: string | undefined;
    rangeId?: string | undefined;
    display?: string | undefined;
}, {
    reason?: string | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    personnelId?: string | undefined;
    rangeId?: string | undefined;
    display?: string | undefined;
}>, {
    reason?: string | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    personnelId?: string | undefined;
    rangeId?: string | undefined;
    display?: string | undefined;
}, {
    reason?: string | undefined;
    name?: string | undefined;
    discordId?: string | undefined;
    personnelId?: string | undefined;
    rangeId?: string | undefined;
    display?: string | undefined;
}>;
declare const change: z.ZodObject<{
    display: z.ZodOptional<z.ZodString>;
    rangeId: z.ZodOptional<z.ZodString>;
} & {
    personnelId: z.ZodString;
    reason: z.ZodString;
    approverId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    personnelId: string;
    rangeId?: string | undefined;
    display?: string | undefined;
    approverId?: string | null | undefined;
}, {
    reason: string;
    personnelId: string;
    rangeId?: string | undefined;
    display?: string | undefined;
    approverId?: string | null | undefined;
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
        duplicateOf: {
            id: string;
            name: string;
        } | null;
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        department: string | null;
        position: number;
        prefix: string;
        suffix: string;
        start: number;
        end: number;
        padLength: number;
        order: string;
        autoAssign: boolean;
        manual: boolean;
        reuse: boolean;
        releaseAs: string;
    }[]>;
    createRange(a: Actor, b: RangeInput): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        department: string | null;
        position: number;
        prefix: string;
        suffix: string;
        start: number;
        end: number;
        padLength: number;
        order: string;
        autoAssign: boolean;
        manual: boolean;
        reuse: boolean;
        releaseAs: string;
    }>;
    saveRange(a: Actor, id: string, b: RangeInput): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        department: string | null;
        position: number;
        prefix: string;
        suffix: string;
        start: number;
        end: number;
        padLength: number;
        order: string;
        autoAssign: boolean;
        manual: boolean;
        reuse: boolean;
        releaseAs: string;
    }>;
    duplicates(): Promise<{
        keep: {
            id: string;
            name: string;
            numbers: number;
            first: string;
            last: string;
        };
        merge: {
            id: string;
            name: string;
            numbers: number;
        }[];
    }[]>;
    mergeDuplicates(a: Actor, _b: {
        confirm: string;
    }): Promise<{
        merged: number;
        moved: number;
        kept: number;
        backup: null;
    } | {
        merged: number;
        moved: number;
        kept: number;
        backup: string;
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
        createdAt: Date;
        reason: string | null;
        userId: string | null;
        personnelId: string | null;
        display: string;
        action: string;
        actorId: string | null;
        oldDisplay: string | null;
        approverId: string | null;
    }[]>;
    pending(): Promise<{
        name: string;
        personnelId: string | null;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string;
        userId: string;
        kind: string;
        discordId: string | null;
        applicationId: string;
    }[]>;
    /** Angenommene Bewerbungen ohne Personalakte nachträglich übernehmen. */
    fromApplications(a: Actor): Promise<{
        created: number;
        skipped: number;
    }>;
    confirm(a: Actor, id: string, b: {
        display?: string;
    }): Promise<{
        display: string;
        old: string | null;
        range: {
            serverId: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            department: string | null;
            position: number;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    discordMembers(q: {
        q: string;
    }): Promise<{
        personnelId: string | null;
        serviceNumber: string | null;
        id: string;
        username: string;
        displayName: string;
        avatar: string | null;
    }[]>;
    assign(a: Actor, b: z.infer<typeof assign>): Promise<{
        display: string;
        old: string | null;
        range: {
            serverId: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            department: string | null;
            position: number;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    change(a: Actor, b: z.infer<typeof change>): Promise<{
        display: string;
        old: string | null;
        range: {
            serverId: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            department: string | null;
            position: number;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
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
declare const sessionBody: z.ZodObject<{
    trainingId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    title: z.ZodString;
    startsAt: z.ZodString;
    forRank: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    duration: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    promoteRankId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    maxSignups: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    startsAt: string;
    notes?: string | null | undefined;
    location?: string | null | undefined;
    guildId?: string | null | undefined;
    duration?: string | null | undefined;
    trainingId?: string | null | undefined;
    channelId?: string | null | undefined;
    forRank?: string | null | undefined;
    promoteRankId?: string | null | undefined;
    maxSignups?: number | null | undefined;
}, {
    title: string;
    startsAt: string;
    notes?: string | null | undefined;
    location?: string | null | undefined;
    guildId?: string | null | undefined;
    duration?: string | null | undefined;
    trainingId?: string | null | undefined;
    channelId?: string | null | undefined;
    forRank?: string | null | undefined;
    promoteRankId?: string | null | undefined;
    maxSignups?: number | null | undefined;
}>;
declare const evalBody: z.ZodObject<{
    attended: z.ZodArray<z.ZodString, "many">;
    passed: z.ZodArray<z.ZodString, "many">;
    actualDuration: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    passed: string[];
    attended: string[];
    note?: string | null | undefined;
    actualDuration?: string | null | undefined;
}, {
    passed: string[];
    attended: string[];
    note?: string | null | undefined;
    actualDuration?: string | null | undefined;
}>;
/** Ausbildungstermine: ankündigen (Discord mit Anmeldung + Thread), anmelden, auswerten (mit Beförderung). */
export declare class HrTrainingSessionsController {
    private readonly s;
    constructor(s: HrTrainingSessionsService);
    list(q: {
        scope?: 'upcoming' | 'past' | 'all';
    }): Promise<{
        signups: import("./hr-training-sessions.service").Signup[];
        training: {
            id: string;
            name: string;
        } | null;
        promoteRank: {
            id: string;
            name: string;
        } | null;
        instructorName: string | null;
        number: string;
        id: string;
        status: string;
        notes: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        location: string | null;
        guildId: string | null;
        duration: string | null;
        trainingId: string | null;
        instructorId: string | null;
        channelId: string | null;
        startsAt: Date;
        passed: string[];
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }[]>;
    get(id: string): Promise<{
        signups: import("./hr-training-sessions.service").Signup[];
        training: {
            id: string;
            name: string;
        } | null;
        promoteRank: {
            id: string;
            name: string;
        } | null;
        instructorName: string | null;
        number: string;
        id: string;
        status: string;
        notes: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        location: string | null;
        guildId: string | null;
        duration: string | null;
        trainingId: string | null;
        instructorId: string | null;
        channelId: string | null;
        startsAt: Date;
        passed: string[];
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    create(a: Actor, b: z.infer<typeof sessionBody>): Promise<{
        signups: import("./hr-training-sessions.service").Signup[];
        training: {
            id: string;
            name: string;
        } | null;
        promoteRank: {
            id: string;
            name: string;
        } | null;
        instructorName: string | null;
        number: string;
        id: string;
        status: string;
        notes: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        location: string | null;
        guildId: string | null;
        duration: string | null;
        trainingId: string | null;
        instructorId: string | null;
        channelId: string | null;
        startsAt: Date;
        passed: string[];
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof sessionBody>): Promise<{
        signups: import("./hr-training-sessions.service").Signup[];
        training: {
            id: string;
            name: string;
        } | null;
        promoteRank: {
            id: string;
            name: string;
        } | null;
        instructorName: string | null;
        number: string;
        id: string;
        status: string;
        notes: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        location: string | null;
        guildId: string | null;
        duration: string | null;
        trainingId: string | null;
        instructorId: string | null;
        channelId: string | null;
        startsAt: Date;
        passed: string[];
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    cancel(a: Actor, id: string, b: {
        reason?: string;
    }): Promise<{
        signups: import("./hr-training-sessions.service").Signup[];
        training: {
            id: string;
            name: string;
        } | null;
        promoteRank: {
            id: string;
            name: string;
        } | null;
        instructorName: string | null;
        number: string;
        id: string;
        status: string;
        notes: string | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        location: string | null;
        guildId: string | null;
        duration: string | null;
        trainingId: string | null;
        instructorId: string | null;
        channelId: string | null;
        startsAt: Date;
        passed: string[];
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    evaluate(a: Actor, id: string, b: z.infer<typeof evalBody>): Promise<{
        session: {
            signups: import("./hr-training-sessions.service").Signup[];
            training: {
                id: string;
                name: string;
            } | null;
            promoteRank: {
                id: string;
                name: string;
            } | null;
            instructorName: string | null;
            number: string;
            id: string;
            status: string;
            notes: string | null;
            createdById: string | null;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            location: string | null;
            guildId: string | null;
            duration: string | null;
            trainingId: string | null;
            instructorId: string | null;
            channelId: string | null;
            startsAt: Date;
            passed: string[];
            forRank: string | null;
            promoteRankId: string | null;
            maxSignups: number | null;
            attended: string[];
            actualDuration: string | null;
            evaluationNote: string | null;
            evaluatedAt: Date | null;
            evaluatedById: string | null;
        };
        results: {
            discordId: string;
            promoted: boolean;
            problem?: string;
        }[];
    }>;
    signup(a: Actor, id: string, b: {
        join: boolean;
    }): Promise<{
        ok: boolean;
        message: string;
        count: number;
    }>;
}
/** Anmelde-Button in Discord – auch für Mitglieder ohne Dashboard-Konto (z. B. Anwärter). */
export declare class BotTrainingSessionsController {
    private readonly s;
    constructor(s: HrTrainingSessionsService);
    signup(id: string, b: {
        discordId: string;
        name: string;
        join: boolean;
    }): Promise<{
        ok: boolean;
        message: string;
        count: number;
    }>;
}
export {};
