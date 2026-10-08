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
import { LocksService } from '../locks/locks.service';
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
    restrictRoleIds?: string[];
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
    statusRoleIds?: string[];
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
    private readonly locks;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, rt: RealtimeService, timeline: TimelineService, cfg: CadConfigService, notify: CadNotifyService, locks: LocksService);
    private label;
    /**
     * Beendete Einsätze (Status mit „closed“, z. B. Abgeschlossen/Abgebrochen) werden einen Tag nach Abschluss gelöscht.
     * Chronik und Einheiten-Zuordnungen fallen per Cascade mit weg; Verweise aus Berichten, Notrufen und Funk werden gelöst.
     */
    purgeClosedIncidents(maxAgeMs?: number): Promise<number>;
    private changed;
    /**
     * Server-übergreifende Aktionen: Vom Heimat-Server (Leitstelle) aus immer erlaubt; von einem anderen Discord-Server
     * nur, wenn eine aktive Server-Verbindung diese Aktion freigibt (und ggf. die Rolle passt).
     * Geprüft wird nur, was aus Discord kommt (Bot mit Discord-ID): im Dashboard ist der gewählte Server nur ein Filter.
     * Ohne eingestellten Heimat-Server ist nur ein Ein-Server-Betrieb (keine Server-Verbindungen) offen.
     */
    assertCrossServer(actor: CadActor, action: 'status_report' | 'radio' | 'view_incidents' | 'dispatch', memberRoleIds?: string[]): Promise<void>;
    /** Fortlaufende Einsatznummer, z. B. E-2026-00421 (Präfix in den CAD-Einstellungen). */
    private nextNumber;
    private log;
    private incidentPayload;
    /** Sichtbarkeit vertraulicher Einsätze: CAD-Verwaltung, Disponent des Einsatzes oder eine der freigegebenen Rollen. */
    private visibility;
    assertVisible(actor: CadActor, id: string): Promise<void>;
    listIncidents(f: {
        active?: boolean;
        q?: string;
        take?: number;
    }, actor?: CadActor): Promise<{
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
    }[]>;
    getIncident(id: string, actor?: CadActor): Promise<{
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
            team: string | null;
            mapX: number | null;
            mapZ: number | null;
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
    private validateIncident;
    createIncident(actor: CadActor, d: IncidentInput, opts?: {
        callId?: string;
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
    /** Zonen mit automatischer Aktion: Einsatz liegt in der Zone → Hinweis in der Chronik („warn“) bzw. zusätzlich Leitstellenmeldung („notify“). */
    private zoneActions;
    updateIncident(actor: CadActor, id: string, d: Partial<IncidentInput>): Promise<{
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
    /** Abschließen und Wiederöffnen eines abgeschlossenen Einsatzes brauchen cad.close_incident. */
    private assertStatusAllowed;
    setStatus(actor: CadActor, id: string, status: string, note?: string): Promise<{
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
    }[]>;
    private validateUnit;
    createUnit(actor: CadActor, d: UnitInput): Promise<{
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
    updateUnit(actor: CadActor, id: string, d: Partial<UnitInput>): Promise<{
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
    deleteUnit(actor: CadActor, id: string): Promise<void>;
    /** Status einer Einheit: Leitstelle (cad.assign_unit) oder ein Besatzungsmitglied selbst (auch vom verbundenen SEK/K9-Server). */
    setUnitStatus(actor: CadActor, id: string, status: string, memberRoleIds?: string[]): Promise<{
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
        serverId: string;
        id: string;
        status: string;
        incidentId: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        source: string;
        startedAt: Date;
        team: string | null;
        mapX: number | null;
        mapZ: number | null;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        claimedById: string | null;
    }[]>;
    callAction(actor: CadActor, id: string, action: 'claim' | 'close' | 'reopen'): Promise<{
        serverId: string;
        id: string;
        status: string;
        incidentId: string | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        source: string;
        startedAt: Date;
        team: string | null;
        mapX: number | null;
        mapZ: number | null;
        callNumber: number;
        callerRobloxId: string | null;
        callerName: string | null;
        positionDescriptor: string | null;
        claimedById: string | null;
    }>;
    /** Notruf → Einsatz (Position, Ort und Beschreibung werden übernommen; die Verknüpfung bleibt gespeichert). */
    incidentFromCall(actor: CadActor, callId: string, d: Partial<IncidentInput>): Promise<{
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
        authorId: string | null;
        incidentId: string | null;
        createdAt: Date;
        unitId: string | null;
        callsign: string | null;
        guildId: string | null;
        discordId: string | null;
        text: string;
    }[]>;
    /** Funkmeldung (Dashboard oder Discord). Mit Einsatz → zusätzlich in der Einsatzchronik. */
    radioUnits(actor: CadActor): Promise<{
        units: {
            id: string;
            callsign: string;
            name: string | null;
        }[];
        mine: string | null;
        dispatcher: boolean;
    }>;
    sendRadio(actor: CadActor, d: {
        text: string;
        unitId?: string | null;
        incidentId?: string | null;
        incidentNumber?: string | null;
        callsign?: string | null;
    }, memberRoleIds?: string[]): Promise<{
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
    /** Wichtige Leitstellenmeldung an alle konfigurierten Kanäle (inkl. verbundener Server). */
    announce(actor: CadActor, text: string): Promise<{
        channels: number;
    }>;
    listMembers(): Promise<{
        inGame: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        unitId: string | null;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        department: string | null;
        discordId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        extra: Prisma.JsonValue | null;
    }[]>;
    saveMember(actor: CadActor, id: string | null, d: MemberInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        unitId: string | null;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        department: string | null;
        discordId: string | null;
        discordName: string | null;
        robloxName: string | null;
        robloxId: string | null;
        erlcName: string | null;
        zelloName: string | null;
        extra: Prisma.JsonValue | null;
    }>;
    deleteMember(actor: CadActor, id: string): Promise<void>;
    listMapObjects(actor: CadActor): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        createdById: string | null;
        name: string;
        icon: string | null;
        color: string | null;
        kind: string;
        layer: string;
        x: number | null;
        z: number | null;
        points: Prisma.JsonValue | null;
        roleIds: string[];
        incidentType: string | null;
        autoAction: string | null;
    }[]>;
    private checkGeometry;
    saveMapObject(actor: CadActor, id: string | null, d: Partial<MapObjectInput>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        createdById: string | null;
        name: string;
        icon: string | null;
        color: string | null;
        kind: string;
        layer: string;
        x: number | null;
        z: number | null;
        points: Prisma.JsonValue | null;
        roleIds: string[];
        incidentType: string | null;
        autoAction: string | null;
    }>;
    deleteMapObject(actor: CadActor, id: string): Promise<void>;
    listLinks(): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        active: boolean;
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
        updatedAt: Date;
        name: string;
        active: boolean;
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
            team: string | null;
            mapX: number | null;
            mapZ: number | null;
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
    /** Kartendaten: Einsätze, Notrufe, Einheiten, Spieler/Staff/Fahrzeuge (live), eigene POIs/Zonen. */
    mapData(actor: CadActor): Promise<{
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
            team: string | null;
            mapX: number | null;
            mapZ: number | null;
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
        }[];
        objects: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            category: string | null;
            description: string | null;
            createdById: string | null;
            name: string;
            icon: string | null;
            color: string | null;
            kind: string;
            layer: string;
            x: number | null;
            z: number | null;
            points: Prisma.JsonValue | null;
            roleIds: string[];
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
