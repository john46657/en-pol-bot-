import { EmbedsService, type EmbedDoc } from './embeds.service';
import type { Actor } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
/** Administration → Embeds. */
export declare class EmbedsController {
    private readonly s;
    constructor(s: EmbedsService);
    list(): Promise<{
        id: string;
        title: string;
        description: string;
        name: string;
        color: string;
        channelId: string | null;
        guildId: string | null;
        content: string;
        footer: string;
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
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
    }[]>;
    save(a: Actor, id: string, b: EmbedDoc): Promise<{
        id: string;
        title: string;
        description: string;
        name: string;
        color: string;
        channelId: string | null;
        guildId: string | null;
        content: string;
        footer: string;
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
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
    }>;
    duplicate(a: Actor, id: string): Promise<{
        id: string;
        title: string;
        description: string;
        name: string;
        color: string;
        channelId: string | null;
        guildId: string | null;
        content: string;
        footer: string;
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
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
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
