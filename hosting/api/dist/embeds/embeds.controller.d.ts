import { EmbedsService, type EmbedDoc } from './embeds.service';
import type { Actor } from '../audit/audit.service';
/** Administration → Embeds. */
export declare class EmbedsController {
    private readonly s;
    constructor(s: EmbedsService);
    list(): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        color: string;
        description: string;
        channelId: string | null;
        url: string;
        title: string;
        image: string;
        content: string;
        footer: string;
        author: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        thumbnail: string;
        timestamp: boolean;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
    }[]>;
    save(a: Actor, id: string, b: EmbedDoc): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        color: string;
        description: string;
        channelId: string | null;
        url: string;
        title: string;
        image: string;
        content: string;
        footer: string;
        author: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        thumbnail: string;
        timestamp: boolean;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
    }>;
    duplicate(a: Actor, id: string): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        color: string;
        description: string;
        channelId: string | null;
        url: string;
        title: string;
        image: string;
        content: string;
        footer: string;
        author: string;
        posted: {
            at: string;
            channelId: string;
            messageId: string;
        } | null;
        thumbnail: string;
        timestamp: boolean;
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
    constructor(s: EmbedsService);
    posted(id: string, b: {
        channelId: string;
        messageId: string;
    }): Promise<void>;
}
