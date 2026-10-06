import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
export declare const CHANNEL_KEYS: readonly ["dispatch", "wanted", "announcements", "applications", "danger", "sek"];
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
/** Channel-/Rollen-IDs aus den Einstellungen. Die Benachrichtigungs-Channels dürfen Komma-Listen sein (mehrere Channels/Server). */
export interface DiscordChannels {
    guildId?: string;
    dispatch?: string;
    wanted?: string;
    announcements?: string;
    applications?: string;
    danger?: string;
    sek?: string;
    teamlist?: string;
    tickets?: string;
    staffRole?: string;
    radioRole?: string;
    sekRole?: string;
}
export declare class DiscordService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    createLinkCode(actor: Actor): Promise<{
        code: string;
        expiresAt: Date;
    }>;
    /** Vom Bot aufgerufen. Einmalig, zeitlich begrenzt; ein Discord-Konto kann nur mit einem Benutzer verknüpft sein. */
    redeem(code: string, discordId: string): Promise<{
        displayName: string;
        username: string;
    }>;
    unlink(actor: Actor, userId: string): Promise<void>;
    status(userId: string): Promise<{
        linked: boolean;
        discordId: string | null;
        linkedAt: Date | null;
    }>;
    /** Auflösung Discord-ID → aktiver Benutzer (für die Bot-Authentifizierung). */
    resolveUser(discordId: string): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        email: string | null;
        robloxUserId: string | null;
        displayName: string;
        passwordHash: string;
        robloxUsername: string | null;
        robloxStatus: string;
        robloxVerifiedAt: Date | null;
        robloxVerifiedById: string | null;
        active: boolean;
        failedLogins: number;
        lockedUntil: Date | null;
        lastLogin: Date | null;
        updatedAt: Date;
        version: number;
    } | null>;
    channels(): Promise<DiscordChannels>;
    /** Nur Einreihen, wenn für den Kanal-Schlüssel ein Channel konfiguriert ist (kein Datenanfall ohne Bot). Fehler dürfen den Fachprozess nie stören. */
    enqueue(channelKey: ChannelKey, type: string, payload: Record<string, unknown>, opts?: {
        always?: boolean;
    }): Promise<void>;
    getState(key: string): Promise<unknown>;
    setState(key: string, value: unknown): Promise<void>;
    pending(limit: number): Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        type: string;
        channelKey: string;
        payload: Prisma.JsonValue;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
    }[]>;
    ack(id: string, ok: boolean, error?: string): Promise<void>;
}
