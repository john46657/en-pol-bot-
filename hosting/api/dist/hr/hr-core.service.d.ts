import { Prisma, type HrRank } from '@prisma/client';
import { type HrConfig, type HrEvent, type MessageSpec, type PromotionCheck, type RankInput } from '@enrp/shared';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
/**
 * Personal-Kern: Einstellungen, Ränge, Prüfung der Beförderungsvoraussetzungen,
 * Discord-/Dashboard-Rollen abgleichen und Benachrichtigungen nach Einstellung verschicken.
 */
export declare class HrCoreService {
    readonly prisma: PrismaService;
    readonly audit: AuditService;
    readonly discord: DiscordService;
    private readonly live;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, live: DiscordLiveService);
    /** Einstellung des gewählten Discord-Servers, sonst die gemeinsame (Personal ist je Server getrennt). */
    setting(key: string, tx?: Tx | PrismaService): Promise<{
        updatedAt: Date;
        value: Prisma.JsonValue;
        key: string;
    } | null>;
    /** Schlüssel, unter dem der gewählte Server speichert (ohne Server: der gemeinsame). */
    settingKey(key: string): string;
    saveSetting(tx: Tx, key: string, value: Prisma.InputJsonValue): Promise<void>;
    config(): Promise<HrConfig>;
    saveConfig(actor: Actor, input: HrConfig): Promise<{
        transfer: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
        };
        promotion: {
            stages: {
                roleIds: string[];
                id: string;
                name: string;
            }[];
            approvalsRequired: number;
            requireReason: boolean;
            requireRequirements: boolean;
            autoExecute: boolean;
            discordRoles: boolean;
            dashboardRoles: boolean;
            announceChannelId: string | null;
            announceTemplate: string;
            announceColor: string;
            statusLabels: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
                label: string;
                emoji: string;
            }>>;
        };
        awards: {
            description: string;
            id: string;
            name: string;
            color: string;
            active: boolean;
            icon: string;
            requirements: string;
            public: boolean;
            discordRoleId: string | null;
        }[];
        sections: Partial<Record<"history" | "awards" | "rank" | "overview" | "promotions" | "trainings" | "exams" | "warnings" | "absences" | "transfers" | "servicenumbers" | "notes", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        fields: Partial<Record<"status" | "rank" | "callsign" | "discordName" | "discordId" | "avatar" | "robloxName" | "robloxId" | "department" | "joinDate" | "serviceNumber", {
            visible: boolean;
            sensitive: boolean;
        }>>;
        warnings: {
            dm: boolean;
            channelId: string | null;
            template: string;
            limit: number;
            atLimit: {
                status: string | null;
                notifyRoleIds: string[];
                pingDiscordRoleIds: string[];
                removeDiscordRoleIds: string[];
            };
        };
        statuses: {
            key: string;
            label: string;
            color: string;
            active: boolean;
            emoji: string;
        }[];
        departments: {
            description: string;
            id: string;
            name: string;
            color: string;
            discordRoleIds: string[];
            dashboardRoleIds: string[];
        }[];
        absenceTypes: {
            key: string;
            label: string;
            emoji: string;
        }[];
        warningSeverities: {
            key: string;
            label: string;
            color: string;
            emoji: string;
            defaultDays: number;
        }[];
        warningCategories: string[];
        showAbsenceInTeam: boolean;
        notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed", {
            dashboard: boolean;
            dm: boolean;
            roleIds: string[];
            channelId: string | null;
        }>>;
        certificate: {
            organisation: string;
            logo: string;
            signature: string;
        };
    }>;
    ranks(includeInactive?: boolean): Prisma.PrismaPromise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        position: number;
        icon: string | null;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: Prisma.JsonValue;
        active: boolean;
    }[]>;
    rankByName(name: string | null | undefined, tx?: Tx | PrismaService): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        position: number;
        icon: string | null;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: Prisma.JsonValue;
        active: boolean;
    } | null>;
    /** Rangreihenfolge auch für Teamliste/Embeds (team.rankOrder). */
    private syncRankOrder;
    saveRank(actor: Actor, d: RankInput, id?: string): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        position: number;
        icon: string | null;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: Prisma.JsonValue;
        active: boolean;
    }>;
    reorderRanks(actor: Actor, ids: string[]): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        position: number;
        icon: string | null;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: Prisma.JsonValue;
        active: boolean;
    }[]>;
    deleteRank(actor: Actor, id: string): Promise<void>;
    /** Mögliche nächste Ränge: eingestellte Ziele, sonst der nächsthöhere aktive Rang. */
    nextRanks(current: HrRank | null): Promise<{
        serverId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        name: string;
        position: number;
        icon: string | null;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
        nextRankIds: string[];
        approverRankIds: string[];
        requirements: Prisma.JsonValue;
        active: boolean;
    }[]>;
    evaluate(personnelId: string, rank: HrRank): Promise<PromotionCheck>;
    discordIdOf(userId: string): Promise<string | null>;
    syncDiscordRoles(userId: string, add: string[], remove: string[], reason: string, tx?: Tx): Promise<boolean>;
    syncDashboardRoles(userId: string, add: string[], remove: string[], tx: Tx): Promise<void>;
    /** Nickname auf allen Servern setzen (Bot). */
    setNickname(userId: string, nickname: string, tx?: Tx): Promise<boolean>;
    dm(userId: string, message: MessageSpec, tx?: Tx): Promise<boolean>;
    /**
     * Benachrichtigung nach Einstellung (Personal → Benachrichtigungen): Dashboard (betroffene Person + eingestellte Rollen),
     * Discord-Kanal und optional DM. Sensible Inhalte gehören nicht in `public` – der Kanal bekommt nur den neutralen Text.
     */
    notify(event: HrEvent, n: {
        memberUserId?: string | null;
        title: string;
        body?: string;
        entityType: string;
        entityId: string;
        publicText?: string;
        dmText?: string;
        color?: number;
    }): Promise<void>;
    /** Personalakte zu einem Benutzer (anlegen, falls gewünscht). */
    ensurePersonnel(userId: string, d: {
        rank?: string | null;
        team?: string | null;
    }, tx: Tx): Promise<{
        personnel: {
            serverId: string | null;
            serviceNumber: string | null;
            id: string;
            updatedAt: Date;
            userId: string;
            callsign: string | null;
            rank: string | null;
            team: string | null;
            office: string | null;
            employmentStatus: string;
            joinDate: Date;
            qualifications: string[];
            rankSince: Date;
            customChecks: Prisma.JsonValue;
        };
        created: boolean;
    }>;
}
