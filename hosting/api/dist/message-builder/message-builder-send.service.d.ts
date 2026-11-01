import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { type MbAction, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { MessageBuilderService } from './message-builder.service';
import { WebhookClient } from './webhook-client';
export declare const sendSchema: z.ZodObject<{
    documentId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    name: z.ZodDefault<z.ZodString>;
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
    /** bot = über den vorhandenen Discord-Bot (Standard), webhook = ausdrücklich gewählter Webhook, test = nur prüfen, nichts senden */
    mode: z.ZodEnum<["bot", "webhook", "test"]>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    webhookId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** optional: in einen bestehenden Thread bzw. Forum-Beitrag senden */
    threadId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** nur Forum: Titel eines neuen Beitrags (die erste Nachricht eröffnet ihn) */
    threadName: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** Bestätigung im Dialog („Jetzt senden“) */
    confirm: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    name: string;
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
    channelId: string | null;
    documentId: string | null;
    mode: "test" | "bot" | "webhook";
    webhookId: string | null;
    threadId: string | null;
    threadName: string | null;
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
    mode: "test" | "bot" | "webhook";
    confirm: true;
    name?: string | undefined;
    channelId?: string | null | undefined;
    documentId?: string | null | undefined;
    webhookId?: string | null | undefined;
    threadId?: string | null | undefined;
    threadName?: string | null | undefined;
}>;
export declare const itemResultSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    messageId: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    channelId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ok: boolean;
    error?: string | undefined;
    channelId?: string | undefined;
    messageId?: string | undefined;
}, {
    ok: boolean;
    error?: string | undefined;
    channelId?: string | undefined;
    messageId?: string | undefined;
}>;
export declare const finishSchema: z.ZodObject<{
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    error?: string | undefined;
}, {
    error?: string | undefined;
}>;
export declare const interactionSchema: z.ZodObject<{
    actionId: z.ZodString;
    value: z.ZodOptional<z.ZodString>;
    values: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    guildId: string | null;
    discordId: string;
    actionId: string;
    value?: string | undefined;
    values?: string[] | undefined;
}, {
    discordId: string;
    actionId: string;
    guildId?: string | null | undefined;
    value?: string | undefined;
    values?: string[] | undefined;
}>;
export declare const webhookCreateSchema: z.ZodObject<{
    name: z.ZodString;
    url: z.ZodString;
    username: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    avatarUrl: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    username: string | null;
    avatarUrl: string | null;
    url: string;
}, {
    name: string;
    url: string;
    username?: string | null | undefined;
    avatarUrl?: string | null | undefined;
}>;
export declare const webhookUpdateSchema: z.ZodObject<{
    name: z.ZodString;
    username: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    avatarUrl: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    /** zusätzlich den Namen des Webhooks in Discord ändern (Discord erlaubt das mit dem Webhook-Token) */
    discordName: z.ZodDefault<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    discordName: string | null;
    username: string | null;
    avatarUrl: string | null;
}, {
    name: string;
    discordName?: string | null | undefined;
    username?: string | null | undefined;
    avatarUrl?: string | null | undefined;
}>;
export declare const historyQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodEnum<["SEND", "EDIT"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: string | undefined;
    kind?: "SEND" | "EDIT" | undefined;
}, {
    status?: string | undefined;
    kind?: "SEND" | "EDIT" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
/** Ziel einer Bearbeitung (gespeicherte Discord-Nachricht). */
export interface EditTarget {
    id: string;
    guildId: string | null;
    channelId: string;
    channelName: string | null;
    threadId: string | null;
    messageId: string;
    mode: string;
    webhookId: string | null;
    keptCustomIds: string[];
    name: string;
}
/** Versand der Nachrichtengruppen (Bot über die Outbox, optional Webhook, Testmodus) und Versandhistorie. */
export declare class MessageBuilderSendService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly mb;
    private readonly webhooks;
    private readonly log;
    /** laufende Webhook-Versände (Tests warten darauf) */
    readonly running: Set<Promise<void>>;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, mb: MessageBuilderService, webhooks: WebhookClient);
    send(actor: Actor, userName: string, b: z.infer<typeof sendSchema>): Promise<{
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
    private track;
    waitIdle(): Promise<void>;
    /** Webhook-Versand: Nachricht für Nachricht; bei einem Fehler werden die restlichen nicht gesendet (Reihenfolge bleibt erhalten). */
    private runWebhook;
    /** Bot holt den Auftrag ab: nur einmal (QUEUED → SENDING), sonst wird nichts gesendet (kein doppelter Versand). */
    start(sendId: string): Promise<{
        proceed: false;
    } | {
        items: {
            position: number;
            payload: Prisma.JsonValue;
        }[];
        messageId?: string | undefined;
        proceed: true;
        kind: "SEND" | "EDIT";
        guildId: string | null;
        channelId: string | null;
        threadId: string | null;
        threadName: string | null;
    }>;
    itemResult(sendId: string, position: number, b: z.infer<typeof itemResultSchema>): Promise<void>;
    /** Gesendete Nachricht als „gespeicherte Nachricht“ merken (Link, Inhalt) bzw. nach dem Bearbeiten aktualisieren. */
    private remember;
    /** Thread/Forum-Angaben prüfen (soweit der Bot Threads gemeldet hat; unbekannte Thread-IDs prüft der Bot beim Senden). */
    private checkThread;
    /**
     * Bearbeitung einer gespeicherten Nachricht einreihen: über den Bot (Outbox, der Bot bearbeitet nur eigene Nachrichten)
     * bzw. direkt über den Webhook, der sie gesendet hat. Rechte prüft der Aufrufer (MessageBuilderMessagesService).
     */
    queueEdit(actor: Actor, userName: string, t: EditTarget, data: MbDocumentData): Promise<{
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
    private runWebhookEdit;
    /** Abschluss: nicht gesendete Nachrichten → übersprungen; Gesamtstatus aus den Einzelstatus (nie „gesendet“, wenn etwas fehlte). */
    finish(sendId: string, b: z.infer<typeof finishSchema>): Promise<void>;
    /** Aufträge, die der Bot nie abgeholt bzw. nie abgeschlossen hat, ehrlich als fehlgeschlagen markieren. */
    expireStale(now?: number): Promise<void>;
    private view;
    /** Einzelner Versand: wer gesendet hat, sieht den Status immer; sonst Recht „Versandhistorie“. */
    get(actor: Actor, id: string): Promise<{
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
    /** Inhalt eines früheren Versands wieder als neuen Entwurf öffnen (eigener Versand oder Recht „Versandhistorie“). */
    toDraft(actor: Actor, id: string): Promise<{
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
    interaction(b: z.infer<typeof interactionSchema>): Promise<MbAction | {
        type: 'gone';
    } | {
        type: 'multi';
        actions: MbAction[];
    }>;
    listWebhooks(): Promise<{
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
    private webhookRow;
    /** Name/Standardprofil ändern; optional auch den Namen in Discord (geht mit dem Webhook-Token). */
    updateWebhook(actor: Actor, id: string, b: z.infer<typeof webhookUpdateSchema>): Promise<{
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
    /** Verbindung testen: Webhook bei Discord abfragen (ohne etwas zu senden); Name, Avatar und Kanal aktualisieren. */
    testWebhook(actor: Actor, id: string): Promise<{
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
    createWebhook(actor: Actor, b: z.infer<typeof webhookCreateSchema>): Promise<{
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
    removeWebhook(actor: Actor, id: string): Promise<void>;
}
