import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
/** `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied). */
export interface DiscordLoginSettings {
    signup: boolean;
    requireGuild: boolean;
    roleMap: {
        discordRoleId: string;
        role: string;
    }[];
    teamRoleIds: string[];
}
export declare const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings;
export type Membership = {
    roles: string[];
} | null | 'unknown';
export type AccessVerdict = 'ok' | 'not_member' | 'no_team_role';
/**
 * Discord-Rollen → Dashboard-Zugang und Dashboard-Rollen. Wird beim Login geprüft und danach laufend:
 * bei Anfragen (spätestens alle 2 Minuten je Benutzer) und im Hintergrund alle 5 Minuten.
 * Verliert jemand die freigeschaltete Discord-Rolle, werden seine Sessions sofort beendet; gewonnene/verlorene
 * verknüpfte Rollen werden vergeben bzw. entzogen. Ist Discord nicht erreichbar, bleibt der letzte Stand.
 */
export declare class DiscordAccessService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly env;
    private readonly log;
    private readonly checked;
    private readonly inflight;
    private timer?;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    isOwnerId(discordId: string): boolean;
    settings(): Promise<DiscordLoginSettings>;
    /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
    membership(discordId: string): Promise<Membership>;
    private bot;
    /** Eingestellte Server bzw. alle Server des Bots (max. 20); `null` = Discord nicht erreichbar. */
    private guildIds;
    /** Server-Mitglieder per Name suchen (Discord: Benutzer- oder Servername beginnt mit `query`). Ohne Token/Discord: leer. */
    searchMembers(query: string, limit?: number): Promise<{
        id: string;
        username: string;
        displayName: string;
        avatar: string | null;
    }[]>;
    /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
    verdict(member: {
        roles: string[];
    } | null, s: DiscordLoginSettings): AccessVerdict;
    /**
     * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor) und die ältere Zuordnungsliste (Einstellungen).
     * Vergeben/entzogen werden nur Rollen, die überhaupt mit Discord verknüpft sind; manuell vergebene Rollen bleiben.
     */
    syncRoles(userId: string, discordRoles: string[], s?: DiscordLoginSettings): Promise<void>;
    /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
    remember(userId: string, ok: boolean): void;
    forget(userId?: string): void;
    /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
    verify(userId: string, force?: boolean): Promise<boolean>;
    private check;
    /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
    sweep(): Promise<void>;
}
