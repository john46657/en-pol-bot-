# Discord-Bot-Erweiterung: Einrichtung, Prüfungszentrum, Diagnose, Sicherungen, Stufen-Rechte

Diese Erweiterung betrifft **ausschließlich den Discord-Bot** (`apps/bot`). Dashboard (`apps/web`), API (`apps/api`),
gemeinsames Paket (`packages/shared`), Website und Hosting-Web-Dateien (`hosting/web`, `hosting/api`) bleiben unverändert.
Neu gebaut werden nur die Bot-Artefakte (`bot.js`, `hosting/bot/dist`).

## 1. Bestandsaufnahme (vorher)

| Bereich | Vorhanden | Datei(en) |
|---|---|---|
| Bot-Einstieg, Discord-Client, Interaktionen, Befehlsregistrierung je Server | ja | `apps/bot/src/index.ts` |
| Befehle / Buttons / Modals / Auswahlmenüs (Registry `prefix:arg`) | ja | `apps/bot/src/commands/*.ts`, `commands/features.ts` (`INTERACTIONS`) |
| Kontext je Interaktion (`Ctx`) | ja | `apps/bot/src/commands/types.ts` |
| HTTP-Anbindung an die API (Bot-Token, Benutzerkontext) | ja | `apps/bot/src/api.ts` |
| Dauerhafter Bot-Speicher | ja, **vorhandene** API-Route `GET/PUT /bot/state/:key` (Tabelle `SystemSetting`, Schlüssel `bot.state.*`) | `apps/api/src/discord/discord.controller.ts` (unverändert) |
| Module je Server (nur Dashboard schaltet, Bot liest) | ja, `GET /bot/servers/:guildId/modules` | `packages/shared/src/modules.ts` |
| Prüfungssystem (Start, Antworten, Abgabe, Bewertung, Annullieren, Auswertung) | ja, nur im Dashboard bedienbar; API-Routen `/hr/exams*`, `/hr/attempts*` | `apps/api/src/hr/hr-exam.service.ts` (unverändert) |
| Ausbildungstermine in Discord | ja, `/ausbildung` | `apps/bot/src/commands/trainings.ts` |
| Datenbank-Sicherung (alle Tabellen in Abhängigkeitsreihenfolge, inkl. Ausbildungs-/Prüfungsdaten) | ja, `GET/POST /backups/data` (Recht `settings.manage`) | `apps/api/src/backup/backup.service.ts` (unverändert) |
| Discord-Server-Backup (Rollen/Kanäle) | ja | `apps/bot/src/backup.ts` |
| Rechteprüfung | API-RBAC je Aufruf (`asUser`), im Bot nur „Server verwalten“ für Panels | `apps/bot/src/commands/features.ts`, `qualifications.ts` |
| Tests | 18 Dateien / 181 Tests (Vitest, Fake-API) | `apps/bot/tests/*.test.ts` |

Bewusst entfernte Funktionen (Git-Historie: Ermittlungen, Beweismittel, Waffenregister, Serververbindungen, Mitteilungen,
Abstimmungen) werden **nicht** wieder eingeführt. Das Prüfungszentrum zeigt nur Prüfungen/Ausbildungen, die im System
existieren – es legt keine neuen Ausbildungsaufgaben an.

## 2. Umsetzung (neue/geänderte Bot-Dateien)

| Anforderung | Datei | Inhalt |
|---|---|---|
| Serverkonfiguration (Schema, Speicher, Vorgaben) | `apps/bot/src/guild-config.ts` | Zod-Schema, je Server ein Eintrag `guildcfg:<guildId>` über `/bot/state`, Revision, unbekannte Felder bleiben erhalten |
| Stufen-Rechte (zentral) | `apps/bot/src/access.ts` | Stufen, Richtlinientabelle `POLICIES`, `authorize()`, frische Rollenprüfung über Discord |
| Wiederholungen / Geheimnisse | `apps/bot/src/safety.ts` | `withRetry` (nur idempotente Aufrufe), `redact`, `scrubSecrets`, Log-Schwärzung |
| Diagnose | `apps/bot/src/diagnostics.ts` | reine Prüf-Funktionen (Rechte, Kanäle, Rollen, Intents, API) |
| Bot-Sicherungen | `apps/bot/src/bot-backup.ts` | Snapshot + Prüfsumme, Ablage außerhalb des Bot-Ordners **und** in der Datenbank, Testwiederherstellung, Plan, Sicherung vor dem Einspielen |
| `/setup` | `apps/bot/src/commands/setup.ts` | Assistent mit Buttons, Auswahlmenüs (Kanäle, Rollen, Module), Modals, Vorschau |
| `/system status \| diagnose \| integrations` | `apps/bot/src/commands/system.ts` | |
| `/backup status \| erstellen \| wiederherstellen` | `apps/bot/src/commands/backup.ts` | |
| `/pruefung liste \| ergebnisse \| ausbildungen \| verwalten \| bewerten` | `apps/bot/src/commands/exams.ts` | Prüfung in Discord ablegen; Ausbilder: Auswertung, Bewerten, Annullieren, Aktivieren, Ankündigen |
| Verdrahtung | `apps/bot/src/index.ts`, `commands/index.ts`, `commands/features.ts`, `commands/types.ts`, `discord-tickets.ts` (Kanal-Auswahlmenü), `welcome.ts` (Begrüßung aus `/setup` als Rückfall), `config.ts` (`BOT_BACKUP_DIR`) | |

## 3. Datenhaltung und Datenerhalt

- Keine Datenbankmigration. Gespeichert wird über die vorhandene Route `/bot/state` (Tabelle `SystemSetting`), dadurch ist
  die Serverkonfiguration automatisch Teil der vorhandenen Datenbank-Sicherung.
- Schlüssel enthalten die Discord-Server-ID → Server sind strikt getrennt.
- Lesen ist tolerant (kaputte Teile → Standardwerte, unbekannte Felder bleiben erhalten), Schreiben führt zusammen statt zu ersetzen.
- Deaktivierte Module werden nur ausgeblendet (Befehle nicht registriert, Ausführung abgelehnt) – Daten bleiben.
- Der Bot ruft für Prüfungsversuche keine Lösch-Routen auf; frühere Versuche bleiben im System.

### Verhältnis zum Dashboard

Die Bot-Einrichtung `/setup` gilt nur für **Discord**: Bot-Spitzname, Embed-Farben, Begrüßungstexte, Kanäle, Stufen-Rollen
und im Bot ausgeblendete Module. Die Modul-Schalter des Systems (Dashboard) bleiben maßgeblich: Was dort aus ist,
blendet der Bot ebenfalls aus. Zusätzlich kann `/setup` Module **nur im Bot** ausblenden.

Bilder nimmt `/setup` als `https://`-Links, weil Discord die Bilder in Embeds selbst lädt. Der Bot lädt sie weder herunter
noch liefert er sie aus.

## 4. Rollen- und Berechtigungssystem

- Die zentrale Richtlinientabelle `POLICIES` steht in `apps/bot/src/access.ts`. `index.ts` prüft sie **vor jeder** Befehls-
  und Interaktionsausführung (`preflight`). Die neuen Befehle prüfen zusätzlich selbst (`guard`).
- Rollen werden mit `guild.members.fetch({ force: true })` frisch von Discord geholt und nicht aus der Interaktion übernommen.
  Damit eine Interaktion nur einmal lädt, merkt sich der Bot das Ergebnis 3 Sekunden.
- Kann Discord die Rollen nicht liefern, wird die Aktion abgelehnt (fail closed). Ablehnungen sind privat (ephemeral).
- Sensible Aktionen (Wiederherstellung, Prüfung de-/aktivieren, Versuch annullieren) laufen über einen eigenen
  Bestätigungsschritt. Dabei wird erneut geprüft.
- Bevor Rollen zugeordnet sind, dürfen Verwaltungsstufen nur Mitglieder mit „Server verwalten“ nutzen. Lesen und Ablegen
  bleiben offen, die API prüft dabei weiter ihre Rechte.
- Bestehende Befehle behalten ihre bisherige Prüfung (System-Rechte über das verknüpfte Konto, „Server verwalten“ für Panels).
  Die Stufen-Richtlinien gelten für die neuen Verwaltungsbefehle. Im Bot ausgeblendete Module sperren auch die Buttons der
  bestehenden Panels dieses Moduls.

## 5. Sicherungen und Wiederherstellung

| | Bot-Einstellungen | Datenbank (Ausbildungen, Prüfungen, Personal, Konfigurationen, Beziehungen) |
|---|---|---|
| Anlegen | `/backup erstellen` | `/backup erstellen` stößt die vorhandene System-Sicherung an (Recht `settings.manage`) |
| Ablage | Datei in `BOT_BACKUP_DIR` (Ordner 700, Datei 600, nie überschrieben) **und** Kopie in der Datenbank (letzte 5 vollständig) | `STORAGE_DIR/backups` des Systems; alle Tabellen in Abhängigkeitsreihenfolge |
| Geheimnisse | Felder wie `token`/`secret`/`password` werden entfernt, Werte von `DISCORD_TOKEN`/`BOT_API_TOKEN` und Token-Muster geschwärzt; eine Datei mit Geheimnis wird nicht eingespielt | wie bisher im System |
| Wiederherstellen | Prüfung, Testlauf in abgeschottetem Speicher, Plan mit allen Änderungen, Bestätigung, automatische Sicherung vorher, Abbruch bei zwischenzeitlicher Änderung | **nicht über den Bot.** Das System ersetzt dabei den gesamten Bestand aller Server. Vorgehen siehe unten |

Datenbank in einer Testumgebung prüfen, bevor sie produktiv eingespielt wird:
1. Testsystem starten (`pnpm dev:all` oder eine eigene Docker-Compose-Instanz mit eigener Datenbank).
2. Dort im Dashboard unter *Backups* die Datei hochladen und einspielen. Das System sichert vorher automatisch.
3. Prüfen, z. B. Prüfungsversuche, Ausbildungen und Serverkonfigurationen.
4. Erst dann produktiv einspielen (Dashboard *Backups* oder `deploy/restore.sh`).

## 6. Tests

`pnpm --filter @enrp/bot test` umfasst 20 Dateien und 227 Tests. Davon sind 37 neu in `apps/bot/tests/bot-extension.test.ts`:

| Pflichttest | Abgedeckt durch |
|---|---|
| 1 Konfiguration überlebt Neustart | neuer Store auf derselben `/bot/state`-Ablage liest denselben Stand; Teil-Updates behalten unbekannte Felder; ungültige Werte werden abgelehnt |
| 2 Server getrennt | Schlüssel je Guild-ID, keine Wirkung auf andere Server, fremde Sicherung abgelehnt, Rollen anderer Server zählen nicht |
| 3 Unberechtigte | `/setup`, `/system`, `/backup` und Buttons/Formulare werden abgelehnt, ohne zu schreiben; Stufen über Rollen; fail closed |
| 4 Prüfungsergebnisse bleiben | kompletter Ablauf Start → Antworten → Abgabe; alter Versuch unverändert; keine DELETE-Aufrufe |
| 5 Wiederherstellung in Testumgebung | Sichern → Ändern → Plan mit Testlauf → Bestätigen; Prüfsumme, Konflikt, Bestätigungstext, echtes Dateisystem |
| 6 Fehlende Rechte verständlich | `diagnoseGuild` und `/system diagnose` mit Lösungsweg und ohne Tokens |
| 7 Bestehende Befehle | alle 43 bisherigen Befehle und 16 Interaktions-Präfixe vorhanden; alle bisherigen Tests grün; Begrüßung ohne Doppelpost |

## 7. Einschränkungen

- **Nicht gegen echtes Discord getestet.** Alle Tests laufen mit Fakes für Discord und API.
  Auswahlmenüs mit Vorbelegung, Kanal-Menüs und Modals aus flüchtigen Nachrichten folgen der discord.js-Dokumentation.
- Laufende Wiederherstellungspläne liegen nur im Arbeitsspeicher (10 Minuten). Nach einem Neustart den Plan neu erstellen.
- Discord-Formulare fassen höchstens 5 Felder. Fragen mit mehr als 5 Lücken und Bewertungen mit mehr als 4 manuell zu
  bewertenden Fragen verweisen deshalb aufs Dashboard. Neue Prüfungen und Fragen werden weiterhin im Dashboard angelegt.
- Ausbildungen zeigt der Bot nur an. Modul-Checklisten pflegt weiter das Dashboard.
- Den Status von ER:LC oder Zello zeigt der Bot nicht an, weil er keinen direkten, dokumentierten Zugang dazu hat.
  Angezeigt werden Discord, API, Roblox (öffentliche Users-API) und die Module.
- Die Datenbank-Sicherung braucht ein verknüpftes Konto mit `settings.manage`. Ohne dieses Recht sichert `/backup erstellen`
  nur die Bot-Einstellungen und sagt das.
- Auf Panel-Hostern kann der Benutzerordner der Produktionsordner sein. Der Bot warnt dann in `/system status`,
  `/system diagnose` und im Log. In dem Fall `BOT_BACKUP_DIR` setzen. Die Kopie in der Datenbank besteht trotzdem.
