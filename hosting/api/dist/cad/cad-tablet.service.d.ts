import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { CadConfigService } from './cad-config.service';
import type { CadActor } from './cad.service';
type Availability = 'available' | 'busy' | 'unavailable';
/**
 * „Tablet“ der Leitstelle – wie das Polizei-Tablet in ER:LC: Meldungen (offene Notrufe), Aktivitätsbrett
 * (Polizisten im Spiel bzw. im Dienst mit Rufname, Rang, Dienstzeit, Verfügbarkeit), Gesucht und Auto-BOLOs.
 */
export declare class CadTabletService {
    private readonly prisma;
    private readonly perms;
    private readonly cfg;
    constructor(prisma: PrismaService, perms: PermissionService, cfg: CadConfigService);
    get(actor: CadActor): Promise<{
        calls: {
            id: string;
            callNumber: number;
            description: string | null;
            location: string | null;
            status: string;
            startedAt: string;
        }[];
        board: {
            key: string;
            name: string;
            callsign: string | null;
            rank: string | null;
            since: string | null;
            unitId: string | null;
            status: string | null;
            statusLabel: string | null;
            statusColor: string | null;
            availability: Availability;
            inGame: boolean;
        }[];
        available: number;
        me: {
            unitId: string;
            callsign: string;
            status: string;
            availability: Availability;
        } | null;
        statuses: {
            available: string | null;
            unavailable: string | null;
        };
        wanted: {
            id: string;
            name: string;
            reason: string;
            priority: string;
            since: string;
        }[];
        bolos: {
            id: string;
            plate: string;
            model: string | null;
            color: string | null;
            reason: string;
            priority: string;
            since: string;
        }[];
        inGameWanted: {
            name: string;
            stars: number;
            location: string | null;
        }[];
        wantedAllowed: boolean;
    }>;
}
export {};
