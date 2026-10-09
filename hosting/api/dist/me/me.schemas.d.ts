import { z } from 'zod';
/**
 * Persönliche Einstellungen – gelten nur für den Benutzer selbst. Unbekannte Felder werden verworfen,
 * alle Werte sind begrenzt (kein Ablageort für beliebige Daten).
 */
export declare const preferencesSchema: z.ZodObject<{
    theme: z.ZodOptional<z.ZodEnum<["dark", "light", "system"]>>;
    accent: z.ZodOptional<z.ZodString>;
    background: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        type: z.ZodEnum<["none", "color", "gradient", "image"]>;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "color" | "none" | "gradient" | "image";
        value: string;
    }, {
        type: "color" | "none" | "gradient" | "image";
        value: string;
    }>, {
        type: "color" | "none" | "gradient" | "image";
        value: string;
    }, {
        type: "color" | "none" | "gradient" | "image";
        value: string;
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
    /** Zeilen pro Tabellenseite (große Seiten werden virtualisiert dargestellt). */
    tablePageSize: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<25>, z.ZodLiteral<50>, z.ZodLiteral<100>, z.ZodLiteral<250>, z.ZodLiteral<500>]>>;
    teamList: z.ZodOptional<z.ZodObject<{
        view: z.ZodEnum<["cards", "table"]>;
        search: z.ZodOptional<z.ZodString>;
        filters: z.ZodOptional<z.ZodObject<{
            team: z.ZodOptional<z.ZodString>;
            rank: z.ZodOptional<z.ZodString>;
            office: z.ZodOptional<z.ZodString>;
            status: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        }, {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        view: "cards" | "table";
        search?: string | undefined;
        filters?: {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        } | undefined;
    }, {
        view: "cards" | "table";
        search?: string | undefined;
        filters?: {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        } | undefined;
    }>>;
    /** Persönliche CAD-Ansicht (nur für diesen Benutzer). */
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
        erlcServerId?: string | undefined;
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
        sound?: boolean | undefined;
        setupHidden?: boolean | undefined;
    }, {
        erlcServerId?: string | undefined;
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
        sound?: boolean | undefined;
        setupHidden?: boolean | undefined;
    }>>;
    /** Persönliche Filter/Sortierung der Polizeifahrzeuge. */
    fleet: z.ZodOptional<z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
        filters: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            color: z.ZodOptional<z.ZodString>;
            owner: z.ZodOptional<z.ZodString>;
            unit: z.ZodOptional<z.ZodString>;
            active: z.ZodOptional<z.ZodEnum<["active", "inactive", "all"]>>;
            online: z.ZodOptional<z.ZodEnum<["all", "yes", "no"]>>;
        }, "strip", z.ZodTypeAny, {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        }, {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        }>>;
        sort: z.ZodOptional<z.ZodObject<{
            key: z.ZodString;
            dir: z.ZodEnum<["asc", "desc"]>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            dir: "asc" | "desc";
        }, {
            key: string;
            dir: "asc" | "desc";
        }>>;
        mapFilter: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        search?: string | undefined;
        sort?: {
            key: string;
            dir: "asc" | "desc";
        } | undefined;
        filters?: {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        } | undefined;
        mapFilter?: string | undefined;
    }, {
        search?: string | undefined;
        sort?: {
            key: string;
            dir: "asc" | "desc";
        } | undefined;
        filters?: {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        } | undefined;
        mapFilter?: string | undefined;
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
        categoryIds: string[];
        sort: "name" | "position" | "members";
        compact: boolean;
        channelIds: string[];
        maxChannels: number;
        showEmpty?: boolean | undefined;
        showDuration?: boolean | undefined;
    }, {
        categoryIds: string[];
        sort: "name" | "position" | "members";
        compact: boolean;
        channelIds: string[];
        maxChannels: number;
        showEmpty?: boolean | undefined;
        showDuration?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    theme?: "system" | "dark" | "light" | undefined;
    timezone?: string | undefined;
    notifications?: {
        muted: string[];
        toasts?: boolean | undefined;
    } | undefined;
    cad?: {
        erlcServerId?: string | undefined;
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
        sound?: boolean | undefined;
        setupHidden?: boolean | undefined;
    } | undefined;
    voice?: {
        categoryIds: string[];
        sort: "name" | "position" | "members";
        compact: boolean;
        channelIds: string[];
        maxChannels: number;
        showEmpty?: boolean | undefined;
        showDuration?: boolean | undefined;
    } | undefined;
    fleet?: {
        search?: string | undefined;
        sort?: {
            key: string;
            dir: "asc" | "desc";
        } | undefined;
        filters?: {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        } | undefined;
        mapFilter?: string | undefined;
    } | undefined;
    accent?: string | undefined;
    background?: {
        type: "color" | "none" | "gradient" | "image";
        value: string;
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
    dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
    favorites?: string[] | undefined;
    quickActions?: string[] | undefined;
    tablePageSize?: 500 | 25 | 100 | 50 | 250 | undefined;
    teamList?: {
        view: "cards" | "table";
        search?: string | undefined;
        filters?: {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        } | undefined;
    } | undefined;
}, {
    theme?: "system" | "dark" | "light" | undefined;
    timezone?: string | undefined;
    notifications?: {
        muted: string[];
        toasts?: boolean | undefined;
    } | undefined;
    cad?: {
        erlcServerId?: string | undefined;
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
        sound?: boolean | undefined;
        setupHidden?: boolean | undefined;
    } | undefined;
    voice?: {
        categoryIds: string[];
        sort: "name" | "position" | "members";
        compact: boolean;
        channelIds: string[];
        maxChannels: number;
        showEmpty?: boolean | undefined;
        showDuration?: boolean | undefined;
    } | undefined;
    fleet?: {
        search?: string | undefined;
        sort?: {
            key: string;
            dir: "asc" | "desc";
        } | undefined;
        filters?: {
            model?: string | undefined;
            unit?: string | undefined;
            active?: "active" | "inactive" | "all" | undefined;
            color?: string | undefined;
            owner?: string | undefined;
            online?: "all" | "yes" | "no" | undefined;
        } | undefined;
        mapFilter?: string | undefined;
    } | undefined;
    accent?: string | undefined;
    background?: {
        type: "color" | "none" | "gradient" | "image";
        value: string;
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
    dateFormat?: "DD.MM.YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | undefined;
    favorites?: string[] | undefined;
    quickActions?: string[] | undefined;
    tablePageSize?: 500 | 25 | 100 | 50 | 250 | undefined;
    teamList?: {
        view: "cards" | "table";
        search?: string | undefined;
        filters?: {
            status?: string | undefined;
            rank?: string | undefined;
            team?: string | undefined;
            office?: string | undefined;
        } | undefined;
    } | undefined;
}>;
export type Preferences = z.infer<typeof preferencesSchema>;
export declare const layoutsSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
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
            size: "S" | "M" | "L" | "XL";
            widget: string;
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
            size: "S" | "M" | "L" | "XL";
            widget: string;
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
            size: "S" | "M" | "L" | "XL";
            widget: string;
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
            size: "S" | "M" | "L" | "XL";
            widget: string;
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
            size: "S" | "M" | "L" | "XL";
            widget: string;
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
}>;
export type Layouts = z.infer<typeof layoutsSchema>;
