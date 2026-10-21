import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { CadService } from '../cad/cad.service';
import { CadConfigService } from '../cad/cad-config.service';
import { QualityService } from '../quality/quality.service';
/**
 * Automatischer Lageassistent: fasst ausschließlich vorhandene Daten zusammen (CAD, Dienst, Fahndungen, Berichte, ER:LC-Notrufe,
 * Störungen, offene Führungsaufgaben). Jeder Abschnitt nennt Quelle und Datenstand. Es wird nichts geschätzt oder ergänzt.
 */
export declare class SituationService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly cad;
    private readonly cadCfg;
    private readonly quality;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, cad: CadService, cadCfg: CadConfigService, quality: QualityService);
    overview(actor: Actor): Promise<{
        generatedAt: string;
        incidents: {
            asOf: string;
            source: string;
            total: number;
            byPriority: Record<string, number>;
            byStatus: Record<string, number>;
            unassigned: number;
            items: {
                errors: import("@enrp/shared").QualityFinding[];
                warnings: import("@enrp/shared").QualityFinding[];
                id: string;
                number: string;
                title: string;
                priority: string;
                priorityLabel: string;
                status: string;
                statusLabel: string;
                type: string | null;
                location: string | null;
                units: string[];
                ageMinutes: number;
                updatedAt: Date;
                hasPosition: boolean;
            }[];
        };
        units: {
            asOf: string;
            source: string;
            total: number;
            byStatus: Record<string, number>;
            assigned: {
                id: string;
                callsign: string;
                status: string;
                statusLabel: string;
                type: string | null;
                current: {
                    id: string;
                    number: string;
                } | null;
                crew: string[];
            }[];
            unassigned: {
                id: string;
                callsign: string;
                status: string;
                statusLabel: string;
                type: string | null;
                current: {
                    id: string;
                    number: string;
                } | null;
                crew: string[];
            }[];
        };
        officers: {
            asOf: string;
            source: string;
            onDuty: number;
            byStatus: Record<string, number>;
            available: number;
            items: {
                userId: string;
                name: string;
                status: string;
                statusLabel: string;
                rank: string | null;
                department: string | null;
                callsign: string | null;
                unit: string | null;
                sinceMinutes: number;
            }[];
        };
        wanted: {
            asOf: string;
            source: string;
            total: number;
            byPriority: Record<string, number>;
            hitsToReview: number;
            expiringSoon: {
                id: string;
                number: string | null;
                reason: string;
                expiresAt: Date | null;
            }[];
            newest: {
                id: string;
                number: string | null;
                reason: string;
                priority: string;
                createdAt: Date;
            }[];
        };
        reports: {
            asOf: string;
            source: string;
            visibleAll: boolean;
            byStatus: Record<string, number>;
            incomplete: {
                id: string;
                number: string;
                title: string;
                status: string;
                errors: string[];
            }[];
        };
        calls: {
            asOf: string;
            source: string;
            enabled: boolean;
            servers: {
                id: string;
                name: string;
                status: string;
                lastSyncAt: Date | null;
                emergencyCalls: boolean;
                lastError: string | null;
            }[];
            open: number;
            withoutIncident: number;
            withoutPosition: number;
            items: {
                id: string;
                callNumber: number;
                description: string | null;
                location: string | null;
                startedAt: Date;
                incident: string | null;
                hasPosition: boolean;
            }[];
        } | null;
        disruptions: {
            asOf: string;
            source: string;
            items: {
                count: number;
                message: string;
                id: string;
                source: string;
                acknowledgedAt: Date | null;
                sourceName: string | null;
                step: string | null;
                firstAt: Date;
                lastAt: Date;
                alertedAt: Date | null;
            }[];
        };
        tasks: {
            asOf: string;
            source: string;
            items: {
                key: string;
                label: string;
                count: number;
                href: string;
            }[];
        };
        critical: {
            kind: string;
            id: string;
            text: string;
        }[];
    }>;
    /** Lagebericht als lesbarer Text (nur vorhandene Daten). */
    render(o: Awaited<ReturnType<SituationService['overview']>>, note?: string | null): string;
    createReport(actor: Actor, note?: string | null): Promise<{
        id: string;
        number: string;
        createdAt: Date;
        text: string;
    }>;
    listReports(): Promise<{
        createdBy: string;
        number: string;
        id: string;
        createdById: string;
        createdAt: Date;
        note: string | null;
    }[]>;
    getReport(id: string): Promise<{
        createdBy: string;
        number: string;
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        note: string | null;
        data: Prisma.JsonValue;
        text: string;
    }>;
}
