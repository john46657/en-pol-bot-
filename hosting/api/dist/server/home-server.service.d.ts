import { type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
/**
 * Der eine Discord-Server dieses Systems (siehe guild-context.ts). Hält den gespeicherten Teil (Einstellung „Discord-Server-ID“
 * bzw. der einzige Server des Bots) aktuell – beim Start, alle 60 s und direkt nach dem Speichern der Einstellungen.
 */
export declare class HomeServerService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly log;
    private timer?;
    private warned;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    /** Gespeicherten Server neu bestimmen und zurückgeben (`DISCORD_GUILD_ID` hat immer Vorrang). */
    refresh(): Promise<string | null>;
}
