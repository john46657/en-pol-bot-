import { ApplicationBansService } from '../application-bans/application-bans.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { type QualificationConfig } from './qualifications.config';
import { type FormField } from '@enrp/shared';
import { RobloxService } from '../persons/roblox.service';
import { type MessageSpec } from '@enrp/shared';
export interface Answer {
    question: string;
    answer: string | string[] | null;
}
/** Bewerbungs-Panel (wie /bewerbungspanel): Button „Jetzt bewerben“ oder Auswahl mit weiteren Bewerbungsarten. */
export declare function policePanelMessage(cfg: QualificationConfig): MessageSpec;
/** Qualifikations-Panel mit Auswahlmenü der Einheiten (wie /qualipanel). */
export declare function qualiPanelMessage(cfg: QualificationConfig): MessageSpec;
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
    /**
     * Discord-Buttons: hat der Klickende auf `guildId` eine der Manager-Rollen dieser Bewerbung (`id`) bzw. – ohne `id` – irgendeiner
     * Bewerbungsart dieser Sorte? Bewerbungen eines anderen Servers zählen nie.
     */
    isDiscordManager(guildId: string, roles: string[], kind: 'police' | 'quali', id?: string): Promise<boolean>;
    /** Fragen der Polizei-Bewerbung (dasselbe Formular wie /apply und Studio). */
    policeForm(guildId?: string | null): Promise<FormField[]>;
    /** Alles für „Setup“ an einem Ort; `own` = dieser Server hat eigene Einstellungen. */
    setup(guildId?: string | null): Promise<{
        policeForm: FormField[];
        own: boolean;
        panelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        qualiPanelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        title: string;
        units: {
            description: string;
            name: string;
            questions: FormField[];
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            pingRoleIds: string[];
            panel: "quali" | "apply";
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
            panelChannelId?: string | undefined;
        };
        intro: string;
        panelChannelId?: string | undefined;
    }>;
    /** Ort des Bewerbungs-Panels in Discord – je Server getrennt. */
    private panelKey;
    /** Bewerbungs-Panel („Jetzt bewerben“) aus dem Dashboard senden oder die gesendete Nachricht aktualisieren. */
    sendPolicePanel(actor: Actor, mode: 'update' | 'new', guildId?: string | null): Promise<{
        queued: boolean;
    }>;
    /** Qualifikations-Panel (Auswahl der Einheiten) aus dem Dashboard senden oder aktualisieren. */
    sendQualiPanel(actor: Actor, mode: 'update' | 'new', guildId?: string | null): Promise<{
        queued: boolean;
    }>;
    saveConfig(actor: Actor, input: QualificationConfig & {
        policeForm?: FormField[];
    }, guildId?: string | null): Promise<{
        policeForm: FormField[];
        own: boolean;
        panelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        qualiPanelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        title: string;
        units: {
            description: string;
            name: string;
            questions: FormField[];
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            pingRoleIds: string[];
            panel: "quali" | "apply";
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
            panelChannelId?: string | undefined;
        };
        intro: string;
        panelChannelId?: string | undefined;
    }>;
    /** Eigene Einstellungen eines Servers löschen – danach gilt wieder die gemeinsame Grundeinstellung. */
    resetGuild(actor: Actor, guildId: string): Promise<{
        policeForm: FormField[];
        own: boolean;
        panelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        qualiPanelPosted: {
            channelId: string;
            messageId: string;
        } | null;
        title: string;
        units: {
            description: string;
            name: string;
            questions: FormField[];
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            pingRoleIds: string[];
            panel: "quali" | "apply";
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            enabled: boolean;
            settings: {
                mode: "DM" | "WEB";
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                cooldownMinutes: number;
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
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
            panelChannelId?: string | undefined;
        };
        intro: string;
        panelChannelId?: string | undefined;
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
        guildId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        discordName: string;
        decidedAt: Date | null;
        joinedAt: Date | null;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        durationSec: number | null;
        decisionReason: string | null;
        unitName: string;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        guildId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        discordName: string;
        decidedAt: Date | null;
        joinedAt: Date | null;
        answers: Prisma.JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        durationSec: number | null;
        decisionReason: string | null;
        unitName: string;
    }>;
    /** Bewerbung endgültig löschen (qualifications.delete) – im Audit-Log bleibt festgehalten, was gelöscht wurde. */
    remove(actor: Actor, id: string): Promise<void>;
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
