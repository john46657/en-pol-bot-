import { DispatchStatus, UnitStatus } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
import { LocksService } from '../locks/locks.service';
export declare class DispatchService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly rt;
    private readonly discord;
    private readonly locks;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, rt: RealtimeService, discord: DiscordService, locks: LocksService);
    listUnits(): import("@prisma/client").Prisma.PrismaPromise<({
        members: {
            userId: string;
            unitId: string;
        }[];
    } & {
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        icon: string | null;
        color: string | null;
        notes: string | null;
        guildId: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    })[]>;
    createUnit(actor: Actor, d: {
        callsign: string;
        vehicle?: string;
        notes?: string;
        memberIds?: string[];
    }): Promise<{
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        icon: string | null;
        color: string | null;
        notes: string | null;
        guildId: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }>;
    setUnitStatus(actor: Actor, id: string, status: UnitStatus): Promise<{
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        icon: string | null;
        color: string | null;
        notes: string | null;
        guildId: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
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
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        icon: string | null;
        color: string | null;
        notes: string | null;
        guildId: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }>;
    list(p: PageQuery, status?: string, activeOnly?: boolean): Promise<{
        items: ({
            units: ({
                unit: {
                    callsign: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            serverId: string | null;
            id: string;
            type: string | null;
            title: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            internalNotes: string | null;
            priority: string;
            source: string;
            location: string | null;
            guildId: string | null;
            mapX: number | null;
            mapZ: number | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            restrictRoleIds: string[];
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
                    type: string | null;
                    status: string;
                    updatedAt: Date;
                    callsign: string;
                    name: string | null;
                    icon: string | null;
                    color: string | null;
                    notes: string | null;
                    guildId: string | null;
                    discordRoleId: string | null;
                    erlcTeam: string | null;
                    operational: boolean;
                    mapX: number | null;
                    mapZ: number | null;
                    statusRoleIds: string[];
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
        } & {
            number: string;
            serverId: string | null;
            id: string;
            type: string | null;
            title: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            internalNotes: string | null;
            priority: string;
            source: string;
            location: string | null;
            guildId: string | null;
            mapX: number | null;
            mapZ: number | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            restrictRoleIds: string[];
        };
        links: {
            role: string;
            id: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
            entityType: string;
            entityId: string;
        }[];
        timeline: {
            id: string;
            createdAt: Date;
            action: string;
            actorId: string | null;
            summary: string;
            entityType: string;
            entityId: string;
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
        serverId: string | null;
        id: string;
        type: string | null;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        internalNotes: string | null;
        priority: string;
        source: string;
        location: string | null;
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
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
        serverId: string | null;
        id: string;
        type: string | null;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        internalNotes: string | null;
        priority: string;
        source: string;
        location: string | null;
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    setStatus(actor: Actor, id: string, to: DispatchStatus, note?: string): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        type: string | null;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        internalNotes: string | null;
        priority: string;
        source: string;
        location: string | null;
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    assignUnit(actor: Actor, id: string, unitId: string): Promise<{
        units: {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        }[];
    } & {
        number: string;
        serverId: string | null;
        id: string;
        type: string | null;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        internalNotes: string | null;
        priority: string;
        source: string;
        location: string | null;
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
}
