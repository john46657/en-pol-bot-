import { Prisma } from '@prisma/client';
import type { CadConfig } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TimelineService } from '../timeline/timeline.service';
import { CadConfigService } from './cad-config.service';
import { CadNotifyService } from './cad-notify.service';
import type { ErlcPlayer } from './erlc.service';
/** Wer handelt und von welchem Discord-Server (Bot) bzw. mit welchem gewählten Server (Dashboard). */
export type CadActor = Actor & {
    guildId?: string | null;
    discordId?: string | null;
};
export interface IncidentInput {
    title: string;
    type?: string | null;
    keyword?: string | null;
    priority?: string;
    status?: string;
    location?: string | null;
    description?: string | null;
    involved?: string | null;
    requiredUnits?: string | null;
    internalNotes?: string | null;
    mapX?: number | null;
    mapZ?: number | null;
    dispatcherId?: string | null;
}
export interface UnitInput {
    callsign: string;
    name?: string | null;
    type?: string | null;
    color?: string | null;
    icon?: string | null;
    status?: string;
    discordRoleId?: string | null;
    guildId?: string | null;
    erlcTeam?: string | null;
    operational?: boolean;
    vehicle?: string | null;
    notes?: string | null;
    mapX?: number | null;
    mapZ?: number | null;
}
export interface MemberInput {
    userId?: string | null;
    discordId?: string | null;
    discordName?: string | null;
    robloxName?: string | null;
    robloxId?: string | null;
    erlcName?: string | null;
    team?: string | null;
    unitId?: string | null;
    zelloName?: string | null;
    callsign?: string | null;
    department?: string | null;
    rank?: string | null;
    extra?: Record<string, string | number> | null;
}
export interface MapObjectInput {
    kind: 'POI' | 'ZONE';
    name: string;
    description?: string | null;
    category?: string | null;
    layer: string;
    icon?: string | null;
    color?: string | null;
    x?: number | null;
    z?: number | null;
    points?: [number, number][] | null;
    roleIds?: string[];
    incidentType?: string | null;
    autoAction?: string | null;
}
export interface LinkInput {
    name: string;
    sourceGuildId: string;
    targetGuildId: string;
    active?: boolean;
    sendTypes?: string[];
    allowActions?: string[];
    roleIds?: string[];
    channels?: Record<string, string[]>;
    notify?: boolean;
}
export declare class CadService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly rt;
    private readonly timeline;
    private readonly cfg;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, rt: RealtimeService, timeline: TimelineService, cfg: CadConfigService, notify: CadNotifyService);
    private label;
    private changed;
    /**
     * Server-übergreifende Aktionen: Vom Heimat-Server (Leitstelle) aus immer erlaubt; von einem anderen Discord-Server
     * nur, wenn eine aktive Server-Verbindung diese Aktion freigibt (und ggf. die Rolle passt).
     */
    assertCrossServer(actor: CadActor, action: 'status_report' | 'radio' | 'view_incidents', memberRoleIds?: string[]): Promise<void>;
    /** Fortlaufende Einsatznummer, z. B. E-2026-00421 (Präfix in den CAD-Einstellungen). */
    private nextNumber;
    private log;
    private incidentPayload;
    listIncidents(f: {
        active?: boolean;
        q?: string;
        take?: number;
    }): Promise<{
        calls: {
            id: string;
            callNumber: number;
            incidentId: string | null;
        }[];
        units: ({
            unit: {
                id: string;
                name: string | null;
                type: string | null;
                status: string;
                callsign: string;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
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
    }[]>;
    getIncident(id: string): Promise<{
        calls: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            team: string | null;
            status: string;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            mapX: number | null;
            mapZ: number | null;
            startedAt: Date;
            claimedById: string | null;
            incidentId: string | null;
            source: string;
            serverId: string;
        }[];
        names: {
            [k: string]: string;
        };
        log: {
            id: string;
            createdAt: Date;
            text: string;
            guildId: string | null;
            incidentId: string;
            kind: string;
            unitId: string | null;
            authorId: string | null;
        }[];
        units: ({
            unit: {
                id: string;
                name: string | null;
                type: string | null;
                status: string;
                callsign: string;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
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
    }>;
    private validateIncident;
    createIncident(actor: CadActor, d: IncidentInput, opts?: {
        callId?: string;
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
    }>;
    /** Zonen mit automatischer Aktion: Einsatz liegt in der Zone → Hinweis in der Chronik („warn“) bzw. zusätzlich Leitstellenmeldung („notify“). */
    private zoneActions;
    updateIncident(actor: CadActor, id: string, d: Partial<IncidentInput>): Promise<{
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
    }>;
    setStatus(actor: CadActor, id: string, status: string, note?: string): Promise<{
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
    }>;
    addNote(actor: CadActor, id: string, text: string): Promise<void>;
    assignUnit(actor: CadActor, id: string, unitId: string): Promise<{
        ok: boolean;
    }>;
    clearUnit(actor: CadActor, id: string, unitId: string): Promise<void>;
    listUnits(): Promise<{
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
            status: string;
            title: string;
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
                status: string;
                title: string;
            };
        } & {
            incidentId: string;
            unitId: string;
            assignedAt: Date;
            clearedAt: Date | null;
        })[];
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
    }[]>;
    private validateUnit;
    createUnit(actor: CadActor, d: UnitInput): Promise<{
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
    }>;
    updateUnit(actor: CadActor, id: string, d: Partial<UnitInput>): Promise<{
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
    }>;
    deleteUnit(actor: CadActor, id: string): Promise<void>;
    /** Status einer Einheit: Leitstelle (cad.assign_unit) oder ein Besatzungsmitglied selbst (auch vom verbundenen SEK/K9-Server). */
    setUnitStatus(actor: CadActor, id: string, status: string, memberRoleIds?: string[]): Promise<{
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
    }>;
    listCalls(f: {
        status?: string;
        take?: number;
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        team: string | null;
        status: string;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        mapX: number | null;
        mapZ: number | null;
        startedAt: Date;
        claimedById: string | null;
        incidentId: string | null;
        source: string;
        serverId: string;
    }[]>;
    callAction(actor: CadActor, id: string, action: 'claim' | 'close' | 'reopen'): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        team: string | null;
        status: string;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        mapX: number | null;
        mapZ: number | null;
        startedAt: Date;
        claimedById: string | null;
        incidentId: string | null;
        source: string;
        serverId: string;
    }>;
    /** Notruf → Einsatz (Position, Ort und Beschreibung werden übernommen; die Verknüpfung bleibt gespeichert). */
    incidentFromCall(actor: CadActor, callId: string, d: Partial<IncidentInput>): Promise<{
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
    }>;
    /** Einheit direkt zu einem Notruf: legt bei Bedarf den Einsatz an. */
    assignToCall(actor: CadActor, callId: string, unitId: string): Promise<{
        incidentId: string;
    }>;
    listRadio(f: {
        incidentId?: string;
        take?: number;
    }): Promise<{
        authorName: string | null;
        incidentNumber: string | null;
        id: string;
        createdAt: Date;
        text: string;
        discordId: string | null;
        guildId: string | null;
        callsign: string | null;
        incidentId: string | null;
        unitId: string | null;
        authorId: string | null;
    }[]>;
    /** Funkmeldung (Dashboard oder Discord). Mit Einsatz → zusätzlich in der Einsatzchronik. */
    sendRadio(actor: CadActor, d: {
        text: string;
        unitId?: string | null;
        incidentId?: string | null;
        incidentNumber?: string | null;
        callsign?: string | null;
    }, memberRoleIds?: string[]): Promise<{
        incidentNumber: string | null;
        id: string;
        createdAt: Date;
        text: string;
        discordId: string | null;
        guildId: string | null;
        callsign: string | null;
        incidentId: string | null;
        unitId: string | null;
        authorId: string | null;
    }>;
    /** Wichtige Leitstellenmeldung an alle konfigurierten Kanäle (inkl. verbundener Server). */
    announce(actor: CadActor, text: string): Promise<{
        channels: number;
    }>;
    listMembers(): Promise<{
        inGame: boolean;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string | null;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        unitId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        department: string | null;
        extra: Prisma.JsonValue | null;
    }[]>;
    saveMember(actor: CadActor, id: string | null, d: MemberInput): Promise<{
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string | null;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        unitId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        department: string | null;
        extra: Prisma.JsonValue | null;
    }>;
    deleteMember(actor: CadActor, id: string): Promise<void>;
    listMapObjects(actor: CadActor): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        category: string | null;
        updatedAt: Date;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        roleIds: string[];
        x: number | null;
        layer: string;
        z: number | null;
        kind: string;
        points: Prisma.JsonValue | null;
        incidentType: string | null;
        autoAction: string | null;
    }[]>;
    private checkGeometry;
    saveMapObject(actor: CadActor, id: string | null, d: Partial<MapObjectInput>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        category: string | null;
        updatedAt: Date;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        roleIds: string[];
        x: number | null;
        layer: string;
        z: number | null;
        kind: string;
        points: Prisma.JsonValue | null;
        incidentType: string | null;
        autoAction: string | null;
    }>;
    deleteMapObject(actor: CadActor, id: string): Promise<void>;
    listLinks(): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        roleIds: string[];
        sourceGuildId: string;
        targetGuildId: string;
        sendTypes: string[];
        allowActions: string[];
        channels: Prisma.JsonValue | null;
        notify: boolean;
    }[]>;
    saveLink(actor: CadActor, id: string | null, d: Partial<LinkInput>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        active: boolean;
        updatedAt: Date;
        roleIds: string[];
        sourceGuildId: string;
        targetGuildId: string;
        sendTypes: string[];
        allowActions: string[];
        channels: Prisma.JsonValue | null;
        notify: boolean;
    }>;
    deleteLink(actor: CadActor, id: string): Promise<void>;
    logs(take?: number): Promise<{
        id: string;
        action: string;
        module: string;
        entityType: string | null;
        entityId: string | null;
        after: Prisma.JsonValue;
        actor: string | null;
        createdAt: Date;
    }[]>;
    /** Daten für die Leitstellen-Startseite in einem Abruf. ER:LC-Ausfall → letzter Stand + Hinweis, CAD läuft weiter. */
    overview(actor: CadActor): Promise<{
        config: CadConfig;
        incidents: {
            calls: {
                id: string;
                callNumber: number;
                incidentId: string | null;
            }[];
            units: ({
                unit: {
                    id: string;
                    name: string | null;
                    type: string | null;
                    status: string;
                    callsign: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
                status: string;
                title: string;
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
                    status: string;
                    title: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            team: string | null;
            status: string;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            mapX: number | null;
            mapZ: number | null;
            startedAt: Date;
            claimedById: string | null;
            incidentId: string | null;
            source: string;
            serverId: string;
        }[];
        radio: {
            authorName: string | null;
            incidentNumber: string | null;
            id: string;
            createdAt: Date;
            text: string;
            discordId: string | null;
            guildId: string | null;
            callsign: string | null;
            incidentId: string | null;
            unitId: string | null;
            authorId: string | null;
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
    /** Kartendaten: Einsätze, Notrufe, Einheiten, Spieler/Staff/Fahrzeuge (live), eigene POIs/Zonen. */
    mapData(actor: CadActor): Promise<{
        incidents: {
            calls: {
                id: string;
                callNumber: number;
                incidentId: string | null;
            }[];
            units: ({
                unit: {
                    id: string;
                    name: string | null;
                    type: string | null;
                    status: string;
                    callsign: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            team: string | null;
            status: string;
            callNumber: number;
            callerRobloxId: string | null;
            callerName: string | null;
            positionDescriptor: string | null;
            mapX: number | null;
            mapZ: number | null;
            startedAt: Date;
            claimedById: string | null;
            incidentId: string | null;
            source: string;
            serverId: string;
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
                status: string;
                title: string;
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
                    status: string;
                    title: string;
                };
            } & {
                incidentId: string;
                unitId: string;
                assignedAt: Date;
                clearedAt: Date | null;
            })[];
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
        }[];
        objects: {
            id: string;
            createdAt: Date;
            name: string;
            category: string | null;
            updatedAt: Date;
            description: string | null;
            color: string | null;
            icon: string | null;
            createdById: string | null;
            roleIds: string[];
            x: number | null;
            layer: string;
            z: number | null;
            kind: string;
            points: Prisma.JsonValue | null;
            incidentType: string | null;
            autoAction: string | null;
        }[];
        players: (ErlcPlayer & {
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
}
