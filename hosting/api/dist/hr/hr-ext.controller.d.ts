import type { Response } from 'express';
import { z } from 'zod';
import { type LearningMaterialInput, type PracticalExamInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PersonnelFileService } from './personnel-file.service';
import { QualificationRegistryService } from './qualification-registry.service';
import { TrainingExtService } from './training-ext.service';
declare const note: z.ZodObject<{
    summary: z.ZodString;
    details: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confidential: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    summary: string;
    details?: string | null | undefined;
    category?: string | null | undefined;
    confidential?: boolean | undefined;
}, {
    summary: string;
    details?: string | null | undefined;
    category?: string | null | undefined;
    confidential?: boolean | undefined;
}>;
declare const editNote: z.ZodObject<{
    summary: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    confidential: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
} & {
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    details?: string | null | undefined;
    category?: string | null | undefined;
    reason?: string | undefined;
    confidential?: boolean | undefined;
    summary?: string | undefined;
}, {
    details?: string | null | undefined;
    category?: string | null | undefined;
    reason?: string | undefined;
    confidential?: boolean | undefined;
    summary?: string | undefined;
}>;
declare const doc: z.ZodObject<{
    mediaId: z.ZodString;
    kind: z.ZodEnum<["PERSONNEL", "TRAINING", "EXAM", "OTHER"]>;
    title: z.ZodString;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confidential: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    title: string;
    kind: "OTHER" | "PERSONNEL" | "TRAINING" | "EXAM";
    mediaId: string;
    note?: string | null | undefined;
    confidential?: boolean | undefined;
}, {
    title: string;
    kind: "OTHER" | "PERSONNEL" | "TRAINING" | "EXAM";
    mediaId: string;
    note?: string | null | undefined;
    confidential?: boolean | undefined;
}>;
/** Personalakte 2.0 (Dashboard), Personal-Auskunft (MDT/Leitstelle/Bot). */
export declare class PersonnelFileController {
    private readonly s;
    constructor(s: PersonnelFileService);
    /** Zuständige Akten für Führungskräfte (personnel.view_unit) */
    myUnit(a: Actor): Promise<{
        id: string;
        name: string;
        robloxName: string | null;
        rank: string | null;
        department: string | null;
        status: string;
        serviceNumber: string | null;
        callsign: string | null;
        joinDate: Date;
    }[]>;
    /** MDT/Leitstelle: dienstrelevante Auskunft, keine vertraulichen Inhalte */
    directory(q: {
        q?: string;
        onDuty?: string;
        page?: number;
    }): Promise<{
        total: number;
        page: number;
        pageSize: number;
        rows: {
            id: string;
            name: string;
            rank: string | null;
            department: string | null;
            callsign: string | null;
            serviceNumber: string | null;
            dutyStatus: string;
            onDutySince: Date | null;
            qualifications: {
                name: string;
                color: string | null;
            }[];
            units: {
                id: string;
                name: string;
                role: string;
            }[];
        }[];
    }>;
    lookup(a: Actor, q: {
        discordId: string;
    }): Promise<{
        id: string;
        name: string;
        robloxName: string | null;
        rank: string | null;
        department: string | null;
        status: string;
        serviceNumber: string | null;
        callsign: string | null;
        joinDate: Date;
        dutyStatus: {
            status: string;
            since: Date | null;
            callsign: string | null;
        };
        units: {
            name: string;
            role: string;
            supervisor: string | null;
        }[];
        qualifications: string[];
    }>;
    summary(a: Actor, id: string): Promise<{
        id: string;
        access: string;
        dutyStatus: {
            status: string;
            since: Date | null;
            callsign: string | null;
        };
        units: {
            id: string;
            name: string;
            kind: string;
            function: string | null;
            since: Date | null;
            role: string;
            path: string[];
            supervisor: {
                id: string;
                userId: string;
                name: string;
                rank: string | null;
                callsign: string | null;
                serviceNumber: string | null;
            } | null;
        }[];
        qualifications: {
            id: string;
            personnelId: string;
            personName: string;
            rank: string | null;
            department: string | null;
            definitionId: string | null;
            name: string;
            color: string | null;
            operational: boolean;
            status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";
            storedStatus: string;
            source: string;
            sourceLabel: string;
            sourceId: string | null;
            issuedAt: Date | null;
            issuedBy: string | null;
            expiresAt: Date | null;
            note: string | null;
            statusReason: string | null;
            statusChangedAt: Date | null;
            statusChangedBy: string | null;
            createdAt: Date;
        }[];
        dutyHistory: {
            days: number;
            minutesOnDuty: number;
            sessions: {
                id: string;
                status: string;
                callsign: string | null;
                startedAt: Date;
                endedAt: Date | null;
            }[];
        };
        dutyReports: {
            number: string;
            id: string;
            status: string;
            createdAt: Date;
            templateName: string;
            period: string;
            periodStart: Date;
        }[];
        trainings: {
            id: string;
            name: string;
            status: string;
            progress: number;
            completedAt: Date | null;
            certificateNo: string | null;
        }[];
        exams: {
            id: string;
            title: string;
            score: number | null;
            maxScore: number | null;
            passed: boolean | null;
            gradedAt: Date | null;
        }[];
        practicalExams: {
            id: string;
            title: string;
            total: number | null;
            maxPoints: number | null;
            passed: boolean | null;
            completedAt: Date | null;
        }[];
        permissions: {
            notes: boolean;
            notesCreate: boolean;
            confidential: boolean;
            documents: boolean;
            activity: boolean;
            qualificationGrant: boolean;
            qualificationRevoke: boolean;
        };
    }>;
    activity(a: Actor, id: string, q: {
        page?: number;
    }): Promise<{
        total: number;
        page: number;
        rows: {
            id: string;
            action: string;
            at: Date;
            actor: string;
            before: import("@prisma/client/runtime/library").JsonValue;
            after: import("@prisma/client/runtime/library").JsonValue;
            reason: string | null;
        }[];
    }>;
    notes(a: Actor, id: string, q: {
        category?: string;
    }): Promise<{
        id: string;
        summary: string;
        details: string | null;
        category: string | null;
        confidential: boolean;
        createdAt: Date;
        updatedAt: Date;
        author: string;
        authorId: string;
        revisions: number;
    }[]>;
    addNote(a: Actor, id: string, b: z.infer<typeof note>): Promise<{
        details: string | null;
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        confidential: boolean;
        summary: string;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        deletedAt: Date | null;
    }>;
    editNote(a: Actor, id: string, b: z.infer<typeof editNote>): Promise<{
        details: string | null;
        id: string;
        status: string | null;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        expiresAt: Date | null;
        personnelId: string;
        attachments: string[];
        confidential: boolean;
        summary: string;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        deletedAt: Date | null;
    }>;
    revisions(a: Actor, id: string): Promise<{
        editedBy: string;
        details: string | null;
        id: string;
        createdAt: Date;
        category: string | null;
        reason: string | null;
        confidential: boolean;
        summary: string;
        editedById: string;
        recordId: string;
    }[]>;
    documents(a: Actor, id: string, q: {
        archived?: string;
    }): Promise<{
        id: string;
        kind: string;
        title: string;
        note: string | null;
        confidential: boolean;
        fileName: string;
        mime: string;
        size: number;
        uploadedBy: string;
        createdAt: Date;
        archivedAt: Date | null;
    }[]>;
    addDocument(a: Actor, id: string, b: z.infer<typeof doc>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        title: string;
        kind: string;
        personnelId: string;
        note: string | null;
        mediaId: string;
        confidential: boolean;
        uploadedById: string;
        archivedAt: Date | null;
        archivedById: string | null;
    }>;
    archive(a: Actor, id: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        title: string;
        kind: string;
        personnelId: string;
        note: string | null;
        mediaId: string;
        confidential: boolean;
        uploadedById: string;
        archivedAt: Date | null;
        archivedById: string | null;
    }>;
    download(a: Actor, id: string, res: Response): Promise<void>;
}
declare const defBody: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    operational: z.ZodDefault<z.ZodBoolean>;
    validDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    autoGrant: z.ZodDefault<z.ZodBoolean>;
    active: z.ZodDefault<z.ZodBoolean>;
} & {
    trainingIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    examIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    name: string;
    operational: boolean;
    autoGrant: boolean;
    trainingIds: string[];
    examIds: string[];
    color?: string | null | undefined;
    description?: string | null | undefined;
    validDays?: number | null | undefined;
}, {
    name: string;
    color?: string | null | undefined;
    description?: string | null | undefined;
    active?: boolean | undefined;
    operational?: boolean | undefined;
    validDays?: number | null | undefined;
    autoGrant?: boolean | undefined;
    trainingIds?: string[] | undefined;
    examIds?: string[] | undefined;
}>;
declare const regQ: z.ZodObject<{
    personnelId: z.ZodOptional<z.ZodString>;
    definitionId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["PENDING", "ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"]>>;
    operational: z.ZodOptional<z.ZodEnum<["1", "0"]>>;
    q: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodNumber>;
    pageSize: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED" | undefined;
    operational?: "1" | "0" | undefined;
    personnelId?: string | undefined;
    definitionId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}, {
    status?: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED" | undefined;
    operational?: "1" | "0" | undefined;
    personnelId?: string | undefined;
    definitionId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/** Qualifikationsregister + Katalog. */
export declare class QualificationRegistryController {
    private readonly s;
    constructor(s: QualificationRegistryService);
    definitions(q: {
        all?: string;
    }): import("@prisma/client").Prisma.PrismaPromise<({
        _count: {
            records: number;
        };
    } & {
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        operational: boolean;
        validDays: number | null;
        autoGrant: boolean;
        trainingIds: string[];
        examIds: string[];
    })[]>;
    create(a: Actor, b: z.infer<typeof defBody>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        operational: boolean;
        validDays: number | null;
        autoGrant: boolean;
        trainingIds: string[];
        examIds: string[];
    }>;
    update(a: Actor, id: string, b: z.infer<typeof defBody>): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        active: boolean;
        name: string;
        operational: boolean;
        validDays: number | null;
        autoGrant: boolean;
        trainingIds: string[];
        examIds: string[];
    }>;
    /** Eigene Qualifikationen (jeder mit Personalakte; Bot-Befehl) */
    mine(a: Actor): Promise<never[] | {
        id: string;
        personnelId: string;
        personName: string;
        rank: string | null;
        department: string | null;
        definitionId: string | null;
        name: string;
        color: string | null;
        operational: boolean;
        status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        storedStatus: string;
        source: string;
        sourceLabel: string;
        sourceId: string | null;
        issuedAt: Date | null;
        issuedBy: string | null;
        expiresAt: Date | null;
        note: string | null;
        statusReason: string | null;
        statusChangedAt: Date | null;
        statusChangedBy: string | null;
        createdAt: Date;
    }[]>;
    list(q: z.infer<typeof regQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        rows: {
            id: string;
            personnelId: string;
            personName: string;
            rank: string | null;
            department: string | null;
            definitionId: string | null;
            name: string;
            color: string | null;
            operational: boolean;
            status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";
            storedStatus: string;
            source: string;
            sourceLabel: string;
            sourceId: string | null;
            issuedAt: Date | null;
            issuedBy: string | null;
            expiresAt: Date | null;
            note: string | null;
            statusReason: string | null;
            statusChangedAt: Date | null;
            statusChangedBy: string | null;
            createdAt: Date;
        }[];
    }>;
    /** Einsatzrelevante, aktive Qualifikationen einer Person (MDT/Leitstelle) */
    ofPersonnel(id: string, q: {
        all?: string;
    }): Promise<{
        id: string;
        personnelId: string;
        personName: string;
        rank: string | null;
        department: string | null;
        definitionId: string | null;
        name: string;
        color: string | null;
        operational: boolean;
        status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        storedStatus: string;
        source: string;
        sourceLabel: string;
        sourceId: string | null;
        issuedAt: Date | null;
        issuedBy: string | null;
        expiresAt: Date | null;
        note: string | null;
        statusReason: string | null;
        statusChangedAt: Date | null;
        statusChangedBy: string | null;
        createdAt: Date;
    }[]>;
    grant(a: Actor, b: {
        personnelId: string;
        definitionId: string;
        issuedAt?: string;
        expiresAt?: string | null;
        note?: string;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        source: string;
        issuedAt: Date | null;
        name: string;
        personnelId: string;
        note: string | null;
        definitionId: string | null;
        sourceId: string | null;
        issuedById: string | null;
        statusReason: string | null;
        statusChangedAt: Date | null;
        statusChangedById: string | null;
    }>;
    status(a: Actor, id: string, b: {
        status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
        reason?: string;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        source: string;
        issuedAt: Date | null;
        name: string;
        personnelId: string;
        note: string | null;
        definitionId: string | null;
        sourceId: string | null;
        issuedById: string | null;
        statusReason: string | null;
        statusChangedAt: Date | null;
        statusChangedById: string | null;
    }>;
}
declare const matQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    trainingId: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind?: string | undefined;
    trainingId?: string | undefined;
    q?: string | undefined;
}, {
    kind?: string | undefined;
    trainingId?: string | undefined;
    q?: string | undefined;
}>;
/** Lernmaterialien und praktische Prüfungen. */
export declare class TrainingExtController {
    private readonly s;
    constructor(s: TrainingExtService);
    materials(a: Actor, q: z.infer<typeof matQ>): Promise<{
        id: string;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        examId: string | null;
        trainingIds: string[];
        qualificationDefId: string | null;
        published: boolean;
    }[]>;
    material(a: Actor, id: string): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        examId: string | null;
        archivedAt: Date | null;
        trainingIds: string[];
        body: string;
        mediaIds: string[];
        qualificationDefId: string | null;
        published: boolean;
        updatedById: string | null;
    }>;
    createMaterial(a: Actor, b: LearningMaterialInput & {
        version?: number;
    }): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        examId: string | null;
        archivedAt: Date | null;
        trainingIds: string[];
        body: string;
        mediaIds: string[];
        qualificationDefId: string | null;
        published: boolean;
        updatedById: string | null;
    }>;
    saveMaterial(a: Actor, id: string, b: LearningMaterialInput & {
        version?: number;
    }): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        title: string;
        kind: string;
        examId: string | null;
        archivedAt: Date | null;
        trainingIds: string[];
        body: string;
        mediaIds: string[];
        qualificationDefId: string | null;
        published: boolean;
        updatedById: string | null;
    }>;
    archiveMaterial(a: Actor, id: string): Promise<void>;
    practical(q: {
        all?: string;
    }): Promise<({
        _count: {
            assessments: number;
        };
    } & {
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        active: boolean;
        examinerIds: string[];
        trainingId: string | null;
        qualificationDefId: string | null;
        tasks: string | null;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
    })[]>;
    practicalExam(id: string): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        active: boolean;
        examinerIds: string[];
        trainingId: string | null;
        qualificationDefId: string | null;
        tasks: string | null;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
    }>;
    createPractical(a: Actor, b: PracticalExamInput): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        active: boolean;
        examinerIds: string[];
        trainingId: string | null;
        qualificationDefId: string | null;
        tasks: string | null;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
    }>;
    savePractical(a: Actor, id: string, b: PracticalExamInput): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string | null;
        active: boolean;
        examinerIds: string[];
        trainingId: string | null;
        qualificationDefId: string | null;
        tasks: string | null;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
    }>;
    assessments(a: Actor, q: {
        examId?: string;
        status?: string;
        personnelId?: string;
    }): Promise<{
        examTitle: string;
        personName: string;
        examinerName: string;
        exam: undefined;
        personnel: undefined;
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }[]>;
    assessment(a: Actor, id: string): Promise<{
        personName: string;
        result: {
            total: number;
            max: number;
            complete: boolean;
            missing: string[];
            invalid: string[];
            failedRequired: string[];
            passed: boolean;
            percent: number;
        };
        canEdit: boolean;
        personnel: {
            user: {
                displayName: string;
            };
            userId: string;
        };
        exam: {
            serverId: string | null;
            id: string;
            createdById: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            description: string | null;
            active: boolean;
            examinerIds: string[];
            trainingId: string | null;
            qualificationDefId: string | null;
            tasks: string | null;
            criteria: import("@prisma/client/runtime/library").JsonValue;
            passPoints: number;
        };
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    start(a: Actor, id: string, b: {
        personnelId: string;
    }): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    scores(a: Actor, id: string, b: {
        scores: Record<string, {
            points: number;
            note?: string;
        }>;
        remarks?: string | null;
    }): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    complete(a: Actor, id: string): Promise<{
        result: {
            total: number;
            max: number;
            complete: boolean;
            missing: string[];
            invalid: string[];
            failedRequired: string[];
            passed: boolean;
            percent: number;
        };
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    cancel(a: Actor, id: string, b: {
        reason: string;
    }): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: import("@prisma/client/runtime/library").JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: import("@prisma/client/runtime/library").JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
}
export {};
