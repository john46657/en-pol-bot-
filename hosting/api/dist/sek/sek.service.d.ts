import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
export interface SekTarget {
    userId?: string;
    discordId?: string;
}
/** SEK (Spezialeinsatzkommando): Roster und Einsatzberichte (nur Mitglieder). Bewerbungen laufen über die Qualifikationen. */
export declare class SekService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    private resolve;
    private people;
    isMember(userId: string): Promise<boolean>;
    me(userId: string): Promise<{
        member: boolean;
    }>;
    members(): Promise<{
        since: Date;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        userId: string;
    }[]>;
    /** Wer hinzugefügt werden kann: alle aktiven Benutzer, die noch nicht im SEK sind (mit Dienstnummer/Dienstgrad, falls vorhanden). */
    candidates(): Promise<{
        userId: string;
        name: string;
        username: string;
        callsign: string | null;
        rank: string | null;
        discordLinked: boolean;
    }[]>;
    addMember(actor: Actor, t: SekTarget): Promise<{
        userId: string;
        displayName: string;
        member: boolean;
    }>;
    removeMember(actor: Actor, t: SekTarget): Promise<{
        userId: string;
        displayName: string;
        member: boolean;
    }>;
    reports(limit: number): Promise<{
        authorName: string;
        authorCallsign: string | null;
        number: string;
        id: string;
        createdAt: Date;
        description: string;
        authorId: string;
        occurredAt: Date;
        missionType: string;
    }[]>;
    createReport(actor: Actor, d: {
        occurredAt?: Date;
        missionType: string;
        description: string;
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        description: string;
        authorId: string;
        occurredAt: Date;
        missionType: string;
    }>;
}
