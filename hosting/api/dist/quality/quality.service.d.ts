import { ModuleRef } from '@nestjs/core';
import { type QualityConfig, type QualityFinding, type QualityTarget } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
export interface QualityResult {
    target: QualityTarget;
    id: string;
    number: string | null;
    title: string;
    checkedAt: string;
    errors: QualityFinding[];
    warnings: QualityFinding[];
    excepted: (QualityFinding & {
        exception: {
            id: string;
            reason: string;
            createdAt: Date;
            createdByName: string;
        };
    })[];
    ok: boolean;
}
/**
 * Qualitätsprüfer: lädt Berichte, Fahndungen und Einsätze, wendet die Regeln aus `@enrp/shared` an und verbindet das Ergebnis mit
 * dokumentierten Ausnahmen. Ändert nie einen Datensatz – Befunde sind Hinweise für Menschen. Optional (Einstellung) wird vor dem
 * Einreichen eines Berichts bzw. dem Abschluss eines Einsatzes geprüft.
 */
export declare class QualityService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly moduleRef;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, moduleRef: ModuleRef);
    config(): Promise<QualityConfig>;
    saveConfig(actor: Actor, c: QualityConfig): Promise<{
        enforceReportSubmit: boolean;
        enforceIncidentClose: boolean;
        reportMinLength: number;
        reportTypesRequiringIncident: string[];
        wantedMinDescription: number;
        incidentReportRequired: "ERROR" | "WARNING" | "OFF";
        staleDraftHours: number;
        staleIncidentHours: number;
    }>;
    private cad;
    private exceptionsFor;
    private result;
    private reportFindings;
    private wantedFindings;
    private incidentFindings;
    /** Einen Datensatz prüfen. Sichtbarkeit: Berichte nur mit Leserecht auf den Bericht (wie im Berichtsmodul). */
    check(actor: Actor, target: QualityTarget, id: string): Promise<QualityResult>;
    private reportVisible;
    /** Übersicht: offene Berichte, aktive Fahndungen, Einsätze (offen und noch vorhandene abgeschlossene) mit Befunden. */
    overview(actor: Actor): Promise<{
        checkedAt: string;
        config: {
            enforceReportSubmit: boolean;
            enforceIncidentClose: boolean;
            reportMinLength: number;
            reportTypesRequiringIncident: string[];
            wantedMinDescription: number;
            incidentReportRequired: "ERROR" | "WARNING" | "OFF";
            staleDraftHours: number;
            staleIncidentHours: number;
        };
        summary: {
            REPORT: {
                checked: number;
                withErrors: number;
                withWarnings: number;
            };
            WANTED: {
                checked: number;
                withErrors: number;
                withWarnings: number;
            };
            INCIDENT: {
                checked: number;
                withErrors: number;
                withWarnings: number;
            };
        };
        items: QualityResult[];
    }>;
    /** Begründete Ausnahme dokumentieren – nur für einen tatsächlich bestehenden Befund dieses Datensatzes. */
    addException(actor: Actor, d: {
        targetType: QualityTarget;
        targetId: string;
        code: string;
        reason: string;
    }): Promise<{
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        reason: string;
        code: string;
        targetType: string;
        targetId: string;
        revokedById: string | null;
        revokedAt: Date | null;
    }>;
    revokeException(actor: Actor, id: string, reason: string): Promise<void>;
    /** Vor dem Einreichen eines Berichts (falls eingestellt): offene Fehler → abgelehnt, mit den Befunden in den Details. */
    assertReportSubmittable(actor: Actor, reportId: string): Promise<void>;
    /** Vor dem Abschluss eines Einsatzes (falls eingestellt). */
    assertIncidentClosable(incidentId: string): Promise<void>;
    /** Für Lageassistent und Prognose: Berichte mit offenen Fehlern (ohne Ausnahme). */
    incompleteReports(ids: string[]): Promise<{
        errors: QualityFinding[];
        warnings: QualityFinding[];
        excepted: {
            exception: {
                id: string;
                code: string;
                reason: string;
                createdAt: Date;
                createdByName: string;
            };
            code: string;
            level: "ERROR" | "WARNING";
            field: string;
            message: string;
            hint: string;
        }[];
        ok: boolean;
        id: string;
        number: string;
        title: string;
        status: string;
        createdAt: Date;
    }[]>;
    incidentIssues(ids: string[]): Promise<{
        errors: QualityFinding[];
        warnings: QualityFinding[];
        excepted: {
            exception: {
                id: string;
                code: string;
                reason: string;
                createdAt: Date;
                createdByName: string;
            };
            code: string;
            level: "ERROR" | "WARNING";
            field: string;
            message: string;
            hint: string;
        }[];
        ok: boolean;
        id: string;
        number: string;
    }[]>;
}
