import { ApplicationBansService } from '../application-bans/application-bans.service';
import { TeamChanceService } from '../teamchance/teamchance.service';
import { NotifyService } from '../notifications/notify.service';
import { ApplicationStatus, type FormField } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PageQuery } from '../common/pagination';
import { RobloxService } from '../persons/roblox.service';
export type { FormField };
/** Die Beschriftungen sind zugleich die Fragen, die der Discord-Bot per Direktnachricht stellt. */
export declare const DEFAULT_FORM: FormField[];
export declare class ApplicationsService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly notify;
    private readonly teamchance;
    private readonly roblox;
    private readonly bans;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, notify: NotifyService, teamchance: TeamChanceService, roblox: RobloxService, bans: ApplicationBansService);
    /** Formular eines Servers (`application.form@<guildId>`), sonst das gemeinsame. */
    form(guildId?: string | null): Promise<FormField[]>;
    /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
    submit(d: {
        robloxUsername: string;
        robloxUserId?: string;
        answers: Record<string, string | string[]>;
    }, meta?: {
        discordId?: string;
        discordName?: string;
        durationSec?: number;
        joinedAt?: Date;
        guildId?: string;
    }): Promise<{
        number: string;
        status: string;
    }>;
    /** Einstellungen der Polizei-Bewerbung (Qualifications/Applications → Setup). */
    police(guildId?: string | null): Promise<{
        name: string;
        settings: {
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            staffThreads: boolean;
            cooldownMinutes: number;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        description: string;
        enabled: boolean;
        title: string;
        pingRoleIds: string[];
        channelId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }>;
    /** Entscheidungs-DM mit Text und Rollen aus den Einstellungen. */
    private decided;
    /** Wie bei Appy: entschiedene Bewerbung in den Channel für angenommene/abgelehnte Bewerbungen posten (nur ohne Original-Nachricht in Discord). */
    private archive;
    /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
    openForDiscord(discordId: string): Promise<{
        open: boolean;
        number: string | null;
    }>;
    openTicket(actor: Actor, id: string): Promise<{
        queued: boolean;
        linked: boolean;
    }>;
    /** Bisherige Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId: string): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        status: string;
        decisionReason: string | null;
    }[]>;
    /**
     * Schnell-Entscheidung aus Discord (Buttons Annehmen/Ablehnen): aus jedem offenen Status direkt angenommen/abgelehnt.
     * `reason` geht – anders als der interne Grund im Web-Workflow – per DM an die Person.
     */
    discordDecide(actor: Actor, id: string, to: 'ACCEPTED' | 'REJECTED', reason?: string): Promise<{
        id: string;
        number: string;
        status: "ACCEPTED" | "REJECTED";
        decidedByName: string | null;
        reason: string | null;
    }>;
    /** Angenommen → Personal-/Dienstnummern-Automatik (Einstellungen → Dienstnummern). */
    private hire;
    /** „Action On User Leave“ der Polizei-Bewerbung: offene Bewerbungen einer Person, die den Discord-Server verlassen hat. */
    memberLeft(guildId: string, discordId: string): Promise<{
        denied: number;
        withdrawn: number;
    }>;
    list(p: PageQuery, status?: string, guildId?: string): Promise<{
        items: {
            decidedByName: string | null;
            number: string;
            id: string;
            createdAt: Date;
            discordId: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            guildId: string | null;
            status: string;
            decidedById: string | null;
            decidedAt: Date | null;
            decisionReason: string | null;
            source: string;
            discordName: string | null;
            answers: import("@prisma/client/runtime/library").JsonValue;
            grantRoleIds: string[];
            durationSec: number | null;
            joinedAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        source: string;
        discordName: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
    }>;
    transition(actor: Actor, id: string, to: ApplicationStatus, reason?: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        discordId: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        source: string;
        discordName: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
    }>;
}
