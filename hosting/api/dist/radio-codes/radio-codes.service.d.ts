import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import type { MessageSpec } from '@enrp/shared';
import { DiscordService } from '../discord/discord.service';
/** Wie die Funk-Codes als Discord-Nachricht aussehen. */
export interface RadioDiscordConfig {
    channelId: string | null;
    title: string;
    description: string;
    color: string;
    groupByCategory: boolean;
    showDescription: boolean;
    autoUpdate: boolean;
}
export declare const DEFAULT_RADIO_DISCORD: RadioDiscordConfig;
export interface RadioCodeInput {
    code?: string;
    meaning?: string;
    category?: string | null;
    description?: string | null;
}
/** Gängige Funkcodes als Startpunkt („Standard-Codes einfügen“) – alles änderbar. */
export declare const DEFAULT_RADIO_CODES: {
    code: string;
    meaning: string;
    category: string;
}[];
/**
 * Funk-Codes. Neue Codes gelten zentral (`guildId` = null). Codes, die früher eigens für den Discord-Server angelegt wurden,
 * bleiben gültig und bearbeitbar; sie überdecken einen gleichnamigen zentralen Code (wie bisher auf dem Server).
 */
export declare class RadioCodesService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    private readonly cfgKey;
    /** Wo die Liste in Discord steht: `radio-all`; früher auf dem Server gepostet (`radio-<Server-ID>`) → dieselbe Nachricht weiter bearbeiten. */
    private stateKey;
    /** Codes dieses Systems: zentrale und die früher eigens für den Discord-Server angelegten. */
    private scope;
    discordConfig(): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        channelId: string | null;
        title: string;
        description: string;
        color: string;
        groupByCategory: boolean;
        showDescription: boolean;
        autoUpdate: boolean;
    }>;
    saveDiscordConfig(actor: Actor, c: RadioDiscordConfig): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        channelId: string | null;
        title: string;
        description: string;
        color: string;
        groupByCategory: boolean;
        showDescription: boolean;
        autoUpdate: boolean;
    }>;
    /** Discord-Nachricht: je Kategorie ein Abschnitt (Discord: max. 25 Abschnitte à 1024 Zeichen, 6000 je Embed → bei Bedarf mehrere Embeds). */
    message(codes: {
        code: string;
        meaning: string;
        category: string | null;
        description: string | null;
    }[], c: RadioDiscordConfig): MessageSpec;
    sendToDiscord(actor: Actor | null, mode: 'update' | 'new'): Promise<{
        queued: boolean;
    }>;
    /** Nach Änderungen: schon gepostete Liste automatisch nachziehen (falls eingestellt). */
    private autoUpdate;
    list(q?: string): Promise<{
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    private load;
    private uniq;
    /** (zentrale Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
    private assertFree;
    create(actor: Actor, d: Required<Pick<RadioCodeInput, 'code' | 'meaning'>> & RadioCodeInput): Promise<{
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    update(actor: Actor, id: string, d: RadioCodeInput): Promise<{
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    reorder(actor: Actor, ids: string[]): Promise<{
        code: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    /** Standard-Codes einfügen – vorhandene Codes bleiben unverändert. */
    insertDefaults(actor: Actor): Promise<{
        added: number;
    }>;
}
