import { EmbedsService, type EmbedDoc } from './embeds.service';
import type { Actor } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
/** Administration → Embeds. */
export declare class EmbedsController {
    private readonly s;
    constructor(s: EmbedsService);
    list(): Promise<{
        guildId: string | null;
        id: string;
        color: string;
        title: string;
        description: string;
        name: string;
        channelId: string | null;
        content: string;
        footer: string;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
        author: string;
        url: string;
        image: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        reactions: string[];
        authorIcon: string;
        thumbnail: string;
        images: string[];
        footerIcon: string;
        timestamp: boolean;
        timestampAt: string | null;
        pingRoles: boolean;
    }[]>;
    save(a: Actor, id: string, b: EmbedDoc): Promise<{
        guildId: string | null;
        id: string;
        color: string;
        title: string;
        description: string;
        name: string;
        channelId: string | null;
        content: string;
        footer: string;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
        author: string;
        url: string;
        image: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        reactions: string[];
        authorIcon: string;
        thumbnail: string;
        images: string[];
        footerIcon: string;
        timestamp: boolean;
        timestampAt: string | null;
        pingRoles: boolean;
    }>;
    duplicate(a: Actor, id: string): Promise<{
        guildId: string | null;
        id: string;
        color: string;
        title: string;
        description: string;
        name: string;
        channelId: string | null;
        content: string;
        footer: string;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
        author: string;
        url: string;
        image: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        reactions: string[];
        authorIcon: string;
        thumbnail: string;
        images: string[];
        footerIcon: string;
        timestamp: boolean;
        timestampAt: string | null;
        pingRoles: boolean;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    send(a: Actor, id: string, b: {
        mode: 'update' | 'new';
    }): Promise<{
        queued: boolean;
        edit: boolean;
    }>;
}
export declare class BotEmbedsController {
    private readonly s;
    private readonly media;
    constructor(s: EmbedsService, media: MediaService);
    /** Hochgeladenes Bild (`media:<id>`) für Nachrichten des Bots – nur Embed-Bilder und Banner. */
    asset(id: string): Promise<{
        mime: string;
        name: string;
        data: string;
    }>;
    posted(id: string, b: {
        channelId: string;
        messageId: string;
    }): Promise<void>;
}
