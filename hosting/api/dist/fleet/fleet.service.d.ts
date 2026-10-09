import { type FleetConfig, type FleetInternalInput, type FleetModelInput } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MediaService } from '../media/media.service';
import type { ErlcSnapshot } from '../cad/erlc.service';
/** Was ER:LC zu einem Fahrzeug liefert (nach normalizeSnapshot). */
type ApiVehicle = NonNullable<ErlcSnapshot['vehicles']>[number];
/**
 * Polizeifahrzeuge: Abgleich der von ER:LC gemeldeten (gespawnten) Fahrzeuge, getrennt vom gepflegten Modellkatalog.
 * - Polizei = Besitzer im Team Police; ist der Besitzer gerade nicht im Spiel, zählt nur ein aktives Katalog-Modell. Sheriff/andere Teams nie.
 * - Wiedererkennung ohne Fahrzeug-ID: Besitzer + Modell + Kennzeichen. Hat ein Besitzer mehrere gleiche, wird nach Reihenfolge nummeriert und als unsicher markiert.
 * - Fahrer und Fahrzeugposition liefert die API nicht – sie werden nie behauptet (siehe DRIVER_STATES/POSITION_HINT).
 * - Der Abgleich schreibt nur API-Felder; interne Felder (Einheit, Status, Notizen, Tags, Kennung) ändert nur das Dashboard.
 */
export declare class FleetService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly rt;
    private readonly media;
    private readonly log;
    private readonly lastSync;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, rt: RealtimeService, media: MediaService);
    config(): Promise<FleetConfig>;
    saveConfig(actor: Actor, patch: Partial<FleetConfig>): Promise<{
        categories: {
            key: string;
            label: string;
            icon: string;
        }[];
        internalStatuses: {
            key: string;
            label: string;
            color: string;
        }[];
        syncSeconds: number;
        keepInactiveDays: number;
    }>;
    /** Schlüssel ohne Fahrzeug-ID: Besitzer|Modell|Kennzeichen, bei mehreren gleichen #1, #2 … (unsicher). */
    static keys(vehicles: ApiVehicle[]): {
        key: string;
        uncertain: boolean;
    }[];
    /** Nach jedem erfolgreichen ER:LC-Abruf (Fahrzeugdaten aktiv). `force` ignoriert den Mindestabstand (Tests, „Jetzt abgleichen“). */
    sync(erlcServerId: string, snap: ErlcSnapshot, force?: boolean): Promise<{
        changes: number;
        active: number;
    } | null>;
    /** Live-Infos zum Besitzer aus dem letzten Abruf + Discord-Verknüpfung + Einheit + Katalog. */
    private enrich;
    private readonly serverSel;
    list(f: {
        active?: 'active' | 'inactive' | 'all';
        serverId?: string;
    }): Promise<{
        items: {
            id: string;
            erlcServerId: string;
            serverName: string;
            key: string;
            active: boolean;
            uncertain: boolean;
            stale: boolean;
            api: {
                name: string;
                owner: string;
                ownerRobloxId: string | null;
                ownerTeam: string | null;
                plate: string | null;
                texture: string | null;
                colorHex: string | null;
                colorName: string | null;
                policeReason: string;
                firstSeenAt: Date;
                lastSeenAt: Date;
                apiChangedAt: Date;
            };
            driver: {
                state: "unavailable";
                label: "Fahrerdaten nicht verfügbar";
                hint: string;
            };
            ownerOnline: boolean;
            ownerPosition: {
                x: number;
                z: number;
                street: string | null;
                postal: string | null;
                hint: string;
            } | null;
            discord: {
                discordId: string | null;
                name: string | null;
            } | null;
            model: {
                id: string;
                name: string;
                category: string;
                imageUrl: string | null;
                internalCode: string | null;
                department: string | null;
            } | null;
            internal: {
                unitId: string | null;
                unit: {
                    id: string;
                    callsign: string;
                    name: string | null;
                } | null;
                status: string;
                internalCode: string | null;
                notes: string | null;
                tags: string[];
                version: number;
                updatedAt: Date;
            };
        }[];
        servers: {
            vehiclesEnabled: boolean;
            id: string;
            status: string;
            name: string;
            lastError: string | null;
            features: string[];
            lastSyncAt: Date | null;
        }[];
    }>;
    get(actor: Actor, id: string): Promise<{
        raw: {
            name: string;
            owner: string;
            plate: string | null;
            texture: string | null;
            colorHex: string | null;
            colorName: string | null;
        }[];
        incidents: never[] | {
            number: string;
            id: string;
            title: string;
            status: string;
        }[];
        events: {
            actorName: string | null;
            id: string;
            incidentId: string | null;
            createdAt: Date;
            vehicleId: string;
            actorId: string | null;
            kind: string;
            text: string;
        }[];
        id: string;
        erlcServerId: string;
        serverName: string;
        key: string;
        active: boolean;
        uncertain: boolean;
        stale: boolean;
        api: {
            name: string;
            owner: string;
            ownerRobloxId: string | null;
            ownerTeam: string | null;
            plate: string | null;
            texture: string | null;
            colorHex: string | null;
            colorName: string | null;
            policeReason: string;
            firstSeenAt: Date;
            lastSeenAt: Date;
            apiChangedAt: Date;
        };
        driver: {
            state: "unavailable";
            label: "Fahrerdaten nicht verfügbar";
            hint: string;
        };
        ownerOnline: boolean;
        ownerPosition: {
            x: number;
            z: number;
            street: string | null;
            postal: string | null;
            hint: string;
        } | null;
        discord: {
            discordId: string | null;
            name: string | null;
        } | null;
        model: {
            id: string;
            name: string;
            category: string;
            imageUrl: string | null;
            internalCode: string | null;
            department: string | null;
        } | null;
        internal: {
            unitId: string | null;
            unit: {
                id: string;
                callsign: string;
                name: string | null;
            } | null;
            status: string;
            internalCode: string | null;
            notes: string | null;
            tags: string[];
            version: number;
            updatedAt: Date;
        };
    }>;
    /** Für die Karte: nur aktive Fahrzeuge, deren Besitzer gerade im Spiel eine Position hat – als Besitzerposition gekennzeichnet. */
    forMap(): Promise<{
        id: string;
        serverId: string;
        name: string;
        owner: string;
        plate: string | null;
        colorHex: string | null;
        colorName: string | null;
        x: number;
        z: number;
        positionHint: string;
        category: string | null;
        icon: string | null;
        unit: string | null;
        uncertain: boolean;
    }[]>;
    /** `version` optional: mit → Konfliktprüfung; ohne (automatisches Speichern einzelner Felder) → letzte Änderung gilt, alles im Verlauf/Audit. */
    updateInternal(actor: Actor, id: string, version: number | undefined, d: FleetInternalInput): Promise<{
        raw: {
            name: string;
            owner: string;
            plate: string | null;
            texture: string | null;
            colorHex: string | null;
            colorName: string | null;
        }[];
        incidents: never[] | {
            number: string;
            id: string;
            title: string;
            status: string;
        }[];
        events: {
            actorName: string | null;
            id: string;
            incidentId: string | null;
            createdAt: Date;
            vehicleId: string;
            actorId: string | null;
            kind: string;
            text: string;
        }[];
        id: string;
        erlcServerId: string;
        serverName: string;
        key: string;
        active: boolean;
        uncertain: boolean;
        stale: boolean;
        api: {
            name: string;
            owner: string;
            ownerRobloxId: string | null;
            ownerTeam: string | null;
            plate: string | null;
            texture: string | null;
            colorHex: string | null;
            colorName: string | null;
            policeReason: string;
            firstSeenAt: Date;
            lastSeenAt: Date;
            apiChangedAt: Date;
        };
        driver: {
            state: "unavailable";
            label: "Fahrerdaten nicht verfügbar";
            hint: string;
        };
        ownerOnline: boolean;
        ownerPosition: {
            x: number;
            z: number;
            street: string | null;
            postal: string | null;
            hint: string;
        } | null;
        discord: {
            discordId: string | null;
            name: string | null;
        } | null;
        model: {
            id: string;
            name: string;
            category: string;
            imageUrl: string | null;
            internalCode: string | null;
            department: string | null;
        } | null;
        internal: {
            unitId: string | null;
            unit: {
                id: string;
                callsign: string;
                name: string | null;
            } | null;
            status: string;
            internalCode: string | null;
            notes: string | null;
            tags: string[];
            version: number;
            updatedAt: Date;
        };
    }>;
    /** Fahrzeug bei einem Einsatz dokumentieren (intern): steht in der Einsatzchronik und im Fahrzeugverlauf. */
    documentIncident(actor: Actor, id: string, incidentId: string, note?: string | null): Promise<{
        ok: boolean;
        number: string;
    }>;
    /** Fahrzeuge einer Einheit (MDT „Meine Einheit“) – interne Zuordnung, kein bestätigter Live-Status. */
    forUnits(unitIds: string[]): Promise<{
        id: string;
        erlcServerId: string;
        serverName: string;
        key: string;
        active: boolean;
        uncertain: boolean;
        stale: boolean;
        api: {
            name: string;
            owner: string;
            ownerRobloxId: string | null;
            ownerTeam: string | null;
            plate: string | null;
            texture: string | null;
            colorHex: string | null;
            colorName: string | null;
            policeReason: string;
            firstSeenAt: Date;
            lastSeenAt: Date;
            apiChangedAt: Date;
        };
        driver: {
            state: "unavailable";
            label: "Fahrerdaten nicht verfügbar";
            hint: string;
        };
        ownerOnline: boolean;
        ownerPosition: {
            x: number;
            z: number;
            street: string | null;
            postal: string | null;
            hint: string;
        } | null;
        discord: {
            discordId: string | null;
            name: string | null;
        } | null;
        model: {
            id: string;
            name: string;
            category: string;
            imageUrl: string | null;
            internalCode: string | null;
            department: string | null;
        } | null;
        internal: {
            unitId: string | null;
            unit: {
                id: string;
                callsign: string;
                name: string | null;
            } | null;
            status: string;
            internalCode: string | null;
            notes: string | null;
            tags: string[];
            version: number;
            updatedAt: Date;
        };
    }[]>;
    catalog(): Promise<{
        imageUrl: string | null;
        liveCount: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        description: string | null;
        active: boolean;
        name: string;
        erlcName: string;
        department: string | null;
        internalCode: string | null;
        tags: string[];
        imageId: string | null;
    }[]>;
    /** Modellnamen, die ER:LC bisher gemeldet hat und die noch nicht im Katalog stehen (Vorschläge zum Übernehmen). */
    suggestions(): Promise<{
        erlcName: string;
        seen: number;
    }[]>;
    private checkModel;
    createModel(actor: Actor, d: FleetModelInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        description: string | null;
        active: boolean;
        name: string;
        erlcName: string;
        department: string | null;
        internalCode: string | null;
        tags: string[];
        imageId: string | null;
    }>;
    updateModel(actor: Actor, id: string, d: Partial<FleetModelInput>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string;
        description: string | null;
        active: boolean;
        name: string;
        erlcName: string;
        department: string | null;
        internalCode: string | null;
        tags: string[];
        imageId: string | null;
    }>;
    deleteModel(actor: Actor, id: string): Promise<void>;
    setModelImage(actor: Actor, id: string, file: {
        originalname: string;
        mimetype: string;
        buffer: Buffer;
        size: number;
    } | undefined): Promise<{
        imageUrl: string;
    }>;
}
export {};
