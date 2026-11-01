import { z } from 'zod';
import { type MbAction, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { MessageBuilderService } from './message-builder.service';
import { MessageBuilderSendService } from './message-builder-send.service';
/** Discord-Nachrichtenlink: https://discord.com/channels/<Server>/<Kanal>/<Nachricht> (auch ptb/canary/discordapp). */
export declare const MESSAGE_LINK: RegExp;
export declare const loadLinkSchema: z.ZodObject<{
    link: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    link: string;
    name?: string | undefined;
}, {
    link: string;
    name?: string | undefined;
}>;
export declare const renameSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const editSchema: z.ZodObject<{
    data: z.ZodObject<{
        messages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            content: z.ZodDefault<z.ZodString>;
            embeds: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                title: z.ZodDefault<z.ZodString>;
                url: z.ZodDefault<z.ZodString>;
                description: z.ZodDefault<z.ZodString>;
                color: z.ZodDefault<z.ZodString>;
                authorName: z.ZodDefault<z.ZodString>;
                authorUrl: z.ZodDefault<z.ZodString>;
                authorIconUrl: z.ZodDefault<z.ZodString>;
                thumbnailUrl: z.ZodDefault<z.ZodString>;
                imageUrl: z.ZodDefault<z.ZodString>;
                footerText: z.ZodDefault<z.ZodString>;
                footerIconUrl: z.ZodDefault<z.ZodString>;
                timestamp: z.ZodDefault<z.ZodEnum<["none", "send", "custom"]>>;
                timestampAt: z.ZodDefault<z.ZodString>;
                fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodDefault<z.ZodString>;
                    value: z.ZodDefault<z.ZodString>;
                    inline: z.ZodDefault<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    value: string;
                    id: string;
                    name: string;
                    inline: boolean;
                }, {
                    id: string;
                    value?: string | undefined;
                    name?: string | undefined;
                    inline?: boolean | undefined;
                }>, "many">>;
            }, "strip", z.ZodTypeAny, {
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
            }, {
                id: string;
                title?: string | undefined;
                color?: string | undefined;
                timestamp?: "send" | "custom" | "none" | undefined;
                fields?: {
                    id: string;
                    value?: string | undefined;
                    name?: string | undefined;
                    inline?: boolean | undefined;
                }[] | undefined;
                description?: string | undefined;
                url?: string | undefined;
                authorName?: string | undefined;
                authorUrl?: string | undefined;
                authorIconUrl?: string | undefined;
                thumbnailUrl?: string | undefined;
                imageUrl?: string | undefined;
                footerText?: string | undefined;
                footerIconUrl?: string | undefined;
                timestampAt?: string | undefined;
            }>, "many">>;
            rows: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"buttons">;
                buttons: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    kind: z.ZodDefault<z.ZodEnum<["link", "action"]>>;
                    label: z.ZodDefault<z.ZodString>;
                    emoji: z.ZodDefault<z.ZodString>;
                    style: z.ZodDefault<z.ZodEnum<["primary", "secondary", "success", "danger"]>>;
                    url: z.ZodDefault<z.ZodString>;
                    disabled: z.ZodDefault<z.ZodBoolean>;
                    action: z.ZodDefault<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
                        type: z.ZodLiteral<"reply">;
                        text: z.ZodDefault<z.ZodString>;
                    }, "strip", z.ZodTypeAny, {
                        type: "reply";
                        text: string;
                    }, {
                        type: "reply";
                        text?: string | undefined;
                    }>, z.ZodObject<{
                        type: z.ZodLiteral<"role">;
                        roleId: z.ZodDefault<z.ZodString>;
                        mode: z.ZodDefault<z.ZodEnum<["toggle", "add", "remove"]>>;
                    }, "strip", z.ZodTypeAny, {
                        type: "role";
                        roleId: string;
                        mode: "remove" | "add" | "toggle";
                    }, {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    }>]>>;
                    keepCustomId: z.ZodDefault<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
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
                }, {
                    id: string;
                    label?: string | undefined;
                    kind?: "action" | "link" | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    style?: "danger" | "secondary" | "success" | "primary" | undefined;
                    url?: string | undefined;
                    disabled?: boolean | undefined;
                    keepCustomId?: string | undefined;
                }>, "many">>;
            }, "strip", z.ZodTypeAny, {
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
            }, {
                type: "buttons";
                id: string;
                buttons?: {
                    id: string;
                    label?: string | undefined;
                    kind?: "action" | "link" | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    style?: "danger" | "secondary" | "success" | "primary" | undefined;
                    url?: string | undefined;
                    disabled?: boolean | undefined;
                    keepCustomId?: string | undefined;
                }[] | undefined;
            }>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"select">;
                placeholder: z.ZodDefault<z.ZodString>;
                disabled: z.ZodDefault<z.ZodBoolean>;
                options: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    label: z.ZodDefault<z.ZodString>;
                    description: z.ZodDefault<z.ZodString>;
                    emoji: z.ZodDefault<z.ZodString>;
                    action: z.ZodDefault<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
                        type: z.ZodLiteral<"reply">;
                        text: z.ZodDefault<z.ZodString>;
                    }, "strip", z.ZodTypeAny, {
                        type: "reply";
                        text: string;
                    }, {
                        type: "reply";
                        text?: string | undefined;
                    }>, z.ZodObject<{
                        type: z.ZodLiteral<"role">;
                        roleId: z.ZodDefault<z.ZodString>;
                        mode: z.ZodDefault<z.ZodEnum<["toggle", "add", "remove"]>>;
                    }, "strip", z.ZodTypeAny, {
                        type: "role";
                        roleId: string;
                        mode: "remove" | "add" | "toggle";
                    }, {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    }>]>>;
                }, "strip", z.ZodTypeAny, {
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
                }, {
                    id: string;
                    label?: string | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    description?: string | undefined;
                }>, "many">>;
                minValues: z.ZodDefault<z.ZodNumber>;
                maxValues: z.ZodDefault<z.ZodNumber>;
                keepCustomId: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
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
            }, {
                type: "select";
                id: string;
                options?: {
                    id: string;
                    label?: string | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    description?: string | undefined;
                }[] | undefined;
                placeholder?: string | undefined;
                disabled?: boolean | undefined;
                keepCustomId?: string | undefined;
                minValues?: number | undefined;
                maxValues?: number | undefined;
            }>]>, "many">>;
            mentions: z.ZodDefault<z.ZodObject<{
                users: z.ZodDefault<z.ZodBoolean>;
                roles: z.ZodDefault<z.ZodBoolean>;
                everyone: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                roles: boolean;
                users: boolean;
                everyone: boolean;
            }, {
                roles?: boolean | undefined;
                users?: boolean | undefined;
                everyone?: boolean | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
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
        }, {
            id: string;
            content?: string | undefined;
            embeds?: {
                id: string;
                title?: string | undefined;
                color?: string | undefined;
                timestamp?: "send" | "custom" | "none" | undefined;
                fields?: {
                    id: string;
                    value?: string | undefined;
                    name?: string | undefined;
                    inline?: boolean | undefined;
                }[] | undefined;
                description?: string | undefined;
                url?: string | undefined;
                authorName?: string | undefined;
                authorUrl?: string | undefined;
                authorIconUrl?: string | undefined;
                thumbnailUrl?: string | undefined;
                imageUrl?: string | undefined;
                footerText?: string | undefined;
                footerIconUrl?: string | undefined;
                timestampAt?: string | undefined;
            }[] | undefined;
            rows?: ({
                type: "buttons";
                id: string;
                buttons?: {
                    id: string;
                    label?: string | undefined;
                    kind?: "action" | "link" | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    style?: "danger" | "secondary" | "success" | "primary" | undefined;
                    url?: string | undefined;
                    disabled?: boolean | undefined;
                    keepCustomId?: string | undefined;
                }[] | undefined;
            } | {
                type: "select";
                id: string;
                options?: {
                    id: string;
                    label?: string | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    description?: string | undefined;
                }[] | undefined;
                placeholder?: string | undefined;
                disabled?: boolean | undefined;
                keepCustomId?: string | undefined;
                minValues?: number | undefined;
                maxValues?: number | undefined;
            })[] | undefined;
            mentions?: {
                roles?: boolean | undefined;
                users?: boolean | undefined;
                everyone?: boolean | undefined;
            } | undefined;
        }>, "many">>;
        webhookProfile: z.ZodDefault<z.ZodObject<{
            username: z.ZodDefault<z.ZodString>;
            avatarUrl: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            username: string;
            avatarUrl: string;
        }, {
            username?: string | undefined;
            avatarUrl?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
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
    }, {
        messages?: {
            id: string;
            content?: string | undefined;
            embeds?: {
                id: string;
                title?: string | undefined;
                color?: string | undefined;
                timestamp?: "send" | "custom" | "none" | undefined;
                fields?: {
                    id: string;
                    value?: string | undefined;
                    name?: string | undefined;
                    inline?: boolean | undefined;
                }[] | undefined;
                description?: string | undefined;
                url?: string | undefined;
                authorName?: string | undefined;
                authorUrl?: string | undefined;
                authorIconUrl?: string | undefined;
                thumbnailUrl?: string | undefined;
                imageUrl?: string | undefined;
                footerText?: string | undefined;
                footerIconUrl?: string | undefined;
                timestampAt?: string | undefined;
            }[] | undefined;
            rows?: ({
                type: "buttons";
                id: string;
                buttons?: {
                    id: string;
                    label?: string | undefined;
                    kind?: "action" | "link" | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    style?: "danger" | "secondary" | "success" | "primary" | undefined;
                    url?: string | undefined;
                    disabled?: boolean | undefined;
                    keepCustomId?: string | undefined;
                }[] | undefined;
            } | {
                type: "select";
                id: string;
                options?: {
                    id: string;
                    label?: string | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    description?: string | undefined;
                }[] | undefined;
                placeholder?: string | undefined;
                disabled?: boolean | undefined;
                keepCustomId?: string | undefined;
                minValues?: number | undefined;
                maxValues?: number | undefined;
            })[] | undefined;
            mentions?: {
                roles?: boolean | undefined;
                users?: boolean | undefined;
                everyone?: boolean | undefined;
            } | undefined;
        }[] | undefined;
        webhookProfile?: {
            username?: string | undefined;
            avatarUrl?: string | undefined;
        } | undefined;
    }>;
    confirm: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
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
    confirm: true;
}, {
    data: {
        messages?: {
            id: string;
            content?: string | undefined;
            embeds?: {
                id: string;
                title?: string | undefined;
                color?: string | undefined;
                timestamp?: "send" | "custom" | "none" | undefined;
                fields?: {
                    id: string;
                    value?: string | undefined;
                    name?: string | undefined;
                    inline?: boolean | undefined;
                }[] | undefined;
                description?: string | undefined;
                url?: string | undefined;
                authorName?: string | undefined;
                authorUrl?: string | undefined;
                authorIconUrl?: string | undefined;
                thumbnailUrl?: string | undefined;
                imageUrl?: string | undefined;
                footerText?: string | undefined;
                footerIconUrl?: string | undefined;
                timestampAt?: string | undefined;
            }[] | undefined;
            rows?: ({
                type: "buttons";
                id: string;
                buttons?: {
                    id: string;
                    label?: string | undefined;
                    kind?: "action" | "link" | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    style?: "danger" | "secondary" | "success" | "primary" | undefined;
                    url?: string | undefined;
                    disabled?: boolean | undefined;
                    keepCustomId?: string | undefined;
                }[] | undefined;
            } | {
                type: "select";
                id: string;
                options?: {
                    id: string;
                    label?: string | undefined;
                    action?: {
                        type: "reply";
                        text?: string | undefined;
                    } | {
                        type: "role";
                        roleId?: string | undefined;
                        mode?: "remove" | "add" | "toggle" | undefined;
                    } | undefined;
                    emoji?: string | undefined;
                    description?: string | undefined;
                }[] | undefined;
                placeholder?: string | undefined;
                disabled?: boolean | undefined;
                keepCustomId?: string | undefined;
                minValues?: number | undefined;
                maxValues?: number | undefined;
            })[] | undefined;
            mentions?: {
                roles?: boolean | undefined;
                users?: boolean | undefined;
                everyone?: boolean | undefined;
            } | undefined;
        }[] | undefined;
        webhookProfile?: {
            username?: string | undefined;
            avatarUrl?: string | undefined;
        } | undefined;
    };
    confirm: true;
}>;
export declare const messagesQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/** Antwort des Bots auf „Nachricht laden“. */
export declare const loadedSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    error: z.ZodOptional<z.ZodString>;
    /** bot = vom Bot selbst, webhook = von einem Webhook (Discord-ID), other = fremd */
    author: z.ZodOptional<z.ZodEnum<["bot", "webhook", "other"]>>;
    webhookId: z.ZodOptional<z.ZodString>;
    /** Kanal, in dem die Nachricht liegt; parentId, wenn das ein Thread ist */
    channelId: z.ZodOptional<z.ZodString>;
    parentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channelName: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodObject<{
        content: z.ZodOptional<z.ZodString>;
        embeds: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        components: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
    }, "strip", z.ZodTypeAny, {
        content?: string | undefined;
        embeds?: unknown[] | undefined;
        components?: unknown[] | undefined;
    }, {
        content?: string | undefined;
        embeds?: unknown[] | undefined;
        components?: unknown[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
    message?: {
        content?: string | undefined;
        embeds?: unknown[] | undefined;
        components?: unknown[] | undefined;
    } | undefined;
    error?: string | undefined;
    channelId?: string | undefined;
    channelName?: string | undefined;
    webhookId?: string | undefined;
    author?: "other" | "bot" | "webhook" | undefined;
    parentId?: string | null | undefined;
}, {
    ok: boolean;
    message?: {
        content?: string | undefined;
        embeds?: unknown[] | undefined;
        components?: unknown[] | undefined;
    } | undefined;
    error?: string | undefined;
    channelId?: string | undefined;
    channelName?: string | undefined;
    webhookId?: string | undefined;
    author?: "other" | "bot" | "webhook" | undefined;
    parentId?: string | null | undefined;
}>;
/**
 * Gespeicherte Discord-Nachrichten des Embed Builders: Links zu gesendeten Nachrichten, per Link geladene Bot-/Webhook-Nachrichten,
 * Bearbeiten (mit Vorschau im Dashboard), Duplizieren/erneut senden (als neuer Entwurf im Dashboard).
 *
 * Rechte: `messagebuilder.edit` für eigene (von dir gesendete) Nachrichten, `messagebuilder.edit_others` für Nachrichten anderer
 * und für per Link geladene Nachrichten, deren Absender im Dashboard unbekannt ist. Bearbeiten kann ohnehin nur der Absender:
 * der Bot seine eigenen Nachrichten, ein Webhook die eigenen (Discord erzwingt das zusätzlich).
 */
export declare class MessageBuilderMessagesService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly mb;
    private readonly send;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, mb: MessageBuilderService, send: MessageBuilderSendService);
    private row;
    /** Darf die Person diese Nachricht bearbeiten (eigene vs. fremde)? */
    private mayEdit;
    private assertEdit;
    /** Ansehen: Historie, Bearbeiten oder eigene Nachricht. */
    private assertView;
    private view;
    list(actor: Actor, q: z.infer<typeof messagesQuery>): Promise<{
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
    get(actor: Actor, id: string): Promise<{
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
    rename(actor: Actor, id: string, b: z.infer<typeof renameSchema>): Promise<{
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
    /** Link entfernen (archivieren) – die Discord-Nachricht selbst bleibt unverändert. */
    remove(actor: Actor, id: string): Promise<void>;
    /** Nachricht per Link laden: der Bot holt sie ab (nur eigene Bot- oder Webhook-Nachrichten des gewählten Servers). */
    loadByLink(actor: Actor, userName: string, b: z.infer<typeof loadLinkSchema>): Promise<{
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
    /** Inhalt erneut aus Discord laden (z. B. nachdem jemand die Nachricht in Discord geändert hat). */
    reload(actor: Actor, id: string): Promise<{
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
    /** Bearbeiten einreihen (Vorschau/Bestätigung im Dashboard). */
    edit(actor: Actor, userName: string, id: string, b: z.infer<typeof editSchema>): Promise<{
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
    botTarget(id: string): Promise<{
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
    loaded(id: string, b: z.infer<typeof loadedSchema>): Promise<undefined>;
}
/** custom_ids `mb:<Aktion>` → normale Komponenten mit der damals festgelegten Aktion (beim Speichern entsteht eine neue Aktion). */
export declare function restoreActions(d: MbDocumentData, actions: Map<string, {
    action?: MbAction;
    options?: Record<string, MbAction>;
}>): MbDocumentData;
