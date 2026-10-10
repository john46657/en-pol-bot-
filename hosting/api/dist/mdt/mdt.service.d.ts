import { Prisma } from '@prisma/client';
import { type MdtConfig, type PersonDetails } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { TimelineService } from '../timeline/timeline.service';
import { MediaService } from '../media/media.service';
import { LocksService } from '../locks/locks.service';
import { RobloxService } from '../persons/roblox.service';
import { type PageQuery } from '../common/pagination';
/**
 * Polizei-MDT: Bürger-, Fahrzeug- und Waffenakten in der Ansicht eines Streifen-Terminals.
 * Nutzt dieselben Akten wie das Dashboard (Personen, Fahrzeuge, Fahndungen, Einsätze, Berichte …) – nichts wird doppelt gespeichert.
 * Alles zeigt nur gespeicherte Daten; was fehlt, bleibt leer („nicht erfasst“).
 */
export declare class MdtService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly timeline;
    private readonly media;
    private readonly locks;
    private readonly roblox;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, timeline: TimelineService, media: MediaService, locks: LocksService, roblox: RobloxService);
    config(): Promise<MdtConfig>;
    saveConfig(actor: Actor, patch: Partial<MdtConfig>): Promise<{
        licenses: {
            key: string;
            label: string;
        }[];
        flags: {
            key: string;
            label: string;
            tone: "warning" | "danger" | "info" | "neutral";
        }[];
        weaponTypes: {
            key: string;
            label: string;
        }[];
        genders: string[];
    }>;
    private citizen;
    private warrantCounts;
    citizens(p: PageQuery & {
        flag?: string;
    }): Promise<{
        items: {
            robloxHeadshotUrl: string | null;
            id: string;
            robloxUsername: string;
            robloxUserId: string | null;
            fullName: string | null;
            status: string;
            aliases: string[];
            dateOfBirth: string | null;
            age: number | null;
            gender: string | null;
            phone: string | null;
            job: string | null;
            nationality: string | null;
            address: string | null;
            appearance: PersonDetails["appearance"];
            licenses: string[];
            flags: string[];
            photoUrl: string | null;
            activeWarrants: number;
            version: number;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    profile(actor: Actor, id: string): Promise<{
        timeline: {
            id: string;
            createdAt: Date;
            entityType: string;
            entityId: string;
            summary: string;
            action: string;
            actorId: string | null;
        }[];
        person: {
            notes: string | null;
            custom: Prisma.JsonValue;
            createdAt: Date;
            id: string;
            robloxUsername: string;
            robloxUserId: string | null;
            fullName: string | null;
            status: string;
            aliases: string[];
            dateOfBirth: string | null;
            age: number | null;
            gender: string | null;
            phone: string | null;
            job: string | null;
            nationality: string | null;
            address: string | null;
            appearance: PersonDetails["appearance"];
            licenses: string[];
            flags: string[];
            photoUrl: string | null;
            activeWarrants: number;
            version: number;
            updatedAt: Date;
        };
        counts: {
            activeWarrants: number | null;
            vehicles: number | null;
            weapons: number | null;
            incidents: number | null;
            reports: number | null;
            investigations: number | null;
            evidence: number | null;
        };
        vehicles: {
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            color: string | null;
            notes: string | null;
            custom: Prisma.JsonValue | null;
            plate: string;
            erlcReference: string | null;
        }[] | null;
        weapons: {
            serverId: string | null;
            model: string | null;
            id: string;
            type: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            notes: string | null;
            serial: string;
        }[] | null;
        warrants: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
        }[] | null;
    }>;
    updateCitizen(actor: Actor, id: string, version: number, d: PersonDetails & {
        notes?: string | null;
    }): Promise<{
        id: string;
        robloxUsername: string;
        robloxUserId: string | null;
        fullName: string | null;
        status: string;
        aliases: string[];
        dateOfBirth: string | null;
        age: number | null;
        gender: string | null;
        phone: string | null;
        job: string | null;
        nationality: string | null;
        address: string | null;
        appearance: PersonDetails["appearance"];
        licenses: string[];
        flags: string[];
        photoUrl: string | null;
        activeWarrants: number;
        version: number;
        updatedAt: Date;
    }>;
    /**
     * Roblox-Profil der Person (Avatar, Anzeigename, Kontoalter, Freunde, Gruppen, frühere Namen) – live von Roblox.
     * Ohne gespeicherte Roblox-ID wird sie über den Roblox-Namen gesucht (nur exakter Treffer) und in der Akte nachgetragen.
     */
    robloxProfile(actor: Actor, id: string): Promise<{
        status: "not_found";
        profile: null;
    } | {
        status: "ok";
        profile: import("../persons/roblox.service").RobloxDetails;
    } | {
        status: "disabled" | "unreachable";
        profile: null;
    }>;
    /** Foto hochladen oder mit der Kamera aufnehmen (Bild bis 8 MB); ersetzt das bisherige Foto. */
    setPhoto(actor: Actor, id: string, file: {
        originalname: string;
        mimetype: string;
        buffer: Buffer;
        size: number;
    } | undefined): Promise<{
        photoUrl: string;
    }>;
    vehicles(p: PageQuery): Promise<{
        items: {
            activeBolos: number;
            owner: {
                id: string;
                robloxUsername: string;
                fullName: string | null;
            } | null;
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            color: string | null;
            notes: string | null;
            custom: Prisma.JsonValue | null;
            plate: string;
            erlcReference: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    vehicle(actor: Actor, id: string): Promise<{
        vehicle: {
            owner: {
                photoUrl: string | null;
                id: string;
                robloxUsername: string;
                fullName: string | null;
                flags: string[];
                photoId: string | null;
            } | null;
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            color: string | null;
            notes: string | null;
            custom: Prisma.JsonValue | null;
            plate: string;
            erlcReference: string | null;
        };
        wanted: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
        }[] | null;
        incidents: {
            number: string;
            id: string;
            title: string;
            status: string;
            createdAt: Date;
        }[];
        timeline: {
            id: string;
            createdAt: Date;
            entityType: string;
            entityId: string;
            summary: string;
            action: string;
            actorId: string | null;
        }[];
    }>;
    weapons(p: PageQuery & {
        ownerId?: string;
        status?: string;
    }): Promise<{
        items: ({
            owner: {
                id: string;
                robloxUsername: string;
                fullName: string | null;
            } | null;
        } & {
            serverId: string | null;
            model: string | null;
            id: string;
            type: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            notes: string | null;
            serial: string;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    private checkWeapon;
    createWeapon(actor: Actor, d: {
        serial: string;
        type: string;
        model?: string | null;
        ownerId?: string | null;
        status?: string;
        notes?: string | null;
    }): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        type: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        ownerId: string | null;
        notes: string | null;
        serial: string;
    }>;
    updateWeapon(actor: Actor, id: string, version: number, d: {
        type?: string;
        model?: string | null;
        ownerId?: string | null;
        status?: string;
        notes?: string | null;
    }): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        type: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        ownerId: string | null;
        notes: string | null;
        serial: string;
    }>;
    warrants(status: 'ACTIVE' | 'ALL'): Promise<{
        person: {
            photoUrl: string | null;
            id: string;
            robloxUsername: string;
            fullName: string | null;
            flags: string[];
            photoId: string | null;
        } | null;
        vehicle: {
            model: string | null;
            id: string;
            color: string | null;
            plate: string;
        } | null;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }[]>;
}
