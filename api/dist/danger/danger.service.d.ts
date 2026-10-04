import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
export declare const DANGER_LEVELS: readonly ["GREEN", "YELLOW", "RED"];
export type DangerLevel = (typeof DANGER_LEVELS)[number];
export interface DangerState {
    level: DangerLevel;
    reason: string | null;
    setByName: string | null;
    at: string | null;
}
/** Aktueller Gefahrenstatus (Grün/Gelb/Rot). Änderungen sind auditiert, gehen live an die Leitstelle und als Discord-Meldung raus. */
export declare class DangerService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService, discord: DiscordService);
    get(): Promise<DangerState>;
    set(actor: Actor, level: DangerLevel, reason?: string): Promise<DangerState>;
}
