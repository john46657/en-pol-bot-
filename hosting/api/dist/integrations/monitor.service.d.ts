import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notifications/notify.service';
import { AuditService, type Actor } from '../audit/audit.service';
export type MonitorSource = 'ERLC' | 'ERLC_STEP' | 'BACKUP' | 'OUTBOX';
export declare const monitorConfigSchema: z.ZodObject<{
    /** Alarm, wenn eine Störung so lange ununterbrochen anhält (Minuten) … */
    alertAfterMinutes: z.ZodDefault<z.ZodNumber>;
    /** … oder so oft hintereinander aufgetreten ist */
    alertAfterFailures: z.ZodDefault<z.ZodNumber>;
    /** Discord-Nachrichten gelten als hängend, wenn sie so lange nicht abgeholt wurden (Minuten) */
    outboxStaleMinutes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    alertAfterMinutes: number;
    alertAfterFailures: number;
    outboxStaleMinutes: number;
}, {
    alertAfterMinutes?: number | undefined;
    alertAfterFailures?: number | undefined;
    outboxStaleMinutes?: number | undefined;
}>;
export type MonitorConfig = z.infer<typeof monitorConfigSchema>;
/**
 * Technische Überwachung: offene Störungen je Quelle (ER:LC-Server, einzelne Verarbeitungsschritte, Backups, Discord-Ausgang)
 * dauerhaft protokollieren. Wiederholte Fehler derselben Quelle werden zusammengefasst; hält eine Störung an, werden die
 * Administratoren (Recht `integrations.view`) benachrichtigt und – falls eingerichtet – der Logging-Kanal in Discord.
 * Erholt sich die Quelle, wird die Störung als behoben markiert (bleibt im Protokoll).
 */
export declare class MonitorService {
    private readonly prisma;
    private readonly notify;
    private readonly audit;
    private readonly log;
    constructor(prisma: PrismaService, notify: NotifyService, audit: AuditService);
    config(): Promise<MonitorConfig>;
    saveConfig(actor: Actor, c: MonitorConfig): Promise<{
        alertAfterMinutes: number;
        alertAfterFailures: number;
        outboxStaleMinutes: number;
    }>;
    private where;
    /**
     * Fehler melden: offene Störung derselben Quelle hochzählen oder neu anlegen. `immediate` = sofort alarmieren (z. B. fehlgeschlagenes Backup).
     * Fehler hier stören nie den Fachprozess.
     */
    failure(source: MonitorSource, sourceId: string | null, sourceName: string | null, step: string | null, message: string, details?: Record<string, unknown>, immediate?: boolean): Promise<{
        count: number;
        message: string;
        id: string;
        status: string;
        source: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        details: Prisma.JsonValue | null;
        sourceId: string | null;
        sourceName: string | null;
        step: string | null;
        firstAt: Date;
        lastAt: Date;
        resolvedAt: Date | null;
        alertedAt: Date | null;
    } | null>;
    /** Quelle wieder in Ordnung: offene Störung(en) als behoben markieren. Ohne `step` nur die Störung der Quelle selbst. */
    recovered(source: MonitorSource, sourceId: string | null, step?: string | null): Promise<number>;
    /** Alarmschwelle erreicht (Dauer oder Anzahl) und noch nicht alarmiert? */
    checkAlert(id: string, now?: Date): Promise<boolean>;
    /** Administratoren benachrichtigen (einmal je Störung) und im Audit-Log festhalten (→ Discord-Logging, falls eingerichtet). */
    private alert;
    /** Regelmäßig (aus dem Planer): Alarmschwellen nach Dauer prüfen und hängende Discord-Nachrichten erkennen. */
    sweep(now?: Date): Promise<void>;
    events(q: {
        status?: string;
        source?: string;
        take?: number;
    }): Promise<{
        acknowledgedByName: string | null;
        count: number;
        message: string;
        id: string;
        status: string;
        source: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        details: Prisma.JsonValue | null;
        sourceId: string | null;
        sourceName: string | null;
        step: string | null;
        firstAt: Date;
        lastAt: Date;
        resolvedAt: Date | null;
        alertedAt: Date | null;
    }[]>;
    /** Störung zur Kenntnis genommen (bleibt offen, bis die Quelle sich erholt – quittiert heißt nicht behoben). */
    acknowledge(actor: Actor, id: string): Promise<{
        count: number;
        message: string;
        id: string;
        status: string;
        source: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        details: Prisma.JsonValue | null;
        sourceId: string | null;
        sourceName: string | null;
        step: string | null;
        firstAt: Date;
        lastAt: Date;
        resolvedAt: Date | null;
        alertedAt: Date | null;
    }>;
}
