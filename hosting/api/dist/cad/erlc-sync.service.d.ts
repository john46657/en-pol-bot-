import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { ErlcSnapshot } from './erlc.service';
/**
 * Personen und Fahrzeuge aus der ER:LC-API ins System übernehmen (bei jedem erfolgreichen Abruf):
 * Spieler → Personenakte (Roblox-Name + ID), gespawnte Fahrzeuge mit Kennzeichen → Fahrzeugregister (Halter über den Roblox-Namen).
 * Es wird nur geschrieben, was neu ist oder sich geändert hat; von Hand gepflegte Angaben (Notizen, Status) bleiben unberührt.
 */
export declare class ErlcSyncService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly rt;
    private readonly log;
    /** Letzter Stand je Server – unveränderte Abrufe kosten keine Datenbank-Abfrage. */
    private readonly last;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, rt: RealtimeService);
    /** `guildId`: Discord-Server des ER:LC-Servers → Akten-Bereich (Server-Verbund); ohne = gemeinsamer Bestand. */
    sync(serverId: string, snap: ErlcSnapshot, guildId?: string | null): Promise<{
        persons: number;
        vehicles: number;
    }>;
    /** Wer/was gerade auf den ER:LC-Servern ist (letzter Abruf), mit Verweis auf die Akte. `guildId`: nur Server dieses Discord-Servers. */
    live(kind: 'persons' | 'vehicles', guildId?: string | null): Promise<{
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            personId: string | null;
            serverName: string;
            name: string;
            robloxUserId: string | null;
            team: string | null;
            callsign: string | null;
            wantedStars: number;
        }[];
    } | {
        servers: {
            id: string;
            name: string;
            status: string;
            lastSyncAt: Date | null;
        }[];
        items: {
            vehicleId: string | null;
            ownerPersonId: string | null;
            serverName: string;
            name: string;
            owner: string;
            plate: string | null;
            colorName: string | null;
            colorHex: string | null;
        }[];
    }>;
}
