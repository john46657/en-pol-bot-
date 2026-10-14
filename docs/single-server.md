# Ein Discord-Server (Single-Server)

EN | POLIZEI – Stadt Emden arbeitet mit **genau einem, fest eingerichteten Discord-Server**. Es gibt keine Server-Auswahl, keine Server-Verwaltung, keine Serververbindungen, keinen Server-Verbund und keine Einstellungen „je Server“ mehr. Rollen, Rechte, Einstellungen, Module und alle Fachdaten sind **zentral**.

Die frühere Multi-Server-Funktion wurde vollständig entfernt. Alle anderen Funktionen (Dashboard, Discord-Login, Bot, CAD/MDT/Leitstelle, ER:LC, Live-Karte, Schichten, Berichte, HR, Tickets usw.) sind unverändert vorhanden.

## Welcher Server?

In dieser Reihenfolge (`apps/api/src/common/guild-context.ts`, `server/home-server.service.ts`):

1. Umgebungsvariable `DISCORD_GUILD_ID` (API **und** Bot). Bei älteren Einträgen mit mehreren IDs zählt nur die erste (Warnung im Log).
2. Einstellung *Administration → Einstellungen → Discord-Bot-Kanäle → „Discord-Server der EN Polizei“* (`discord.channels.guildId`).
3. Der einzige Server, auf dem der Bot ist.

Empfehlung: `DISCORD_GUILD_ID` in API und Bot setzen.

## Verhalten

| Bereich | Verhalten |
|---|---|
| Dashboard | Kein `X-Guild-Id` mehr. Ein solcher Header wird ignoriert. Server-Auswahllisten (Kanäle, Rollen) zeigen nur den eigenen Server. |
| Bot | Registriert Slash-Commands nur auf dem eigenen Server. Auf anderen Servern entfernt er seine Befehle und ignoriert Interaktionen und Ereignisse (mit Hinweis an den Nutzer). Den Server und abgeschaltete Module fragt er über `GET /bot/server` ab. |
| API (Bot im Namen eines Mitglieds) | Kommt eine Interaktion von einem anderen Discord-Server, antwortet die API mit `403` (`reason: FOREIGN_GUILD`). |
| Anmeldung und Mitgliedschaft | Discord-Login und die laufende Prüfung alle 2 bzw. 5 Minuten (`DiscordAccessService`) prüfen die Mitgliedschaft und die Team-Rollen auf **diesem** Server. Wer ihn verlässt oder die Rolle verliert, wird abgemeldet. |
| Rollen und Rechte | Zentral: `RolePermission`, persönliche Ausnahmen, DENY vor ALLOW. Über Discord vergebene Rollen (`UserRole.guildIds`) zählen nur, wenn die Discord-Rolle auf diesem Server besteht. |
| Module | *Administration → Module* (`modules.view` bzw. `modules.manage`). Ein abgeschaltetes Modul ist im Dashboard, in der API und bei Discord-Befehlen gesperrt, auch für Administratoren. Optimistisches Sperren (`version`, sonst 409). |
| Wochen-Reset | Ein Wochen-Reset (*Administration → Schichten*). Frühere Archive je Server bleiben unverändert und erscheinen in der Archivliste. |

Entfernt wurden:
- die API-Routen `/servers/…`, `/connections/…`, `/server-links/…`, `/cad/links/…` und `/bot/servers/:guildId/modules`
- die Rechte `servers.*`, `connections.*`, `sync.*` und `cad.manage_cross_server`
- im Dashboard die Server-Auswahl oben links und die Seiten *Server-Verbund*, *Server & Module* und *CAD → Cross-Server*

Alte Links auf diese Seiten führen auf *Administration → Module* bzw. *CAD → Einstellungen*.

## Datenbank: nichts gelöscht

Es gibt **keine** Schema-Migration. Alle Tabellen und Spalten bleiben erhalten, auch die der Multi-Server-Zeit (`DiscordServer`, `ServerMembership`, `ServerModuleSetting`, `DiscordRoleMapping`, `ServerConnection*`, `ConnectionDataPolicy`, `SyncEvent`, `SyncedRecord`, `CadServerLink`, Spalten `serverId` und `guildId`). Sie werden nicht mehr beschrieben, bleiben aber lesbar. Dadurch lassen sich ältere Backups weiterhin einspielen.

## Einmalige Umstellung beim ersten Start

`apps/api/src/server/single-server-migration.service.ts` läuft beim Start (mit Sperre gegen mehrere Instanzen), bis die Umstellung erledigt ist. Das Ergebnis steht in der Einstellung `migration.singleServer` und im Audit-Log (`system.single_server`).

1. **Backup zuerst**: Die Umstellung legt ein vollständiges Daten-Backup an (*Administration → Backups*, Art „vor-umstellung“). Scheitert das Backup, wird **nichts** verändert.
2. **Einstellungen**: Für jede früher serverbezogene Einstellung (`<Schlüssel>@<Server-ID>`) wird der **zuletzt gespeicherte** Wert zentral, also entweder der des Servers oder der bisherige zentrale Wert. Ersetzte zentrale Werte stehen in `migration.singleServer → replaced`. Die `@`-Werte bleiben als Archiv erhalten, werden aber nicht mehr angezeigt.
3. **Rollen**: Jede Rolle des Servers wird mit der gleichnamigen zentralen Rolle zusammengeführt:
   - Zuweisungen werden vereinigt. Bei einer Person mit beiden Zuweisungen schlägt „manuell“ „über Discord“.
   - Rechte und Eigenschaften kommen von der laut Audit-Log zuletzt geänderten Fassung.
   - Discord-Rollen-Zuordnungen des Servers (`DiscordRoleMapping`) kommen zu den `discordRoleIds` hinzu.

   Gibt es kein zentrales Gegenstück, wird die Server-Rolle selbst zentral. Rollen anderer Server bleiben als Archiv erhalten und gelten nicht.
4. **Persönliche Ausnahmen** des Servers werden zentral. Widersprechen sie einer zentralen Ausnahme, gewinnt das **Verbot**. Niemand gewinnt durch die Umstellung Rechte.
5. **Module**: Auf dem Server abgeschaltete Module bleiben abgeschaltet, jetzt zentral (`modules.config`). War der zentrale Wochen-Reset aus, der des Servers aber an, wird dessen Einstellung übernommen.
6. **Fachdaten** (Personen, Fahrzeuge, Waffen, Berichte, Einsätze, Einheiten, Personalakten, HR, Dienstzeiten, SEK, Funk-Freigaben, Tatbestände …): Alle früheren Datenbereiche werden **ein** Bestand (`serverId` = NULL).
   - Würde dabei eine Eindeutigkeit verletzt (z. B. zwei Personalakten derselben Person oder zwei Einheiten mit gleichem Rufnamen), bleibt der weniger aktuelle Eintrag in seinem Bereich stehen. Er bleibt sichtbar und wird nicht gelöscht.
   - Vorrang hat der Bereich des Servers, dann der bisherige gemeinsame Bestand, dann andere frühere Server.

Gibt es Daten **mehrerer** Server, aber keinen eingerichteten Server, wartet die Umstellung. Es bleibt dann alles, wie es ist, und im Log steht ein Hinweis. In diesem Fall `DISCORD_GUILD_ID` setzen und neu starten.

## Zurücksetzen / Wiederherstellen

- Das Backup „vor-umstellung-…“ enthält den vollständigen Stand von vor der Umstellung. Es lässt sich unter *Administration → Backups* einspielen. Vorher wird automatisch der aktuelle Stand gesichert.
- Nach dem Einspielen eines Backups von **vor** der Umstellung läuft sie sofort erneut (mit neuem Backup). Der Stand ist danach wieder konsistent.
- Wer das **alte Multi-Server-Release** zurückhaben möchte: das alte Release starten und das Backup „vor-umstellung-…“ einspielen (`deploy/restore.sh` bzw. *Administration → Backups*). Da die Tabellen unverändert sind, passt es zum alten Release.

## Tests

- `apps/api/test/single-server.test.ts`:
  - Discord-Befehle nur vom eigenen Server, Bot-Endpunkt `/bot/server`
  - Module zentral (Sperre auch für Administratoren, Abhängigkeiten, Versionskonflikt)
  - Umstellung: Einstellungen, Rollen, Ausnahmen, Module und Daten; nichts gelöscht
  - Backup vor der Umstellung enthält den alten Stand und lässt sich einspielen, danach wird erneut umgestellt
  - keine Umstellung ohne eingerichteten Server bei Daten mehrerer Server
- `dashboard-rbac.test.ts`: `X-Guild-Id` ändert nichts, keine Einstellungen „je Server“, alte Server-Routen liefern 404, Teamliste/Voice nur vom eigenen Server
- `cad-erlc.test.ts`: Befehle von einem anderen Discord-Server werden abgewiesen, Kanalzuordnungen auf andere Server werden nicht bedient
- Bot: `apps/bot/tests/home.test.ts`
