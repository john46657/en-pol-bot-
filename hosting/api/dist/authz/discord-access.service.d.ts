import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
/**
 * `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied).
 * `guildAdmins`: wer auf einem Server das Discord-Recht „Administrator“ hat (oder Besitzer ist), kommt immer rein und ist
 * Server-Administrator genau dieses Servers.
 */
export interface DiscordLoginSettings {
    signup: boolean;
    requireGuild: boolean;
    roleMap: {
        discordRoleId: string;
        role: string;
    }[];
    teamRoleIds: string[];
    guildAdmins: boolean;
}
export declare const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings;
/**
 * Anmelde-Einstellungen JE SERVER (`auth.discord@<Server>`): Teamrollen, Rollen-Zuordnung, Discord-Admins und Registrierung
 * gelten nur für den eigenen Server. `base` = gemeinsamer Grundwert (Server ohne eigene Einstellung, „Nur Mitglieder“).
 */
export interface LoginPolicy {
    base: DiscordLoginSettings;
    byGuild: Record<string, DiscordLoginSettings>;
}
/**
 * `roles` = alle Discord-Rollen (Zugangsprüfung), `byGuild` = Rollen je geprüftem Server (Mitglied), `checked` = geprüfte Server,
 * `admin` = Server, auf denen die Person das Discord-Recht „Administrator“ hat oder Besitzer ist.
 */
export type Membership = {
    roles: string[];
    byGuild: Record<string, string[]>;
    checked: string[];
    admin?: string[];
} | null | 'unknown';
/** Rolle, die Discord-Administratoren eines Servers bekommen (Rechte nur auf diesem Server). */
export declare const SERVER_ADMIN_ROLE = "Server-Administrator";
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
    private readonly guildInfo;
    private timer?;
    private resyncTimer?;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    isOwnerId(discordId: string): boolean;
    /** Gemeinsamer Grundwert – unabhängig vom gewählten Server der Anfrage. */
    settings(): Promise<DiscordLoginSettings>;
    /** Einstellungen der angegebenen Server: eigener Wert des Servers (bzw. seiner Gruppe), sonst der Grundwert. */
    policy(guildIds: string[]): Promise<LoginPolicy>;
    /** Server, auf denen die Mitgliedschaft Zugang gibt (Teamrolle des Servers, Discord-Admin des Servers oder keine Teamrollen dort). */
    grantingGuilds(member: {
        byGuild: Record<string, string[]>;
        admin?: string[];
    }, p: LoginPolicy): string[];
    /** Sind irgendwo Teamrollen Pflicht? Dann kommt ohne Server-Mitgliedschaft niemand rein. */
    teamRolesRequired(p: LoginPolicy): boolean;
    /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
    membership(discordId: string): Promise<Membership>;
    /** Besitzer und Rollen mit dem Discord-Recht „Administrator“ (die @everyone-Rolle hat die ID des Servers); `null` = nicht lesbar. */
    private guildAdmins;
    private bot;
    /** Eingestellte und registrierte Server bzw. alle Server des Bots (max. 20); `null` = Discord nicht erreichbar. */
    private guildIds;
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
        byGuild: Record<string, string[]>;
        admin?: string[];
    } | null, p: LoginPolicy): AccessVerdict;
    /**
     * Mitgliedschaften je registriertem Server festhalten: geprüft und Mitglied → MEMBER (mit Discord-Rollen), geprüft und
     * nicht Mitglied → LEFT. Manuelle Mitgliedschaften (Konten ohne Discord) bleiben unangetastet.
     */
    recordMemberships(userId: string, byGuild: Record<string, string[]>, checked: string[]): Promise<void>;
    /**
     * Discord-Rolle → Dashboard-Rolle, JE SERVER: verknüpfte Rollen (Rollen-Editor `discordRoleIds`, Zuordnungstabelle
     * `DiscordRoleMapping`, ältere Zuordnungsliste der Einstellungen). Die Zuweisung merkt sich, auf welchen Servern sie gilt
     * (`UserRole.guildIds`) – eine Discord-Rolle auf Server A verleiht nie Rechte auf Server B. Nur die in `byGuild`/`checked`
     * geprüften Server werden geändert; Rollen ohne Discord-Verknüpfung und „System Administrator“ bleiben unangetastet.
     */
    syncRoles(userId: string, byGuild: Record<string, string[]>, p?: LoginPolicy, checked?: string[], adminGuilds?: string[]): Promise<void>;
    /** Rolle „Server-Administrator“ (alle Rechte, nur auf diesem Server) für registrierte Server anlegen, falls es sie noch nicht gibt. */
    private ensureServerAdminRoles;
    /**
     * Vom Administrator ausdrücklich eingestellte Haupt-Server (DISCORD_GUILD_ID bzw. Einstellung „Discord-Server-ID“) sind
     * automatisch registriert und aktiv – andere vom Bot entdeckte Server müssen ein globaler Systemadministrator freischalten.
     */
    ensureConfiguredServers(): Promise<void>;
    /**
     * Discord-Verknüpfung einer Rolle geändert (Rollen-Editor): nicht bis zum nächsten Abgleich warten – jede nächste Anfrage
     * gleicht neu ab, und alle angemeldeten Benutzer werden kurz danach im Hintergrund geprüft.
     */
    resyncSoon(): void;
    /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
    remember(userId: string, ok: boolean): void;
    forget(userId?: string): void;
    /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
    verify(userId: string, force?: boolean): Promise<boolean>;
    private check;
    /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
    sweep(): Promise<void>;
}
