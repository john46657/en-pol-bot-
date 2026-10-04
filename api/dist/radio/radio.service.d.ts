import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
/** Funk-Freigabe: nur freigegebene Mitglieder gelten als funkberechtigt. Identifikation per Benutzer-ID oder verknüpfter Discord-ID. */
export declare class RadioService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    private resolve;
    list(): Promise<{
        userId: string;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        since: Date;
    }[]>;
    check(t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        whitelisted: boolean;
        displayName: string;
    }>;
    add(actor: Actor, t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        userId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
    remove(actor: Actor, t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        userId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
}
