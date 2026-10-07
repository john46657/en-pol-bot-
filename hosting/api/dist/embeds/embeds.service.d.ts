import { z } from 'zod';
import type { MessageSpec } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/** Ein Embed wie bei Sapphire: Titel, Text, Abschnitte (Feld-Name + Text), Farbe, Bilder, Fußzeile. */
export declare const embedSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    content: z.ZodDefault<z.ZodString>;
    title: z.ZodDefault<z.ZodString>;
    url: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    description: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    author: z.ZodDefault<z.ZodString>;
    thumbnail: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    footer: z.ZodDefault<z.ZodString>;
    timestamp: z.ZodDefault<z.ZodBoolean>;
    fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
        inline: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        value: string;
        inline: boolean;
    }, {
        name: string;
        value: string;
        inline?: boolean | undefined;
    }>, "many">>;
    /** Wo der Bot die Nachricht zuletzt gepostet hat (zum Aktualisieren). */
    posted: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        channelId: z.ZodString;
        messageId: z.ZodString;
        at: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        at: string;
        channelId: string;
        messageId: string;
    }, {
        at: string;
        channelId: string;
        messageId: string;
    }>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    guildId: string | null;
    description: string;
    color: string;
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
}, {
    id: string;
    name: string;
    guildId?: string | null | undefined;
    description?: string | undefined;
    color?: string | undefined;
    channelId?: string | null | undefined;
    url?: string | undefined;
    title?: string | undefined;
    image?: string | undefined;
    content?: string | undefined;
    footer?: string | undefined;
    author?: string | undefined;
    posted?: {
        at: string;
        channelId: string;
        messageId: string;
    } | null | undefined;
    thumbnail?: string | undefined;
    timestamp?: boolean | undefined;
    fields?: {
        name: string;
        value: string;
        inline?: boolean | undefined;
    }[] | undefined;
}>, {
    id: string;
    name: string;
    guildId: string | null;
    description: string;
    color: string;
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
}, {
    id: string;
    name: string;
    guildId?: string | null | undefined;
    description?: string | undefined;
    color?: string | undefined;
    channelId?: string | null | undefined;
    url?: string | undefined;
    title?: string | undefined;
    image?: string | undefined;
    content?: string | undefined;
    footer?: string | undefined;
    author?: string | undefined;
    posted?: {
        at: string;
        channelId: string;
        messageId: string;
    } | null | undefined;
    thumbnail?: string | undefined;
    timestamp?: boolean | undefined;
    fields?: {
        name: string;
        value: string;
        inline?: boolean | undefined;
    }[] | undefined;
}>;
export type EmbedDoc = z.infer<typeof embedSchema>;
/** Embed-Baukasten: Nachrichten im Dashboard bauen, in einen Kanal senden und später aktualisieren (der Bot bearbeitet dieselbe Nachricht). */
export declare class EmbedsService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    all(guildId?: string | null): Promise<EmbedDoc[]>;
    private write;
    save(actor: Actor, e: Omit<EmbedDoc, 'posted'> & {
        posted?: unknown;
    }): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        description: string;
        color: string;
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
    duplicate(actor: Actor, id: string): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        description: string;
        color: string;
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
    remove(actor: Actor, id: string): Promise<void>;
    message(e: EmbedDoc): MessageSpec;
    /**
     * Senden: in den gewählten Kanal. Liegt die letzte Nachricht schon in diesem Kanal, bearbeitet der Bot sie (`update`),
     * sonst postet er neu (`new` erzwingt eine neue Nachricht).
     */
    send(actor: Actor, id: string, mode: 'update' | 'new'): Promise<{
        queued: boolean;
        edit: boolean;
    }>;
    /** Bot meldet, wo die Nachricht steht. */
    posted(id: string, channelId: string, messageId: string): Promise<void>;
}
