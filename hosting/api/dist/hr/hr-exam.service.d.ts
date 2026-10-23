import { Prisma } from '@prisma/client';
import { type ExamInput } from '@enrp/shared';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
/** Zustand einer Prüfung für die angemeldete Person. */
export type ExamState = 'AVAILABLE' | 'IN_PROGRESS' | 'PASSED' | 'PENDING' | 'WAITING' | 'NO_ATTEMPTS' | 'LOCKED' | 'NOT_YET' | 'CLOSED' | 'INACTIVE' | 'NO_QUESTIONS' | 'NO_PROFILE';
/** Prüfungen: Verwaltung, Ablauf (Start → Zwischenspeichern → Abgabe), Bewertung, Annullieren und Auswertung. */
export declare class HrExamService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
    private get prisma();
    private gradesAll;
    private canGrade;
    /** Zielgruppe: leer = alle mit exam.view, sonst mindestens eine der Dashboard-Rollen. */
    private inAudience;
    private me;
    private timedOut;
    /** Fragen eines Versuchs in der Reihenfolge des Versuchs (Schnappschuss; ältere Versuche: aktuelle Fragen der Prüfung). */
    private questionsOf;
    /** Nur bekannte Fragen, nur Text oder Textlisten, begrenzte Länge. */
    private cleanAnswers;
    /** Zustand der Prüfung für eine Person (welche Aktion ist möglich, warum nicht). */
    private state;
    list(actor: Actor): Promise<{
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
            state: ExamState;
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
    private summary;
    /** Vollständige Prüfung mit Fragen (Editor/Prüfer). */
    detail(actor: Actor, id: string): Promise<{
        questions: {
            options: string[];
            type: "YESNO" | "MULTI" | "NUMBER" | "TEXT" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    save(actor: Actor, d: ExamInput, id?: string): Promise<{
        questions: {
            options: string[];
            type: "YESNO" | "MULTI" | "NUMBER" | "TEXT" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    duplicate(actor: Actor, id: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        category: string | null;
        description: string | null;
        active: boolean;
        instructions: string | null;
        questions: Prisma.JsonValue;
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
    /** Prüfung in einen Discord-Kanal schicken: Eckdaten + Link-Button direkt zur Prüfung im Dashboard (optional mit Rollen-Ping). */
    postToDiscord(actor: Actor, id: string, b: {
        channelId: string;
        pingRoleIds: string[];
        message?: string;
    }): Promise<{
        ok: boolean;
        url: string;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Prüfung starten (oder laufenden Versuch fortsetzen). Liefert Fragen OHNE Lösungen. */
    start(actor: Actor, examId: string): Promise<{
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Versuch ansehen: eigener (ohne Lösungen; nach der Bewertung je nach Einsicht) oder als Prüfer (mit Lösungen). */
    view(attemptId: string, actor: Actor): Promise<{
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Antworten und markierte Fragen zwischenspeichern (Autosave während der Prüfung). */
    saveAnswers(actor: Actor, attemptId: string, answers: Record<string, unknown>, flagged?: string[]): Promise<{
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Abgeben: automatische Bewertung oder „wartet auf Prüfer“ (dann werden die Prüfer benachrichtigt). */
    submit(actor: Actor, attemptId: string, answers: Record<string, unknown>, forced?: boolean): Promise<{
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Manuelle Bewertung (Prüfer der Prüfung oder exam.grade/exam.manage). Auch Neubewertung. */
    grade(actor: Actor, attemptId: string, d: {
        scores: Record<string, number>;
        feedback?: string;
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Versuch annullieren: zählt nicht mehr als Versuch (z. B. Täuschung, technische Probleme → neuer Versuch möglich). */
    void(actor: Actor, attemptId: string, reason: string): Promise<{
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
            type: "TEXT" | "YESNO" | "MULTI" | "NUMBER" | "SINGLE" | "ORDER" | "MATCH" | "GAP";
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
    /** Ergebnis in die Personalakte übernehmen; bestanden → Benachrichtigung und verknüpfte Ausbildung „in Bearbeitung“. */
    private afterGrade;
    /** Versuche (ohne Antworten) für Prüfer: alle Prüfungen mit exam.grade/exam.manage, sonst nur die eigenen Prüfer-Prüfungen. */
    attempts(actor: Actor, q: {
        examId?: string;
        status?: string;
    }): Promise<{
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
        passed: boolean | null;
        score: number | null;
        maxScore: number | null;
        gradedAt: Date | null;
        submittedAt: Date | null;
        exam: {
            title: string;
            passPercent: number;
        };
    }[]>;
    /** Auswertung einer Prüfung: Kennzahlen, Ergebnis je Person, Versuche, Fragenstatistik. */
    results(actor: Actor, examId: string): Promise<{
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
}
