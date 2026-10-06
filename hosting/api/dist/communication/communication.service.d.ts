import { NotifyService } from '../notifications/notify.service';
import { PermissionService } from '../authz/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
export declare const CHANNELS: readonly ["TEAM", "DISPATCH", "INCIDENT", "SUPERVISOR", "ANNOUNCEMENT"];
export type Channel = (typeof CHANNELS)[number];
export declare class CommunicationService {
    private readonly prisma;
    private readonly perms;
    private readonly audit;
    private readonly discord;
    private readonly notify;
    constructor(prisma: PrismaService, perms: PermissionService, audit: AuditService, discord: DiscordService, notify: NotifyService);
    /** Berechtigung wird serverseitig geprüft – auch für spätere WebSocket-Subscriptions (gleiche Methode). */
    canRead(userId: string, channel: Channel): Promise<boolean>;
    private conversation;
    list(actor: Actor, channel: Channel, entityId?: string, q?: string): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }[]>;
    post(actor: Actor, channel: Channel, d: {
        body: string;
        entityId?: string;
        replyToId?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }>;
    moderate(actor: Actor, id: string, action: 'pin' | 'unpin' | 'delete'): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }>;
}
