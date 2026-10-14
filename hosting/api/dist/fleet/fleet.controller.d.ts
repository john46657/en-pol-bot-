import { z } from 'zod';
import { fleetConfigSchema, type FleetInternalInput, type FleetModelInput } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { FleetService } from './fleet.service';
/** Polizeifahrzeuge: Live-Liste (ER:LC), Details, interne Daten, Modellkatalog, Einstellungen. Alle Rechte serverseitig. */
export declare class FleetController {
    private readonly s;
    constructor(s: FleetService);
    config(): Promise<{
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
    saveConfig(a: Actor, b: Partial<z.infer<typeof fleetConfigSchema>>): Promise<{
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
    list(q: {
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
                    name: string | null;
                    callsign: string;
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
            name: string;
            lastError: string | null;
            status: string;
            features: string[];
            lastSyncAt: Date | null;
        }[];
    }>;
    get(a: Actor, id: string): Promise<{
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
            status: string;
            title: string;
        }[];
        events: {
            actorName: string | null;
            id: string;
            createdAt: Date;
            text: string;
            actorId: string | null;
            incidentId: string | null;
            vehicleId: string;
            kind: string;
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
                name: string | null;
                callsign: string;
            } | null;
            status: string;
            internalCode: string | null;
            notes: string | null;
            tags: string[];
            version: number;
            updatedAt: Date;
        };
    }>;
    /** Interne Felder; Einheit braucht zusätzlich fleet.assign, alles andere fleet.edit (im Service geprüft). */
    update(a: Actor, id: string, b: FleetInternalInput & {
        version?: number;
    }): Promise<{
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
            status: string;
            title: string;
        }[];
        events: {
            actorName: string | null;
            id: string;
            createdAt: Date;
            text: string;
            actorId: string | null;
            incidentId: string | null;
            vehicleId: string;
            kind: string;
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
                name: string | null;
                callsign: string;
            } | null;
            status: string;
            internalCode: string | null;
            notes: string | null;
            tags: string[];
            version: number;
            updatedAt: Date;
        };
    }>;
    incident(a: Actor, id: string, b: {
        incidentId: string;
        note?: string | null;
    }): Promise<{
        ok: boolean;
        number: string;
    }>;
    catalog(): Promise<{
        imageUrl: string | null;
        liveCount: number;
        id: string;
        createdAt: Date;
        name: string;
        category: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        internalCode: string | null;
        tags: string[];
        erlcName: string;
        imageId: string | null;
        department: string | null;
    }[]>;
    suggestions(): Promise<{
        erlcName: string;
        seen: number;
    }[]>;
    createModel(a: Actor, b: FleetModelInput): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        category: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        internalCode: string | null;
        tags: string[];
        erlcName: string;
        imageId: string | null;
        department: string | null;
    }>;
    updateModel(a: Actor, id: string, b: Partial<FleetModelInput>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        category: string;
        active: boolean;
        updatedAt: Date;
        description: string | null;
        internalCode: string | null;
        tags: string[];
        erlcName: string;
        imageId: string | null;
        department: string | null;
    }>;
    deleteModel(a: Actor, id: string): Promise<void>;
    image(a: Actor, id: string, file: Express.Multer.File | undefined): Promise<{
        imageUrl: string;
    }>;
}
