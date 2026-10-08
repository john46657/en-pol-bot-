import { type AirMode, type AirStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadNotifyService } from './cad-notify.service';
import type { CadActor } from './cad.service';
/**
 * Luftunterstützung (Hubschrauber) und Gebäudekameras. ER:LC hat für beides keine API: der Hubschrauber wird im Spiel
 * gerufen, Kameras schaut man im Spiel an – die Leitstelle koordiniert hier Anforderung, Rückmeldung und Kamerapunkte.
 */
export declare class CadAirService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly rt;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, rt: RealtimeService, notify: CadNotifyService);
    private name;
    private changed;
    /** Offene und die letzten erledigten Anforderungen (mit Einsatznummer). */
    list(): Promise<{
        incident: {
            number: string;
            id: string;
            title: string;
        } | null;
        number: number;
        id: string;
        createdAt: Date;
        discordId: string | null;
        updatedAt: Date;
        guildId: string | null;
        status: string;
        mode: string;
        incidentId: string | null;
        authorId: string | null;
        note: string | null;
        target: string | null;
        requestedBy: string | null;
        handledBy: string | null;
    }[]>;
    request(actor: CadActor, d: {
        mode: AirMode;
        target?: string | null;
        note?: string | null;
        incidentId?: string | null;
        incidentNumber?: string | null;
    }): Promise<{
        incident: {
            id: string;
            number: string;
            guildId: string | null;
        } | null;
        number: number;
        id: string;
        createdAt: Date;
        discordId: string | null;
        updatedAt: Date;
        guildId: string | null;
        status: string;
        mode: string;
        incidentId: string | null;
        authorId: string | null;
        note: string | null;
        target: string | null;
        requestedBy: string | null;
        handledBy: string | null;
    }>;
    /** Rückmeldung: Leitstelle (cad.assign_unit) übernimmt/erledigt; der Anforderer darf seine eigene abbrechen. */
    setStatus(actor: CadActor, id: string, status: AirStatus): Promise<{
        number: number;
        id: string;
        createdAt: Date;
        discordId: string | null;
        updatedAt: Date;
        guildId: string | null;
        status: string;
        mode: string;
        incidentId: string | null;
        authorId: string | null;
        note: string | null;
        target: string | null;
        requestedBy: string | null;
        handledBy: string | null;
    }>;
    /** Gebäudekameras aus ER:LC als Kartenpunkte (Ebene „cameras“) anlegen – nur fehlende, ohne Position. */
    addDefaultCameras(actor: CadActor): Promise<{
        added: number;
    }>;
}
