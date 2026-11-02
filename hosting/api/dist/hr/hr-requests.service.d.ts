import { Prisma } from '@prisma/client';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
import { NotifyService } from '../notifications/notify.service';
type Kind = 'PROMOTION' | 'TRANSFER';
export interface RequestFilter {
    kind?: Kind;
    status?: string;
    personnelId?: string;
    rank?: string;
    department?: string;
    requesterId?: string;
    approverId?: string;
    from?: string;
    to?: string;
    q?: string;
}
/** Rückfrage an den Antragsteller (Status „Rückfrage erforderlich“). */
export interface Query {
    id: string;
    askedById: string;
    askedByName: string;
    question: string;
    askedAt: string;
    answer: string | null;
    answeredAt: string | null;
}
export declare const HR_REQUEST_STATUS_LABEL: Record<string, string>;
/**
 * Beförderungs- und Versetzungsanträge: Antrag → Prüfung → Genehmigungsstufen → Durchführung
 * (Rang/Abteilung, Discord-/Dashboard-Rollen, Personalakte, Historie, Audit, Benachrichtigung).
 */
export declare class HrRequestsService {
    private readonly core;
    private readonly perms;
    private readonly notify;
    constructor(core: HrCoreService, perms: PermissionService, notify: NotifyService);
    private get prisma();
    private stagesOf;
    private needed;
    list(actor: Actor, f: RequestFilter): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }[]>;
    get(actor: Actor, id: string): Promise<{
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
            query: boolean;
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Welche Stufe als Nächstes genehmigt (null = alle durch). */
    private nextStage;
    /** Darf der Benutzer in der aktuellen Stufe genehmigen? Stufen-Rollen und „Genehmiger-Ränge“ des Zielrangs werden geprüft. */
    private mayApprove;
    /** Rückfragen stellen: wer prüfen oder entscheiden darf – nie beim eigenen Antrag. */
    private mayQuery;
    private abilities;
    create(actor: Actor, d: {
        kind: Kind;
        personnelId: string;
        to: string;
        reason: string;
        achievements?: string;
        internalNote?: string;
        attachments?: string[];
    }): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    private createUnchecked;
    edit(actor: Actor, id: string, d: {
        reason?: string;
        achievements?: string | null;
        internalNote?: string | null;
        attachments?: string[];
        version?: number;
    }): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Entscheidung: genehmigen (Stufe), ablehnen, in Prüfung nehmen, zurückstellen, abbrechen. */
    decide(actor: Actor, id: string, decision: 'APPROVE' | 'REJECT' | 'REVIEW' | 'DEFER' | 'CANCEL', comment?: string): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Durchführung: Rang/Abteilung setzen, Rollen tauschen, Personalakte + Historie, Ankündigung, Benachrichtigung. */
    execute(actor: Actor, id: string, auto?: boolean): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Eigene Personalakte (Server der Anfrage). */
    private ownPersonnel;
    /** Mögliche Ziele für einen eigenen Antrag: nächste Ränge mit Voraussetzungs-Prüfung, andere Abteilungen. */
    targets(actor: Actor): Promise<{
        personnelId: string;
        rank: string | null;
        department: string | null;
        canPromotion: boolean;
        canTransfer: boolean;
        ranks: {
            id: string;
            name: string;
            eligible: boolean;
            met: number;
            total: number;
            missing: string[];
        }[];
        departments: string[];
        requireRequirements: boolean;
    }>;
    /**
     * Antrag für sich selbst (Dashboard oder Discord). Beförderung nur mit erfüllten Voraussetzungen; ausgeführt wird
     * erst nach ausdrücklicher Genehmigung durch eine berechtigte Führungskraft (nie automatisch aus dem Antrag heraus).
     */
    createSelf(actor: Actor, d: {
        kind: Kind;
        to: string;
        reason: string;
        achievements?: string;
    }): Promise<{
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        internalNote: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Eigene Anträge (ohne interne Notizen und ohne Namen der Genehmiger-Kommentare zu verbergen – Kommentare sind Begründungen). */
    mine(actor: Actor): Promise<{
        id: string;
        number: string;
        kind: string;
        status: string;
        statusLabel: string;
        origin: string;
        reason: string;
        achievements: string | null;
        fromLabel: string | null;
        toLabel: string | null;
        createdAt: Date;
        decidedAt: Date | null;
        executedAt: Date | null;
        decisions: {
            decision: "REVIEW" | "APPROVE" | "REJECT" | "DEFER";
            comment: string | null;
            at: string;
            by: string;
        }[];
        queries: Query[];
        openQuery: Query | null;
        canWithdraw: boolean;
    }[]>;
    /** Rückfrage stellen → Status „Rückfrage erforderlich“; der Antragsteller wird benachrichtigt (DM nur mit Zustimmung). */
    query(actor: Actor, id: string, question: string): Promise<{
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
            query: boolean;
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
        queries: Prisma.JsonValue;
        reviewerId: string | null;
        origin: string;
        fromValue: string | null;
        toValue: string;
        achievements: string | null;
        attachments: string[];
        requesterId: string;
        approvals: Prisma.JsonValue;
        decidedAt: Date | null;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Antragsteller beantwortet die offene Rückfrage → zurück „In Prüfung“; wer gefragt hat, wird benachrichtigt. */
    answer(actor: Actor, id: string, answer: string): Promise<{
        id: string;
        number: string;
        kind: string;
        status: string;
        statusLabel: string;
        origin: string;
        reason: string;
        achievements: string | null;
        fromLabel: string | null;
        toLabel: string | null;
        createdAt: Date;
        decidedAt: Date | null;
        executedAt: Date | null;
        decisions: {
            decision: "REVIEW" | "APPROVE" | "REJECT" | "DEFER";
            comment: string | null;
            at: string;
            by: string;
        }[];
        queries: Query[];
        openQuery: Query | null;
        canWithdraw: boolean;
    } | undefined>;
    /** Antragsteller zieht den eigenen Antrag zurück. */
    withdraw(actor: Actor, id: string): Promise<{
        id: string;
        number: string;
        kind: string;
        status: string;
        statusLabel: string;
        origin: string;
        reason: string;
        achievements: string | null;
        fromLabel: string | null;
        toLabel: string | null;
        createdAt: Date;
        decidedAt: Date | null;
        executedAt: Date | null;
        decisions: {
            decision: "REVIEW" | "APPROVE" | "REJECT" | "DEFER";
            comment: string | null;
            at: string;
            by: string;
        }[];
        queries: Query[];
        openQuery: Query | null;
        canWithdraw: boolean;
    } | undefined>;
    /** Kennzahlen für die Übersicht „🎖️ Beförderungen“. */
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
}
export {};
