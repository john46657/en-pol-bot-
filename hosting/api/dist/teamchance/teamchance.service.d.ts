import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { NotifyService } from '../notifications/notify.service';
export declare const teamChanceSchema: z.ZodEffects<z.ZodObject<{
    open: z.ZodBoolean;
    title: z.ZodString;
    description: z.ZodString;
    opensAt: z.ZodNullable<z.ZodString>;
    closesAt: z.ZodNullable<z.ZodString>;
    /** Höchstzahl Bewerbungen in dieser Team-Chance (0 = unbegrenzt) */
    slots: z.ZodNumber;
    /** Ankündigung beim Öffnen/Schließen in diesen Channel (leer = keine) */
    channelId: z.ZodNullable<z.ZodString>;
    pingRoleIds: z.ZodArray<z.ZodString, "many">;
    /** Bewerbungen nur während einer offenen Team-Chance annehmen */
    restrictApplications: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    description: string;
    channelId: string | null;
    title: string;
    open: boolean;
    opensAt: string | null;
    closesAt: string | null;
    slots: number;
    pingRoleIds: string[];
    restrictApplications: boolean;
}, {
    description: string;
    channelId: string | null;
    title: string;
    open: boolean;
    opensAt: string | null;
    closesAt: string | null;
    slots: number;
    pingRoleIds: string[];
    restrictApplications: boolean;
}>, {
    description: string;
    channelId: string | null;
    title: string;
    open: boolean;
    opensAt: string | null;
    closesAt: string | null;
    slots: number;
    pingRoleIds: string[];
    restrictApplications: boolean;
}, {
    description: string;
    channelId: string | null;
    title: string;
    open: boolean;
    opensAt: string | null;
    closesAt: string | null;
    slots: number;
    pingRoleIds: string[];
    restrictApplications: boolean;
}>;
export type TeamChanceCfg = z.infer<typeof teamChanceSchema> & {
    openedAt?: string | null;
};
export declare const DEFAULT_TEAMCHANCE: TeamChanceCfg;
/**
 * Team-Chance: Die Leitung öffnet/schließt eine Bewerbungsphase für das Team (je Server getrennt), optional mit
 * Zeitfenster und Platzzahl. Beim Öffnen/Schließen: Ankündigung in Discord und Benachrichtigung im Dashboard.
 */
export declare class TeamChanceService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly notify;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, notify: NotifyService);
    config(guildId?: string | null): Promise<TeamChanceCfg>;
    /** Ist die Team-Chance gerade offen? (Schalter + Zeitfenster + freie Plätze) */
    status(guildId?: string | null): Promise<{
        isOpen: boolean;
        reason: string | null;
        used: number;
        remaining: number | null;
        description: string;
        channelId: string | null;
        title: string;
        open: boolean;
        opensAt: string | null;
        closesAt: string | null;
        slots: number;
        pingRoleIds: string[];
        restrictApplications: boolean;
        openedAt?: string | null;
    }>;
    /** Für Bewerbungen: wenn eingestellt, nur während einer offenen Team-Chance. */
    assertApplicationsAllowed(guildId: string | null): Promise<void>;
    save(actor: Actor, input: z.infer<typeof teamChanceSchema>): Promise<{
        isOpen: boolean;
        reason: string | null;
        used: number;
        remaining: number | null;
        description: string;
        channelId: string | null;
        title: string;
        open: boolean;
        opensAt: string | null;
        closesAt: string | null;
        slots: number;
        pingRoleIds: string[];
        restrictApplications: boolean;
        openedAt?: string | null;
    }>;
}
