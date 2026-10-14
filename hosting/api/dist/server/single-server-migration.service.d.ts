import { type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from '../backup/backup.service';
import { HomeServerService } from './home-server.service';
export declare const SINGLE_SERVER_FLAG = "migration.singleServer";
/** Einstellungen, die es früher je Discord-Server gab (`<Schlüssel>@<Server-ID>`); jetzt gibt es nur noch `<Schlüssel>`. */
export declare const FORMER_PER_SERVER_SETTINGS: readonly string[];
export interface MigrationResult {
    status: 'done' | 'nothing' | 'postponed';
    guildId: string | null;
    backup?: string | null;
    settings?: number;
    roles?: number;
    overrides?: number;
    modules?: string[];
    records?: number;
    keptApart?: number;
    reason?: string;
}
/**
 * Einmalige Umstellung von „mehrere Discord-Server“ auf EINEN Server mit zentraler Konfiguration. Läuft beim Start (und nach dem
 * Einspielen eines älteren Backups), bis sie erledigt ist; mehrere Instanzen sperren sich gegenseitig.
 *
 * Vorher wird ein vollständiges Daten-Backup angelegt (Administration → Backups, Art „vor Umstellung“) – ohne Backup keine Umstellung.
 * Gelöscht wird NICHTS: Werte je Server, Server-Rollen, Ausnahmen je Server und Server-Tabellen bleiben als Archiv in der Datenbank.
 *  - Einstellungen: Der jeweils zuletzt gespeicherte Wert (zentral oder der des Servers) wird der zentrale Wert. Ersetzte zentrale
 *    Werte stehen im Ergebnis (`migration.singleServer` → `replaced`).
 *  - Rollen: Rollen des Servers werden mit der gleichnamigen zentralen Rolle zusammengeführt (Zuweisungen vereinigt; Rechte und
 *    Eigenschaften der zuletzt geänderten Fassung; Discord-Rollen-Zuordnungen des Servers kommen dazu). Ohne zentrales Gegenstück
 *    wird die Server-Rolle selbst zentral.
 *  - Persönliche Ausnahmen des Servers werden zentral; widersprechen sie einer zentralen Ausnahme, gewinnt das Verbot.
 *  - Abgeschaltete Module des Servers bleiben abgeschaltet (jetzt zentral). Wochen-Reset des Servers → zentraler Wochen-Reset, falls dieser aus war.
 *  - Fachdaten aller früheren Bereiche gehören zum einen Bestand. Würde ein Eintrag dabei eine Eindeutigkeit verletzen (z. B. zwei
 *    Personalakten desselben Benutzers), bleibt der weniger aktuelle in seinem Bereich stehen (sichtbar, nur nicht eindeutig).
 */
export declare class SingleServerMigrationService implements OnModuleInit {
    private readonly prisma;
    private readonly backup;
    private readonly home;
    private readonly log;
    constructor(prisma: PrismaService, backup: BackupService, home: HomeServerService);
    onModuleInit(): Promise<void>;
    /** Gibt es noch Daten aus der Multi-Server-Zeit, die zusammengeführt werden müssen? */
    private pending;
    /** Server, dessen Werte zentral werden: der eingerichtete – sonst der einzige, der in den Daten vorkommt. */
    private target;
    run(): Promise<MigrationResult>;
    /** Jeweils der zuletzt gespeicherte Wert (zentral oder der des Servers bzw. seiner früheren Einstellungs-Gruppe) wird zentral. */
    private mergeSettings;
    /** Letzte Änderung einer Rolle laut Audit-Log (Rechte, Name, Discord-Rollen …). */
    private lastChange;
    private mergeRoles;
    /** Ausnahmen des Servers werden zentral; bei Widerspruch gewinnt das Verbot (niemand gewinnt durch die Umstellung Rechte). */
    private mergeOverrides;
    private mergeModules;
    /**
     * Alle früheren Datenbereiche → ein Bestand (`serverId` = NULL). Vorrang bei Eindeutigkeiten: Bereich des Servers, dann der
     * bisherige gemeinsame Bestand, dann andere frühere Server (jeweils neueste zuerst). Wer verliert, bleibt unverändert in seinem
     * Bereich bzw. bekommt einen eigenen (nur damit die Datenbank-Eindeutigkeit hält) – gelöscht wird nichts.
     */
    private mergeData;
    private columns;
    private hasColumn;
}
