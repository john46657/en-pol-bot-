import { z } from 'zod';
import { DiscordService } from './discord.service';
import { ApplicationsService } from '../applications/applications.service';
import { DangerService } from '../danger/danger.service';
import { DutyService } from '../duty/duty.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../audit/audit.service';
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
declare const application: z.ZodObject<{
    robloxUsername: z.ZodString;
    robloxUserId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodString;
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    robloxUsername: string;
    answers: Record<string, string>;
    robloxUserId?: string | undefined;
}, {
    discordId: string;
    robloxUsername: string;
    answers: Record<string, string>;
    robloxUserId?: string | undefined;
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
    private readonly duty;
    private readonly danger;
    private readonly applications;
    private readonly prisma;
    constructor(d: DiscordService, duty: DutyService, danger: DangerService, applications: ApplicationsService, prisma: PrismaService);
    redeem(b: z.infer<typeof redeem>): Promise<{
        displayName: string;
        username: string;
    }>;
    config(): Promise<import("./discord.service").DiscordChannels>;
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
    dangerState(): Promise<import("../danger/danger.service").DangerState>;
    getState(key: string): Promise<{
        value: unknown;
    }>;
    setState(key: string, b: z.infer<typeof stateBody>): Promise<void>;
    /** Bewerbung aus Discord. Eigener Dienstweg (mit Bot-Token), damit das öffentliche Rate-Limit pro IP nicht alle Discord-Bewerber gemeinsam trifft. */
    submitApplication(b: z.infer<typeof application>): Promise<{
        number: string;
        status: string;
    }>;
}
export {};
