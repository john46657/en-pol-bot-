import { z } from 'zod';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
export declare const trainingSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    requirements: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    instructorIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    duration: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
    examRequired: z.ZodDefault<z.ZodBoolean>;
    examId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    certificate: z.ZodDefault<z.ZodBoolean>;
    audience: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    requiredRoleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    validDays: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    modules: z.ZodEffects<z.ZodDefault<z.ZodArray<z.ZodString, "many">>, string[], string[] | undefined>;
}, "strip", z.ZodTypeAny, {
    description: string | null;
    active: boolean;
    name: string;
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
}, {
    name: string;
    description?: string | null | undefined;
    active?: boolean | undefined;
    requirements?: string | null | undefined;
    instructorIds?: string[] | undefined;
    duration?: string | null | undefined;
    examRequired?: boolean | undefined;
    examId?: string | null | undefined;
    certificate?: boolean | undefined;
    audience?: string | null | undefined;
    requiredRoleId?: string | null | undefined;
    validDays?: number | null | undefined;
    modules?: string[] | undefined;
}>;
export declare const TRAINING_STATUSES: readonly ["NOT_STARTED", "IN_PROGRESS", "PASSED", "FAILED", "ABORTED", "EXPIRED"];
/** Ausbildungen (mit Fortschritt und Zertifikat). Prüfungen: hr-exam.service.ts */
export declare class HrTrainingService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
    private get prisma();
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
    saveTraining(actor: Actor, d: z.infer<typeof trainingSchema>, id?: string): Promise<{
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
    deleteTraining(actor: Actor, id: string): Promise<void>;
    /** Fortschritt aller Personen in einer Ausbildung (Matrix). */
    progressOf(trainingId: string): Promise<({
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
    /** Fortschritt setzen (Ausbilder oder training.manage); bei „bestanden“ ggf. Zertifikat und Ablaufdatum. */
    setProgress(actor: Actor, d: {
        trainingId: string;
        personnelId: string;
        status: (typeof TRAINING_STATUSES)[number];
        progress?: number;
        doneModules?: string[];
        note?: string | null;
    }): Promise<{
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
    /** Abgelaufene Ausbildungen markieren (beim Lesen). */
    expire(): Promise<void>;
    /** Digitales Zertifikat (nur bestandene Ausbildungen mit Zertifikat). Sichtbar für die Person selbst und mit training.view. */
    certificate(actor: Actor, certificateNo: string): Promise<{
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
