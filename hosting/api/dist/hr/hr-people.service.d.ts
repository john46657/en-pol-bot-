import { Prisma } from '@prisma/client';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
import { DiscordLiveService } from '../discord/discord-live.service';
export interface OverviewFilter {
    q?: string;
    status?: string;
    rank?: string;
    department?: string;
    state?: 'active' | 'inactive' | 'absent';
}
export declare const RECORD_TYPES: readonly ["NOTE", "WARNING", "AWARD", "RECOMMENDATION"];
export type RecordType = (typeof RECORD_TYPES)[number];
/** Personal-Übersicht, Personalakte und Einträge (Notizen, Verwarnungen, Auszeichnungen, Empfehlungen). */
export declare class HrPeopleService {
    private readonly core;
    private readonly perms;
    private readonly live;
    constructor(core: HrCoreService, perms: PermissionService, live: DiscordLiveService);
    private get prisma();
    private ctx;
    /** Feld/Bereich sichtbar? Geschützt = nur mit personnel.view_sensitive. */
    private shows;
    overview(actor: Actor, f: OverviewFilter): Promise<{
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
    /** Vollständige Personalakte (nur sichtbare Bereiche); Zugriff wird protokolliert. */
    profile(actor: Actor, id: string): Promise<{
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
        customChecks: Prisma.JsonValue;
        sections: {
            [k: string]: boolean;
        };
        next: import("@enrp/shared").PromotionCheck[];
        promotions: {
            createdByName: string;
            data: Prisma.JsonValue | null;
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
            data: Prisma.JsonValue | null;
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
            approvals: Prisma.JsonValue;
            executedById: string | null;
            executedAt: Date | null;
        }[];
        awards: {
            createdByName: string;
            data: Prisma.JsonValue | null;
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
            data: Prisma.JsonValue | null;
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
            data: Prisma.JsonValue | null;
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
            data: Prisma.JsonValue | null;
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
            before: Prisma.JsonValue;
            after: Prisma.JsonValue;
            reason: string | null;
        }[] | null;
        counts: {
            promotions: number;
            trainings: number;
            awards: number;
            warnings: number;
        };
    }>;
    /** Personalakte anlegen – für einen Benutzer oder direkt per Discord-ID (Benutzer wird bei Bedarf angelegt). */
    create(actor: Actor, d: {
        userId?: string;
        discordId?: string;
        name?: string;
        rank?: string | null;
        department?: string | null;
        status?: string;
        joinDate?: string;
        callsign?: string | null;
    }): Promise<{
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
        customChecks: Prisma.JsonValue;
    }>;
    /** Benutzer zu einer Discord-ID (vorhandene Verknüpfung oder neu, Anmeldung später über Discord). */
    userForDiscord(tx: Prisma.TransactionClient, discordId: string, name: string): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        passwordHash: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        robloxVerifiedById: string | null;
        active: boolean;
        failedLogins: number;
        lockedUntil: Date | null;
        lastLogin: Date | null;
        totpSecret: string | null;
        totpPending: string | null;
        totpEnabledAt: Date | null;
        totpLastStep: number | null;
        totpRecovery: string[];
        updatedAt: Date;
        version: number;
    }>;
    update(actor: Actor, id: string, d: {
        department?: string | null;
        office?: string | null;
        status?: string;
        joinDate?: string;
        callsign?: string | null;
        rank?: string | null;
        rankSince?: string;
    }): Promise<{
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
        customChecks: Prisma.JsonValue;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    private needFor;
    addRecord(actor: Actor, id: string, d: {
        type: RecordType;
        summary: string;
        details?: string;
        category?: string;
        severity?: string;
        expiresAt?: string | null;
        awardId?: string;
        attachments?: string[];
    }): Promise<{
        data: Prisma.JsonValue | null;
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
    editRecord(actor: Actor, recordId: string, d: {
        summary?: string;
        details?: string | null;
        status?: 'ACTIVE' | 'REVOKED';
        expiresAt?: string | null;
        category?: string;
    }): Promise<{
        data: Prisma.JsonValue | null;
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
    deleteRecord(actor: Actor, recordId: string, reason?: string): Promise<void>;
    /** Frei definierte Voraussetzung abhaken (promotion.manage_requirements). */
    setCheck(actor: Actor, id: string, reqId: string, value: boolean): Promise<{
        [x: string]: boolean;
    }>;
}
