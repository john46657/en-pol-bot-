import { z } from 'zod';
import { type MbChannelBotPerms, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
export declare const sf: z.ZodString;
export declare const docKind: z.ZodEnum<["DRAFT", "TEMPLATE"]>;
export declare const createDocSchema: z.ZodObject<{
    kind: z.ZodEnum<["DRAFT", "TEMPLATE"]>;
    name: z.ZodString;
    categoryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    data: z.ZodOptional<z.ZodObject<{
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
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    kind: "DRAFT" | "TEMPLATE";
    categoryId: string | null;
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
}, {
    name: string;
    kind: "DRAFT" | "TEMPLATE";
    categoryId?: string | null | undefined;
    data?: {
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
    } | undefined;
}>;
export declare const updateDocSchema: z.ZodObject<{
    name: z.ZodString;
    categoryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
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
    /** Stand, auf dem die Änderung beruht (optimistisches Sperren) */
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
    name: string;
    categoryId: string | null;
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
}, {
    version: number;
    name: string;
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
    categoryId?: string | null | undefined;
    channelId?: string | null | undefined;
}>;
export declare const copyDocSchema: z.ZodObject<{
    kind: z.ZodEnum<["DRAFT", "TEMPLATE"]>;
    name: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    kind: "DRAFT" | "TEMPLATE";
    name?: string | undefined;
    categoryId?: string | null | undefined;
}, {
    kind: "DRAFT" | "TEMPLATE";
    name?: string | undefined;
    categoryId?: string | null | undefined;
}>;
export declare const categorySchema: z.ZodObject<{
    name: z.ZodString;
    position: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    position?: number | undefined;
}, {
    name: string;
    position?: number | undefined;
}>;
export declare const channelsConfigSchema: z.ZodObject<{
    channelIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    channelIds: string[];
}, {
    channelIds: string[];
}>;
/** Message Builder arbeitet immer für genau einen Discord-Server (oben links gewählt). */
export declare function requireGuild(): string;
export type Kind = z.infer<typeof docKind>;
export interface MbChannel {
    id: string;
    name: string;
    category: string | null;
    position: number;
    bot: MbChannelBotPerms | null;
    allowed: boolean;
}
/** Discord Message Builder: Entwürfe, Vorlagen, Kategorien und erlaubte Kanäle. Versand: MessageBuilderSendService. */
export declare class MessageBuilderService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, discord: DiscordService);
    /** Entwürfe gehören der Person, die sie angelegt hat; Vorlagen sind gemeinsam und brauchen eigene Rechte. */
    private assertDoc;
    private load;
    /** Gespeicherte Daten lesen – defekte Einträge (z. B. von Hand geändert) ergeben eine leere Gruppe statt eines Absturzes. */
    dataOf(v: unknown): MbDocumentData;
    private view;
    /** Vorlagen (alle) bzw. eigene Entwürfe – ohne Inhalt. */
    list(actor: Actor, kind: Kind): Promise<{
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
    create(actor: Actor, b: z.infer<typeof createDocSchema>): Promise<{
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
    /** Autosave: gilt nur, wenn niemand zwischendurch gespeichert hat (sonst 409 mit aktuellem Stand). */
    update(actor: Actor, id: string, b: z.infer<typeof updateDocSchema>): Promise<{
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
    /** Kopie anlegen: Vorlage duplizieren, Entwurf als Vorlage speichern, Vorlage als neuen Entwurf laden. */
    copy(actor: Actor, id: string, b: z.infer<typeof copyDocSchema>): Promise<{
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
    /** Löschen = archivieren (bleibt in der Datenbank und in Backups erhalten). */
    remove(actor: Actor, id: string): Promise<void>;
    /** Kategorien des gewählten Servers; ein Server ohne Kategorien bekommt die Standard-Kategorien. */
    categories(): Promise<{
        id: string;
        name: string;
        position: number;
    }[]>;
    private assertCategory;
    createCategory(actor: Actor, b: z.infer<typeof categorySchema>): Promise<{
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        position: number;
    }>;
    updateCategory(actor: Actor, id: string, b: z.infer<typeof categorySchema>): Promise<{
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        position: number;
    }>;
    /** Kategorie löschen: Vorlagen bleiben erhalten (ohne Kategorie). */
    removeCategory(actor: Actor, id: string): Promise<void>;
    allowedChannelIds(guildId?: string | null): Promise<string[]>;
    setAllowedChannels(actor: Actor, b: z.infer<typeof channelsConfigSchema>): Promise<{
        channelIds: string[];
    }>;
    /**
     * Gewählter Discord-Server laut Bot-Meldung: Textkanäle (mit Bot-Rechten, falls gemeldet) und Rollen. Nur dieser Server –
     * Kanäle und Rollen anderer Server sind hier nie wählbar.
     */
    serverInfo(guildId?: string | null): Promise<{
        problem: "no_server";
        guild: null;
        channels: MbChannel[];
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
        channels: MbChannel[];
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
        channels: MbChannel[];
        roles: {
            id: string;
            name: string;
            color: number;
            position: number;
        }[];
        configured: boolean;
        restricted: boolean;
    }>;
    names(ids: (string | null | undefined)[]): Promise<Map<string, string>>;
}
