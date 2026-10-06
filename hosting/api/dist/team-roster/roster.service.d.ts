import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordLiveService, type LiveMember } from '../discord/discord-live.service';
import { DiscordService } from '../discord/discord.service';
export interface TeamStructure {
    teams: string[];
    ranks: string[];
    offices: string[];
}
export interface RosterMember {
    key: string;
    userId: string | null;
    discordId: string | null;
    name: string;
    username: string | null;
    avatar: string | null;
    team: string | null;
    rank: string | null;
    office: string | null;
    serviceNumber: string | null;
    callsign: string | null;
    status: LiveMember['status'];
    joinedAt: string | null;
    discordRoles: string[];
}
/**
 * Teamliste: Personalakten (Team, Dienstgrad, Büro, Dienstnummer) + Discord-Teammitglieder (Avatar, Name, Online-Status).
 * Enthält bewusst KEINE Voice-Informationen – die liefert ausschließlich `/team/voice`.
 */
export declare class RosterService {
    private readonly prisma;
    private readonly live;
    private readonly discord;
    private readonly perms;
    constructor(prisma: PrismaService, live: DiscordLiveService, discord: DiscordService, perms: PermissionService);
    /** Teams, Dienstgrade und Büros: aus den Einstellungen, ergänzt um Werte, die in Personalakten vorkommen. */
    /** Server-Einstellung, sonst die gemeinsame. */
    private setting;
    structure(): Promise<TeamStructure>;
    roster(): Promise<{
        members: RosterMember[];
        structure: TeamStructure;
        discordUpdatedAt: Date | null;
        generatedAt: Date;
    }>;
    /** Profil eines Teammitglieds. Discord-ID, Rollen und Beitrittsdatum nur mit `personnel.view` oder `users.view`. */
    profile(viewerId: string, key: string): Promise<{
        discordId: string | null;
        discordRoles: string[];
        joinedAt: string | null;
        personnelId: string | null;
        detailed: boolean;
        key: string;
        userId: string | null;
        name: string;
        username: string | null;
        avatar: string | null;
        team: string | null;
        rank: string | null;
        office: string | null;
        serviceNumber: string | null;
        callsign: string | null;
        status: LiveMember["status"];
    }>;
    /** Voice-Channels mit Personen (eigenes Widget, getrennt von der Teamliste). */
    voice(): {
        channels: import("../discord/discord-live.service").LiveVoiceChannel[];
        updatedAt: Date | null;
    };
    activity(limit: number): import("../discord/discord-live.service").TeamChange[];
    /** „Jetzt aktualisieren“: den Bot um einen sofortigen Bericht bitten (er meldet sonst ohnehin alle 60 Sekunden). */
    requestSync(): Promise<void>;
}
