import { z } from 'zod';
import { DiscordService } from './discord.service';
import { DiscordLiveService } from './discord-live.service';
import { ApplicationsService } from '../applications/applications.service';
import { DangerService } from '../danger/danger.service';
import { DutyService } from '../duty/duty.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../audit/audit.service';
declare const guildsBody: z.ZodObject<{
    guilds: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        icon: z.ZodNullable<z.ZodString>;
        channels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            type: z.ZodEnum<["text", "category", "voice", "other"]>;
            parentId: z.ZodNullable<z.ZodString>;
            position: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }, {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }>, "many">;
        roles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            color: z.ZodNumber;
            position: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            color: number;
            position: number;
        }, {
            id: string;
            name: string;
            color: number;
            position: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        icon: string | null;
        channels: {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }[];
    }, {
        id: string;
        name: string;
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        icon: string | null;
        channels: {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    guilds: {
        id: string;
        name: string;
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        icon: string | null;
        channels: {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }[];
    }[];
}, {
    guilds: {
        id: string;
        name: string;
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        icon: string | null;
        channels: {
            id: string;
            name: string;
            type: "text" | "category" | "voice" | "other";
            position: number;
            parentId: string | null;
        }[];
    }[];
}>;
declare const redeem: z.ZodObject<{
    code: z.ZodString;
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    discordId: string;
}, {
    code: string;
    discordId: string;
}>;
declare const ack: z.ZodObject<{
    ok: z.ZodBoolean;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
    error?: string | undefined;
}, {
    ok: boolean;
    error?: string | undefined;
}>;
declare const outboxQ: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
declare const stateBody: z.ZodObject<{
    value: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    value?: unknown;
}, {
    value?: unknown;
}>;
declare const membersBody: z.ZodObject<{
    members: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        guildId: z.ZodString;
        username: z.ZodString;
        displayName: z.ZodString;
        avatar: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<["online", "idle", "dnd", "offline", "unknown"]>;
        roleIds: z.ZodArray<z.ZodString, "many">;
        joinedAt: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        username: string;
        displayName: string;
        guildId: string;
        roleIds: string[];
        status: "unknown" | "online" | "idle" | "dnd" | "offline";
        avatar: string | null;
        joinedAt: string | null;
    }, {
        id: string;
        username: string;
        displayName: string;
        guildId: string;
        roleIds: string[];
        status: "unknown" | "online" | "idle" | "dnd" | "offline";
        avatar: string | null;
        joinedAt: string | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    members: {
        id: string;
        username: string;
        displayName: string;
        guildId: string;
        roleIds: string[];
        status: "unknown" | "online" | "idle" | "dnd" | "offline";
        avatar: string | null;
        joinedAt: string | null;
    }[];
}, {
    members: {
        id: string;
        username: string;
        displayName: string;
        guildId: string;
        roleIds: string[];
        status: "unknown" | "online" | "idle" | "dnd" | "offline";
        avatar: string | null;
        joinedAt: string | null;
    }[];
}>;
declare const voiceBody: z.ZodObject<{
    channels: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        guildId: z.ZodString;
        name: z.ZodString;
        parentId: z.ZodNullable<z.ZodString>;
        parentName: z.ZodNullable<z.ZodString>;
        position: z.ZodNumber;
        members: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatar: z.ZodNullable<z.ZodString>;
            selfMute: z.ZodBoolean;
            selfDeaf: z.ZodBoolean;
            serverMute: z.ZodBoolean;
            serverDeaf: z.ZodBoolean;
            video: z.ZodBoolean;
            streaming: z.ZodBoolean;
            since: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }, {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        guildId: string;
        members: {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }[];
        position: number;
        parentId: string | null;
        parentName: string | null;
    }, {
        id: string;
        name: string;
        guildId: string;
        members: {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }[];
        position: number;
        parentId: string | null;
        parentName: string | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    channels: {
        id: string;
        name: string;
        guildId: string;
        members: {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }[];
        position: number;
        parentId: string | null;
        parentName: string | null;
    }[];
}, {
    channels: {
        id: string;
        name: string;
        guildId: string;
        members: {
            id: string;
            displayName: string;
            avatar: string | null;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute: boolean;
            serverDeaf: boolean;
            video: boolean;
            streaming: boolean;
            since: string | null;
        }[];
        position: number;
        parentId: string | null;
        parentName: string | null;
    }[];
}>;
declare const openQ: z.ZodObject<{
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    discordId: string;
}, {
    discordId: string;
}>;
declare const application: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodString;
    discordName: z.ZodOptional<z.ZodString>;
    durationSec: z.ZodOptional<z.ZodNumber>;
    joinedAt: z.ZodOptional<z.ZodDate>;
    answers: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    robloxUsername: string;
    answers: Record<string, string | string[]>;
    robloxUserId?: string | undefined;
    guildId?: string | undefined;
    discordName?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}, {
    discordId: string;
    robloxUsername: string;
    answers: Record<string, string | string[]>;
    robloxUserId?: string | undefined;
    guildId?: string | undefined;
    discordName?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}>;
/** Web-Seite: eigenes Konto verknüpfen. Authentifiziert per Session; Bot-Zugang ist hier nicht erlaubt. */
export declare class DiscordController {
    private readonly d;
    constructor(d: DiscordService);
    link(a: Actor): Promise<{
        linked: boolean;
        discordId: string | null;
        linkedAt: Date | null;
    }>;
    /** Server des Bots mit Channels und Rollen (Namen + Auswahllisten im Dashboard). */
    guilds(): Promise<import("./discord.service").DiscordGuildInfo[]>;
    linkCode(a: Actor): Promise<{
        code: string;
        expiresAt: Date;
    }>;
    unlinkSelf(a: Actor): Promise<void>;
    unlinkUser(a: Actor, userId: string): Promise<void>;
}
/** Dienst-zu-Dienst-Endpunkte des Bots (Header `Authorization: Bot <BOT_API_TOKEN>`); ohne Benutzerkontext. */
export declare class BotController {
    private readonly d;
    private readonly live;
    private readonly duty;
    private readonly danger;
    private readonly applications;
    private readonly prisma;
    constructor(d: DiscordService, live: DiscordLiveService, duty: DutyService, danger: DangerService, applications: ApplicationsService, prisma: PrismaService);
    redeem(b: z.infer<typeof redeem>): Promise<{
        displayName: string;
        username: string;
    }>;
    config(): Promise<import("./discord.service").DiscordChannels>;
    guilds(b: z.infer<typeof guildsBody>): Promise<void>;
    outbox(q: z.infer<typeof outboxQ>): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        type: string;
        channelKey: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
    }[]>;
    ack(id: string, b: z.infer<typeof ack>): Promise<void>;
    /** Teamübersicht für die selbst aktualisierende Teamliste in Discord (nur Anzeigefelder). */
    team(): Promise<{
        rankOrder: string[];
        members: {
            name: string;
            rank: string | null;
            callsign: string | null;
            team: string | null;
            dutyStatus: string;
            unit: string | null;
        }[];
    }>;
    /** Teammitglieder (Avatar, Name, Online-Status, Rollen) – der Bot meldet mindestens alle 60 Sekunden. */
    teamRoles(): Promise<{
        roleIds: string[];
    }>;
    members(b: z.infer<typeof membersBody>): void;
    /** Voice-Channels mit Personen (getrennt von der Teamliste). */
    voice(b: z.infer<typeof voiceBody>): void;
    dangerState(): Promise<import("../danger/danger.service").DangerState>;
    getState(key: string): Promise<{
        value: unknown;
    }>;
    setState(key: string, b: z.infer<typeof stateBody>): Promise<void>;
    /** Bewerbung aus Discord. Eigener Dienstweg (mit Bot-Token), damit das öffentliche Rate-Limit pro IP nicht alle Discord-Bewerber gemeinsam trifft. */
    openApplication(q: z.infer<typeof openQ>): Promise<{
        open: boolean;
        number: string | null;
    }>;
    submitApplication(b: z.infer<typeof application>): Promise<{
        number: string;
        status: string;
    }>;
}
export {};
