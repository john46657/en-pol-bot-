import type { Response } from 'express';
import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { ServerConfigService } from './server-config.service';
declare const save: z.ZodObject<{
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    version: z.ZodNumber;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    version: number;
    data: Record<string, unknown>;
    note?: string | undefined;
}, {
    version: number;
    data: Record<string, unknown>;
    note?: string | undefined;
}>;
declare const setup: z.ZodObject<{
    step: z.ZodNumber;
    complete: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    step: number;
    complete?: boolean | undefined;
}, {
    step: number;
    complete?: boolean | undefined;
}>;
declare const restore: z.ZodObject<{
    version: z.ZodNumber;
    modules: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    version: number;
    modules: boolean;
}, {
    version: number;
    modules?: boolean | undefined;
}>;
declare const upload: z.ZodObject<{
    kind: z.ZodEnum<[string, ...string[]]>;
}, "strip", z.ZodTypeAny, {
    kind: string;
}, {
    kind: string;
}>;
/**
 * Server-Konfiguration: Name, Branding, Bilder, Design, Einrichtungsassistent, Versionen.
 * Autorisierung im Service gegen den Server aus dem PFAD (Mitgliedschaft + Recht genau dort); Header/Body können ihn nicht ändern.
 */
export declare class ServerConfigController {
    private readonly c;
    constructor(c: ServerConfigService);
    /** Branding des gewählten Servers fürs Dashboard (nur Mitglieder dieses Servers). */
    branding(a: Actor, guildId: string): Promise<{
        design: {
            primary: string;
            mode: "user" | "dark" | "light";
            accent: string;
            useBackground: boolean;
        };
        images: {
            logo: string | null;
            avatar: string | null;
            banner: string | null;
            background: string | null;
            areas: {
                dashboard: string | null;
                tickets: string | null;
                team: string | null;
            };
        };
        displayName: string;
        shortName: string;
        dashboardTitle: string;
        welcomeText: string;
        serverId: string;
        guildId: string;
        configured: boolean;
        setupCompleted: boolean;
    }>;
    get(a: Actor, id: string): Promise<{
        server: {
            id: string;
            guildId: string;
            name: string;
            status: string;
            archivedAt: Date | null;
        };
        config: {
            data: {
                general: {
                    displayName: string;
                    shortName: string;
                    dashboardTitle: string;
                    welcomeText: string;
                };
                branding: {
                    avatar: string | null;
                    logo: string | null;
                    banner: string | null;
                    background: string | null;
                    areas: {
                        dashboard: string | null;
                        team: string | null;
                        tickets: string | null;
                    };
                };
                design: {
                    primary: string;
                    mode: "user" | "dark" | "light";
                    accent: string;
                    useBackground: boolean;
                };
            };
            version: number;
            setupStep: number;
            setupCompletedAt: Date | null;
            saved: boolean;
            updatedAt: Date | null;
        };
        assets: {
            inUse: boolean;
            inRevisions: boolean;
            id: string;
            kind: string;
            mime: string;
            size: number;
            width: number;
            height: number;
            sha256: string;
            originalName: string;
            createdAt: Date;
            url: string | null;
        }[];
        bot: {
            present: boolean;
            guildName: string | null;
            icon: string | null;
            channels: number;
            roles: number;
            permissions: Partial<Record<"administrator" | "viewChannel" | "sendMessages" | "embedLinks" | "attachFiles" | "readMessageHistory" | "manageChannels" | "manageRoles", boolean>> | null;
            missing: ("viewChannel" | "sendMessages" | "embedLinks" | "attachFiles" | "readMessageHistory" | "manageChannels" | "manageRoles")[] | null;
        };
        canManage: boolean;
    }>;
    save(a: Actor, id: string, b: z.infer<typeof save>): Promise<{
        version: number;
        data: {
            general: {
                displayName: string;
                shortName: string;
                dashboardTitle: string;
                welcomeText: string;
            };
            branding: {
                avatar: string | null;
                logo: string | null;
                banner: string | null;
                background: string | null;
                areas: {
                    dashboard: string | null;
                    team: string | null;
                    tickets: string | null;
                };
            };
            design: {
                primary: string;
                mode: "user" | "dark" | "light";
                accent: string;
                useBackground: boolean;
            };
        };
        updatedAt: Date;
    }>;
    setup(a: Actor, id: string, b: z.infer<typeof setup>): Promise<{
        setupStep: number;
        setupCompletedAt: Date | null;
    }>;
    revisions(a: Actor, id: string): Promise<{
        version: number;
        note: string | null;
        createdAt: Date;
        createdBy: string | null;
        data: import("@prisma/client/runtime/library").JsonValue;
        modules: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    restore(a: Actor, id: string, v: number, b: z.infer<typeof restore>): Promise<{
        modulesChanged: number;
        version: number;
        data: {
            general: {
                displayName: string;
                shortName: string;
                dashboardTitle: string;
                welcomeText: string;
            };
            branding: {
                avatar: string | null;
                logo: string | null;
                banner: string | null;
                background: string | null;
                areas: {
                    dashboard: string | null;
                    team: string | null;
                    tickets: string | null;
                };
            };
            design: {
                primary: string;
                mode: "user" | "dark" | "light";
                accent: string;
                useBackground: boolean;
            };
        };
        updatedAt: Date;
    }>;
    upload(a: Actor, id: string, file: Express.Multer.File | undefined, b: z.infer<typeof upload>): Promise<{
        id: string;
        kind: string;
        mime: string;
        size: number;
        width: number;
        height: number;
        sha256: string;
        originalName: string;
        createdAt: Date;
        url: string | null;
    }>;
    asset(a: Actor, id: string, assetId: string, res: Response): Promise<void>;
    remove(a: Actor, id: string, assetId: string, confirm: string | undefined): Promise<{
        ok: boolean;
    }>;
}
export {};
