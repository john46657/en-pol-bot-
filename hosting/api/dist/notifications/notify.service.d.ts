import { type NotificationPrefs } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
export interface NotifyInput {
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
}
/** Benachrichtigung über den zentralen Ereigniskatalog (`NOTIFICATION_EVENTS`). */
export interface EmitInput {
    title: string;
    /** Text im Dashboard. Sensible Inhalte nur hier – nie in `dmText`, wenn sie nicht in eine DM gehören. */
    body?: string;
    /** Relativer Link zum Datensatz, z. B. `/shiftplan?id=…` */
    link?: string;
    entityType?: string;
    entityId?: string;
    /** Anlass – zusammen mit dem Ereignis und dem Empfänger eindeutig: dieselbe Benachrichtigung kommt nie doppelt. */
    dedupeKey?: string;
    /** Text der Discord-DM (nur bei Zustimmung des Empfängers). Standard: Titel + Link, ohne `body`. */
    dmText?: string;
    /** false: keine DM (z. B. wenn der Fachprozess schon selbst eine DM schickt) */
    dm?: boolean;
}
/**
 * Persönliche Benachrichtigungen: speichern + sofort an offene Dashboards melden (Popup).
 * Welche Arten jemand sehen will, stellt jeder selbst ein (ausgeblendete Arten filtert die Liste).
 * Fehler beim Benachrichtigen dürfen den Fachprozess nie stören.
 */
export declare class NotifyService {
    private readonly prisma;
    private readonly rt;
    private readonly log;
    constructor(prisma: PrismaService, rt: RealtimeService);
    notify(userIds: string[], n: NotifyInput): Promise<void>;
    /** Aktive Benutzer mit einem Recht (im angegebenen Server bzw. serverübergreifend), ohne `exceptUserId`. Gebündelt: 5 Abfragen insgesamt. */
    usersWith(permission: string, opts?: {
        guildId?: string | null;
        exceptUserId?: string | null;
    }): Promise<string[]>;
    notifyPermission(permission: string, n: NotifyInput, opts?: {
        guildId?: string | null;
        exceptUserId?: string | null;
    }): Promise<void>;
    /** Persönliche Benachrichtigungs-Einstellungen (UserSettings.preferences.notifications). */
    prefsOf(userIds: string[]): Promise<Map<string, NotificationPrefs>>;
    /** Vom Administrator abgeschaltete Ereignisse (notifications.manage). */
    disabledEvents(): Promise<string[]>;
    /**
     * Zentrale Zustellung für Dashboard, MDT, Leitstelle und Discord: speichert je Empfänger (außer stummgeschaltet),
     * meldet offene Dashboards sofort, schickt eine DM nur mit Zustimmung des Empfängers. Mit `dedupeKey` kommt dieselbe
     * Benachrichtigung nie doppelt (auch nicht als DM) – z. B. wenn Dashboard und Discord gleichzeitig dieselbe Aktion auslösen.
     * Fehler stören den Fachprozess nie. Liefert die Anzahl neu gespeicherter Benachrichtigungen.
     */
    emit(event: string, userIds: string[], n: EmitInput): Promise<number>;
    /** Wie `emit`, an alle mit einem Recht (im Server der Anfrage). */
    emitPermission(event: string, permission: string, n: EmitInput, opts?: {
        guildId?: string | null;
        exceptUserId?: string | null;
    }): Promise<number>;
}
