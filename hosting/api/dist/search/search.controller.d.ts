import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import type { AuthUser } from '../common/request-context';
import { SupportTicketsService } from '../support-tickets/tickets.service';
import { DiscordLiveService } from '../discord/discord-live.service';
declare const q: z.ZodObject<{
    q: z.ZodString;
}, "strip", z.ZodTypeAny, {
    q: string;
}, {
    q: string;
}>;
interface Hit {
    type: string;
    id: string;
    label: string;
    sub?: string;
}
/**
 * Globale Suche. Jede Entitätsart wird nur durchsucht, wenn der Benutzer die View-Permission besitzt –
 * ohne Berechtigung wird nicht einmal die Anfrage an die Tabelle gestellt (keine Existenz-Leaks).
 */
export declare class SearchController {
    private readonly prisma;
    private readonly perms;
    private readonly tickets;
    private readonly live;
    constructor(prisma: PrismaService, perms: PermissionService, tickets: SupportTicketsService, live: DiscordLiveService);
    search(u: AuthUser, { q: term }: z.infer<typeof q>): Promise<{
        results: Hit[];
    }>;
}
export {};
