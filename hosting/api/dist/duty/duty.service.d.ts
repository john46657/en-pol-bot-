import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { ShiftsService } from './shifts';
/** Schicht-ID wie bei Trident: Discord-Snowflake aus dem Beginn der Schicht (Zeitstempel + Zufall), als Text. */
export declare const newShiftId: (at: Date) => string;
/** Eckdaten einer Schicht für das Shift-Log: ID, Beginn, Zeit im Dienst und in der Pause (Sekunden). */
export interface ShiftSummary {
    shiftId: string;
    startedAt: Date;
    workSeconds: number;
    breakSeconds: number;
}
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
        discordRoleIds?: string[];
    }, targetUserId?: string): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        shiftId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | {
        status: string;
    }>;
    /**
     * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
     * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
     */
    private notifyDiscord;
    private touched;
    /** Aktivität merken (höchstens einmal pro Minute in die Datenbank). Nur laufende Schichten „Im Dienst“. */
    touch(userId: string, force?: boolean): Promise<void>;
    /** „Bin noch im Dienst“ / Herzschlag aus dem Dashboard. */
    active(userId: string): Promise<{
        onDuty: boolean;
        status: string;
    }>;
    /**
     * Jede Minute: Wer „Im Dienst“ ist und seit `afterMinutes` nichts gemacht hat, bekommt eine Erinnerung (Discord-DM mit Buttons + Glocke im Dashboard).
     * Mit `autoOffMinutes` endet die Schicht automatisch, wenn danach weiter nichts passiert. Pause/Training/Verwaltung sind ausgenommen.
     */
    remindTick(now?: Date): Promise<{
        reminded: number;
        ended: number;
    }>;
    team(): import("@prisma/client").Prisma.PrismaPromise<({
        user: {
            personnel: {
                callsign: string | null;
                rank: string | null;
            }[];
            id: string;
            displayName: string;
        };
    } & {
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        shiftId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    })[]>;
    mine(userId: string): import("@prisma/client").Prisma.Prisma__DutySessionClient<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        shiftId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    /**
     * Dienststunden der letzten `days` Tage, pro Benutzer und Status (in Minuten).
     * Sitzungen, die vor dem Zeitraum begonnen haben oder noch laufen, zählen nur mit dem Anteil im Zeitraum.
     */
    hours(days: number, userId?: string): Promise<{
        days: number;
        since: Date;
        users: {
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            minutes: number;
            byStatus: Record<string, number>;
            sessions: number;
        }[];
    }>;
    /**
     * Gesamtwerte aller Schichten eines Benutzers (Discord: `/shift manage`, `/shift admin`): Anzahl und Zeit im Dienst ohne Pausen,
     * dazu die letzte Schicht (Status, Zeit, Schichtart, ID).
     */
    shiftStats(userId: string): Promise<{
        count: number;
        minutes: number;
        seconds: number;
        last: {
            shiftId: string | null;
            status: string;
            seconds: number;
            shiftType: string | null;
        } | null;
    }>;
    /** Sitzungen einer Schicht (im Bereich des Servers). */
    private shiftParts;
    private static workMs;
    /**
     * Schichtleitung (`/shift admin` → Modify Shift): Zeit im Dienst einer Schicht ändern. Mehr Zeit → Beginn der Schicht früher;
     * weniger Zeit → Dienst-Sitzungen von hinten kürzen (Ende früher, bei laufender Sitzung Beginn später). Pausen bleiben, wie sie sind.
     */
    modifyShift(actor: Actor, shiftId: string, action: 'add' | 'remove' | 'set', seconds: number): Promise<{
        shiftId: string;
        userId: string;
        seconds: number;
    }>;
    /** Schichtleitung: eine beendete Schicht löschen (laufende erst beenden). */
    deleteShift(actor: Actor, shiftId: string): Promise<{
        shiftId: string;
        deleted: boolean;
    }>;
    /** Schichtleitung (Clear User Shifts): alle beendeten Schichten eines Mitglieds löschen, optional nur eine Schichtart. Die laufende bleibt. */
    clearShifts(actor: Actor, userId: string, shiftType?: string): Promise<{
        deleted: number;
    }>;
    /** Discord-IDs verknüpfter Benutzer (für @Erwähnungen in Discord). */
    private discordIds;
    /**
     * Rangliste (Discord: `/shift leaderboard`, wie Trident): Zeit im Dienst ohne Pausen in Sekunden, Anzahl Schichten.
     * `days` = null → alle Zeiten; mit `shiftType` nur Sitzungen dieser Schichtart.
     */
    leaderboard(days: number | null, me: string, shiftType?: string): Promise<{
        days: number | null;
        shiftType: string | null;
        me: string;
        users: {
            userId: string;
            name: string;
            callsign: string | null;
            discordId: string | null;
            shifts: number;
            seconds: number;
            minutes: number;
        }[];
    }>;
    /** Laufende Schichten (Discord: `/shift active`): Beginn der Schicht, Zeit im Dienst ohne Pausen, Status, Schichtart. */
    activeShifts(): Promise<{
        userId: string;
        name: string;
        callsign: string | null;
        discordId: string | null;
        status: string;
        shiftId: string | null;
        shiftType: string | null;
        startedAt: Date;
        seconds: number;
    }[]>;
    /**
     * Schicht-Logs: zusammenhängende Dienst-Sitzungen (Im Dienst ↔ Pause ↔ Schichtwechsel) bis „Außer Dienst“ ergeben eine Schicht.
     * Je Schicht: wer, Schichtart, Beginn/Ende, Dauer, Pausen und wer sie gestartet/beendet hat (aus dem Audit-Log).
     */
    shiftLog(f: {
        days: number;
        userId?: string;
        shiftType?: string;
        discordId?: string;
    }): Promise<{
        days: number;
        since: Date;
        member: null;
        items: never[];
    } | {
        items: {
            id: string;
            shiftId: string | null;
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
            seconds: number;
            startedBy: string | null;
            endedBy: string | null;
        }[];
        member?: {
            userId: string;
            name: string;
        } | undefined;
        days: number;
        since: Date;
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
        lastActivityAt: Date | null;
        reminded: boolean;
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
            status: string;
            title: string;
            priority: string;
        } | null;
    }[]>;
}
