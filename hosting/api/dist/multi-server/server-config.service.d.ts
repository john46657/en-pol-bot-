import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { ServersService } from './servers.service';
/**
 * Server-Konfiguration (Name, Branding, Design, Einrichtungsassistent). Mandant = Server aus dem PFAD; jeder Zugriff prüft
 * Mitgliedschaft und Recht genau auf diesem Server (ServersService.access). Bilder gehören genau einem Server.
 */
export declare class ServerConfigService {
    private readonly prisma;
    private readonly servers;
    private readonly audit;
    private readonly discord;
    private readonly dir;
    constructor(prisma: PrismaService, servers: ServersService, audit: AuditService, discord: DiscordService);
    private assetUrl;
    private assetOut;
    /** Gespeicherte Daten lesen; alte/beschädigte Werte → Standard statt Absturz. */
    private parse;
    /** Alles für die Einstellungsseite und den Assistenten (Recht servers.view auf diesem Server). */
    get(actor: Actor, serverId: string): Promise<{
        server: {
            id: string;
            guildId: string;
            name: string;
            status: string;
            archivedAt: Date | null;
        };
        config: {
            data: {
                general: {
                    displayName: string;
                    shortName: string;
                    dashboardTitle: string;
                    welcomeText: string;
                };
                branding: {
                    avatar: string | null;
                    logo: string | null;
                    banner: string | null;
                    background: string | null;
                    areas: {
                        dashboard: string | null;
                        team: string | null;
                        tickets: string | null;
                    };
                };
                design: {
                    primary: string;
                    mode: "user" | "dark" | "light";
                    accent: string;
                    useBackground: boolean;
                };
            };
            version: number;
            setupStep: number;
            setupCompletedAt: Date | null;
            saved: boolean;
            updatedAt: Date | null;
        };
        assets: {
            inUse: boolean;
            inRevisions: boolean;
            id: string;
            kind: string;
            mime: string;
            size: number;
            width: number;
            height: number;
            sha256: string;
            originalName: string;
            createdAt: Date;
            url: string | null;
        }[];
        bot: {
            present: boolean;
            guildName: string | null;
            icon: string | null;
            channels: number;
            roles: number;
            permissions: Partial<Record<"administrator" | "viewChannel" | "sendMessages" | "embedLinks" | "attachFiles" | "readMessageHistory" | "manageChannels" | "manageRoles", boolean>> | null;
            missing: ("viewChannel" | "sendMessages" | "embedLinks" | "attachFiles" | "readMessageHistory" | "manageChannels" | "manageRoles")[] | null;
        };
        canManage: boolean;
    }>;
    private can;
    /**
     * Branding für das Dashboard des gewählten Servers – nur für Mitglieder dieses Servers (Guild-ID aus der Anfrage wird
     * serverseitig gegen die Mitgliedschaft geprüft; fremde Server verhalten sich wie nicht vorhanden).
     */
    branding(actor: Actor, guildId: string): Promise<{
        design: {
            primary: string;
            mode: "user" | "dark" | "light";
            accent: string;
            useBackground: boolean;
        };
        images: {
            logo: string | null;
            avatar: string | null;
            banner: string | null;
            background: string | null;
            areas: {
                dashboard: string | null;
                tickets: string | null;
                team: string | null;
            };
        };
        displayName: string;
        shortName: string;
        dashboardTitle: string;
        welcomeText: string;
        serverId: string;
        guildId: string;
        configured: boolean;
        setupCompleted: boolean;
    }>;
    /** Bilder dürfen nur aus dem eigenen Bestand dieses Servers kommen – und nur in ein passendes Feld. */
    private checkAssets;
    private moduleState;
    /** Speichern (erst nach erfolgreicher Prüfung). Jede Version wird als unveränderliche Revision abgelegt. */
    save(actor: Actor, serverId: string, body: {
        data: unknown;
        version: number;
        note?: string;
    }): Promise<{
        version: number;
        data: {
            general: {
                displayName: string;
                shortName: string;
                dashboardTitle: string;
                welcomeText: string;
            };
            branding: {
                avatar: string | null;
                logo: string | null;
                banner: string | null;
                background: string | null;
                areas: {
                    dashboard: string | null;
                    team: string | null;
                    tickets: string | null;
                };
            };
            design: {
                primary: string;
                mode: "user" | "dark" | "light";
                accent: string;
                useBackground: boolean;
            };
        };
        updatedAt: Date;
    }>;
    /** Fortschritt des Einrichtungsassistenten (zum späteren Weitermachen). */
    setup(actor: Actor, serverId: string, b: {
        step: number;
        complete?: boolean;
    }): Promise<{
        setupStep: number;
        setupCompletedAt: Date | null;
    }>;
    revisions(actor: Actor, serverId: string): Promise<{
        version: number;
        note: string | null;
        createdAt: Date;
        createdBy: string | null;
        data: Prisma.JsonValue;
        modules: Prisma.JsonValue;
    }[]>;
    /**
     * Frühere Version wiederherstellen: wird als NEUE Version gespeichert (nichts wird überschrieben oder gelöscht).
     * `modules`: auch die Modul-Schalter von damals übernehmen (Recht modules.manage; Daten deaktivierter Module bleiben erhalten).
     */
    restore(actor: Actor, serverId: string, version: number, b: {
        version: number;
        modules: boolean;
    }): Promise<{
        modulesChanged: number;
        version: number;
        data: {
            general: {
                displayName: string;
                shortName: string;
                dashboardTitle: string;
                welcomeText: string;
            };
            branding: {
                avatar: string | null;
                logo: string | null;
                banner: string | null;
                background: string | null;
                areas: {
                    dashboard: string | null;
                    team: string | null;
                    tickets: string | null;
                };
            };
            design: {
                primary: string;
                mode: "user" | "dark" | "light";
                accent: string;
                useBackground: boolean;
            };
        };
        updatedAt: Date;
    }>;
    /** Hochladen mit Prüfung von echtem Dateityp (Magic Bytes), Größe und Abmessungen; nie SVG, nie Client-Dateinamen im Dateisystem. */
    upload(actor: Actor, serverId: string, kind: string, file: {
        originalname: string;
        mimetype: string;
        buffer: Buffer;
        size: number;
    } | undefined): Promise<{
        id: string;
        kind: string;
        mime: string;
        size: number;
        width: number;
        height: number;
        sha256: string;
        originalName: string;
        createdAt: Date;
        url: string | null;
    }>;
    /** Bild ausliefern – nur an Mitglieder dieses Servers und nur, wenn das Bild zu diesem Server gehört. */
    asset(actor: Actor, serverId: string, assetId: string): Promise<{
        mime: string;
        data: NonSharedBuffer;
    }>;
    /** IDs, die die aktuelle Konfiguration bzw. eine gespeicherte Version (Wiederherstellung) noch braucht. */
    private usedAssetIds;
    /**
     * Bild entfernen: nur wenn weder die aktuelle Konfiguration noch eine gespeicherte Version es verwendet und ausdrücklich
     * bestätigt (`confirm`). Der Eintrag bleibt als Nachweis erhalten, nur die Datei wird gelöscht.
     */
    removeAsset(actor: Actor, serverId: string, assetId: string, confirm: boolean): Promise<{
        ok: boolean;
    }>;
}
