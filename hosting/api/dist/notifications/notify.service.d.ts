import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
export interface NotifyInput {
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
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
}
