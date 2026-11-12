import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { QualityService } from '../quality/quality.service';
/**
 * Personalbedarfs- und Aktivitätsprognose für Führungskräfte. Rechnet ausschließlich mit gespeicherten Daten (Dienstzeiten,
 * Personalakten, Einsatzstatistik, Ausbildung/Prüfungen, Berichte) und kennzeichnet jede Prognose als Schätzung mit Datenbasis,
 * Zeitraum und Aussagekraft. Löst nie etwas aus (keine Sanktionen, Herabstufungen oder Beförderungen).
 */
export declare class ForecastService {
    private readonly prisma;
    private readonly audit;
    private readonly quality;
    constructor(prisma: PrismaService, audit: AuditService, quality: QualityService);
    forecast(actor: Actor, q: {
        weeks: number;
        minStaff: number;
        department?: string;
    }, now?: Date): Promise<{
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
