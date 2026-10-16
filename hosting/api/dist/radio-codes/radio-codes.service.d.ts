import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import type { MessageSpec } from '@enrp/shared';
import { DiscordService } from '../discord/discord.service';
/** Wie die Funk-Codes als Discord-Nachricht aussehen (je Server bzw. gemeinsam). */
export interface RadioDiscordConfig {
    channelId: string | null;
    title: string;
    description: string;
    color: string;
    groupByCategory: boolean;
    showDescription: boolean;
    autoUpdate: boolean;
    /** `fields`: je Kategorie ein Abschnitt; `list`: eine Liste „Code = Bedeutung“ im Text (wie eine handgeschriebene Funk-Übersicht). */
    layout: 'fields' | 'list';
    /** Text unter der Liste (Markdown), z. B. Regeln zur Funkdisziplin. */
    rules: string;
}
export declare const DEFAULT_RADIO_DISCORD: RadioDiscordConfig;
export interface RadioCodeInput {
    code?: string;
    meaning?: string;
    category?: string | null;
    description?: string | null;
    guildId?: string | null;
}
/** Gängige Funkcodes als Startpunkt („10-Codes einfügen“) – alles änderbar. */
export declare const DEFAULT_RADIO_CODES: {
    code: string;
    meaning: string;
    category: string;
}[];
/** Polizei-Status 0–11 („Status-Codes einfügen“). */
export declare const DEFAULT_STATUS_CODES: {
    code: string;
    meaning: string;
    category: string;
}[];
export declare const RADIO_CODE_SETS: {
    readonly ten: {
        code: string;
        meaning: string;
        category: string;
    }[];
    readonly status: {
        code: string;
        meaning: string;
        category: string;
    }[];
};
export type RadioCodeSet = keyof typeof RADIO_CODE_SETS;
/**
 * Funk-Codes je Server (Server getrennt) oder für alle Server. Im Server-Kontext sieht man die Codes dieses Servers
 * und die gemeinsamen; ein Server-Code überdeckt einen gemeinsamen mit gleichem Code.
 */
export declare class RadioCodesService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService);
    private cfgKey;
    private stateKey;
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
        layout: "fields" | "list";
        rules: string;
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
        layout: "fields" | "list";
        rules: string;
    }>;
    /** Discord-Nachricht: je Kategorie ein Abschnitt (Discord: max. 25 Abschnitte à 1024 Zeichen, 6000 je Embed → bei Bedarf mehrere Embeds). */
    message(codes: {
        code: string;
        meaning: string;
        category: string | null;
        description: string | null;
    }[], c: RadioDiscordConfig): MessageSpec;
    /** Liste „Code = Bedeutung“ im Embed-Text, Trennlinien, Regeln darunter. Zu lang für ein Embed (4096 Zeichen) → Folge-Embeds. */
    private listMessage;
    sendToDiscord(actor: Actor | null, mode: 'update' | 'new'): Promise<{
        queued: boolean;
    }>;
    /** Nach Änderungen: schon gepostete Liste automatisch nachziehen (falls eingestellt). */
    private autoUpdate;
    list(q?: string, guildId?: string | null): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    private load;
    private uniq;
    /** (gemeinsame Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
    private assertFree;
    create(actor: Actor, d: Required<Pick<RadioCodeInput, 'code' | 'meaning'>> & RadioCodeInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    update(actor: Actor, id: string, d: RadioCodeInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    remove(actor: Actor, id: string): Promise<void>;
    reorder(actor: Actor, ids: string[]): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    /** Standard-Codes (`ten`: 10-Codes, `status`: Polizei-Status 0–11) für den gewählten Server (bzw. alle Server) einfügen – vorhandene Codes bleiben unverändert. */
    insertDefaults(actor: Actor, set?: RadioCodeSet): Promise<{
        added: number;
    }>;
}
