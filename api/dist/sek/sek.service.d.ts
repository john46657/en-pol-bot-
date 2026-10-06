import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
export interface SekTarget {
    userId?: string;
    discordId?: string;
}
/** SEK (Spezialeinsatzkommando): Roster, Einsatzberichte (nur Mitglieder) und Bewerbungen (Annahme → Aufnahme ins Roster). */
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
        openApplication: {
            number: string;
            createdAt: Date;
        } | null;
    }>;
    members(): Promise<{
        since: Date;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        userId: string;
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
    applications(status?: string): Promise<{
        applicant: {
            displayName: string;
            callsign: string | null;
            rank: string | null;
        };
        decidedByName: string | null;
        number: string;
        id: string;
        userId: string;
        createdAt: Date;
        status: string;
        experience: string | null;
        motivation: string;
        decidedById: string | null;
        serviceTime: string;
        decidedAt: Date | null;
    }[]>;
    apply(actor: Actor, d: {
        serviceTime: string;
        motivation: string;
        experience?: string;
    }): Promise<{
        number: string;
        status: string;
    }>;
    decide(actor: Actor, id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<{
        id: string;
        number: string;
        status: "REJECTED" | "ACCEPTED";
    }>;
}
