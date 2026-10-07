import { Prisma } from '@prisma/client';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
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
/**
 * Beförderungs- und Versetzungsanträge: Antrag → Prüfung → Genehmigungsstufen → Durchführung
 * (Rang/Abteilung, Discord-/Dashboard-Rollen, Personalakte, Historie, Audit, Benachrichtigung).
 */
export declare class HrRequestsService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
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
        approvals: Prisma.JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Welche Stufe als Nächstes genehmigt (null = alle durch). */
    private nextStage;
    /** Darf der Benutzer in der aktuellen Stufe genehmigen? Stufen-Rollen und „Genehmiger-Ränge“ des Zielrangs werden geprüft. */
    private mayApprove;
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
        approvals: Prisma.JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    edit(actor: Actor, id: string, d: {
        reason?: string;
        achievements?: string | null;
        internalNote?: string | null;
        attachments?: string[];
        version?: number;
    }): Promise<{
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
        approvals: Prisma.JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Entscheidung: genehmigen (Stufe), ablehnen, in Prüfung nehmen, zurückstellen, abbrechen. */
    decide(actor: Actor, id: string, decision: 'APPROVE' | 'REJECT' | 'REVIEW' | 'DEFER' | 'CANCEL', comment?: string): Promise<{
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
        approvals: Prisma.JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
    /** Durchführung: Rang/Abteilung setzen, Rollen tauschen, Personalakte + Historie, Ankündigung, Benachrichtigung. */
    execute(actor: Actor, id: string, auto?: boolean): Promise<{
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
        approvals: Prisma.JsonValue;
        executedById: string | null;
        executedAt: Date | null;
    }>;
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
