import { z } from 'zod';
import { type QualityConfig, type QualityTarget } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { QualityService } from './quality.service';
declare const exceptionBody: z.ZodObject<{
    targetType: z.ZodEnum<["REPORT", "WANTED", "INCIDENT"]>;
    targetId: z.ZodString;
    code: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    code: string;
    targetType: "INCIDENT" | "REPORT" | "WANTED";
    targetId: string;
}, {
    reason: string;
    code: string;
    targetType: "INCIDENT" | "REPORT" | "WANTED";
    targetId: string;
}>;
export declare class QualityController {
    private readonly s;
    constructor(s: QualityService);
    config(): Promise<{
        enforceReportSubmit: boolean;
        enforceIncidentClose: boolean;
        reportMinLength: number;
        reportTypesRequiringIncident: string[];
        wantedMinDescription: number;
        incidentReportRequired: "ERROR" | "WARNING" | "OFF";
        staleDraftHours: number;
        staleIncidentHours: number;
    }>;
    saveConfig(a: Actor, b: QualityConfig): Promise<{
        enforceReportSubmit: boolean;
        enforceIncidentClose: boolean;
        reportMinLength: number;
        reportTypesRequiringIncident: string[];
        wantedMinDescription: number;
        incidentReportRequired: "ERROR" | "WARNING" | "OFF";
        staleDraftHours: number;
        staleIncidentHours: number;
    }>;
    overview(a: Actor): Promise<{
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
        items: import("./quality.service").QualityResult[];
    }>;
    check(a: Actor, t: QualityTarget, id: string): Promise<import("./quality.service").QualityResult>;
    addException(a: Actor, b: z.infer<typeof exceptionBody>): Promise<{
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
    revoke(a: Actor, id: string, b: {
        reason: string;
    }): Promise<void>;
}
export {};
