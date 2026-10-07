import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
/** Nur bekannte Settings-Keys mit striktem Schema werden akzeptiert. */
export declare const SETTING_SCHEMAS: {
    readonly 'org.name': z.ZodString;
    readonly 'org.serverName': z.ZodString;
    readonly 'org.timezone': z.ZodString;
    readonly 'org.dateFormat': z.ZodEnum<["DD.MM.YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]>;
    readonly 'retention.sessionDays': z.ZodNumber;
    readonly 'retention.loginHistoryDays': z.ZodNumber;
    readonly 'retention.readNotificationDays': z.ZodNumber;
    readonly 'dashboard.defaultLayout': z.ZodArray<z.ZodObject<{
        widget: z.ZodString;
        visible: z.ZodBoolean;
        order: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        order: number;
        widget: string;
        visible: boolean;
    }, {
        order: number;
        widget: string;
        visible: boolean;
    }>, "many">;
    readonly 'studio.customFields': z.ZodEffects<z.ZodObject<{
        persons: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            type: z.ZodEnum<["text", "number", "select", "date"]>;
            required: z.ZodDefault<z.ZodBoolean>;
            options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }>, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }>, "many">>;
        vehicles: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            type: z.ZodEnum<["text", "number", "select", "date"]>;
            required: z.ZodDefault<z.ZodBoolean>;
            options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }>, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }, {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        persons: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }[];
        vehicles: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }[];
    }, {
        persons?: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        vehicles?: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
    }>, {
        persons: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }[];
        vehicles: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            required: boolean;
            options?: string[] | undefined;
        }[];
    }, {
        persons?: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
        vehicles?: {
            key: string;
            type: "number" | "select" | "text" | "date";
            label: string;
            options?: string[] | undefined;
            required?: boolean | undefined;
        }[] | undefined;
    }>;
    readonly 'theme.accent': z.ZodUnion<[z.ZodEnum<["blue", "green", "amber", "red", "cyan", "violet", "orange", "pink", "indigo", "teal", "lime", "sky", "rose", "emerald", "gold", "slate"]>, z.ZodString]>;
    /** Eigene Akzentfarben (Studio → Design → „Eigene Farbe hinzufügen“). */
    readonly 'theme.customAccents': z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        hex: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        hex: string;
    }, {
        name: string;
        hex: string;
    }>, "many">;
    readonly 'discord.channels': z.ZodObject<{
        guildId: z.ZodOptional<z.ZodString>;
        dispatch: z.ZodOptional<z.ZodString>;
        wanted: z.ZodOptional<z.ZodString>;
        announcements: z.ZodOptional<z.ZodString>;
        applications: z.ZodOptional<z.ZodString>;
        danger: z.ZodOptional<z.ZodString>;
        sek: z.ZodOptional<z.ZodString>;
        qualifications: z.ZodOptional<z.ZodString>;
        duty: z.ZodOptional<z.ZodString>;
        teamlist: z.ZodOptional<z.ZodString>;
        tickets: z.ZodOptional<z.ZodString>;
        staffRole: z.ZodOptional<z.ZodString>;
        radioRole: z.ZodOptional<z.ZodString>;
        sekRole: z.ZodOptional<z.ZodString>;
        dutyRole: z.ZodOptional<z.ZodString>;
        breakRole: z.ZodOptional<z.ZodString>;
        trainingRole: z.ZodOptional<z.ZodString>;
        adminDutyRole: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        dispatch?: string | undefined;
        wanted?: string | undefined;
        announcements?: string | undefined;
        applications?: string | undefined;
        danger?: string | undefined;
        sek?: string | undefined;
        qualifications?: string | undefined;
        duty?: string | undefined;
        tickets?: string | undefined;
        guildId?: string | undefined;
        teamlist?: string | undefined;
        staffRole?: string | undefined;
        radioRole?: string | undefined;
        sekRole?: string | undefined;
        dutyRole?: string | undefined;
        breakRole?: string | undefined;
        trainingRole?: string | undefined;
        adminDutyRole?: string | undefined;
    }, {
        dispatch?: string | undefined;
        wanted?: string | undefined;
        announcements?: string | undefined;
        applications?: string | undefined;
        danger?: string | undefined;
        sek?: string | undefined;
        qualifications?: string | undefined;
        duty?: string | undefined;
        tickets?: string | undefined;
        guildId?: string | undefined;
        teamlist?: string | undefined;
        staffRole?: string | undefined;
        radioRole?: string | undefined;
        sekRole?: string | undefined;
        dutyRole?: string | undefined;
        breakRole?: string | undefined;
        trainingRole?: string | undefined;
        adminDutyRole?: string | undefined;
    }>;
    readonly 'team.rankOrder': z.ZodArray<z.ZodString, "many">;
    /** Teams und Büros (Dienstgrade: `team.rankOrder`) – Auswahl in Personalakten und Filter der Teamliste. */
    readonly 'team.structure': z.ZodObject<{
        teams: z.ZodArray<z.ZodString, "many">;
        offices: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        teams: string[];
        offices: string[];
    }, {
        teams: string[];
        offices: string[];
    }>;
    readonly 'application.form': z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
        minLength: z.ZodDefault<z.ZodNumber>;
        maxLength: z.ZodDefault<z.ZodNumber>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
        }, "strip", z.ZodTypeAny, {
            label: string;
            roleId?: string | undefined;
        }, {
            label: string;
            roleId?: string | undefined;
        }>, "many">>;
        multiple: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, "many">, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }[], {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }[]>;
    /** „Mit Discord anmelden“: neue Konten erlauben, nur Mitglieder des Discord-Servers, Discord-Rolle → Systemrolle. */
    readonly 'auth.discord': z.ZodObject<{
        signup: z.ZodBoolean;
        requireGuild: z.ZodBoolean;
        roleMap: z.ZodArray<z.ZodObject<{
            discordRoleId: z.ZodString;
            role: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            role: string;
            discordRoleId: string;
        }, {
            role: string;
            discordRoleId: string;
        }>, "many">;
        /** Team-Rolle(n): nur wer eine davon auf dem Discord-Server hat, kommt ins MDT/Dashboard (leer = alle Mitglieder). */
        teamRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        signup: boolean;
        requireGuild: boolean;
        roleMap: {
            role: string;
            discordRoleId: string;
        }[];
        teamRoleIds: string[];
    }, {
        signup: boolean;
        requireGuild: boolean;
        roleMap: {
            role: string;
            discordRoleId: string;
        }[];
        teamRoleIds?: string[] | undefined;
    }>;
};
export type SettingKey = keyof typeof SETTING_SCHEMAS;
export declare class AdminService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    getSettings(): Promise<{
        settings: {
            [k: string]: Prisma.JsonValue;
        };
        allowedKeys: string[];
        serverScoped: readonly ["team.structure", "team.rankOrder", "dashboard.defaultLayout", "theme.accent", "theme.customAccents", "org.name", "teamchance"];
    }>;
    /** `key@<guildId>`: Server-eigener Wert (nur für Einstellungen, die je Server getrennt sein dürfen). */
    setSetting(actor: Actor, key: string, value: unknown): Promise<{
        key: string;
        value: Prisma.JsonValue;
    }>;
    securityEvents(take?: number, type?: string): Prisma.PrismaPromise<{
        id: string;
        requestId: string | null;
        createdAt: Date;
        userId: string | null;
        type: string;
        ip: string | null;
        detail: string | null;
    }[]>;
    getLayout(userId: string): Promise<{
        layout: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | null;
        isDefault: boolean;
    }>;
    setLayout(actor: Actor, layout: unknown[] | null): Promise<{
        layout: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | null;
        isDefault: boolean;
    }>;
    /** Aufbewahrung: löscht nur operative Hilfsdaten. AuditLog ist per DB-Trigger unlöschbar und wird hier bewusst NICHT angefasst. */
    runRetention(actor: Actor): Promise<{
        sessions: number;
        loginHistory: number;
        notifications: number;
    }>;
}
