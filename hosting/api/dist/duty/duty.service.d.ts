import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { ShiftsService } from './shifts';
/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
export declare class DutyService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly discord;
    private readonly shifts;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService, discord: DiscordService, shifts: ShiftsService);
    setStatus(actor: Actor, status: DutyStatus, d: {
        unitId?: string;
        callsign?: string;
        shiftType?: string;
    }, targetUserId?: string): Promise<{
        id: string;
        userId: string;
        status: string;
        endedAt: Date | null;
        callsign: string | null;
        startedAt: Date;
        unitId: string | null;
        shiftType: string | null;
    } | {
        status: string;
    }>;
    /**
     * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
     * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
     */
    private notifyDiscord;
    team(): import("@prisma/client").Prisma.PrismaPromise<({
        user: {
            personnel: {
                rank: string | null;
                callsign: string | null;
            } | null;
            id: string;
            displayName: string;
        };
    } & {
        id: string;
        userId: string;
        status: string;
        endedAt: Date | null;
        callsign: string | null;
        startedAt: Date;
        unitId: string | null;
        shiftType: string | null;
    })[]>;
    mine(userId: string): import("@prisma/client").Prisma.Prisma__DutySessionClient<{
        id: string;
        userId: string;
        status: string;
        endedAt: Date | null;
        callsign: string | null;
        startedAt: Date;
        unitId: string | null;
        shiftType: string | null;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    /**
     * Dienststunden der letzten `days` Tage, pro Benutzer und Status (in Minuten).
     * Sitzungen, die vor dem Zeitraum begonnen haben oder noch laufen, zählen nur mit dem Anteil im Zeitraum.
     */
    hours(days: number, userId?: string): Promise<{
        days: number;
        since: Date;
        users: {
            minutes: number;
            byStatus: {
                [k: string]: number;
            };
        }[];
    }>;
    /**
     * Schicht-Logs: zusammenhängende Dienst-Sitzungen (Im Dienst ↔ Pause ↔ Schichtwechsel) bis „Außer Dienst“ ergeben eine Schicht.
     * Je Schicht: wer, Schichtart, Beginn/Ende, Dauer, Pausen und wer sie gestartet/beendet hat (aus dem Audit-Log).
     */
    shiftLog(f: {
        days: number;
        userId?: string;
        shiftType?: string;
    }): Promise<{
        days: number;
        since: Date;
        items: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            shiftType: string | null;
            shiftTypeNames: string[];
            startedAt: Date;
            endedAt: Date | null;
            active: boolean;
            status: string;
            minutes: number;
            breakMinutes: number;
            breaks: number;
            startedBy: string | null;
            endedBy: string | null;
        }[];
    }>;
    /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
    overview(): Promise<{
        userId: string;
        personnelId: string;
        name: string;
        rank: string | null;
        callsign: string | null;
        team: string | null;
        dutyStatus: string;
        onDutySince: Date | null;
        shiftType: string | null;
        lastStatusChange: Date | null;
        unit: {
            id: string;
            callsign: string;
            status: string;
        } | null;
        currentIncident: {
            number: string;
            id: string;
            priority: string;
            status: string;
            title: string;
        } | null;
    }[]>;
}
