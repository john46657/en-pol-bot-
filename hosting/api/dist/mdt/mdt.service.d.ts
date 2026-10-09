import { Prisma } from '@prisma/client';
import { type MdtConfig, type PersonDetails } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { TimelineService } from '../timeline/timeline.service';
import { MediaService } from '../media/media.service';
import { LocksService } from '../locks/locks.service';
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
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, timeline: TimelineService, media: MediaService, locks: LocksService);
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
            action: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            summary: string;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            serverId: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            notes: string | null;
            plate: string;
            model: string | null;
            ownerId: string | null;
            erlcReference: string | null;
        }[] | null;
        weapons: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            serverId: string | null;
            status: string;
            notes: string | null;
            model: string | null;
            ownerId: string | null;
            serial: string;
        }[] | null;
        warrants: {
            id: string;
            reason: string;
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            personId: string | null;
            vehicleId: string | null;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            serverId: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            notes: string | null;
            plate: string;
            model: string | null;
            ownerId: string | null;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            serverId: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            notes: string | null;
            plate: string;
            model: string | null;
            ownerId: string | null;
            erlcReference: string | null;
        };
        wanted: {
            id: string;
            reason: string;
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            personId: string | null;
            vehicleId: string | null;
        }[] | null;
        incidents: {
            number: string;
            id: string;
            createdAt: Date;
            status: string;
            title: string;
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
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            serverId: string | null;
            status: string;
            notes: string | null;
            model: string | null;
            ownerId: string | null;
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        serverId: string | null;
        status: string;
        notes: string | null;
        model: string | null;
        ownerId: string | null;
        serial: string;
    }>;
    updateWeapon(actor: Actor, id: string, version: number, d: {
        type?: string;
        model?: string | null;
        ownerId?: string | null;
        status?: string;
        notes?: string | null;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        serverId: string | null;
        status: string;
        notes: string | null;
        model: string | null;
        ownerId: string | null;
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
            id: string;
            color: string | null;
            plate: string;
            model: string | null;
        } | null;
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        personId: string | null;
        vehicleId: string | null;
    }[]>;
}
