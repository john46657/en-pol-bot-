import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { ForecastService } from './forecast.service';
declare const q: z.ZodObject<{
    weeks: z.ZodDefault<z.ZodNumber>;
    minStaff: z.ZodDefault<z.ZodNumber>;
    department: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    weeks: number;
    minStaff: number;
    department?: string | undefined;
}, {
    department?: string | undefined;
    weeks?: number | undefined;
    minStaff?: number | undefined;
}>;
export declare class ForecastController {
    private readonly s;
    constructor(s: ForecastService);
    get(a: Actor, query: z.infer<typeof q>): Promise<{
        generatedAt: string;
        estimateNotice: string;
        basis: {
            from: string;
            to: string;
            weeks: number;
            timezone: string;
            dutySessions: number;
            incidents: number;
            reports: number;
            personnel: number;
            missing: string[];
        };
        confidence: {
            duty: {
                label: string;
                level: import("@enrp/shared").Confidence;
                reason: string;
            };
            incidents: {
                label: string;
                level: import("@enrp/shared").Confidence;
                reason: string;
            };
        };
        weekly: {
            week: string;
            dutyHours: number;
            officers: number;
            incidents: number;
            reports: number;
            incompleteReports: number;
        }[];
        heatmap: (number | null)[][];
        demandHeatmap: (number | null)[][];
        byDepartment: {
            department: string;
            hours: number[];
            total: number;
            officers: number;
        }[];
        lowStaffing: {
            weekday: number;
            day: string;
            from: number;
            to: number;
            avg: number;
        }[];
        hotspots: {
            weekday: number;
            hour: number;
            staff: number | null;
            incidents: number;
        }[];
        estimates: {
            nextWeeksIncidents: {
                value: number;
                low: number;
                high: number;
            }[] | null;
            nextWeeksDutyHours: {
                value: number;
                low: number;
                high: number;
            }[] | null;
            incidentsPerDutyHour: number | null;
            neededDutyHoursNextWeek: number | null;
        };
        anomalies: {
            incidents: {
                label: string;
                value: number;
                expected: number;
                direction: "up" | "down";
            }[];
            dutyHours: {
                label: string;
                value: number;
                expected: number;
                direction: "up" | "down";
            }[];
            incompleteReports: {
                label: string;
                value: number;
                expected: number;
                direction: "up" | "down";
            }[];
        };
        openTraining: {
            trainingsOpen: number;
            examsToGrade: number;
            upcomingSessions: number;
        };
        suggestions: string[];
        departments: string[];
    }>;
}
export {};
