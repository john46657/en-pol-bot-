import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadConfigService } from './cad-config.service';
import { CadNotifyService } from './cad-notify.service';
import type { CadActor } from './cad.service';
/** Was bei einer Übergabe festgehalten wird (nur Anzeige – Labels sind schon aufgelöst). */
export interface HandoverSnapshot {
    incidents: {
        id: string;
        number: string;
        title: string;
        status: string;
        priority: string;
        location: string | null;
        units: string[];
        createdAt: string;
    }[];
    confidentialIncidents: number;
    units: {
        id: string;
        callsign: string;
        name: string | null;
        status: string;
        incident: string | null;
    }[];
    calls: {
        id: string;
        callNumber: number;
        description: string | null;
        location: string | null;
        status: string;
        startedAt: string;
    }[];
    changes: {
        incident: string;
        text: string;
        createdAt: string;
    }[];
}
/**
 * Schichtübergabe der Leitstelle: Der abgebende Disponent hält den aktuellen Stand fest und schreibt Notizen;
 * die nächste Schicht bestätigt die Übernahme. Beides wird mit Benutzer und Zeit gespeichert (Audit + Discord, falls eingestellt).
 */
export declare class CadHandoverService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly cfg;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService, cfg: CadConfigService, notify: CadNotifyService);
    /** Aktueller Stand für eine neue Übergabe; „Letzte Statusänderungen“ seit der vorigen Übergabe (höchstens 12 Stunden zurück). */
    snapshot(): Promise<HandoverSnapshot>;
    private names;
    list(take?: number): Promise<{
        snapshot: HandoverSnapshot;
        createdByName: string | null;
        acknowledgedByName: string | null;
        id: string;
        createdAt: Date;
        guildId: string | null;
        createdById: string | null;
        notes: string;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }[]>;
    /** Entwurf: aktueller Stand + die letzte Übergabe (Notizen des vorigen Disponenten). */
    draft(): Promise<{
        snapshot: HandoverSnapshot;
        previous: {
            snapshot: HandoverSnapshot;
            createdByName: string | null;
            acknowledgedByName: string | null;
            id: string;
            createdAt: Date;
            guildId: string | null;
            createdById: string | null;
            notes: string;
            acknowledgedById: string | null;
            acknowledgedAt: Date | null;
            ackNote: string | null;
        } | null;
    }>;
    create(actor: CadActor, notes: string): Promise<{
        id: string;
        createdAt: Date;
        guildId: string | null;
        createdById: string | null;
        notes: string;
        snapshot: Prisma.JsonValue;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }>;
    /** Übernahme bestätigen: einmal und nur von jemand anderem als dem abgebenden Disponenten. */
    acknowledge(actor: CadActor, id: string, note?: string | null): Promise<{
        id: string;
        createdAt: Date;
        guildId: string | null;
        createdById: string | null;
        notes: string;
        snapshot: Prisma.JsonValue;
        acknowledgedById: string | null;
        acknowledgedAt: Date | null;
        ackNote: string | null;
    }>;
}
