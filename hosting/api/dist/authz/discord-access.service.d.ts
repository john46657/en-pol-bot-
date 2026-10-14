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
/** `roles` = Discord-Rollen auf dem Server (Zugangsprüfung), `byGuild` = dieselben Rollen mit Server-ID (für den Rollenabgleich). */
export type Membership = {
    roles: string[];
    byGuild: Record<string, string[]>;
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
    /** Mitglied auf dem Discord-Server dieses Systems? `null` = nein, `unknown` = nicht prüfbar. */
    membership(discordId: string): Promise<Membership>;
    private bot;
    /**
     * Discord-Server dieses Systems. Ist noch keiner eingerichtet, gilt der Server des Bots – aber nur, wenn es genau einer ist
     * (sonst wäre unklar, wo geprüft wird). `null` = Discord nicht erreichbar bzw. kein eindeutiger Server.
     */
    private guildId;
    /** Server-Mitglieder per Name suchen (Discord: Benutzer- oder Servername beginnt mit `query`). Ohne Token/Discord: leer. */
    searchMembers(query: string, limit?: number): Promise<{
        id: string;
        username: string;
        displayName: string;
        avatar: string | null;
    }[]>;
    private readonly avatarCache;
    /** Profilbilder zu Discord-IDs (Discord-API, 6 h zwischengespeichert). Ohne Token/Discord: leer. */
    avatars(ids: string[]): Promise<Map<string, string | null>>;
    /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
    verdict(member: {
        roles: string[];
    } | null, s: DiscordLoginSettings): AccessVerdict;
    /**
     * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor `discordRoleIds`, ältere Zuordnungsliste der
     * Einstellungen). Über Discord vergebene Zuweisungen merken sich den Discord-Server (`UserRole.guildIds`), damit der Abgleich
     * sie wieder entziehen kann; manuell vergebene Rollen (ohne Server) und „System Administrator“ bleiben unangetastet.
     * `byGuild` enthält höchstens den Discord-Server dieses Systems (Rollen anderer Server werden ignoriert).
     */
    syncRoles(userId: string, byGuild: Record<string, string[]>, s?: DiscordLoginSettings): Promise<void>;
    /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
    remember(userId: string, ok: boolean): void;
    forget(userId?: string): void;
    /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
    verify(userId: string, force?: boolean): Promise<boolean>;
    private check;
    /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
    sweep(): Promise<void>;
}
