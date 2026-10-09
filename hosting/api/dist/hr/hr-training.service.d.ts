import { Prisma } from '@prisma/client';
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
}, "strip", z.ZodTypeAny, {
    name: string;
    active: boolean;
    description: string | null;
    duration: string | null;
    requirements: string | null;
    instructorIds: string[];
    examRequired: boolean;
    examId: string | null;
    certificate: boolean;
    audience: string | null;
    requiredRoleId: string | null;
    validDays: number | null;
}, {
    name: string;
    active?: boolean | undefined;
    description?: string | null | undefined;
    duration?: string | null | undefined;
    requirements?: string | null | undefined;
    instructorIds?: string[] | undefined;
    examRequired?: boolean | undefined;
    examId?: string | null | undefined;
    certificate?: boolean | undefined;
    audience?: string | null | undefined;
    requiredRoleId?: string | null | undefined;
    validDays?: number | null | undefined;
}>;
export declare const examSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    questions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["SINGLE", "MULTI", "YESNO", "TEXT", "NUMBER"]>;
        text: z.ZodString;
        options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        correct: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        points: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        options: string[];
        type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
        text: string;
        id: string;
        correct: string[];
        points: number;
    }, {
        type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
        text: string;
        id: string;
        options?: string[] | undefined;
        correct?: string[] | undefined;
        points?: number | undefined;
    }>, "many">>;
    questionCount: z.ZodDefault<z.ZodNumber>;
    passPercent: z.ZodDefault<z.ZodNumber>;
    timeLimitMin: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    maxAttempts: z.ZodDefault<z.ZodNumber>;
    retryHours: z.ZodDefault<z.ZodNumber>;
    autoGrade: z.ZodDefault<z.ZodBoolean>;
    showResult: z.ZodDefault<z.ZodBoolean>;
    examinerIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    trainingId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    description: string | null;
    title: string;
    questions: {
        options: string[];
        type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
        text: string;
        id: string;
        correct: string[];
        points: number;
    }[];
    trainingId: string | null;
    questionCount: number;
    passPercent: number;
    timeLimitMin: number | null;
    maxAttempts: number;
    retryHours: number;
    autoGrade: boolean;
    showResult: boolean;
    examinerIds: string[];
}, {
    title: string;
    active?: boolean | undefined;
    description?: string | null | undefined;
    questions?: {
        type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
        text: string;
        id: string;
        options?: string[] | undefined;
        correct?: string[] | undefined;
        points?: number | undefined;
    }[] | undefined;
    trainingId?: string | null | undefined;
    questionCount?: number | undefined;
    passPercent?: number | undefined;
    timeLimitMin?: number | null | undefined;
    maxAttempts?: number | undefined;
    retryHours?: number | undefined;
    autoGrade?: boolean | undefined;
    showResult?: boolean | undefined;
    examinerIds?: string[] | undefined;
}>;
export declare const TRAINING_STATUSES: readonly ["NOT_STARTED", "IN_PROGRESS", "PASSED", "FAILED", "ABORTED", "EXPIRED"];
/** Ausbildungen (mit Fortschritt und Zertifikat) und Prüfungen (Fragen, Versuche, automatische/manuelle Bewertung). */
export declare class HrTrainingService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
    private get prisma();
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
    saveTraining(actor: Actor, d: z.infer<typeof trainingSchema>, id?: string): Promise<{
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
    /** Fortschritt setzen (Ausbilder oder training.manage); bei „bestanden“ ggf. Zertifikat und Ablaufdatum. */
    setProgress(actor: Actor, d: {
        trainingId: string;
        personnelId: string;
        status: (typeof TRAINING_STATUSES)[number];
        progress?: number;
        note?: string | null;
    }): Promise<{
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
    exams(actor: Actor): Promise<{
        questions: Prisma.JsonValue | undefined;
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
    saveExam(actor: Actor, d: z.infer<typeof examSchema>, id?: string): Promise<{
        id: string;
        createdAt: Date;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        title: string;
        questions: Prisma.JsonValue;
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
    deleteExam(actor: Actor, id: string): Promise<void>;
    /** Prüfung starten: prüft Versuche, Wartezeit; zieht ggf. zufällige Fragen. Liefert Fragen OHNE Lösungen. */
    start(actor: Actor, examId: string): Promise<{
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
        answers: Prisma.JsonValue;
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
    private timedOut;
    /** Versuch ansehen: eigene (ohne Lösungen, Ergebnis je nach Einstellung) oder als Prüfer (mit Lösungen). */
    view(attemptId: string, actor: Actor): Promise<{
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
        answers: Prisma.JsonValue;
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
    /** Antworten zwischenspeichern (Autosave während der Prüfung). */
    saveAnswers(actor: Actor, attemptId: string, answers: Record<string, unknown>): Promise<{
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
        answers: Prisma.JsonValue;
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
    /** Abgeben: automatische Bewertung (ohne Freitext) oder „wartet auf Prüfer“. */
    submit(actor: Actor, attemptId: string, answers: Record<string, unknown>, forced?: boolean): Promise<{
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
        answers: Prisma.JsonValue;
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
    /** Manuelle Bewertung (Prüfer der Prüfung oder exam.grade). */
    grade(actor: Actor, attemptId: string, d: {
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
        answers: Prisma.JsonValue;
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
    /** Ergebnis in die Personalakte übernehmen; bestandene Prüfung → verknüpfte Ausbildung „in Bearbeitung“ markieren. */
    private afterGrade;
    /** Abgegebene Versuche, die noch bewertet werden müssen, bzw. alle Versuche einer Prüfung. */
    attempts(actor: Actor, examId?: string): Promise<{
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
        feedback: string | null;
        personnelId: string;
        score: number | null;
        passed: boolean | null;
        gradedById: string | null;
        examId: string;
        questionIds: string[];
        maxScore: number | null;
        gradedAt: Date | null;
        submittedAt: Date | null;
    }[]>;
}
