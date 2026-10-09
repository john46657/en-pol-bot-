import { z } from 'zod';
import type { MessageSpec } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
/** Bild: https-URL oder hochgeladene Datei (`media:<id>`, der Bot hängt sie an). */
export declare const imageRef: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
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
    authorIcon: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    thumbnail: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    /** weitere große Bilder (Discord zeigt bis zu 4 als Galerie, wenn ein Titel-Link gesetzt ist) */
    images: z.ZodDefault<z.ZodArray<z.ZodPipeline<z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, z.ZodString>, "many">>;
    footer: z.ZodDefault<z.ZodString>;
    footerIcon: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    timestamp: z.ZodDefault<z.ZodBoolean>;
    /** eigener Zeitpunkt (ISO); leer = Zeitpunkt des Sendens */
    timestampAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** Reaktionen, die der Bot unter die Nachricht setzt (z. B. ✅ ❌ ⏳) */
    reactions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Rollen-Erwähnungen im Text oben wirklich pingen */
    pingRoles: z.ZodDefault<z.ZodBoolean>;
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
    title: string;
    description: string;
    name: string;
    color: string;
    guildId: string | null;
    content: string;
    footer: string;
    channelId: string | null;
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
}, {
    id: string;
    name: string;
    title?: string | undefined;
    description?: string | undefined;
    color?: string | undefined;
    guildId?: string | null | undefined;
    content?: string | undefined;
    footer?: string | undefined;
    channelId?: string | null | undefined;
    author?: string | undefined;
    url?: string | undefined;
    image?: string | undefined;
    posted?: {
        at: string;
        channelId: string;
        messageId: string;
    } | null | undefined;
    reactions?: string[] | undefined;
    authorIcon?: string | undefined;
    thumbnail?: string | undefined;
    images?: (string | undefined)[] | undefined;
    footerIcon?: string | undefined;
    timestamp?: boolean | undefined;
    timestampAt?: string | null | undefined;
    pingRoles?: boolean | undefined;
    fields?: {
        name: string;
        value: string;
        inline?: boolean | undefined;
    }[] | undefined;
}>, {
    id: string;
    title: string;
    description: string;
    name: string;
    color: string;
    guildId: string | null;
    content: string;
    footer: string;
    channelId: string | null;
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
}, {
    id: string;
    name: string;
    title?: string | undefined;
    description?: string | undefined;
    color?: string | undefined;
    guildId?: string | null | undefined;
    content?: string | undefined;
    footer?: string | undefined;
    channelId?: string | null | undefined;
    author?: string | undefined;
    url?: string | undefined;
    image?: string | undefined;
    posted?: {
        at: string;
        channelId: string;
        messageId: string;
    } | null | undefined;
    reactions?: string[] | undefined;
    authorIcon?: string | undefined;
    thumbnail?: string | undefined;
    images?: (string | undefined)[] | undefined;
    footerIcon?: string | undefined;
    timestamp?: boolean | undefined;
    timestampAt?: string | null | undefined;
    pingRoles?: boolean | undefined;
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
        title: string;
        description: string;
        name: string;
        color: string;
        guildId: string | null;
        content: string;
        footer: string;
        channelId: string | null;
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
    duplicate(actor: Actor, id: string): Promise<{
        id: string;
        title: string;
        description: string;
        name: string;
        color: string;
        guildId: string | null;
        content: string;
        footer: string;
        channelId: string | null;
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
