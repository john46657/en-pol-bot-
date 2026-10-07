import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../audit/audit.service';
declare const prefsBody: z.ZodObject<{
    preferences: z.ZodObject<{
        theme: z.ZodOptional<z.ZodEnum<["dark", "light", "system"]>>;
        accent: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            type: z.ZodEnum<["none", "color", "gradient", "image"]>;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        }, {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        }>, {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        }, {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        }>>;
        cardStyle: z.ZodOptional<z.ZodEnum<["solid", "glass", "outline"]>>;
        transparency: z.ZodOptional<z.ZodNumber>;
        radius: z.ZodOptional<z.ZodNumber>;
        shadow: z.ZodOptional<z.ZodEnum<["none", "soft", "strong"]>>;
        glow: z.ZodOptional<z.ZodBoolean>;
        animations: z.ZodOptional<z.ZodBoolean>;
        sidebarWidth: z.ZodOptional<z.ZodEnum<["narrow", "normal", "wide"]>>;
        sidebarCollapsed: z.ZodOptional<z.ZodBoolean>;
        fontSize: z.ZodOptional<z.ZodNumber>;
        density: z.ZodOptional<z.ZodEnum<["compact", "comfortable"]>>;
        language: z.ZodOptional<z.ZodEnum<["de", "en"]>>;
        timezone: z.ZodOptional<z.ZodString>;
        dateFormat: z.ZodOptional<z.ZodEnum<["DD.MM.YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]>>;
        notifications: z.ZodOptional<z.ZodObject<{
            muted: z.ZodArray<z.ZodString, "many">;
            toasts: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            muted: string[];
            toasts?: boolean | undefined;
        }, {
            muted: string[];
            toasts?: boolean | undefined;
        }>>;
        favorites: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        quickActions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        teamList: z.ZodOptional<z.ZodObject<{
            view: z.ZodEnum<["cards", "table"]>;
            search: z.ZodOptional<z.ZodString>;
            filters: z.ZodOptional<z.ZodObject<{
                team: z.ZodOptional<z.ZodString>;
                rank: z.ZodOptional<z.ZodString>;
                office: z.ZodOptional<z.ZodString>;
                status: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            }, {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        }, {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        }>>;
        cad: z.ZodOptional<z.ZodObject<{
            widgets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            hiddenLayers: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            zoom: z.ZodOptional<z.ZodNumber>;
            center: z.ZodOptional<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
            compact: z.ZodOptional<z.ZodBoolean>;
            sidebar: z.ZodOptional<z.ZodBoolean>;
            favoriteIncidents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            erlcServerId: z.ZodOptional<z.ZodString>;
            sound: z.ZodOptional<z.ZodBoolean>;
            setupHidden: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        }, {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        }>>;
        voice: z.ZodOptional<z.ZodObject<{
            channelIds: z.ZodArray<z.ZodString, "many">;
            categoryIds: z.ZodArray<z.ZodString, "many">;
            sort: z.ZodEnum<["members", "name", "position"]>;
            compact: z.ZodBoolean;
            maxChannels: z.ZodNumber;
            showEmpty: z.ZodOptional<z.ZodBoolean>;
            showDuration: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        }, {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        cad?: {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        } | undefined;
        voice?: {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        } | undefined;
        notifications?: {
            muted: string[];
            toasts?: boolean | undefined;
        } | undefined;
        theme?: "system" | "dark" | "light" | undefined;
        accent?: string | undefined;
        background?: {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        } | undefined;
        cardStyle?: "solid" | "glass" | "outline" | undefined;
        transparency?: number | undefined;
        radius?: number | undefined;
        shadow?: "none" | "soft" | "strong" | undefined;
        glow?: boolean | undefined;
        animations?: boolean | undefined;
        sidebarWidth?: "narrow" | "normal" | "wide" | undefined;
        sidebarCollapsed?: boolean | undefined;
        fontSize?: number | undefined;
        density?: "compact" | "comfortable" | undefined;
        language?: "de" | "en" | undefined;
        timezone?: string | undefined;
        dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
        favorites?: string[] | undefined;
        quickActions?: string[] | undefined;
        teamList?: {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        } | undefined;
    }, {
        cad?: {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        } | undefined;
        voice?: {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        } | undefined;
        notifications?: {
            muted: string[];
            toasts?: boolean | undefined;
        } | undefined;
        theme?: "system" | "dark" | "light" | undefined;
        accent?: string | undefined;
        background?: {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        } | undefined;
        cardStyle?: "solid" | "glass" | "outline" | undefined;
        transparency?: number | undefined;
        radius?: number | undefined;
        shadow?: "none" | "soft" | "strong" | undefined;
        glow?: boolean | undefined;
        animations?: boolean | undefined;
        sidebarWidth?: "narrow" | "normal" | "wide" | undefined;
        sidebarCollapsed?: boolean | undefined;
        fontSize?: number | undefined;
        density?: "compact" | "comfortable" | undefined;
        language?: "de" | "en" | undefined;
        timezone?: string | undefined;
        dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
        favorites?: string[] | undefined;
        quickActions?: string[] | undefined;
        teamList?: {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    preferences: {
        cad?: {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        } | undefined;
        voice?: {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        } | undefined;
        notifications?: {
            muted: string[];
            toasts?: boolean | undefined;
        } | undefined;
        theme?: "system" | "dark" | "light" | undefined;
        accent?: string | undefined;
        background?: {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        } | undefined;
        cardStyle?: "solid" | "glass" | "outline" | undefined;
        transparency?: number | undefined;
        radius?: number | undefined;
        shadow?: "none" | "soft" | "strong" | undefined;
        glow?: boolean | undefined;
        animations?: boolean | undefined;
        sidebarWidth?: "narrow" | "normal" | "wide" | undefined;
        sidebarCollapsed?: boolean | undefined;
        fontSize?: number | undefined;
        density?: "compact" | "comfortable" | undefined;
        language?: "de" | "en" | undefined;
        timezone?: string | undefined;
        dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
        favorites?: string[] | undefined;
        quickActions?: string[] | undefined;
        teamList?: {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        } | undefined;
    };
}, {
    preferences: {
        cad?: {
            compact?: boolean | undefined;
            widgets?: string[] | undefined;
            hiddenLayers?: string[] | undefined;
            zoom?: number | undefined;
            center?: {
                x: number;
                y: number;
            } | undefined;
            sidebar?: boolean | undefined;
            favoriteIncidents?: string[] | undefined;
            erlcServerId?: string | undefined;
            sound?: boolean | undefined;
            setupHidden?: boolean | undefined;
        } | undefined;
        voice?: {
            sort: "name" | "members" | "position";
            compact: boolean;
            channelIds: string[];
            categoryIds: string[];
            maxChannels: number;
            showEmpty?: boolean | undefined;
            showDuration?: boolean | undefined;
        } | undefined;
        notifications?: {
            muted: string[];
            toasts?: boolean | undefined;
        } | undefined;
        theme?: "system" | "dark" | "light" | undefined;
        accent?: string | undefined;
        background?: {
            value: string;
            type: "color" | "none" | "gradient" | "image";
        } | undefined;
        cardStyle?: "solid" | "glass" | "outline" | undefined;
        transparency?: number | undefined;
        radius?: number | undefined;
        shadow?: "none" | "soft" | "strong" | undefined;
        glow?: boolean | undefined;
        animations?: boolean | undefined;
        sidebarWidth?: "narrow" | "normal" | "wide" | undefined;
        sidebarCollapsed?: boolean | undefined;
        fontSize?: number | undefined;
        density?: "compact" | "comfortable" | undefined;
        language?: "de" | "en" | undefined;
        timezone?: string | undefined;
        dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
        favorites?: string[] | undefined;
        quickActions?: string[] | undefined;
        teamList?: {
            view: "cards" | "table";
            search?: string | undefined;
            filters?: {
                team?: string | undefined;
                status?: string | undefined;
                rank?: string | undefined;
                office?: string | undefined;
            } | undefined;
        } | undefined;
    };
}>;
declare const layoutsBody: z.ZodObject<{
    layouts: z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodObject<{
        active: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            widgets: z.ZodArray<z.ZodObject<{
                widget: z.ZodString;
                size: z.ZodDefault<z.ZodEnum<["S", "M", "L", "XL"]>>;
                minimized: z.ZodDefault<z.ZodBoolean>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }, {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }[];
        }, {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }[];
        }[];
    }, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }[];
        }[];
    }>, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }[];
        }[];
    }, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }[];
        }[];
    }>, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }[];
        }[];
    }, {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }[];
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    layouts: {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size: "S" | "M" | "L" | "XL";
                minimized: boolean;
                hidden: boolean;
            }[];
        }[];
    } | null;
}, {
    layouts: {
        active: string;
        items: {
            id: string;
            name: string;
            widgets: {
                widget: string;
                size?: "S" | "M" | "L" | "XL" | undefined;
                minimized?: boolean | undefined;
                hidden?: boolean | undefined;
            }[];
        }[];
    } | null;
}>;
/**
 * Persönliche Einstellungen und Startseiten-Layouts – je Benutzer (bei Discord-Login: je Discord-Konto) in der Datenbank,
 * damit sie auf jedem Gerät gleich sind. Jeder ändert ausschließlich seine eigenen Daten (Benutzer-ID aus der Session).
 */
export declare class MeController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    get(a: Actor): Promise<{
        preferences: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray;
        layouts: string | number | boolean | Prisma.JsonObject | Prisma.JsonArray | null;
        updatedAt: Date;
    }>;
    setPreferences(a: Actor, b: z.infer<typeof prefsBody>): Promise<{
        preferences: {
            cad?: {
                compact?: boolean | undefined;
                widgets?: string[] | undefined;
                hiddenLayers?: string[] | undefined;
                zoom?: number | undefined;
                center?: {
                    x: number;
                    y: number;
                } | undefined;
                sidebar?: boolean | undefined;
                favoriteIncidents?: string[] | undefined;
                erlcServerId?: string | undefined;
                sound?: boolean | undefined;
                setupHidden?: boolean | undefined;
            } | undefined;
            voice?: {
                sort: "name" | "members" | "position";
                compact: boolean;
                channelIds: string[];
                categoryIds: string[];
                maxChannels: number;
                showEmpty?: boolean | undefined;
                showDuration?: boolean | undefined;
            } | undefined;
            notifications?: {
                muted: string[];
                toasts?: boolean | undefined;
            } | undefined;
            theme?: "system" | "dark" | "light" | undefined;
            accent?: string | undefined;
            background?: {
                value: string;
                type: "color" | "none" | "gradient" | "image";
            } | undefined;
            cardStyle?: "solid" | "glass" | "outline" | undefined;
            transparency?: number | undefined;
            radius?: number | undefined;
            shadow?: "none" | "soft" | "strong" | undefined;
            glow?: boolean | undefined;
            animations?: boolean | undefined;
            sidebarWidth?: "narrow" | "normal" | "wide" | undefined;
            sidebarCollapsed?: boolean | undefined;
            fontSize?: number | undefined;
            density?: "compact" | "comfortable" | undefined;
            language?: "de" | "en" | undefined;
            timezone?: string | undefined;
            dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
            favorites?: string[] | undefined;
            quickActions?: string[] | undefined;
            teamList?: {
                view: "cards" | "table";
                search?: string | undefined;
                filters?: {
                    team?: string | undefined;
                    status?: string | undefined;
                    rank?: string | undefined;
                    office?: string | undefined;
                } | undefined;
            } | undefined;
        };
        savedAt: Date;
    }>;
    /** Layouts (Widgets, Reihenfolge, Größe). `null` = auf den Standard zurücksetzen. */
    setLayouts(a: Actor, b: z.infer<typeof layoutsBody>): Promise<{
        layouts: {
            active: string;
            items: {
                id: string;
                name: string;
                widgets: {
                    widget: string;
                    size: "S" | "M" | "L" | "XL";
                    minimized: boolean;
                    hidden: boolean;
                }[];
            }[];
        } | null;
        savedAt: Date;
    }>;
}
export {};
