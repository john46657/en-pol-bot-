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
        name: string | null;
        updatedAt: Date;
        guildId: string | null;
        type: string | null;
        color: string | null;
        icon: string | null;
        status: string;
        callsign: string;
        mapX: number | null;
        mapZ: number | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
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
        name: string | null;
        updatedAt: Date;
        guildId: string | null;
        type: string | null;
        color: string | null;
        icon: string | null;
        status: string;
        callsign: string;
        mapX: number | null;
        mapZ: number | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        statusRoleIds: string[];
    }>;
    setUnitStatus(actor: Actor, id: string, status: UnitStatus): Promise<{
        vehicle: string | null;
        id: string;
        name: string | null;
        updatedAt: Date;
        guildId: string | null;
        type: string | null;
        color: string | null;
        icon: string | null;
        status: string;
        callsign: string;
        mapX: number | null;
        mapZ: number | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
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
        name: string | null;
        updatedAt: Date;
        guildId: string | null;
        type: string | null;
        color: string | null;
        icon: string | null;
        status: string;
        callsign: string;
        mapX: number | null;
        mapZ: number | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            guildId: string | null;
            type: string | null;
            description: string | null;
            priority: string;
            status: string;
            title: string;
            mapX: number | null;
            mapZ: number | null;
            source: string;
            serverId: string | null;
            location: string | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            internalNotes: string | null;
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
                    name: string | null;
                    updatedAt: Date;
                    guildId: string | null;
                    type: string | null;
                    color: string | null;
                    icon: string | null;
                    status: string;
                    callsign: string;
                    mapX: number | null;
                    mapZ: number | null;
                    notes: string | null;
                    discordRoleId: string | null;
                    erlcTeam: string | null;
                    operational: boolean;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            guildId: string | null;
            type: string | null;
            description: string | null;
            priority: string;
            status: string;
            title: string;
            mapX: number | null;
            mapZ: number | null;
            source: string;
            serverId: string | null;
            location: string | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            internalNotes: string | null;
            restrictRoleIds: string[];
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
        guildId: string | null;
        type: string | null;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        mapX: number | null;
        mapZ: number | null;
        source: string;
        serverId: string | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        internalNotes: string | null;
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        type: string | null;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        mapX: number | null;
        mapZ: number | null;
        source: string;
        serverId: string | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        internalNotes: string | null;
        restrictRoleIds: string[];
    }>;
    setStatus(actor: Actor, id: string, to: DispatchStatus, note?: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        type: string | null;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        mapX: number | null;
        mapZ: number | null;
        source: string;
        serverId: string | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        internalNotes: string | null;
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        type: string | null;
        description: string | null;
        priority: string;
        status: string;
        title: string;
        mapX: number | null;
        mapZ: number | null;
        source: string;
        serverId: string | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        internalNotes: string | null;
        restrictRoleIds: string[];
    }>;
}
