import { Prisma } from '@prisma/client';
import { type QualificationDefInput, type QualificationSource } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { HrCoreService } from './hr-core.service';
/**
 * Qualifikationsregister: Qualifikationen mit Person, Abschlussdatum, ausstellender Person, Status und Herkunft.
 * Vergabe nur durch berechtigte Personen (`qualification.grant`) oder durch eine bestätigte Leistung (bestandene Ausbildung,
 * bewertete Prüfung, abgeschlossene praktische Prüfung) – und auch dann standardmäßig erst nach Bestätigung (autoGrant aus).
 * `Personnel.qualifications` (Namen) wird mit den aktiven Qualifikationen mitgeführt, damit bestehende Anzeigen weiter stimmen.
 */
export declare class QualificationRegistryService {
    private readonly core;
    private readonly perms;
    private readonly notify;
    constructor(core: HrCoreService, perms: PermissionService, notify: NotifyService);
    private get prisma();
    definitions(all?: boolean): Prisma.PrismaPromise<({
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
    saveDefinition(actor: Actor, d: QualificationDefInput & {
        trainingIds?: string[];
        examIds?: string[];
    }, id?: string): Promise<{
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
    list(q: {
        personnelId?: string;
        definitionId?: string;
        status?: string;
        operational?: boolean;
        q?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
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
    private userNames;
    private view;
    /** Qualifikationen einer Person (Personalakte, MDT, Leitstelle). `operationalOnly`: nur einsatzrelevante, nur aktive. */
    ofPersonnel(personnelId: string, operationalOnly?: boolean): Promise<{
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
    /** Personalakte zum Benutzer (für /mine). */
    mine(userId: string): Promise<never[] | {
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
    private syncNames;
    /** Manuelle Vergabe (qualification.grant). Niemand vergibt sich selbst eine Qualifikation. */
    grant(actor: Actor, d: {
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
    /** Bestätigen (PENDING → ACTIVE), ruhen lassen, reaktivieren, entziehen – jeweils mit Grund, protokolliert. */
    setStatus(actor: Actor, id: string, d: {
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
    /**
     * Bestätigte Leistung (Ausbildung bestanden, Prüfung bestanden, praktische Prüfung bestanden) → Qualifikation.
     * Nur für Qualifikationen, die mit dieser Leistung verknüpft sind; ohne `autoGrant` als „Zur Bestätigung“ (PENDING).
     */
    fromAchievement(source: Exclude<QualificationSource, 'MANUAL' | 'LEGACY'>, ref: {
        trainingId?: string | null;
        examId?: string | null;
        definitionId?: string | null;
    }, personnelId: string, sourceId: string, examinerId: string | null): Promise<string[]>;
    /** Person: Dashboard-Benachrichtigung + DM (neutraler Text, keine vertraulichen Inhalte). */
    private announce;
}
