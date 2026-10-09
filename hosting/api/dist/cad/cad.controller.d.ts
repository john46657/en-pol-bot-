import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import type { AppRequest } from '../common/request-context';
import { PermissionService } from '../authz/permission.service';
import { MediaService } from '../media/media.service';
import { CadService, type CadActor } from './cad.service';
import { CadTabletService } from './cad-tablet.service';
import { CadHandoverService } from './cad-handover.service';
import { CadStatsService } from './cad-stats.service';
import { CadConfigService } from './cad-config.service';
import { ErlcService, erlcServerInput } from './erlc.service';
import { ErlcSyncService } from './erlc-sync.service';
declare const incidentBody: z.ZodObject<{
    title: z.ZodString;
    type: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    keyword: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    priority: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    involved: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    requiredUnits: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    internalNotes: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    mapX: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    mapZ: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    dispatcherId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    restrictRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    type?: any;
    status?: string | undefined;
    description?: any;
    internalNotes?: any;
    priority?: string | undefined;
    mapX?: any;
    mapZ?: any;
    location?: any;
    dispatcherId?: any;
    keyword?: any;
    involved?: any;
    requiredUnits?: any;
    restrictRoleIds?: string[] | undefined;
}, {
    title: string;
    type?: any;
    status?: string | undefined;
    description?: any;
    internalNotes?: any;
    priority?: string | undefined;
    mapX?: any;
    mapZ?: any;
    location?: any;
    dispatcherId?: any;
    keyword?: any;
    involved?: any;
    requiredUnits?: any;
    restrictRoleIds?: string[] | undefined;
}>;
declare const unitBody: z.ZodObject<{
    callsign: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    type: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    status: z.ZodOptional<z.ZodString>;
    discordRoleId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    erlcTeam: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    operational: z.ZodOptional<z.ZodBoolean>;
    vehicle: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    mapX: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    mapZ: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    statusRoleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    callsign: string;
    vehicle?: any;
    type?: any;
    status?: string | undefined;
    name?: any;
    color?: any;
    icon?: any;
    guildId?: any;
    notes?: any;
    discordRoleId?: any;
    erlcTeam?: any;
    operational?: boolean | undefined;
    mapX?: any;
    mapZ?: any;
    statusRoleIds?: string[] | undefined;
}, {
    callsign: string;
    vehicle?: any;
    type?: any;
    status?: string | undefined;
    name?: any;
    color?: any;
    icon?: any;
    guildId?: any;
    notes?: any;
    discordRoleId?: any;
    erlcTeam?: any;
    operational?: boolean | undefined;
    mapX?: any;
    mapZ?: any;
    statusRoleIds?: string[] | undefined;
}>;
declare const memberBody: z.ZodObject<{
    userId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    discordId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    discordName: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    robloxName: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    robloxId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    erlcName: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    team: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    unitId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    zelloName: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    callsign: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    department: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    rank: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    extra: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber]>>>>;
}, "strip", z.ZodTypeAny, {
    userId?: any;
    unitId?: any;
    callsign?: any;
    rank?: any;
    team?: any;
    discordId?: any;
    discordName?: any;
    robloxName?: any;
    robloxId?: any;
    erlcName?: any;
    zelloName?: any;
    department?: any;
    extra?: Record<string, string | number> | null | undefined;
}, {
    userId?: any;
    unitId?: any;
    callsign?: any;
    rank?: any;
    team?: any;
    discordId?: any;
    discordName?: any;
    robloxName?: any;
    robloxId?: any;
    erlcName?: any;
    zelloName?: any;
    department?: any;
    extra?: Record<string, string | number> | null | undefined;
}>;
declare const mapObjectBody: z.ZodObject<{
    kind: z.ZodEnum<["POI", "ZONE"]>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    layer: z.ZodString;
    icon: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    x: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    z: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    points: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, "many">>>;
    roleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    incidentType: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    autoAction: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    kind: "POI" | "ZONE";
    layer: string;
    category?: any;
    description?: any;
    color?: any;
    icon?: any;
    x?: any;
    z?: any;
    points?: [number, number][] | null | undefined;
    roleIds?: string[] | undefined;
    incidentType?: any;
    autoAction?: any;
}, {
    name: string;
    kind: "POI" | "ZONE";
    layer: string;
    category?: any;
    description?: any;
    color?: any;
    icon?: any;
    x?: any;
    z?: any;
    points?: [number, number][] | null | undefined;
    roleIds?: string[] | undefined;
    incidentType?: any;
    autoAction?: any;
}>;
declare const linkBody: z.ZodObject<{
    name: z.ZodString;
    sourceGuildId: z.ZodString;
    targetGuildId: z.ZodString;
    active: z.ZodOptional<z.ZodBoolean>;
    sendTypes: z.ZodOptional<z.ZodArray<z.ZodEnum<["incidents", "incident_status", "unit_requests", "calls", "announcements", "radio"]>, "many">>;
    allowActions: z.ZodOptional<z.ZodArray<z.ZodEnum<["status_report", "radio", "view_incidents", "dispatch"]>, "many">>;
    roleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    channels: z.ZodOptional<z.ZodRecord<z.ZodEnum<["incidents", "incident_status", "unit_requests", "calls", "announcements", "radio"]>, z.ZodArray<z.ZodString, "many">>>;
    notify: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sourceGuildId: string;
    targetGuildId: string;
    active?: boolean | undefined;
    roleIds?: string[] | undefined;
    sendTypes?: ("incidents" | "calls" | "announcements" | "radio" | "incident_status" | "unit_requests")[] | undefined;
    allowActions?: ("dispatch" | "radio" | "status_report" | "view_incidents")[] | undefined;
    channels?: Partial<Record<"incidents" | "calls" | "announcements" | "radio" | "incident_status" | "unit_requests", string[]>> | undefined;
    notify?: boolean | undefined;
}, {
    name: string;
    sourceGuildId: string;
    targetGuildId: string;
    active?: boolean | undefined;
    roleIds?: string[] | undefined;
    sendTypes?: ("incidents" | "calls" | "announcements" | "radio" | "incident_status" | "unit_requests")[] | undefined;
    allowActions?: ("dispatch" | "radio" | "status_report" | "view_incidents")[] | undefined;
    channels?: Partial<Record<"incidents" | "calls" | "announcements" | "radio" | "incident_status" | "unit_requests", string[]>> | undefined;
    notify?: boolean | undefined;
}>;
declare const listQ: z.ZodObject<{
    active: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    q: z.ZodOptional<z.ZodString>;
    take: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    take?: number | undefined;
    active?: "true" | "false" | undefined;
    q?: string | undefined;
}, {
    take?: number | undefined;
    active?: "true" | "false" | undefined;
    q?: string | undefined;
}>;
declare const statusBody: z.ZodObject<{
    status: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: string;
    note?: string | undefined;
}, {
    status: string;
    note?: string | undefined;
}>;
declare const feedbackBody: z.ZodObject<{
    kind: z.ZodEnum<["accepted" | "en_route" | "on_scene" | "support" | "under_control" | "completed", ...("accepted" | "en_route" | "on_scene" | "support" | "under_control" | "completed")[]]>;
    incidentId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
}, "strip", z.ZodTypeAny, {
    kind: "accepted" | "en_route" | "on_scene" | "support" | "under_control" | "completed";
    incidentId?: any;
    note?: any;
}, {
    kind: "accepted" | "en_route" | "on_scene" | "support" | "under_control" | "completed";
    incidentId?: any;
    note?: any;
}>;
declare const radioBody: z.ZodObject<{
    text: z.ZodString;
    unitId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    incidentId: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    incidentNumber: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
    callsign: z.ZodOptional<z.ZodNullable<z.ZodTypeAny>>;
}, "strip", z.ZodTypeAny, {
    text: string;
    incidentId?: any;
    unitId?: any;
    callsign?: any;
    incidentNumber?: any;
}, {
    text: string;
    incidentId?: any;
    unitId?: any;
    callsign?: any;
    incidentNumber?: any;
}>;
export declare class CadController {
    private readonly s;
    private readonly tablet;
    private readonly cfg;
    private readonly perms;
    private readonly media;
    private readonly handover;
    private readonly statsSvc;
    constructor(s: CadService, tablet: CadTabletService, cfg: CadConfigService, perms: PermissionService, media: MediaService, handover: CadHandoverService, statsSvc: CadStatsService);
    config(): Promise<import("@enrp/shared").CadConfig>;
    saveConfig(a: Actor, b: Record<string, unknown>): Promise<import("@enrp/shared").CadConfig>;
    saveMap(a: Actor, b: Record<string, unknown>): Promise<import("@enrp/shared").CadConfig>;
    /** Kartenbild hochladen (ER:LC-Karte, bis 40 MB) – wird danach als Kartenhintergrund gesetzt. */
    mapImage(a: Actor, file: Express.Multer.File | undefined, b: {
        width?: number;
        height?: number;
    }): Promise<import("@enrp/shared").CadConfig>;
    /** Kartenbild von einer https-Adresse übernehmen: der Server lädt es herunter und speichert es wie einen Upload (fremde Bild-Server blockiert die Sicherheitsrichtlinie). */
    mapImageUrl(a: Actor, b: {
        url: string;
    }): Promise<import("@enrp/shared").CadConfig>;
    overview(a: CadActor): Promise<{
        config: import("@enrp/shared").CadConfig;
        incidents: {
            calls: {
                id: string;
                incidentId: string | null;
                callNumber: number;
            }[];
            units: ({
                unit: {
                    id: string;
                    type: string | null;
                    status: string;
                    callsign: string;
                    name: string | null;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
            guildId: string | null;
            mapX: number | null;
            mapZ: number | null;
            location: string | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            restrictRoleIds: string[];
        }[];
        units: {
            crew: {
                id: string;
                discordName: string | null;
                discordId: string | null;
                robloxName: string | null;
                erlcName: string | null;
                callsign: string | null;
                team: string | null;
                inGame: boolean;
            }[];
            memberNames: string[];
            current: {
                number: string;
                id: string;
                title: string;
                status: string;
            } | null;
            position: {
                x: number;
                z: number;
                source: "erlc";
                street: string | null;
                postal: string | null;
            } | {
                x: number;
                z: number;
                source: "manual";
                street: null;
                postal: null;
            } | null;
            members: {
                userId: string;
                unitId: string;
            }[];
            incidents: ({
                incident: {
                    number: string;
                    id: string;
                    title: string;
                    status: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
            vehicle: string | null;
            id: string;
            type: string | null;
            status: string;
            updatedAt: Date;
            callsign: string;
            name: string | null;
            color: string | null;
            icon: string | null;
            guildId: string | null;
            notes: string | null;
            discordRoleId: string | null;
            erlcTeam: string | null;
            operational: boolean;
            mapX: number | null;
            mapZ: number | null;
            statusRoleIds: string[];
        }[];
        calls: {
            incident: {
                number: string;
                id: string;
                status: string;
            } | null;
            server: {
                id: string;
                name: string;
            };
            serverId: string;
            id: string;
            status: string;
            incidentId: string | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            source: string;
            startedAt: Date;
            mapX: number | null;
            mapZ: number | null;
            team: string | null;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            claimedById: string | null;
        }[];
        radio: {
            authorName: string | null;
            incidentNumber: string | null;
            id: string;
            authorId: string | null;
            incidentId: string | null;
            createdAt: Date;
            unitId: string | null;
            callsign: string | null;
            guildId: string | null;
            discordId: string | null;
            text: string;
        }[];
        erlc: {
            id: string;
            name: string;
            logoUrl: string | null;
            status: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            latencyMs: number | null;
            players: number | null;
            maxPlayers: number | null;
            queue: number | null;
            staffOnline: number | null;
        }[];
        counts: {
            persons: number | null;
            vehicles: number | null;
        };
    }>;
    map(a: CadActor): Promise<{
        incidents: {
            calls: {
                id: string;
                incidentId: string | null;
                callNumber: number;
            }[];
            units: ({
                unit: {
                    id: string;
                    type: string | null;
                    status: string;
                    callsign: string;
                    name: string | null;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
            guildId: string | null;
            mapX: number | null;
            mapZ: number | null;
            location: string | null;
            dispatcherId: string | null;
            supervisorId: string | null;
            closedAt: Date | null;
            keyword: string | null;
            involved: string | null;
            requiredUnits: string | null;
            restrictRoleIds: string[];
        }[];
        calls: {
            incident: {
                number: string;
                id: string;
                status: string;
            } | null;
            server: {
                id: string;
                name: string;
            };
            serverId: string;
            id: string;
            status: string;
            incidentId: string | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            source: string;
            startedAt: Date;
            mapX: number | null;
            mapZ: number | null;
            team: string | null;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            claimedById: string | null;
        }[];
        units: {
            crew: {
                id: string;
                discordName: string | null;
                discordId: string | null;
                robloxName: string | null;
                erlcName: string | null;
                callsign: string | null;
                team: string | null;
                inGame: boolean;
            }[];
            memberNames: string[];
            current: {
                number: string;
                id: string;
                title: string;
                status: string;
            } | null;
            position: {
                x: number;
                z: number;
                source: "erlc";
                street: string | null;
                postal: string | null;
            } | {
                x: number;
                z: number;
                source: "manual";
                street: null;
                postal: null;
            } | null;
            members: {
                userId: string;
                unitId: string;
            }[];
            incidents: ({
                incident: {
                    number: string;
                    id: string;
                    title: string;
                    status: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
            vehicle: string | null;
            id: string;
            type: string | null;
            status: string;
            updatedAt: Date;
            callsign: string;
            name: string | null;
            color: string | null;
            icon: string | null;
            guildId: string | null;
            notes: string | null;
            discordRoleId: string | null;
            erlcTeam: string | null;
            operational: boolean;
            mapX: number | null;
            mapZ: number | null;
            statusRoleIds: string[];
        }[];
        objects: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            category: string | null;
            description: string | null;
            createdById: string | null;
            name: string;
            color: string | null;
            icon: string | null;
            kind: string;
            layer: string;
            x: number | null;
            z: number | null;
            points: import("@prisma/client/runtime/library").JsonValue | null;
            roleIds: string[];
            incidentType: string | null;
            autoAction: string | null;
        }[];
        players: (import("./erlc.service").ErlcPlayer & {
            serverId: string;
            staff: boolean;
        })[];
        vehicles: {
            name: string;
            owner: string;
            plate: string | null;
            colorHex: string | null;
            x: number;
            z: number;
            serverId: string;
        }[];
        stale: boolean;
    }>;
    incidents(a: CadActor & {
        roles: string[];
    }, q: z.infer<typeof listQ>): Promise<{
        calls: {
            id: string;
            incidentId: string | null;
            callNumber: number;
        }[];
        units: ({
            unit: {
                id: string;
                type: string | null;
                status: string;
                callsign: string;
                name: string | null;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }[]>;
    incident(a: CadActor & {
        roles: string[];
    }, id: string): Promise<{
        calls: {
            serverId: string;
            id: string;
            status: string;
            incidentId: string | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            source: string;
            startedAt: Date;
            mapX: number | null;
            mapZ: number | null;
            team: string | null;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            claimedById: string | null;
        }[];
        names: {
            [k: string]: string;
        };
        log: {
            id: string;
            authorId: string | null;
            incidentId: string;
            createdAt: Date;
            unitId: string | null;
            guildId: string | null;
            kind: string;
            text: string;
        }[];
        units: ({
            unit: {
                id: string;
                type: string | null;
                status: string;
                callsign: string;
                name: string | null;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    createIncident(a: CadActor, b: z.infer<typeof incidentBody>): Promise<{
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    updateIncident(a: CadActor, id: string, b: Partial<z.infer<typeof incidentBody>>): Promise<{
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    status(a: CadActor & {
        roles: string[];
    }, id: string, b: z.infer<typeof statusBody>): Promise<{
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    }>;
    note(a: CadActor, id: string, b: {
        text: string;
    }): Promise<void>;
    assign(a: CadActor & {
        roles: string[];
    }, id: string, b: {
        unitId: string;
    }): Promise<{
        ok: boolean;
    }>;
    clear(a: CadActor, id: string, unitId: string): Promise<void>;
    units(a: CadActor & {
        roles: string[];
    }): Promise<{
        crew: {
            id: string;
            discordName: string | null;
            discordId: string | null;
            robloxName: string | null;
            erlcName: string | null;
            callsign: string | null;
            team: string | null;
            inGame: boolean;
        }[];
        memberNames: string[];
        current: {
            number: string;
            id: string;
            title: string;
            status: string;
        } | null;
        position: {
            x: number;
            z: number;
            source: "erlc";
            street: string | null;
            postal: string | null;
        } | {
            x: number;
            z: number;
            source: "manual";
            street: null;
            postal: null;
        } | null;
        members: {
            userId: string;
            unitId: string;
        }[];
        incidents: ({
            incident: {
                number: string;
                id: string;
                title: string;
                status: string;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        color: string | null;
        icon: string | null;
        guildId: string | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }[]>;
    createUnit(a: CadActor, b: z.infer<typeof unitBody>): Promise<{
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        color: string | null;
        icon: string | null;
        guildId: string | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }>;
    updateUnit(a: CadActor, id: string, b: Partial<z.infer<typeof unitBody>>): Promise<{
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        color: string | null;
        icon: string | null;
        guildId: string | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }>;
    deleteUnit(a: CadActor, id: string): Promise<void>;
    /** Leitstelle oder die Besatzung selbst (auch vom verbundenen SEK/K9-Server, falls freigegeben). */
    unitStatus(a: CadActor & {
        roles: string[];
    }, id: string, b: {
        status: string;
    }): Promise<{
        vehicle: string | null;
        id: string;
        type: string | null;
        status: string;
        updatedAt: Date;
        callsign: string;
        name: string | null;
        color: string | null;
        icon: string | null;
        guildId: string | null;
        notes: string | null;
        discordRoleId: string | null;
        erlcTeam: string | null;
        operational: boolean;
        mapX: number | null;
        mapZ: number | null;
        statusRoleIds: string[];
    }>;
    /** Rückmeldung zum Einsatz (MDT/Discord): gleiche Berechtigung wie der Einheitenstatus. */
    feedback(a: CadActor & {
        roles: string[];
    }, id: string, b: z.infer<typeof feedbackBody>): Promise<{
        ok: boolean;
        incidentId: string;
        number: string;
        callsign: string;
        unitStatus: "EN_ROUTE" | "ON_SCENE" | null;
    }>;
    mdt(a: CadActor): Promise<{
        units: {
            id: string;
            callsign: string;
            name: string | null;
            type: string | null;
            status: string;
            color: string | null;
            icon: string | null;
            vehicle: string | null;
            operational: boolean;
            incidents: {
                log: {
                    id: string;
                    authorId: string | null;
                    incidentId: string;
                    createdAt: Date;
                    unitId: string | null;
                    guildId: string | null;
                    kind: string;
                    text: string;
                }[];
                units: ({
                    unit: {
                        id: string;
                        type: string | null;
                        status: string;
                        callsign: string;
                        name: string | null;
                    };
                } & {
                    incidentId: string;
                    unitId: string;
                    assignedAt: Date;
                    clearedAt: Date | null;
                })[];
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
                guildId: string | null;
                mapX: number | null;
                mapZ: number | null;
                location: string | null;
                dispatcherId: string | null;
                supervisorId: string | null;
                closedAt: Date | null;
                keyword: string | null;
                involved: string | null;
                requiredUnits: string | null;
                restrictRoleIds: string[];
            }[];
        }[];
        radio: {
            id: string;
            authorId: string | null;
            incidentId: string | null;
            createdAt: Date;
            unitId: string | null;
            callsign: string | null;
            guildId: string | null;
            discordId: string | null;
            text: string;
        }[];
        notifications: {
            id: string;
            type: string;
            title: string;
            createdAt: Date;
            userId: string;
            entityType: string | null;
            entityId: string | null;
            body: string | null;
            readAt: Date | null;
            archivedAt: Date | null;
        }[];
        history: never[] | {
            number: string;
            type: string | null;
            status: string;
            incidentId: string;
            createdAt: Date;
            priority: string;
            source: string;
            guildId: string | null;
            dispatcherId: string | null;
            closedAt: Date;
            units: string[];
            unitTypes: string[];
        }[];
        feedback: readonly [{
            readonly key: "accepted";
            readonly label: "Auftrag angenommen";
            readonly emoji: "\u2705";
            readonly unitStatus: "EN_ROUTE";
        }, {
            readonly key: "en_route";
            readonly label: "Ausger\u00FCckt";
            readonly emoji: "\uD83D\uDE93";
            readonly unitStatus: "EN_ROUTE";
        }, {
            readonly key: "on_scene";
            readonly label: "Am Einsatzort";
            readonly emoji: "\uD83D\uDCCD";
            readonly unitStatus: "ON_SCENE";
        }, {
            readonly key: "support";
            readonly label: "Unterst\u00FCtzung ben\u00F6tigt";
            readonly emoji: "\uD83C\uDD98";
        }, {
            readonly key: "under_control";
            readonly label: "Einsatz unter Kontrolle";
            readonly emoji: "\uD83D\uDEE1\uFE0F";
        }, {
            readonly key: "completed";
            readonly label: "Einsatz abgeschlossen (Meldung)";
            readonly emoji: "\uD83C\uDFC1";
        }];
    }>;
    handovers(): Promise<{
        snapshot: import("./cad-handover.service").HandoverSnapshot;
        createdByName: string | null;
        acknowledgedByName: string | null;
        id: string;
        createdAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }[]>;
    handoverDraft(): Promise<{
        snapshot: import("./cad-handover.service").HandoverSnapshot;
        previous: {
            snapshot: import("./cad-handover.service").HandoverSnapshot;
            createdByName: string | null;
            acknowledgedByName: string | null;
            id: string;
            createdAt: Date;
            createdById: string | null;
            guildId: string | null;
            notes: string;
            acknowledgedById: string | null;
            acknowledgedAt: Date | null;
            ackNote: string | null;
        } | null;
    }>;
    createHandover(a: CadActor, b: {
        notes: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string;
        snapshot: import("@prisma/client/runtime/library").JsonValue;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }>;
    ackHandover(a: CadActor, id: string, b: {
        note?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        createdById: string | null;
        guildId: string | null;
        notes: string;
        snapshot: import("@prisma/client/runtime/library").JsonValue;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }>;
    stats(q: {
        days?: number;
    }): Promise<{
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
    calls(a: CadActor & {
        roles: string[];
    }, q: {
        status?: string;
    }): Promise<{
        incident: {
            number: string;
            id: string;
            status: string;
        } | null;
        server: {
            id: string;
            name: string;
        };
        serverId: string;
        id: string;
        status: string;
        incidentId: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        source: string;
        startedAt: Date;
        mapX: number | null;
        mapZ: number | null;
        team: string | null;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        claimedById: string | null;
    }[]>;
    callAction(a: CadActor & {
        roles: string[];
    }, id: string, action: string, body: unknown): Promise<{
        serverId: string;
        id: string;
        status: string;
        incidentId: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        source: string;
        startedAt: Date;
        mapX: number | null;
        mapZ: number | null;
        team: string | null;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        claimedById: string | null;
    } | {
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
        guildId: string | null;
        mapX: number | null;
        mapZ: number | null;
        location: string | null;
        dispatcherId: string | null;
        supervisorId: string | null;
        closedAt: Date | null;
        keyword: string | null;
        involved: string | null;
        requiredUnits: string | null;
        restrictRoleIds: string[];
    } | {
        incidentId: string;
    }>;
    /** Tablet der Leitstelle: Meldungen, Aktivitätsbrett, Gesucht, Auto-BOLOs. */
    tabletView(a: CadActor): Promise<{
        calls: {
            id: string;
            callNumber: number;
            description: string | null;
            location: string | null;
            status: string;
            startedAt: string;
        }[];
        board: {
            key: string;
            name: string;
            callsign: string | null;
            rank: string | null;
            since: string | null;
            unitId: string | null;
            status: string | null;
            statusLabel: string | null;
            statusColor: string | null;
            availability: "available" | "busy" | "unavailable";
            inGame: boolean;
        }[];
        available: number;
        me: {
            unitId: string;
            callsign: string;
            status: string;
            availability: "available" | "busy" | "unavailable";
        } | null;
        statuses: {
            available: string | null;
            unavailable: string | null;
        };
        wanted: {
            id: string;
            name: string;
            reason: string;
            priority: string;
            since: string;
        }[];
        bolos: {
            id: string;
            plate: string;
            model: string | null;
            color: string | null;
            reason: string;
            priority: string;
            since: string;
        }[];
        inGameWanted: {
            name: string;
            stars: number;
            location: string | null;
        }[];
        wantedAllowed: boolean;
    }>;
    radio(q: {
        incidentId?: string;
        take?: number;
    }): Promise<{
        authorName: string | null;
        incidentNumber: string | null;
        id: string;
        authorId: string | null;
        incidentId: string | null;
        createdAt: Date;
        unitId: string | null;
        callsign: string | null;
        guildId: string | null;
        discordId: string | null;
        text: string;
    }[]>;
    /** Einheiten, als die man funken darf (Leitstelle: alle; sonst nur die eigene). */
    radioUnits(a: CadActor): Promise<{
        units: {
            id: string;
            callsign: string;
            name: string | null;
        }[];
        mine: string | null;
        dispatcher: boolean;
    }>;
    sendRadio(a: CadActor & {
        roles: string[];
    }, b: z.infer<typeof radioBody>): Promise<{
        incidentNumber: string | null;
        id: string;
        authorId: string | null;
        incidentId: string | null;
        createdAt: Date;
        unitId: string | null;
        callsign: string | null;
        guildId: string | null;
        discordId: string | null;
        text: string;
    }>;
    announce(a: CadActor, b: {
        text: string;
    }): Promise<{
        channels: number;
    }>;
    members(): Promise<{
        inGame: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        unitId: string | null;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        discordId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        department: string | null;
        extra: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    createMember(a: CadActor, b: z.infer<typeof memberBody>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        unitId: string | null;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        discordId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        department: string | null;
        extra: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    updateMember(a: CadActor, id: string, b: Partial<z.infer<typeof memberBody>>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        unitId: string | null;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        discordId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        department: string | null;
        extra: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    deleteMember(a: CadActor, id: string): Promise<void>;
    objects(a: CadActor): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        createdById: string | null;
        name: string;
        color: string | null;
        icon: string | null;
        kind: string;
        layer: string;
        x: number | null;
        z: number | null;
        points: import("@prisma/client/runtime/library").JsonValue | null;
        roleIds: string[];
        incidentType: string | null;
        autoAction: string | null;
    }[]>;
    createObject(a: CadActor, b: z.infer<typeof mapObjectBody>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        createdById: string | null;
        name: string;
        color: string | null;
        icon: string | null;
        kind: string;
        layer: string;
        x: number | null;
        z: number | null;
        points: import("@prisma/client/runtime/library").JsonValue | null;
        roleIds: string[];
        incidentType: string | null;
        autoAction: string | null;
    }>;
    updateObject(a: CadActor, id: string, b: Partial<z.infer<typeof mapObjectBody>>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        createdById: string | null;
        name: string;
        color: string | null;
        icon: string | null;
        kind: string;
        layer: string;
        x: number | null;
        z: number | null;
        points: import("@prisma/client/runtime/library").JsonValue | null;
        roleIds: string[];
        incidentType: string | null;
        autoAction: string | null;
    }>;
    deleteObject(a: CadActor, id: string): Promise<void>;
    links(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        roleIds: string[];
        sourceGuildId: string;
        targetGuildId: string;
        sendTypes: string[];
        allowActions: string[];
        channels: import("@prisma/client/runtime/library").JsonValue | null;
        notify: boolean;
    }[]>;
    createLink(a: CadActor, b: z.infer<typeof linkBody>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        roleIds: string[];
        sourceGuildId: string;
        targetGuildId: string;
        sendTypes: string[];
        allowActions: string[];
        channels: import("@prisma/client/runtime/library").JsonValue | null;
        notify: boolean;
    }>;
    updateLink(a: CadActor, id: string, b: Partial<z.infer<typeof linkBody>>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        roleIds: string[];
        sourceGuildId: string;
        targetGuildId: string;
        sendTypes: string[];
        allowActions: string[];
        channels: import("@prisma/client/runtime/library").JsonValue | null;
        notify: boolean;
    }>;
    deleteLink(a: CadActor, id: string): Promise<void>;
    logs(): Promise<{
        id: string;
        action: string;
        module: string;
        entityType: string | null;
        entityId: string | null;
        after: import("@prisma/client/runtime/library").JsonValue;
        actor: string | null;
        createdAt: Date;
    }[]>;
}
declare const commandBody: z.ZodObject<{
    command: z.ZodString;
    confirm: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command: string;
    confirm?: boolean | undefined;
}, {
    command: string;
    confirm?: boolean | undefined;
}>;
export declare class ErlcController {
    private readonly s;
    private readonly perms;
    private readonly records;
    constructor(s: ErlcService, perms: PermissionService, records: ErlcSyncService);
    /** Personen-/Fahrzeugseite: wer bzw. was gerade im Spiel ist (aus der ER:LC-API), mit Link zur Akte. */
    livePersons(): Promise<{
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            personId: string | null;
            serverName: string;
            name: string;
            robloxUserId: string | null;
            team: string | null;
            callsign: string | null;
            wantedStars: number;
        }[];
    } | {
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            vehicleId: string | null;
            ownerPersonId: string | null;
            serverName: string;
            name: string;
            owner: string;
            plate: string | null;
            colorName: string | null;
            colorHex: string | null;
        }[];
    }>;
    liveVehicles(): Promise<{
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            personId: string | null;
            serverName: string;
            name: string;
            robloxUserId: string | null;
            team: string | null;
            callsign: string | null;
            wantedStars: number;
        }[];
    } | {
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            vehicleId: string | null;
            ownerPersonId: string | null;
            serverName: string;
            name: string;
            owner: string;
            plate: string | null;
            colorName: string | null;
            colorHex: string | null;
        }[];
    }>;
    list(a: Actor): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(a: Actor, b: z.infer<typeof erlcServerInput>): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(a: Actor, id: string, b: Partial<z.infer<typeof erlcServerInput>>): Promise<{
        id: string;
        name: string;
        serverRef: string | null;
        description: string | null;
        logoUrl: string | null;
        guildId: string | null;
        active: boolean;
        pollSeconds: number;
        features: string[];
        webhookEnabled: boolean;
        settings: {
            criticalCommands: string[];
            blockedCommands: string[];
        };
        status: string;
        statusLabel: string;
        lastSyncAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        latencyMs: number | null;
        rateLimit: {
            blockedUntil: number | null;
            buckets: import("./erlc-client").RateState[];
        };
        hasKey: boolean;
        keyMasked: string;
        webhookPath: string | null;
        paused: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    test(a: Actor, id: string): Promise<{
        server: {
            id: string;
            name: string;
            serverRef: string | null;
            description: string | null;
            logoUrl: string | null;
            guildId: string | null;
            active: boolean;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            settings: {
                criticalCommands: string[];
                blockedCommands: string[];
            };
            status: string;
            statusLabel: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: {
                blockedUntil: number | null;
                buckets: import("./erlc-client").RateState[];
            };
            hasKey: boolean;
            keyMasked: string;
            webhookPath: string | null;
            paused: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        ok: boolean;
        status: import("@enrp/shared").ErlcStatus;
        message?: string;
        latencyMs?: number;
    }>;
    reconnect(a: Actor, id: string): Promise<{
        server: {
            id: string;
            name: string;
            serverRef: string | null;
            description: string | null;
            logoUrl: string | null;
            guildId: string | null;
            active: boolean;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            settings: {
                criticalCommands: string[];
                blockedCommands: string[];
            };
            status: string;
            statusLabel: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: {
                blockedUntil: number | null;
                buckets: import("./erlc-client").RateState[];
            };
            hasKey: boolean;
            keyMasked: string;
            webhookPath: string | null;
            paused: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        ok: boolean;
        status: import("@enrp/shared").ErlcStatus;
        message?: string;
        latencyMs?: number;
    }>;
    live(id: string): Promise<{
        server: {
            id: string;
            name: string;
            serverRef: string | null;
            description: string | null;
            logoUrl: string | null;
            guildId: string | null;
            active: boolean;
            pollSeconds: number;
            features: string[];
            webhookEnabled: boolean;
            settings: {
                criticalCommands: string[];
                blockedCommands: string[];
            };
            status: string;
            statusLabel: string;
            lastSyncAt: Date | null;
            lastError: string | null;
            lastErrorAt: Date | null;
            latencyMs: number | null;
            rateLimit: {
                blockedUntil: number | null;
                buckets: import("./erlc-client").RateState[];
            };
            hasKey: boolean;
            keyMasked: string;
            webhookPath: string | null;
            paused: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        snapshot: import("./erlc.service").ErlcSnapshot | null;
        stale: boolean;
    }>;
    command(a: CadActor, id: string, b: z.infer<typeof commandBody>): Promise<{
        ok: true;
        result: string | null;
        critical: boolean;
        logId: string;
    }>;
    commands(id: string): Promise<{
        userName: string | null;
        serverId: string;
        error: string | null;
        result: string | null;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string | null;
        command: string;
        critical: boolean;
        ok: boolean;
    }[]>;
    /** Event-Webhook von ER:LC (öffentlich, aber nur mit gültiger Ed25519-Signatur von PRC). */
    webhook(id: string, token: string, req: AppRequest & {
        rawBody?: Buffer;
    }, ts?: string, sig?: string): Promise<{
        ok: boolean;
        duplicate: boolean;
        ignored?: undefined;
        calls?: undefined;
        events?: undefined;
    } | {
        ok: boolean;
        ignored: boolean;
        duplicate?: undefined;
        calls?: undefined;
        events?: undefined;
    } | {
        ok: boolean;
        calls: number;
        events: number;
        duplicate?: undefined;
        ignored?: undefined;
    }>;
}
export {};
