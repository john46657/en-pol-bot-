import { DispatchStatus, UnitStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
export declare class DispatchService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly rt;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, rt: RealtimeService, discord: DiscordService);
    listUnits(): import("@prisma/client").Prisma.PrismaPromise<({
        members: {
            userId: string;
            unitId: string;
        }[];
    } & {
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    })[]>;
    createUnit(actor: Actor, d: {
        callsign: string;
        vehicle?: string;
        notes?: string;
        memberIds?: string[];
    }): Promise<{
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    setUnitStatus(actor: Actor, id: string, status: UnitStatus): Promise<{
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    /** Besetzung einer Einheit (Supervisor/Leitstelle). Nur aktive Benutzer; ersetzt die bisherige Besetzung vollständig. */
    setUnitMembers(actor: Actor, id: string, userIds: string[]): Promise<{
        members: {
            userId: string;
            unitId: string;
        }[];
    } & {
        vehicle: string | null;
        id: string;
        updatedAt: Date;
        status: string;
        callsign: string;
        notes: string | null;
    }>;
    list(p: PageQuery, status?: string, activeOnly?: boolean): Promise<{
        items: ({
            units: ({
                unit: {
                    callsign: string;
                };
            } & {
                unitId: string;
                incidentId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            status: string;
            title: string;
            serverId: string | null;
            location: string | null;
            source: string;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        incident: {
            units: ({
                unit: {
                    vehicle: string | null;
                    id: string;
                    updatedAt: Date;
                    status: string;
                    callsign: string;
                    notes: string | null;
                };
            } & {
                unitId: string;
                incidentId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            status: string;
            title: string;
            serverId: string | null;
            location: string | null;
            source: string;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
        };
        links: {
            role: string;
            id: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
        }[];
        timeline: {
            id: string;
            action: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            summary: string;
            actorId: string | null;
        }[];
    }>;
    create(actor: Actor, d: {
        title: string;
        description?: string;
        priority?: string;
        location?: string;
        personIds?: string[];
        vehicleIds?: string[];
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        serverId: string | null;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    attach(tx: Tx, incidentId: string, personIds: string[] | undefined, vehicleIds: string[] | undefined, actor: Actor): Promise<void>;
    attachRecords(actor: Actor, id: string, d: {
        personIds?: string[];
        vehicleIds?: string[];
    }): Promise<void>;
    update(actor: Actor, id: string, version: number, d: {
        title?: string;
        description?: string;
        priority?: string;
        location?: string;
        supervisorId?: string | null;
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        serverId: string | null;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    setStatus(actor: Actor, id: string, to: DispatchStatus, note?: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        serverId: string | null;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
    assignUnit(actor: Actor, id: string, unitId: string): Promise<{
        units: {
            unitId: string;
            incidentId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        }[];
    } & {
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        serverId: string | null;
        location: string | null;
        source: string;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
    }>;
}
