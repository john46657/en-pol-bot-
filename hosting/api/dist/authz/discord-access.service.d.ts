import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
/** Automatische Dashboard-Rolle je Server für Discord-Administratoren (Name: „Discord-Admin · <Server>“). */
export declare const DISCORD_ADMIN_ROLE_PREFIX = "Discord-Admin";
/** Discord-Admins bekommen auf ihrem Server alle Rechte – außer Benutzerkonten zu verwalten (die gelten serverübergreifend). */
export declare const DISCORD_ADMIN_GRANTS: ("ticket.create" | "ticket.settings" | "ticket.delete" | "ticket.view" | "ticket.claim" | "ticket.close" | "ticket.reopen" | "ticket.add_user" | "ticket.remove_user" | "ticket.change_status" | "ticket.change_priority" | "ticket.change_category" | "ticket.rename" | "ticket.move" | "ticket.lock" | "ticket.escalate" | "ticket.transcript" | "ticket.transcript_delete" | "ticket.internal_notes" | "ticket.rate" | "ticket.manage" | "evidence.create" | "evidence.view" | "evidence.transfer" | "evidence.release" | "personnel.create" | "personnel.view" | "personnel.edit" | "personnel.promote" | "personnel.discipline" | "dispatch.create" | "dispatch.view" | "dispatch.close" | "dispatch.manage" | "dispatch.edit" | "dispatch.assign" | "wanted.create" | "wanted.view" | "wanted.edit" | "wanted.activate" | "wanted.clear" | "applications.view" | "applications.review" | "applications.decide" | "sek.report" | "sek.view" | "sek.manage" | "qualifications.view" | "qualifications.manage" | "qualifications.decide" | "tickets.create" | "tickets.view" | "tickets.edit" | "tickets.void" | "cad.radio" | "cad.view" | "cad.create_incident" | "cad.edit_incident" | "cad.close_incident" | "cad.assign_unit" | "cad.manage_units" | "cad.view_persons" | "cad.view_vehicles" | "cad.manage_map" | "cad.view_erlc" | "cad.manage_erlc" | "cad.erlc_command" | "cad.erlc_command_critical" | "cad.manage_cross_server" | "cad.view_logs" | "cad.manage_settings" | "roles.view" | "roles.manage" | "settings.view" | "settings.manage" | "teamchance.view" | "teamchance.manage" | "users.view" | "team.view" | "radio.view" | "dashboard.view" | "dashboard.applications.view" | "dashboard.tickets.view" | "dashboard.cad.view" | "dashboard.settings.view" | "dashboard.teamchance.view" | "dashboard.customize" | "dashboard.team.view" | "dashboard.offices.view" | "dashboard.voice.view" | "dashboard.radio.view" | "dashboard.logs.view" | "team.manage" | "incidents.create" | "incidents.delete" | "incidents.view" | "incidents.close" | "incidents.edit" | "persons.create" | "persons.view" | "persons.edit" | "persons.archive" | "persons.merge" | "vehicles.create" | "vehicles.view" | "vehicles.edit" | "vehicles.archive" | "reports.create" | "reports.view" | "reports.edit" | "reports.review" | "reports.archive" | "reports.submit" | "reports.approve" | "reports.reject" | "complaints.create" | "complaints.view" | "complaints.close" | "complaints.assign" | "complaints.investigate" | "complaints.resolve" | "investigations.create" | "investigations.view" | "investigations.close" | "investigations.edit" | "leave.view" | "leave.manage" | "leave.request" | "academy.view" | "academy.manage" | "radio.manage" | "communication.view" | "communication.send" | "communication.moderate" | "analytics.view" | "audit.view" | "audit.export" | "studio.view" | "studio.manage")[];
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
/** `adminGuilds`: Server, auf denen man Discord-Administrator ist (Besitzer oder eine Rolle mit dem Recht „Administrator“). */
export type Membership = {
    roles: string[];
    adminGuilds?: string[];
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
    private readonly guildMeta;
    private botGuildList?;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    isOwnerId(discordId: string): boolean;
    settings(): Promise<DiscordLoginSettings>;
    private bot;
    /** Alle Server des Bots (zwischengespeichert). `null` = nicht abrufbar. */
    private botGuilds;
    /** Besitzer und Rechte je Rolle eines Servers (zwischengespeichert). */
    private guildInfo;
    /** Discord-Administrator auf diesem Server? (Besitzer oder @everyone/eine eigene Rolle mit „Administrator“) */
    private isGuildAdmin;
    /**
     * Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar.
     * Zusätzlich: auf welchen Servern des Bots man Discord-Administrator ist – die kommen immer ins Dashboard ihres Servers.
     */
    membership(discordId: string, fresh?: boolean): Promise<Membership>;
    /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
    verdict(member: {
        roles: string[];
        adminGuilds?: string[];
    } | null, s: DiscordLoginSettings): AccessVerdict;
    /**
     * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor) und die ältere Zuordnungsliste (Einstellungen).
     * Vergeben/entzogen werden nur Rollen, die überhaupt mit Discord verknüpft sind; manuell vergebene Rollen bleiben.
     */
    syncRoles(userId: string, discordRoles: string[], s?: DiscordLoginSettings): Promise<void>;
    /**
     * Discord-Administratoren: je Server eine automatische Dashboard-Rolle („Discord-Admin · Server“, gilt nur dort) mit allen
     * Rechten außer `users.manage`. Wer auf einem Server nicht mehr Administrator ist, verliert die Rolle beim nächsten Abgleich.
     */
    syncAdminRoles(userId: string, adminGuilds: string[]): Promise<void>;
    /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
    remember(userId: string, ok: boolean): void;
    forget(userId?: string): void;
    /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
    verify(userId: string, force?: boolean): Promise<boolean>;
    private check;
    /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
    sweep(): Promise<void>;
}
