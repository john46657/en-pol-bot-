# Multi-Server-Architektur

EN | POLIZEI kann mehrere Discord-Server gleichzeitig bedienen. **Jeder Server arbeitet standardmäßig getrennt**: eigene Module, eigene Rollen und Rechte, eigene Daten. Server lassen sich **optional** verbinden. Verbunden werden aber nur die Daten, die ausdrücklich freigegeben sind, und die kommen beim anderen Server nur als **lesende Kopie** an. **Rechte werden nie automatisch auf andere Server übertragen.**

Dieses Dokument beschreibt den Stand des Codes. Was noch fehlt, steht unter [Bekannte Einschränkungen](#bekannte-einschränkungen).

## Verantwortungsbereiche

| Bereich | Wo im Code |
|---|---|
| Authentifizierung, Benutzeridentität | `apps/api/src/auth`, `authz/guards.ts` (`AuthGuard`) |
| Discord-Integration (Mitgliedschaft, Rollenabgleich) | `authz/discord-access.service.ts`, `apps/bot` |
| Server-/Mandantenverwaltung | `multi-server/servers.service.ts`, Tabelle `DiscordServer`, `ServerMembership` |
| Modulverwaltung | `packages/shared/src/modules.ts` (Katalog), `ServerModuleSetting`, `multi-server/module-settings.ts` |
| Rollen und Berechtigungen | `authz/permission.service.ts`, `users/roles.service.ts`, `packages/shared/src/permissions.ts` |
| **Zentrale Autorisierung** | `authz/authorization.service.ts` (`AuthorizationService.authorize/assert`) |
| Fachmodule | jeweilige Module (CAD, MDT, Berichte, Dienst/Shift Logs …) |
| Serverübergreifende Synchronisierung | `multi-server/sync.service.ts`, `multi-server/connections.service.ts` |
| Audit-Logging | `audit/audit.service.ts` (`AuditLog`, unveränderlich) |
| Hintergrundaufgaben | Sync-Worker (alle 5 s), Wochen-Reset (alle 30 s und beim Start), Discord-Abgleich (alle 5 min) |
| Web-Dashboard | `apps/web/src/pages/admin/MultiServer.tsx` (*Administration → Server & Module*) |

## Datenmodell

Migration: `apps/api/prisma/migrations/20261105100000_multi_server_foundation`. Spaltennamen wie in Prisma (camelCase). Die Tabellennamen aus der Vorgabe sind auf die Codebasis abgebildet:

| Vorgabe | Umsetzung | Wichtige Regeln |
|---|---|---|
| `discord_servers` | `DiscordServer` (`guildId` eindeutig, `status` ACTIVE/DISABLED/ERROR, `archivedAt`, `version`) | Kein Server doppelt (Unique-Index). „Löschen“ heißt archivieren, die Daten bleiben. |
| `users` | `User` (bestehend) + `DiscordLink` (Discord-ID eindeutig) | Die stabile Identität ist die Discord-ID, nicht der Benutzername. |
| `server_memberships` | `ServerMembership` (eindeutig je `serverId`+`userId`, `status` MEMBER/LEFT/UNKNOWN, `source` DISCORD/MANUAL, `discordRoleIds`, `lastVerifiedAt`) | Mitglied auf A heißt nicht Zugriff auf B. |
| `modules` | `AppModule` (Schlüssel = `key`), beim Start aus dem Code-Katalog übernommen | |
| `server_module_settings` | `ServerModuleSetting` (eindeutig je `serverId`+`moduleKey`, `enabled`, `settings`, `version`, `updatedById`) | `settings` wird je Modul streng validiert (unbekannte Felder werden abgelehnt) und ersetzt nie eine Rechteprüfung. |
| `roles` | `Role` (bestehend; `guildId` = Server, `null` = serverübergreifend) | Eindeutig je (`guildId`, `name`), für serverübergreifende Rollen per Teil-Index. „System Administrator“ ist ein reservierter Name. |
| `discord_role_mappings` | `DiscordRoleMapping` (`serverId`, `discordRoleId`, `roleId`) | Die Zuordnung verleiht die interne Rolle **nur auf diesem Server**. |
| `permissions` | `Permission` (bestehend, Schlüssel z. B. `cad.view`) + Modulzuordnung über das Präfix | |
| `role_permissions` | `RolePermission` (bestehend, eindeutig je Rolle+Recht, `effect` ALLOW/DENY) | |
| `server_connections` | `ServerConnection` (`status`, `version`, `createdById`) | |
| `server_connection_members` | `ServerConnectionMember` (eindeutig je Verbindung+Server) | Ein Server kann in mehreren Verbindungen sein. |
| `connection_data_policies` | `ConnectionDataPolicy` (eindeutig je Verbindung+Quelle+Ziel+Datenart, `direction`, `enabled`, `version`) | **Zusammengesetzte Fremdschlüssel**: Quelle und Ziel müssen Mitglied derselben Verbindung sein. CHECK: Quelle ≠ Ziel, Richtung gültig. |
| `audit_logs` | `AuditLog` (bestehend, neu: `serverId`, `result` SUCCESS/DENIED/FAILED) | Per DB-Trigger unveränderlich, auch für Administratoren. |
| `sync_events` | `SyncEvent` (`idempotencyKey` eindeutig, `status`, `attemptCount`, `nextAttemptAt`, `lastError`) | Status PENDING/DONE/SKIPPED/FAILED/CANCELLED. |
| *(neu)* | `SyncedRecord` (eindeutig je Zielserver+Datenart+Quell-ID, `sourceVersion`) | Nur lesende Kopie auf der Zielseite. |
| *(erweitert)* | `UserRole.guildIds` | Leer = manuell vergeben. Sonst über Discord vergeben und nur auf diesen Servern gültig. |
| *(erweitert)* | `DutyWeekArchive.scope` | `global` oder `space:<Akten-Bereich>`, eindeutig je (`scope`, `weekStart`). |

### Datenbereiche

| Art | Umsetzung |
|---|---|
| Servereigene Daten | Spalte `serverId` = Akten-Bereich des Servers (`ownSpace(guildId)`), gefiltert mit `recordWhere()`. Neu auch für Dienstzeiten (`DutySession`). |
| Gemeinsam genutzte Daten | Server-Verbund-Gruppe mit „Akten teilen“: gleicher Bereich (Gruppen-ID). Ausdrücklich eingestellt unter *Administration → Server-Verbund*. |
| Nur lesend synchronisierte Daten | `SyncedRecord`. Sichtbar nur mit Lese-Recht auf dem Zielserver **und** solange die Freigabe aktiv ist. |
| Benachrichtigungen über Daten anderer Server | Die bestehenden Discord-Ausgaben je Kanal. Eine eigene Benachrichtigungsart „fremder Datensatz“ gibt es noch nicht. |

Ein Datensatz wird **nicht** global sichtbar, nur weil eine Verbindung besteht: Das Original bleibt beim fremden Server und liefert dort `404`. Freigegeben wird nur die Kopie.

## Zentraler Berechtigungsdienst

`AuthorizationService.authorize(userId, guildId, permission, resourceContext)` prüft in dieser Reihenfolge, Standard ist **verweigert**:

1. Der Benutzer ist angemeldet (`AuthGuard`: Session oder Bot-Token mit verknüpftem Discord-Konto).
2. Der Server ist registriert (`UNKNOWN_SERVER`). Ist er deaktiviert oder archiviert, sind nur Grundsystem-Rechte erlaubt (`SERVER_DISABLED`).
3. Die Mitgliedschaft ist bestätigt (`NOT_MEMBER`). Ausnahme: globale Systemadministratoren.
4. Das Modul ist auf dem Server an (`MODULE_DISABLED`). Das gilt auch für globale Administratoren.
5. Die Berechtigung (`PERMISSION`) ergibt sich aus Rollen **dieses** Servers, serverübergreifenden Rollen und Einzel-Ausnahmen, in der Reihenfolge Benutzer-DENY → Benutzer-ALLOW → Rollen-DENY → Rollen-ALLOW → verweigert.
6. Der Datensatz liegt im erlaubten Bereich (`FOREIGN_RECORD`, nach außen als `404`).
7. Serverübergreifend muss eine Freigabe aktiv sein (`NO_POLICY`), und zwar nur zum Lesen (`READ_ONLY`).

Wo die Prüfung greift:
- **Jede** Route mit `@RequirePermission` läuft über den `PermissionGuard` und damit über diesen Dienst. Das betrifft alle bestehenden Fachmodule und die Bot-Aufrufe.
- Die Routen unter `/servers/:serverId/…` und `/connections/…` sind mit `@ServiceAuthorized()` markiert. Sie prüfen gegen den Server **aus dem Pfad**, ein Header kann ihn nicht übersteuern. Der Test „route authorization coverage“ verlangt diese ausdrückliche Markierung.
- Verweigerungen werden protokolliert: `SecurityEvent` plus `AuditLog` mit `result = DENIED`, höchstens einmal pro Minute je Benutzer, Recht und Server.

Globaler Systemadministrator ≠ Serveradministrator:
- **Global** ist nur, wer die serverübergreifende Rolle „System Administrator“ **manuell** hat (oder in `ADMIN_DISCORD_IDS` steht). Nur globale Administratoren dürfen Server registrieren, freischalten, deaktivieren und archivieren.
- Ein **Serveradministrator** hat seine Rechte über eine Rolle mit `guildId` und damit nur auf diesem Server.

### Was sich gegenüber vorher ändert

- **Über Discord vergebene Rollen gelten nur noch auf dem Server, auf dem die Discord-Rolle besteht.** Unter „Alle Server“ (ohne gewählten Server) gelten nur manuell vergebene, serverübergreifende Rollen.
- Ein gewählter Server muss registriert sein, und man muss dort bestätigtes Mitglied sein. Das Dashboard bietet in der Server-Auswahl nur solche Server an.
- Konten ohne Discord (Passwort-Konten) brauchen auf einem Server eine **manuelle Mitgliedschaft** (`PUT /servers/:id/members`, Recht `servers.manage`). Globale Systemadministratoren brauchen keine.

## API-Routen (Präfix `/api/v1`)

Server: `GET/POST /servers`, `GET/PATCH/DELETE /servers/:serverId` (DELETE = archivieren), `GET/PUT /servers/:serverId/members`
Module: `GET /servers/:serverId/modules`, `GET/PATCH /servers/:serverId/modules/:moduleKey` (Body: `enabled`, `settings`, `version`)
Rollen: `GET/POST /servers/:serverId/roles`, `PATCH/DELETE /servers/:serverId/roles/:roleId`
Rechte: `GET /servers/:serverId/permissions`, `GET/PUT /servers/:serverId/roles/:roleId/permissions`, `GET /servers/:serverId/users/:userId/effective-permissions`
Discord-Rollen: `GET/PUT /servers/:serverId/role-mappings`
Verbindungen: `GET/POST /connections`, `GET/PATCH/DELETE /connections/:connectionId`, `POST /connections/:connectionId/members`, `DELETE /connections/:connectionId/members/:serverId`
Freigaben: `GET/POST /connections/:connectionId/policies`, `PATCH/DELETE /connections/:connectionId/policies/:policyId`
Synchronisierung: `GET /connections/:connectionId/sync-status`, `GET /connections/:connectionId/sync-events`, `POST /connections/:connectionId/retry-failed`, `GET /servers/:serverId/synced/:dataType`
Audit: `GET /servers/:serverId/audit-logs`, `GET /connections/:connectionId/audit-logs`
Bot: `GET /bot/servers/:guildId/modules` (nur mit Bot-Token)

Fehler kommen wie gewohnt als `{ code, message, details }`. Bei verweigertem Zugriff steht in `details.reason` z. B. `NOT_MEMBER`, `MODULE_DISABLED` oder `VERSION_CONFLICT`.

Neue Rechte: `servers.view/manage`, `modules.view/manage`, `connections.view/manage`, `sync.view/retry`. Der Systemadministrator hat sie über `*`, andere Rollen nur, wenn man sie ausdrücklich vergibt.

## Verbindungen, Freigaben und Synchronisierung

- **Verbindung verwalten** erfordert `connections.manage` auf **jedem** Mitgliedsserver (oder einen globalen Systemadministrator). **Freigabe anlegen oder ändern** erfordert `connections.manage` auf Quell- **und** Zielserver.
- Richtungen: `A_TO_B` (Quelle → Ziel), `B_TO_A`, `BIDIRECTIONAL`, `NONE`. Unidirektional bleibt unidirektional (`policyAllowsFlow`).
- Ablauf (Outbox):
  1. Die Fachaktion schreibt ihre Daten und ruft `SyncService.emit` **in derselben Transaktion** auf.
  2. Je erlaubtem Ziel entsteht ein `SyncEvent` mit Idempotenzschlüssel. Doppelte Ereignisse werden übersprungen.
  3. Der Worker holt Ereignisse mit `FOR UPDATE SKIP LOCKED`, sodass mehrere Instanzen gefahrlos parallel laufen können.
  4. Auf der Zielseite prüft der Worker Verbindung, Freigabe, Richtung, Zielserver und Modul **erneut**.
  5. Dann schreibt er idempotent ein `SyncedRecord`. Ältere Versionen überschreiben nie neuere (Status `SKIPPED`, Audit `sync.conflict`).
- Fehler: Wiederholung mit Backoff (10 s, 20 s, 40 s …, höchstens 30 min). Nach 6 Versuchen gilt ein Ereignis als `FAILED` (Audit `sync.failed`) und kann manuell wiederholt werden (`retry-failed`). Durch die Idempotenz entstehen dabei keine Duplikate.
- Ratenbegrenzung: höchstens 100 Ereignisse je Verbindung und Durchlauf (alle 5 s).
- **Deaktivierung** einer Verbindung, Änderung oder Entfernung einer Freigabe, Austritt eines Servers oder Archivierung: Offene Ereignisse werden verworfen (`CANCELLED`) und nie ausgeführt. Fachdaten und bereits übertragene Kopien werden **nicht** gelöscht, die Kopien sind ohne aktive Freigabe aber unsichtbar.
- Schleifen sind ausgeschlossen: Kopien lösen nie neue Ereignisse aus.
- Ereignislisten liefern nur Metadaten, nie die Inhalte.

Angebundene Quellen (Datenarten mit echten Ereignissen):

| Datenart | Quelle |
|---|---|
| `reports` | Statuswechsel eines Berichts (eingereicht, geprüft …) |
| `unit_status`, `team_overview` | Dienststatus-Wechsel auf einem Server |
| `shift_statistics` | Wochenarchiv eines Servers bzw. einer Shift-Log-Gruppe |

`incidents`, `incident_status` und `radio_messages` lassen sich anlegen, haben aber **noch keine Quelle**. Die CAD-Leitstelle ist bewusst ein gemeinsamer Bereich (siehe [cad.md](cad.md)).

## Module je Server

Katalog: `core` (System, immer an), `cad`, `mdt`, `dispatch`, `reports`, `shift_logs`, `investigations`, `personnel`, `applications`, `support`, `sek`, `communication`. Ein Recht gehört über sein Präfix zu einem Modul (z. B. `cad.*`/`fleet.*` → `cad`, `persons.*` → `mdt`).

- Ohne Eintrag ist ein Modul **an**. Bestehende Installationen funktionieren also unverändert.
- Abhängigkeiten werden geprüft. MDT hängt **nicht** von CAD ab.
- Abschalten sperrt das Modul im Dashboard, in der API und bei Discord-Befehlen. Andere Server bleiben unberührt.
- Der Bot registriert je Server nur die Befehle aktivierter Module und gleicht das alle 2 Minuten ab. Die Prüfung im Backend erfolgt trotzdem bei **jeder** Ausführung.

## Discord

- Jeder Bot-Befehl schickt Server (`X-Guild-Id`) und Discord-Rollen (`X-Discord-Roles`) des Aufrufers mit. Das Backend bestätigt damit die Mitgliedschaft auf **genau diesem** Server und gleicht die Rollen-Zuordnung dieses Servers ab. Danach gilt dieselbe Prüfung wie im Dashboard.
- Login und laufender Abgleich (alle 2 bzw. 5 Minuten) halten die Mitgliedschaften je registriertem Server aktuell.
- Der in `DISCORD_GUILD_ID` bzw. in den Einstellungen eingetragene Haupt-Server wird automatisch registriert und ist aktiv. Andere vom Bot gemeldete Server erscheinen **deaktiviert** und müssen von einem globalen Systemadministrator freigeschaltet werden.
- Der Bot-Token liegt nur in der Server-Konfiguration (Umgebungsvariablen) und wird nie gespeichert oder ausgeliefert.

## Shift Logs und Wochenwechsel

- Dienstzeiten werden dem Akten-Bereich des Servers zugeordnet. Teamübersicht, Dienststunden und Schicht-Logs zeigen je gewähltem Server nur dessen Daten.
- Wochen-Reset je Bereich:
  - `global`: Gesamtstatistik, Einstellung unter „Alle Server“.
  - Je Server bzw. gemeinsamer Shift-Log-Gruppe (Server-Verbund mit geteilten Akten): Einstellung im Modul `shift_logs` → `weeklyReset` (an/aus, Kanal, Plätze, Erwähnung). Jeder Server postet in seinen eigenen Kanal.
- Für alle Bereiche gilt:
  - Montag 00:00 Europe/Berlin, Zeitpunkte in UTC gespeichert.
  - Ein Advisory-Lock je Bereich und ein eindeutiges (Bereich, Woche) verhindern doppelte Resets.
  - Verpasste Resets werden nach einem Neustart nachgeholt.
  - Archive sind unveränderlich, und Archive fremder Bereiche sind unsichtbar (`404`).
- Manuelle Shift-Log-Korrekturen gibt es noch nicht (siehe Einschränkungen).

## Autosave und Konflikte

- Module, Server, Verbindungen und Freigaben haben eine `version`. Wer mit einem veralteten Stand speichert, bekommt `409 VERSION_CONFLICT`, und **nichts** wird überschrieben. Das Dashboard lädt dann neu und meldet den Konflikt.
- „Gespeichert“ zeigt das Dashboard erst nach erfolgreicher Antwort des Servers.
- Mehrteilige Änderungen laufen in Transaktionen. Modul-Änderungen sind je Server zusätzlich per Advisory-Lock serialisiert, damit die Abhängigkeitsprüfung konsistent bleibt.
- Die bisherige Autosave-Warteschlange des Dashboards (`apps/web/src/lib/autosave.ts`) behandelt 4xx-Antworten schon als Fehler, nicht als gespeichert.

## Migration und Wiederherstellung

- Die Migration ist **nicht destruktiv**. Sie ergänzt nur Tabellen, Spalten, Indizes und Constraints.
  - Der globale Unique-Index auf `Role.name` wird durch (`guildId`, `name`) plus Teil-Index ersetzt. Bisher waren alle Namen eindeutig, deshalb gibt es dabei keine Konflikte.
  - Bereits vom Bot gemeldete Server (`discord.guilds`) werden als **aktiv** registriert. Ungültige IDs werden übersprungen.
  - Bestehende Archive erhalten den Bereich `global`, bestehende Audit-Einträge das Ergebnis `SUCCESS`.
  - **Nichts** wird automatisch zwischen Servern freigegeben.
- Bestehende Dienstzeiten ohne Server werden weiterhin wie bisher über `assignLegacyRecords` dem Heimat-Server zugeordnet. Lässt sich ein Datensatz keinem Server eindeutig zuordnen, bleibt er im gemeinsamen Bestand. Er ist dann nur für Server sichtbar, die diesen Bestand ausdrücklich nutzen.
- Bestehende Discord-Rollen-Zuweisungen gelten bis zum nächsten Discord-Abgleich des Benutzers noch serverübergreifend. Der Abgleich läuft bei der nächsten Anfrage, spätestens nach 5 Minuten.
- Mit Migrationstest geprüft: Bestandsdatenbank → Migration → Server registriert, Rollen, Audit und Archive unverändert.
- **Vor dem Update** ein Daten-Backup anlegen (*Administration → Backups* oder `deploy/`-Skripte).
- **Zurücksetzen**:
  - Altes Release starten und Backup einspielen (`deploy/restore.sh`).
  - Die neuen Tabellen stören ein altes Release nicht.
  - Ein bloßes Zurückrollen des Codes ohne Backup funktioniert ebenfalls. Über Discord vergebene Rollen gelten dann wieder serverübergreifend.
- Beim Einspielen eines Daten-Backups bleiben `AuditLog` und `DutyWeekArchive` unangetastet (beide unveränderlich). Fehlende Archive werden ergänzt.

## Tests

`apps/api/test/multi-server.test.ts` deckt ab:
- Mandantentrennung, manipulierte Server- und Datensatz-IDs, gleichnamige Rollen
- Module per API und Discord-Befehl, MDT ohne CAD
- Versionskonflikt, Systemmodul, Einstellungsvalidierung und Persistenz
- global vs. Server-Admin, Rechteänderungen und DENY-Vorrang, Delegationsregel
- Discord-Rollen-Zuordnung je Server
- Verbindungen: nur Mitglieder, „Verbindung allein überträgt nichts“, unidirektional, nur lesend
- Idempotenz, Konflikt, Retry ohne Duplikate, deaktivierte Verbindung
- Wochen-Reset je Server (eigener Kanal, kein Doppel-Reset, fremde Archive unsichtbar)
- Audit je Server, unveränderlich

Dazu kommen `packages/shared/tests/modules.test.ts` und die angepassten bestehenden Tests.

## Bekannte Einschränkungen

- **Einzel-Ausnahmen für Benutzer** (`UserPermissionOverride`) sind noch nicht je Server, sie gelten serverübergreifend. Sie werden ausdrücklich von Administratoren gesetzt.
- **„Alle Server“-Ansicht**: Wer eine manuell vergebene, serverübergreifende Rolle hat, sieht dort die Daten aller Server, wie bisher. Serverübergreifende Rollen sind damit ausdrücklich globale Rechte.
- Objektbezogene Zusatzprüfungen in einzelnen Diensten (`PermissionService.has`) prüfen nur Rollen. Server, Mitgliedschaft und Modul sind aber für jede Route bereits durch den Guard geprüft.
- `incidents`, `incident_status` und `radio_messages` haben noch keine Sync-Quelle (siehe oben).
- Keine manuellen Shift-Log-Korrekturen: Es gibt keine Bearbeitung vergangener Schichten, also auch kein Audit dafür.
- Row-Level Security in PostgreSQL wird nicht eingesetzt. Die Trennung erfolgt im Backend und über Constraints.
- Alles ist mit Integrationstests gegen PostgreSQL abgesichert. Gegen echtes Discord wurde **nicht** getestet (Befehlsregistrierung je Server, Rollenabgleich).
