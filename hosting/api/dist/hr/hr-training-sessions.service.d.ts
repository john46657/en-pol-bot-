import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
import { HrTrainingService } from './hr-training.service';
export interface Signup {
    discordId: string;
    userId?: string | null;
    name: string;
    at: string;
}
export interface SessionInput {
    trainingId?: string | null;
    title: string;
    startsAt: string;
    forRank?: string | null;
    duration?: string | null;
    location?: string | null;
    notes?: string | null;
    channelId?: string | null;
    guildId?: string | null;
    promoteRankId?: string | null;
    maxSignups?: number | null;
}
/**
 * Ausbildungstermine (wie bisher in Discord: „Ausbildung – Wann / Für den Rang / Dauer“ und danach die „Auswertung“):
 * ankündigen mit Anmelde-Button und Thread, Anmeldungen live in der Nachricht, Auswertung (erschienen/bestanden/Dauer)
 * als eigene Nachricht und in den Personalakten – Bestandene werden auf Wunsch automatisch befördert.
 */
export declare class HrTrainingSessionsService {
    private readonly prisma;
    private readonly perms;
    private readonly core;
    private readonly trainings;
    constructor(prisma: PrismaService, perms: PermissionService, core: HrCoreService, trainings: HrTrainingService);
    list(f: {
        scope?: 'upcoming' | 'past' | 'all';
    }): Promise<{
        signups: Signup[];
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
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string | null;
        location: string | null;
        startsAt: Date;
        instructorId: string | null;
        passed: string[];
        channelId: string | null;
        duration: string | null;
        trainingId: string | null;
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
        signups: Signup[];
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
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string | null;
        location: string | null;
        startsAt: Date;
        instructorId: string | null;
        passed: string[];
        channelId: string | null;
        duration: string | null;
        trainingId: string | null;
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    private row;
    private view;
    private assertCan;
    create(actor: Actor, d: SessionInput): Promise<{
        signups: Signup[];
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
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string | null;
        location: string | null;
        startsAt: Date;
        instructorId: string | null;
        passed: string[];
        channelId: string | null;
        duration: string | null;
        trainingId: string | null;
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    update(actor: Actor, id: string, d: SessionInput): Promise<{
        signups: Signup[];
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
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string | null;
        location: string | null;
        startsAt: Date;
        instructorId: string | null;
        passed: string[];
        channelId: string | null;
        duration: string | null;
        trainingId: string | null;
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    cancel(actor: Actor, id: string, reason?: string): Promise<{
        signups: Signup[];
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
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string | null;
        location: string | null;
        startsAt: Date;
        instructorId: string | null;
        passed: string[];
        channelId: string | null;
        duration: string | null;
        trainingId: string | null;
        forRank: string | null;
        promoteRankId: string | null;
        maxSignups: number | null;
        attended: string[];
        actualDuration: string | null;
        evaluationNote: string | null;
        evaluatedAt: Date | null;
        evaluatedById: string | null;
    }>;
    private data;
    private check;
    /** An-/Abmelden – aus Discord (Button) auch ohne Dashboard-Konto, aus dem Dashboard über die eigene Discord-Verknüpfung. */
    signupById(id: string, d: {
        discordId: string;
        name: string;
        join: boolean;
    }): Promise<{
        ok: boolean;
        message: string;
        count: number;
    }>;
    signupSelf(actor: Actor, id: string, join: boolean): Promise<{
        ok: boolean;
        message: string;
        count: number;
    }>;
    private signupRow;
    /**
     * Auswertung: wer war da, wer hat bestanden, wie lange hat es gedauert. Bestandene bekommen den Ausbildungsnachweis
     * (Personalakte) und – falls eingestellt – den neuen Rang inkl. Discord-Rollen.
     */
    evaluate(actor: Actor, id: string, d: {
        attended: string[];
        passed: string[];
        actualDuration?: string | null;
        note?: string | null;
    }): Promise<{
        session: {
            signups: Signup[];
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
            title: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            createdById: string | null;
            guildId: string | null;
            notes: string | null;
            location: string | null;
            startsAt: Date;
            instructorId: string | null;
            passed: string[];
            channelId: string | null;
            duration: string | null;
            trainingId: string | null;
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
    /** Ankündigung posten bzw. aktualisieren (Anmeldungen, Status). */
    private publish;
}
