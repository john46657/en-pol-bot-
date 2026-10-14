import { type CadEvent } from '@enrp/shared';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadConfigService } from './cad-config.service';
/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration (CAD-Einstellungen → Discord).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet. Zuordnungen, die noch auf einen anderen Discord-Server
 * zeigen (aus der früheren Multi-Server-Zeit), werden nicht mehr bedient.
 */
export declare class CadNotifyService {
    private readonly discord;
    private readonly cfg;
    private readonly rt;
    constructor(discord: DiscordService, cfg: CadConfigService, rt: RealtimeService);
    targets(event: CadEvent): Promise<{
        channelIds: string[];
        pingRoleIds: string[];
    }>;
    /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
    emit(event: CadEvent, payload: Record<string, unknown>): Promise<{
        channelIds: string[];
        pingRoleIds: string[];
    } | null>;
}
