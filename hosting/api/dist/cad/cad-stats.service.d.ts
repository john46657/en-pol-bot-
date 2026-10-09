import { PrismaService } from '../prisma/prisma.service';
import { CadConfigService } from './cad-config.service';
/**
 * Leitstellenstatistik – ausschließlich aus gespeicherten Daten:
 * abgeschlossene Einsätze aus `CadIncidentStat` (bleibt nach dem Löschen der Einsätze erhalten), offene aus `Incident`,
 * Dienstzeiten aus den intern erfassten Dienstsitzungen (`DutySession`) – nicht aus ER:LC-Onlinezeiten.
 */
export declare class CadStatsService {
    private readonly prisma;
    private readonly cfg;
    constructor(prisma: PrismaService, cfg: CadConfigService);
    stats(days: number): Promise<{
        days: number;
        since: string;
        generatedAt: string;
        totals: {
            created: number;
            closed: number;
            openNow: number;
            avgHandlingMin: number | null;
            medianHandlingMin: number | null;
        };
        byDay: {
            key: string;
            value: number;
        }[];
        byWeek: {
            key: string;
            value: number;
        }[];
        byMonth: {
            key: string;
            value: number;
        }[];
        byType: {
            key: string;
            label: string;
            value: number;
        }[];
        byPriority: {
            key: string;
            label: string;
            color: string | null;
            value: number;
        }[];
        byClosedStatus: {
            key: string;
            label: string;
            value: number;
        }[];
        bySource: {
            key: string;
            label: string;
            value: number;
        }[];
        units: {
            key: string;
            label: string;
            value: number;
        }[];
        unitTypes: {
            key: string;
            label: string;
            value: number;
        }[];
        duty: {
            totalHours: number;
            officers: number;
            sessions: number;
            top: {
                userId: string;
                name: string;
                hours: number;
            }[];
        };
    }>;
}
