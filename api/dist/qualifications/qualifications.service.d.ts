import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { type QualificationConfig } from './qualifications.config';
import { type FormField } from '@enrp/shared';
export interface Answer {
    question: string;
    answer: string | string[] | null;
}
/**
 * Qualifikations-Bewerbungen (SEK, Flugstaffel, Ausbilder …): Discord-Panel → Fragen per DM → Team entscheidet (Web oder Button im Team-Channel).
 * Bei Annahme: Direktnachricht, optionale Discord-Rolle; für die Einheit `sek` zusätzlich SEK-Roster + System-Rolle „SEK“ (bei verknüpftem Konto).
 */
export declare class QualificationsService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    config(): Promise<QualificationConfig>;
    /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
    policeForm(): Promise<FormField[]>;
    /** Alles für „Qualifications → Setup“ an einem Ort. */
    setup(): Promise<{
        policeForm: FormField[];
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    saveConfig(actor: Actor, input: QualificationConfig & {
        policeForm?: FormField[];
    }): Promise<{
        policeForm: FormField[];
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    /** Für den Bot: läuft für diese Discord-ID schon eine offene Bewerbung (je Einheit)? */
    openFor(discordId: string, unit?: string): Promise<{
        open: boolean;
        number: string | null;
        unitName: string | null;
    }>;
    submit(d: {
        unit: string;
        discordId: string;
        discordName: string;
        answers: Answer[];
        durationSec?: number;
        joinedAt?: Date;
        guildId?: string;
    }): Promise<{
        id: string;
        number: string;
        unitName: string;
    }>;
    list(f: {
        unit?: string;
        status?: string;
    }): Promise<{
        linkedName: string | null;
        decidedByName: string | null;
        number: string;
        unit: string;
        id: string;
        userId: string | null;
        createdAt: Date;
        discordId: string;
        guildId: string | null;
        status: string;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
        unitName: string;
        decidedAt: Date | null;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        userId: string | null;
        createdAt: Date;
        discordId: string;
        guildId: string | null;
        status: string;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
        unitName: string;
        decidedAt: Date | null;
    }>;
    /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId: string): Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        status: string;
        decisionReason: string | null;
        unitName: string;
    }[]>;
    decide(actor: Actor, id: string, status: 'ACCEPTED' | 'REJECTED', reason?: string): Promise<{
        id: string;
        number: string;
        unitName: string;
        status: "REJECTED" | "ACCEPTED";
        addedToSek: boolean;
        decidedByName: string | null;
        reason: string | null;
    }>;
}
