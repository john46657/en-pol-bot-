import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../backup/backup.service';
import { ServerLinksService } from '../server-links/server-links.service';
/** Gesetzt von der früheren Umstellung „ein fester Discord-Server“ (Wert: `guildId` des Servers, für den zusammengeführt wurde). */
export declare const SINGLE_SERVER_FLAG = "migration.singleServer";
/** Gesetzt, sobald die Daten aus dem Ein-Server-Betrieb wieder einem Server gehören. */
export declare const MULTI_RESTORE_FLAG = "migration.multiServerRestore";
/**
 * Tabellen mit Akten-Bereich (`serverId`) und ihren Eindeutigkeiten je Bereich. Im Ein-Server-Betrieb gehörte alles zum
 * Bestand `serverId` = NULL; jetzt gehört es dem Server, für den damals zusammengeführt wurde.
 */
export declare const DATA_TABLES: [string, string[]][];
/**
 * Tabellen mit Discord-Server-Spalte (`guildId`), in denen „leer“ für ALLE Server gilt (bzw. keinem gehört). Was im
 * Ein-Server-Betrieb ohne Server entstand, gehört dem Server – sonst sähe es jeder neue Server.
 */
export declare const GUILD_TABLES: string[];
export interface RestoreResult {
    status: 'nothing' | 'done' | 'postponed';
    guildId: string | null;
    backup?: string;
    reason?: string;
    summary?: Record<string, unknown>;
}
/**
 * Einmalige Rück-Umstellung vom Ein-Server-Betrieb auf getrennte Discord-Server (eine Website, je Server eigene Akten).
 * Alles, was es gibt, gehört danach dem Server, für den damals zusammengeführt wurde (z. B. EN | Polizei):
 *  - Akten (`serverId` = NULL) → eigener Akten-Bereich dieses Servers; Einträge mit `guildId` = leer → dieser Server
 *  - zentrale Einstellungen → Einstellungen dieses Servers; zentrale Rollen, Rechte, Zuweisungen und persönliche Ausnahmen →
 *    Rollen dieses Servers (alte, im Ein-Server-Betrieb überholte Server-Rollen/-Ausnahmen werden exakt angeglichen, damit
 *    niemand entzogene Rechte zurückbekommt); zentral bleiben nur Vorlagen für neue Server und „System Administrator“
 *  - zentral abgeschaltete Module → auf diesem Server abgeschaltet
 *  - geteilte Akten zwischen Servern (Server-Verbund) werden aufgehoben: Server teilen keine Akten.
 * Vorher wird ein Backup angelegt (schlägt es fehl, wird nichts verändert). Gesperrt gegen parallele Instanzen; läuft nach dem
 * Einspielen eines Backups aus dem Ein-Server-Betrieb erneut.
 */
export declare class MultiServerRestoreService implements OnModuleInit {
    private readonly prisma;
    private readonly backup;
    private readonly links;
    private readonly log;
    constructor(prisma: PrismaService, backup: BackupService, links: ServerLinksService);
    onModuleInit(): Promise<void>;
    /** Steht die Rück-Umstellung noch aus? (Ein-Server-Betrieb lief, Rück-Umstellung noch nicht.) */
    pending(): Promise<boolean>;
    /** Server, dem die Daten gehören: der, für den zusammengeführt wurde – sonst der eingerichtete. */
    private home;
    run(): Promise<RestoreResult>;
    /** Server teilen keine Akten mehr: Gruppen mit „Akten teilen“ und der gemeinsame Bestand werden aufgehoben. */
    private unlinkRecords;
    /** Server registriert und aktiv; Rollen werden hier selbst angeglichen (nicht von `initServerRoles`). */
    private ensureServer;
    private moveData;
    /** Zentrale Werte sind der aktuelle Stand → Einstellungen des Servers (überholte Server-Werte von früher werden ersetzt). */
    private moveSettings;
    /**
     * Zentrale Rollen (= aktueller Stand) → Rollen des Servers: Rechte, Discord-Verknüpfung und Zuweisungen exakt übernehmen.
     * Server-Rollen ohne zentrales Gegenstück wurden im Ein-Server-Betrieb gelöscht → entfernt. Zentral bleiben Vorlagen ohne
     * Zuweisungen. „System Administrator“ bleibt global (manuell vergeben); wer ihn über eine Discord-Rolle hatte, wird
     * Administrator dieses Servers.
     */
    private moveRoles;
    /** Persönliche Ausnahmen: zentrale (= aktueller Stand) gelten jetzt auf diesem Server; überholte Server-Ausnahmen entfallen. */
    private moveOverrides;
    /** Zentral abgeschaltete Module → auf diesem Server abgeschaltet, alle anderen an. */
    private moveModules;
    /** Konten ohne Discord (Passwort-Anmeldung) mit Rollen auf diesem Server: manuelle Mitgliedschaft, damit sie Zugang behalten. */
    private manualMembers;
}
