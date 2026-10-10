import { z } from 'zod';
import { mdtConfigSchema } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { pageQuery } from '../common/pagination';
import { MdtService } from './mdt.service';
declare const citizenQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    flag: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
    flag?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    flag?: string | undefined;
}>;
declare const citizenUpdate: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dateOfBirth: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gender: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    job: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nationality: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    appearance: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        skinTone: z.ZodOptional<z.ZodString>;
        hairColor: z.ZodOptional<z.ZodString>;
        eyeColor: z.ZodOptional<z.ZodString>;
        height: z.ZodOptional<z.ZodString>;
        features: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    }, {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    }>>>;
    licenses: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    flags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    version: z.ZodNumber;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    version: number;
    notes?: string | null | undefined;
    fullName?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    gender?: string | null | undefined;
    phone?: string | null | undefined;
    job?: string | null | undefined;
    nationality?: string | null | undefined;
    address?: string | null | undefined;
    appearance?: {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    } | null | undefined;
    licenses?: string[] | undefined;
    flags?: string[] | undefined;
}, {
    version: number;
    notes?: string | null | undefined;
    fullName?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    gender?: string | null | undefined;
    phone?: string | null | undefined;
    job?: string | null | undefined;
    nationality?: string | null | undefined;
    address?: string | null | undefined;
    appearance?: {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    } | null | undefined;
    licenses?: string[] | undefined;
    flags?: string[] | undefined;
}>;
declare const weaponQ: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    ownerId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED", ...("REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED")[]]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED" | undefined;
    ownerId?: string | undefined;
    q?: string | undefined;
}, {
    status?: "REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED" | undefined;
    ownerId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const weaponBody: z.ZodObject<{
    serial: z.ZodString;
    type: z.ZodString;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ownerId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED", ...("REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED")[]]>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    serial: string;
    model?: string | null | undefined;
    status?: "REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED" | undefined;
    ownerId?: string | null | undefined;
    notes?: string | null | undefined;
}, {
    type: string;
    serial: string;
    model?: string | null | undefined;
    status?: "REGISTERED" | "STOLEN" | "SEIZED" | "DESTROYED" | undefined;
    ownerId?: string | null | undefined;
    notes?: string | null | undefined;
}>;
/** Polizei-MDT (Streifen-Terminal): Bürger, Fahrzeuge, Waffen, Haftbefehle. Gleiche Akten und Rechte wie im Dashboard. */
export declare class MdtController {
    private readonly s;
    constructor(s: MdtService);
    config(): Promise<{
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
    saveConfig(a: Actor, b: Partial<z.infer<typeof mdtConfigSchema>>): Promise<{
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
    citizens(q: z.infer<typeof citizenQ>): Promise<{
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
            appearance: import("@enrp/shared").PersonDetails["appearance"];
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
    citizen(a: Actor, id: string): Promise<{
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
            custom: import("@prisma/client/runtime/library").JsonValue;
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
            appearance: import("@enrp/shared").PersonDetails["appearance"];
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
            custom: import("@prisma/client/runtime/library").JsonValue | null;
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
    citizenRoblox(a: Actor, id: string): Promise<{
        status: "not_found";
        profile: null;
    } | {
        status: "ok";
        profile: import("../persons/roblox.service").RobloxDetails;
    } | {
        status: "disabled" | "unreachable";
        profile: null;
    }>;
    updateCitizen(a: Actor, id: string, b: z.infer<typeof citizenUpdate>): Promise<{
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
        appearance: import("@enrp/shared").PersonDetails["appearance"];
        licenses: string[];
        flags: string[];
        photoUrl: string | null;
        activeWarrants: number;
        version: number;
        updatedAt: Date;
    }>;
    photo(a: Actor, id: string, file: Express.Multer.File | undefined): Promise<{
        photoUrl: string;
    }>;
    vehicles(q: z.infer<typeof pageQuery>): Promise<{
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
            custom: import("@prisma/client/runtime/library").JsonValue | null;
            plate: string;
            erlcReference: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    vehicle(a: Actor, id: string): Promise<{
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
            custom: import("@prisma/client/runtime/library").JsonValue | null;
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
    weapons(q: z.infer<typeof weaponQ>): Promise<{
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
    createWeapon(a: Actor, b: z.infer<typeof weaponBody>): Promise<{
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
    updateWeapon(a: Actor, id: string, b: {
        version: number;
    } & Partial<Omit<z.infer<typeof weaponBody>, 'serial'>>): Promise<{
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
    warrants(q: {
        status?: 'ACTIVE' | 'ALL';
    }): Promise<{
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
export {};
