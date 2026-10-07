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
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, roblox: RobloxService);
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
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
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
        };
    }>;
    saveConfig(actor: Actor, input: QualificationConfig & {
        policeForm?: FormField[];
    }, guildId?: string | null): Promise<{
        policeForm: FormField[];
        own: boolean;
        title: string;
        units: {
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
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
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
        };
    }>;
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame Grundeinstellung. */
    resetGuild(actor: Actor, guildId: string): Promise<{
        policeForm: FormField[];
        own: boolean;
        title: string;
        units: {
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
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
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
        guildId?: string;
    }): Promise<{
        linkedName: string | null;
        decidedByName: string | null;
        number: string;
        unit: string;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        guildId: string | null;
        unitName: string;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        discordName: string;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        guildId: string | null;
        unitName: string;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        discordName: string;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
    }>;
    openTicket(actor: Actor, id: string): Promise<{
        queued: boolean;
        linked: boolean;
    }>;
    /** Bisherige Qualifikations-Bewerbungen einer Discord-ID (Button „Verlauf“). */
    history(discordId: string): Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        unitName: string;
        status: string;
        decisionReason: string | null;
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
