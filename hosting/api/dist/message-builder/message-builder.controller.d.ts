import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import type { AuthUser } from '../common/request-context';
import { categorySchema, channelsConfigSchema, copyDocSchema, createDocSchema, MessageBuilderService, updateDocSchema } from './message-builder.service';
import { finishSchema, historyQuery, interactionSchema, itemResultSchema, MessageBuilderSendService, sendSchema, webhookCreateSchema } from './message-builder-send.service';
declare const kindQuery: z.ZodObject<{
    kind: z.ZodEnum<["DRAFT", "TEMPLATE"]>;
}, "strip", z.ZodTypeAny, {
    kind: "DRAFT" | "TEMPLATE";
}, {
    kind: "DRAFT" | "TEMPLATE";
}>;
/**
 * Discord Message Builder. Alle Routen brauchen mindestens `messagebuilder.view`; Entwürfe/Vorlagen/Versand prüfen
 * im Service zusätzlich das jeweilige Recht (Entwurf vs. Vorlage, Bot vs. Webhook vs. Test).
 */
export declare class MessageBuilderController {
    private readonly s;
    private readonly send;
    constructor(s: MessageBuilderService, send: MessageBuilderSendService);
    server(): Promise<{
        guild: null;
        channels: import("./message-builder.service").MbChannel[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        problem: string;
        configuredGuildId: string | null;
        reportedGuilds: {
            id: string;
            name: string;
        }[];
        restricted?: undefined;
    } | {
        guild: {
            id: string;
            name: string;
            icon: string | null;
        };
        channels: import("./message-builder.service").MbChannel[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        restricted: boolean;
        problem?: undefined;
        configuredGuildId?: undefined;
        reportedGuilds?: undefined;
    }>;
    list(a: Actor, q: z.infer<typeof kindQuery>): Promise<{
        updatedByName: string | null;
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    description: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    url: string;
                    authorName: string;
                    authorUrl: string;
                    authorIconUrl: string;
                    thumbnailUrl: string;
                    imageUrl: string;
                    footerText: string;
                    footerIconUrl: string;
                    timestampAt: string;
                }[];
                rows: ({
                    type: "buttons";
                    id: string;
                    buttons: {
                        label: string;
                        kind: "action" | "link";
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                        url: string;
                        style: "danger" | "secondary" | "success" | "primary";
                        disabled: boolean;
                    }[];
                } | {
                    options: {
                        label: string;
                        description: string;
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                })[];
                mentions: {
                    roles: boolean;
                    users: boolean;
                    everyone: boolean;
                };
            }[];
            webhookProfile: {
                username: string;
                avatarUrl: string;
            };
        } | undefined;
        id: string;
        kind: string;
        name: string;
        categoryId: string | null;
        channelId: string | null;
        version: number;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }[]>;
    get(a: Actor, id: string): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    description: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    url: string;
                    authorName: string;
                    authorUrl: string;
                    authorIconUrl: string;
                    thumbnailUrl: string;
                    imageUrl: string;
                    footerText: string;
                    footerIconUrl: string;
                    timestampAt: string;
                }[];
                rows: ({
                    type: "buttons";
                    id: string;
                    buttons: {
                        label: string;
                        kind: "action" | "link";
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                        url: string;
                        style: "danger" | "secondary" | "success" | "primary";
                        disabled: boolean;
                    }[];
                } | {
                    options: {
                        label: string;
                        description: string;
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                })[];
                mentions: {
                    roles: boolean;
                    users: boolean;
                    everyone: boolean;
                };
            }[];
            webhookProfile: {
                username: string;
                avatarUrl: string;
            };
        } | undefined;
        id: string;
        kind: string;
        name: string;
        categoryId: string | null;
        channelId: string | null;
        version: number;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }>;
    create(a: Actor, b: z.infer<typeof createDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    description: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    url: string;
                    authorName: string;
                    authorUrl: string;
                    authorIconUrl: string;
                    thumbnailUrl: string;
                    imageUrl: string;
                    footerText: string;
                    footerIconUrl: string;
                    timestampAt: string;
                }[];
                rows: ({
                    type: "buttons";
                    id: string;
                    buttons: {
                        label: string;
                        kind: "action" | "link";
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                        url: string;
                        style: "danger" | "secondary" | "success" | "primary";
                        disabled: boolean;
                    }[];
                } | {
                    options: {
                        label: string;
                        description: string;
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                })[];
                mentions: {
                    roles: boolean;
                    users: boolean;
                    everyone: boolean;
                };
            }[];
            webhookProfile: {
                username: string;
                avatarUrl: string;
            };
        } | undefined;
        id: string;
        kind: string;
        name: string;
        categoryId: string | null;
        channelId: string | null;
        version: number;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof updateDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    description: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    url: string;
                    authorName: string;
                    authorUrl: string;
                    authorIconUrl: string;
                    thumbnailUrl: string;
                    imageUrl: string;
                    footerText: string;
                    footerIconUrl: string;
                    timestampAt: string;
                }[];
                rows: ({
                    type: "buttons";
                    id: string;
                    buttons: {
                        label: string;
                        kind: "action" | "link";
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                        url: string;
                        style: "danger" | "secondary" | "success" | "primary";
                        disabled: boolean;
                    }[];
                } | {
                    options: {
                        label: string;
                        description: string;
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                })[];
                mentions: {
                    roles: boolean;
                    users: boolean;
                    everyone: boolean;
                };
            }[];
            webhookProfile: {
                username: string;
                avatarUrl: string;
            };
        } | undefined;
        id: string;
        kind: string;
        name: string;
        categoryId: string | null;
        channelId: string | null;
        version: number;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }>;
    copy(a: Actor, id: string, b: z.infer<typeof copyDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    description: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    url: string;
                    authorName: string;
                    authorUrl: string;
                    authorIconUrl: string;
                    thumbnailUrl: string;
                    imageUrl: string;
                    footerText: string;
                    footerIconUrl: string;
                    timestampAt: string;
                }[];
                rows: ({
                    type: "buttons";
                    id: string;
                    buttons: {
                        label: string;
                        kind: "action" | "link";
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                        url: string;
                        style: "danger" | "secondary" | "success" | "primary";
                        disabled: boolean;
                    }[];
                } | {
                    options: {
                        label: string;
                        description: string;
                        action: {
                            type: "reply";
                            text: string;
                        } | {
                            type: "role";
                            roleId: string;
                            mode: "remove" | "add" | "toggle";
                        };
                        id: string;
                        emoji: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                })[];
                mentions: {
                    roles: boolean;
                    users: boolean;
                    everyone: boolean;
                };
            }[];
            webhookProfile: {
                username: string;
                avatarUrl: string;
            };
        } | undefined;
        id: string;
        kind: string;
        name: string;
        categoryId: string | null;
        channelId: string | null;
        version: number;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
        messageCount: number;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    categories(): import("@prisma/client").Prisma.PrismaPromise<{
        name: string;
        id: string;
        position: number;
    }[]>;
    createCategory(a: Actor, b: z.infer<typeof categorySchema>): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
    }>;
    updateCategory(a: Actor, id: string, b: z.infer<typeof categorySchema>): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
    }>;
    removeCategory(a: Actor, id: string): Promise<void>;
    channelsConfig(): Promise<{
        channelIds: string[];
    }>;
    setChannels(a: Actor, b: z.infer<typeof channelsConfigSchema>): Promise<{
        channelIds: string[];
    }>;
    doSend(a: Actor, u: AuthUser, b: z.infer<typeof sendSchema>): Promise<{
        payloads?: import("@enrp/shared").DiscordMessagePayload[] | undefined;
        warnings: import("@enrp/shared").MbIssue[];
        guildId: string | null;
        id: string;
        documentId: string | null;
        documentName: string;
        mode: string;
        channelId: string | null;
        channelName: string | null;
        webhookId: string | null;
        status: string;
        error: string | null;
        createdById: string | null;
        createdByName: string;
        createdAt: Date;
        startedAt: Date | null;
        finishedAt: Date | null;
        items: {
            position: number;
            summary: string;
            status: string;
            messageId: string | null;
            error: string | null;
            sentAt: Date | null;
        }[];
    }>;
    history(q: z.infer<typeof historyQuery>): Promise<{
        items: {
            id: string;
            documentId: string | null;
            documentName: string;
            mode: string;
            channelId: string | null;
            channelName: string | null;
            webhookId: string | null;
            status: string;
            error: string | null;
            createdById: string | null;
            createdByName: string;
            createdAt: Date;
            startedAt: Date | null;
            finishedAt: Date | null;
            items: {
                position: number;
                summary: string;
                status: string;
                messageId: string | null;
                error: string | null;
                sentAt: Date | null;
            }[];
        }[];
        total: number;
        page: number;
        pageSize: number;
        guildId: string | null;
    }>;
    sendStatus(a: Actor, id: string): Promise<{
        guildId: string | null;
        id: string;
        documentId: string | null;
        documentName: string;
        mode: string;
        channelId: string | null;
        channelName: string | null;
        webhookId: string | null;
        status: string;
        error: string | null;
        createdById: string | null;
        createdByName: string;
        createdAt: Date;
        startedAt: Date | null;
        finishedAt: Date | null;
        items: {
            position: number;
            summary: string;
            status: string;
            messageId: string | null;
            error: string | null;
            sentAt: Date | null;
        }[];
    }>;
    webhooks(): Promise<{
        id: string;
        name: string;
        webhookId: string;
        channelId: string | null;
        channelName: string | null;
        readable: boolean;
        createdAt: Date;
    }[]>;
    createWebhook(a: Actor, b: z.infer<typeof webhookCreateSchema>): Promise<{
        id: string;
        name: string;
        webhookId: string;
        channelId: string | null;
        channelName: string | null;
        readable: boolean;
        createdAt: Date;
    }>;
    removeWebhook(a: Actor, id: string): Promise<void>;
}
/** Nur für den Bot: Versandaufträge abholen und Ergebnisse je Nachricht melden, Aktionen interaktiver Komponenten auflösen. */
export declare class BotMessageBuilderController {
    private readonly send;
    constructor(send: MessageBuilderSendService);
    start(id: string): Promise<{
        proceed: false;
        guildId?: undefined;
        channelId?: undefined;
        items?: undefined;
    } | {
        proceed: true;
        guildId: string | null;
        channelId: string | null;
        items: {
            position: number;
            payload: import("@prisma/client/runtime/library").JsonValue;
        }[];
    }>;
    item(id: string, position: number, b: z.infer<typeof itemResultSchema>): Promise<void>;
    finish(id: string, b: z.infer<typeof finishSchema>): Promise<void>;
    interaction(b: z.infer<typeof interactionSchema>): Promise<{
        type: "reply";
        text: string;
    } | {
        type: "role";
        roleId: string;
        mode: "remove" | "add" | "toggle";
    } | {
        type: "gone";
    }>;
}
export {};
