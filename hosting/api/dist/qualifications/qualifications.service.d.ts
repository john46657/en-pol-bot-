import { ApplicationBansService } from '../application-bans/application-bans.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { type QualificationConfig } from './qualifications.config';
import { type FormField } from '@enrp/shared';
import { RobloxService } from '../persons/roblox.service';
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
    private readonly roblox;
    private readonly bans;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, roblox: RobloxService, bans: ApplicationBansService);
    /** Einstellungen eines Servers (`@<guildId>`) – ohne eigene gilt die gemeinsame Grundeinstellung. */
    private keyOf;
    private read;
    config(guildId?: string | null): Promise<QualificationConfig>;
    /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
    policeForm(guildId?: string | null): Promise<FormField[]>;
    /** Alles für „Setup“ an einem Ort; `own` = dieser Server hat eigene Einstellungen. */
    setup(guildId?: string | null): Promise<{
        policeForm: FormField[];
        own: boolean;
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    saveConfig(actor: Actor, input: QualificationConfig & {
        policeForm?: FormField[];
    }, guildId?: string | null): Promise<{
        policeForm: FormField[];
        own: boolean;
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame Grundeinstellung. */
    resetGuild(actor: Actor, guildId: string): Promise<{
        policeForm: FormField[];
        own: boolean;
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
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
        guildId?: string;
    }): Promise<{
        linkedName: string | null;
        decidedByName: string | null;
        number: string;
        unit: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        guildId: string | null;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        discordId: string;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        unitName: string;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        guildId: string | null;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        discordId: string;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        unitName: string;
    }>;
    openTicket(actor: Actor, id: string): Promise<{
        queued: boolean;
        linked: boolean;
    }>;
    /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId: string): Prisma.PrismaPromise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        decisionReason: string | null;
        unitName: string;
    }[]>;
    /** „Action On User Leave“: offene Bewerbungen einer Person, die den Discord-Server verlassen hat (Einstellung je Einheit). */
    memberLeft(guildId: string, discordId: string): Promise<{
        denied: number;
        withdrawn: number;
    }>;
    decide(actor: Actor, id: string, status: 'ACCEPTED' | 'REJECTED', reason?: string): Promise<{
        id: string;
        number: string;
        unitName: string;
        status: "ACCEPTED" | "REJECTED";
        addedToSek: boolean;
        decidedByName: string | null;
        reason: string | null;
    }>;
}
