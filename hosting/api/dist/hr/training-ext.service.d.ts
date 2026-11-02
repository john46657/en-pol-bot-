import { Prisma } from '@prisma/client';
import { type LearningMaterialInput, type PracticalExamInput, type PracticalScores } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { HrCoreService } from './hr-core.service';
import { QualificationRegistryService } from './qualification-registry.service';
/**
 * Ausbildungs- und Prüfungssystem 2.0 (Ergänzung zu Ausbildungen/Theorieprüfungen): Lernmaterialien und praktische Prüfungen.
 * Praktische Bewertungen dürfen nur Prüfer der Prüfung bzw. Personen mit `exam.manage` vornehmen – nie für sich selbst.
 */
export declare class TrainingExtService {
    private readonly core;
    private readonly perms;
    private readonly quals;
    private readonly notify;
    constructor(core: HrCoreService, perms: PermissionService, quals: QualificationRegistryService, notify: NotifyService);
    private get prisma();
    materials(actor: Actor, q: {
        q?: string;
        trainingId?: string;
        kind?: string;
    }): Promise<{
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
    material(actor: Actor, id: string): Promise<{
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
    saveMaterial(actor: Actor, d: LearningMaterialInput & {
        version?: number;
    }, id?: string): Promise<{
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
    archiveMaterial(actor: Actor, id: string): Promise<void>;
    practicalExams(all?: boolean): Promise<({
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
        criteria: Prisma.JsonValue;
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
        criteria: Prisma.JsonValue;
        passPoints: number;
    }>;
    savePracticalExam(actor: Actor, d: PracticalExamInput, id?: string): Promise<{
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
        criteria: Prisma.JsonValue;
        passPoints: number;
    }>;
    /** Bewertungen: mit exam.results/exam.manage alle, sonst nur eigene (als Prüfer). */
    assessments(actor: Actor, q: {
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
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }[]>;
    private assertExaminer;
    private assessment;
    start(actor: Actor, examId: string, personnelId: string): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    /** Zwischenstand speichern (Punkte und Bemerkungen je Kriterium). */
    saveScores(actor: Actor, id: string, d: {
        scores: PracticalScores;
        remarks?: string | null;
    }): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    /** Abschließen: alle Kriterien bewertet → Ergebnis, Personalakte, ggf. Qualifikation, private Benachrichtigung. */
    complete(actor: Actor, id: string): Promise<{
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
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    cancel(actor: Actor, id: string, reason: string): Promise<{
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
    view(actor: Actor, id: string): Promise<{
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
            criteria: Prisma.JsonValue;
            passPoints: number;
        };
        id: string;
        status: string;
        startedAt: Date;
        personnelId: string;
        examId: string;
        criteria: Prisma.JsonValue;
        passPoints: number;
        passed: boolean | null;
        total: number | null;
        completedAt: Date | null;
        examinerId: string;
        scores: Prisma.JsonValue;
        maxPoints: number | null;
        remarks: string | null;
        cancelledReason: string | null;
    }>;
}
