import { type CadEvent } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CadConfigService } from './cad-config.service';
/**
 * Überträgt CAD-Ereignisse nach Discord. Zielkanäle kommen ausschließlich aus der Konfiguration:
 * 1. Kanalzuordnungen (CAD-Einstellungen → Discord) des Heimat-Servers des Ereignisses,
 * 2. aktive Server-Verbindungen, deren Datenart das Ereignis erlaubt (Kanäle der Verbindung + Zuordnungen des Ziel-Servers).
 * Nichts ist hartcodiert; ohne Konfiguration wird nichts gesendet.
 */
export declare class CadNotifyService {
    private readonly prisma;
    private readonly discord;
    private readonly cfg;
    private readonly rt;
    constructor(prisma: PrismaService, discord: DiscordService, cfg: CadConfigService, rt: RealtimeService);
    targets(event: CadEvent, guildId: string | null): Promise<{
        channelIds: string[];
        pingRoleIds: string[];
        linkedGuilds: string[];
    }>;
    /** Best effort: Fehler beim Benachrichtigen stören den Fachprozess nie. */
    emit(event: CadEvent, payload: Record<string, unknown>, guildId: string | null): Promise<{
        channelIds: string[];
        pingRoleIds: string[];
        linkedGuilds: string[];
    } | null>;
}
