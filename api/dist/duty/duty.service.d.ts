import { DutyStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
export declare class DutyService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService);
    setStatus(actor: Actor, status: DutyStatus, d: {
        unitId?: string;
        callsign?: string;
    }, targetUserId?: string): Promise<{
        id: string;
        userId: string;
        status: string;
        callsign: string | null;
        unitId: string | null;
        startedAt: Date;
        endedAt: Date | null;
    } | {
        status: string;
    }>;
    team(): import("@prisma/client").Prisma.PrismaPromise<({
        user: {
            personnel: {
                callsign: string | null;
                rank: string | null;
            } | null;
            id: string;
            displayName: string;
        };
    } & {
        id: string;
        userId: string;
        status: string;
        callsign: string | null;
        unitId: string | null;
        startedAt: Date;
        endedAt: Date | null;
    })[]>;
    mine(userId: string): import("@prisma/client").Prisma.Prisma__DutySessionClient<{
        id: string;
        userId: string;
        status: string;
        callsign: string | null;
        unitId: string | null;
        startedAt: Date;
        endedAt: Date | null;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
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
            priority: string;
            title: string;
        } | null;
    }[]>;
}
