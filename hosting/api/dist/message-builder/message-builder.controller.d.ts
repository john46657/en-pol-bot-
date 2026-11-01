import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import type { AuthUser } from '../common/request-context';
import { categorySchema, channelsConfigSchema, copyDocSchema, createDocSchema, MessageBuilderService, templateExportQuery, templateImportSchema, updateDocSchema } from './message-builder.service';
import { editSchema, loadedSchema, loadLinkSchema, MessageBuilderMessagesService, messagesQuery, renameSchema } from './message-builder-messages.service';
import { finishSchema, historyQuery, interactionSchema, itemResultSchema, MessageBuilderSendService, sendSchema, webhookCreateSchema, webhookUpdateSchema } from './message-builder-send.service';
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
    private readonly msgs;
    constructor(s: MessageBuilderService, send: MessageBuilderSendService, msgs: MessageBuilderMessagesService);
    server(): Promise<{
        problem: "no_server";
        guild: null;
        channels: import("./message-builder.service").MbChannel[];
        threads: import("./message-builder.service").MbThread[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        restricted?: undefined;
    } | {
        problem: "no_report";
        guild: null;
        channels: import("./message-builder.service").MbChannel[];
        threads: import("./message-builder.service").MbThread[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        restricted?: undefined;
    } | {
        guild: {
            id: string;
            name: string;
            icon: string | null;
        };
        channels: import("./message-builder.service").MbChannel[];
        threads: import("./message-builder.service").MbThread[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        restricted: boolean;
    }>;
    list(a: Actor, q: z.infer<typeof kindQuery>): Promise<{
        updatedByName: string | null;
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }[]>;
    get(a: Actor, id: string): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }>;
    create(a: Actor, b: z.infer<typeof createDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof updateDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }>;
    copy(a: Actor, id: string, b: z.infer<typeof copyDocSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }>;
    remove(a: Actor, id: string): Promise<void>;
    exportTemplates(q: z.infer<typeof templateExportQuery>): Promise<{
        format: string;
        version: 1;
        exportedAt: string;
        templates: {
            name: string;
            category: string | null;
            data: {
                messages: {
                    id: string;
                    content: string;
                    embeds: {
                        title: string;
                        id: string;
                        color: string;
                        timestamp: "send" | "custom" | "none";
                        fields: {
                            value: string;
                            id: string;
                            name: string;
                            inline: boolean;
                        }[];
                        description: string;
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
                            style: "danger" | "secondary" | "success" | "primary";
                            url: string;
                            disabled: boolean;
                            keepCustomId: string;
                        }[];
                    } | {
                        options: {
                            label: string;
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
                            description: string;
                        }[];
                        type: "select";
                        id: string;
                        placeholder: string;
                        disabled: boolean;
                        keepCustomId: string;
                        minValues: number;
                        maxValues: number;
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
            };
        }[];
    }>;
    importTemplates(a: Actor, b: z.infer<typeof templateImportSchema>): Promise<{
        created: {
            id: string;
            name: string;
        }[];
    }>;
    examples(a: Actor): Promise<{
        added: string[];
        skipped: string[];
    }>;
    categories(): Promise<{
        id: string;
        name: string;
        position: number;
    }[]>;
    createCategory(a: Actor, b: z.infer<typeof categorySchema>): Promise<{
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        position: number;
    }>;
    updateCategory(a: Actor, id: string, b: z.infer<typeof categorySchema>): Promise<{
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
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
        kind: string;
        documentId: string | null;
        documentName: string;
        templateName: string | null;
        mode: string;
        channelId: string | null;
        channelName: string | null;
        webhookId: string | null;
        threadId: string | null;
        threadName: string | null;
        targetId: string | null;
        hasData: boolean;
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
            channelId: string | null;
            error: string | null;
            sentAt: Date | null;
        }[];
    }>;
    history(q: z.infer<typeof historyQuery>): Promise<{
        items: {
            id: string;
            kind: string;
            documentId: string | null;
            documentName: string;
            templateName: string | null;
            mode: string;
            channelId: string | null;
            channelName: string | null;
            webhookId: string | null;
            threadId: string | null;
            threadName: string | null;
            targetId: string | null;
            hasData: boolean;
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
                channelId: string | null;
                error: string | null;
                sentAt: Date | null;
            }[];
        }[];
        total: number;
        page: number;
        pageSize: number;
        guildId: string;
    }>;
    sendStatus(a: Actor, id: string): Promise<{
        guildId: string | null;
        id: string;
        kind: string;
        documentId: string | null;
        documentName: string;
        templateName: string | null;
        mode: string;
        channelId: string | null;
        channelName: string | null;
        webhookId: string | null;
        threadId: string | null;
        threadName: string | null;
        targetId: string | null;
        hasData: boolean;
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
            channelId: string | null;
            error: string | null;
            sentAt: Date | null;
        }[];
    }>;
    sendToDraft(a: Actor, id: string): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        sourceTemplateId: string | null;
    }>;
    messages(a: Actor, q: z.infer<typeof messagesQuery>): Promise<{
        items: {
            data?: {
                messages: {
                    id: string;
                    content: string;
                    embeds: {
                        title: string;
                        id: string;
                        color: string;
                        timestamp: "send" | "custom" | "none";
                        fields: {
                            value: string;
                            id: string;
                            name: string;
                            inline: boolean;
                        }[];
                        description: string;
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
                            style: "danger" | "secondary" | "success" | "primary";
                            url: string;
                            disabled: boolean;
                            keepCustomId: string;
                        }[];
                    } | {
                        options: {
                            label: string;
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
                            description: string;
                        }[];
                        type: "select";
                        id: string;
                        placeholder: string;
                        disabled: boolean;
                        keepCustomId: string;
                        minValues: number;
                        maxValues: number;
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
            } | null | undefined;
            id: string;
            name: string;
            channelId: string;
            channelName: string | null;
            threadId: string | null;
            messageId: string;
            mode: string;
            webhookId: string | null;
            sendId: string | null;
            status: string;
            error: string | null;
            sentById: string | null;
            createdByName: string;
            createdAt: Date;
            lastEditedAt: Date | null;
            link: string | null;
            canEdit: boolean;
            foreignComponents: number;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    message(a: Actor, id: string): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        } | null | undefined;
        id: string;
        name: string;
        channelId: string;
        channelName: string | null;
        threadId: string | null;
        messageId: string;
        mode: string;
        webhookId: string | null;
        sendId: string | null;
        status: string;
        error: string | null;
        sentById: string | null;
        createdByName: string;
        createdAt: Date;
        lastEditedAt: Date | null;
        link: string | null;
        canEdit: boolean;
        foreignComponents: number;
    }>;
    loadMessage(a: Actor, u: AuthUser, b: z.infer<typeof loadLinkSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        } | null | undefined;
        id: string;
        name: string;
        channelId: string;
        channelName: string | null;
        threadId: string | null;
        messageId: string;
        mode: string;
        webhookId: string | null;
        sendId: string | null;
        status: string;
        error: string | null;
        sentById: string | null;
        createdByName: string;
        createdAt: Date;
        lastEditedAt: Date | null;
        link: string | null;
        canEdit: boolean;
        foreignComponents: number;
    }>;
    reloadMessage(a: Actor, id: string): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        } | null | undefined;
        id: string;
        name: string;
        channelId: string;
        channelName: string | null;
        threadId: string | null;
        messageId: string;
        mode: string;
        webhookId: string | null;
        sendId: string | null;
        status: string;
        error: string | null;
        sentById: string | null;
        createdByName: string;
        createdAt: Date;
        lastEditedAt: Date | null;
        link: string | null;
        canEdit: boolean;
        foreignComponents: number;
    }>;
    renameMessage(a: Actor, id: string, b: z.infer<typeof renameSchema>): Promise<{
        data?: {
            messages: {
                id: string;
                content: string;
                embeds: {
                    title: string;
                    id: string;
                    color: string;
                    timestamp: "send" | "custom" | "none";
                    fields: {
                        value: string;
                        id: string;
                        name: string;
                        inline: boolean;
                    }[];
                    description: string;
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
                        style: "danger" | "secondary" | "success" | "primary";
                        url: string;
                        disabled: boolean;
                        keepCustomId: string;
                    }[];
                } | {
                    options: {
                        label: string;
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
                        description: string;
                    }[];
                    type: "select";
                    id: string;
                    placeholder: string;
                    disabled: boolean;
                    keepCustomId: string;
                    minValues: number;
                    maxValues: number;
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
        } | null | undefined;
        id: string;
        name: string;
        channelId: string;
        channelName: string | null;
        threadId: string | null;
        messageId: string;
        mode: string;
        webhookId: string | null;
        sendId: string | null;
        status: string;
        error: string | null;
        sentById: string | null;
        createdByName: string;
        createdAt: Date;
        lastEditedAt: Date | null;
        link: string | null;
        canEdit: boolean;
        foreignComponents: number;
    }>;
    removeMessage(a: Actor, id: string): Promise<void>;
    editMessage(a: Actor, u: AuthUser, id: string, b: z.infer<typeof editSchema>): Promise<{
        warnings: import("@enrp/shared").MbIssue[];
        guildId: string | null;
        id: string;
        kind: string;
        documentId: string | null;
        documentName: string;
        templateName: string | null;
        mode: string;
        channelId: string | null;
        channelName: string | null;
        webhookId: string | null;
        threadId: string | null;
        threadName: string | null;
        targetId: string | null;
        hasData: boolean;
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
            channelId: string | null;
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
        channelType: "text" | "forum" | null;
        readable: boolean;
        createdAt: Date;
        username: string | null;
        avatarUrl: string | null;
        discordName: string | null;
        discordAvatarUrl: string | null;
        lastCheckAt: Date | null;
        lastCheckOk: boolean | null;
        lastCheckError: string | null;
    }[]>;
    createWebhook(a: Actor, b: z.infer<typeof webhookCreateSchema>): Promise<{
        id: string;
        name: string;
        webhookId: string;
        channelId: string | null;
        channelName: string | null;
        channelType: "text" | "forum" | null;
        readable: boolean;
        createdAt: Date;
        username: string | null;
        avatarUrl: string | null;
        discordName: string | null;
        discordAvatarUrl: string | null;
        lastCheckAt: Date | null;
        lastCheckOk: boolean | null;
        lastCheckError: string | null;
    }>;
    updateWebhook(a: Actor, id: string, b: z.infer<typeof webhookUpdateSchema>): Promise<{
        id: string;
        name: string;
        webhookId: string;
        channelId: string | null;
        channelName: string | null;
        channelType: "text" | "forum" | null;
        readable: boolean;
        createdAt: Date;
        username: string | null;
        avatarUrl: string | null;
        discordName: string | null;
        discordAvatarUrl: string | null;
        lastCheckAt: Date | null;
        lastCheckOk: boolean | null;
        lastCheckError: string | null;
    }>;
    testWebhook(a: Actor, id: string): Promise<{
        ok: boolean;
        error: string | null;
        webhook: {
            id: string;
            name: string;
            webhookId: string;
            channelId: string | null;
            channelName: string | null;
            channelType: "text" | "forum" | null;
            readable: boolean;
            createdAt: Date;
            username: string | null;
            avatarUrl: string | null;
            discordName: string | null;
            discordAvatarUrl: string | null;
            lastCheckAt: Date | null;
            lastCheckOk: boolean | null;
            lastCheckError: string | null;
        };
    }>;
    removeWebhook(a: Actor, id: string): Promise<void>;
}
/** Nur für den Bot: Versandaufträge abholen und Ergebnisse je Nachricht melden, Aktionen interaktiver Komponenten auflösen. */
export declare class BotMessageBuilderController {
    private readonly send;
    private readonly msgs;
    constructor(send: MessageBuilderSendService, msgs: MessageBuilderMessagesService);
    target(id: string): Promise<{
        proceed: false;
        guildId?: undefined;
        channelId?: undefined;
        messageId?: undefined;
    } | {
        proceed: true;
        guildId: string | null;
        channelId: string;
        messageId: string;
    }>;
    loaded(id: string, b: z.infer<typeof loadedSchema>): Promise<void>;
    start(id: string): Promise<{
        proceed: false;
    } | {
        items: {
            position: number;
            payload: import("@prisma/client/runtime/library").JsonValue;
        }[];
        messageId?: string | undefined;
        proceed: true;
        kind: "SEND" | "EDIT";
        guildId: string | null;
        channelId: string | null;
        threadId: string | null;
        threadName: string | null;
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
    } | {
        type: "multi";
        actions: import("@enrp/shared").MbAction[];
    }>;
}
export {};
