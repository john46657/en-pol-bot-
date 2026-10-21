import type { Actor } from '../audit/audit.service';
import { SituationService } from './situation.service';
export declare class SituationController {
    private readonly s;
    constructor(s: SituationService);
    overview(a: Actor): Promise<{
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
    reports(): Promise<{
        createdBy: string;
        number: string;
        id: string;
        createdById: string;
        createdAt: Date;
        note: string | null;
    }[]>;
    report(id: string): Promise<{
        createdBy: string;
        number: string;
        serverId: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        note: string | null;
        data: import("@prisma/client/runtime/library").JsonValue;
        text: string;
    }>;
    create(a: Actor, b: {
        note?: string | null;
    }): Promise<{
        id: string;
        number: string;
        createdAt: Date;
        text: string;
    }>;
}
