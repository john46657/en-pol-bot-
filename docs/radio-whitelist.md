# Funk-Whitelist (externer Funkdienst)

Dashboard: **Funk → 🎙️ Funk-Whitelist** (`/radio-whitelist`). Discord: `/funkantrag`, `/funkstatus`, `/funkfreigabe`.
Das System arbeitet mit **genau einem** fest konfigurierten Discord-Server (`DISCORD_GUILD_ID`, sonst *Einstellungen → Discord*). Es gibt keine Multi-Server-Logik für diese Funktion.

## Welcher Funkdienst? (Prüfung)

Im Code dieses Projekts deutet alles auf **Zello** hin: Leitstellen-Teamdaten führen einen „Zello-Benutzernamen“ (`CadMember.zelloName`), und das Formular-Panel „Funk- und Roblox-Daten“ fragt „Zello Funk“ ab. Ob es sich um die **kostenlose Zello-App** (öffentlicher/privater Kanal) oder um **Zello Work** (kostenpflichtiges Firmennetzwerk) handelt, lässt sich aus dem Code nicht ablesen – deshalb sind beide wählbar.

| Funkdienst | Offizielle API zur Mitgliederverwaltung? | Was das System tut |
|---|---|---|
| **Zello Work** | **Ja** – Server-API, dokumentiert unter <https://zellowork.com/api> (Version 1.1.0) | automatische Synchronisierung: freigegebene Mitglieder in den gewählten Kanal, entzogene/gesperrte/abgelaufene hinaus |
| **Zello (kostenlose App, Kanal)** | **Nein.** Moderatoren setzen „Trusted“-Mitglieder nur in der App (Zelect/Zelect+-Kanäle) | **keine** automatische Synchronisierung; Liste „Im Funkdienst zu erledigen“ + CSV-Export/-Import |
| Anderer Funkdienst | nicht geprüft | wie oben: manuell + CSV |

Die Seite *Funkdienst* zeigt das deutlich an („⚠️ Keine automatische Synchronisierung verfügbar“).

### Verwendete Zello-Work-Endpunkte (gegen die Dokumentation geprüft, 16.10.2026)

| Zweck | Aufruf |
|---|---|
| Anmeldung, Schritt 1 | `GET /user/gettoken` → `token`, `sid` |
| Anmeldung, Schritt 2 | `POST /user/auth?sid=…` mit `username`, `password` (Klartext über TLS), `api_mac` = HMAC-SHA256(API-Schlüssel, `username + ":" + token`) – **der API-Schlüssel selbst wird nie gesendet** |
| Abmelden | `GET /user/logout?sid=…` |
| Verbindung testen (Kanal vorhanden?) | `GET /channel/get/name/{kanal}?sid=…` |
| Mitglied in den Kanal | `POST /user/addto/{kanal}?sid=…` mit `login[]` |
| Mitglied aus dem Kanal | `POST /user/removefrom/{kanal}?sid=…` mit `login[]` |

Basis-URL: `https://<netzwerk>.zellowork.com` (Netzwerkname = Subdomain der Web-Konsole). Antworten: JSON mit `status` und `code` („200“ = OK); bekannte Fehlercodes (301, 302, 303, 404, 405, 605) werden auf Deutsch angezeigt.
**Nicht verwendet:** Konten anlegen/löschen (`/user/save`, `/user/delete`) – die Zello-Benutzer müssen im Netzwerk schon existieren. **Nicht getestet** gegen ein echtes Zello-Work-Netzwerk (keine Zugangsdaten vorhanden); getestet gegen einen simulierten Server nach der Dokumentation.

Einrichtung: API-Schlüssel in der Zello-Work-Admin-Konsole (*Dashboard → Account*) aktivieren → im Dashboard Netzwerk, Kanal, Administrator, Passwort, API-Schlüssel eintragen → **Verbindung testen** → optional „Änderungen automatisch übertragen“. Für jede Freigabe den *Benutzernamen im Funkdienst* eintragen (wird aus der Teamübersicht übernommen, falls dort ein Zello-Name steht).

## Funktionen

- **Whitelist**: hinzufügen (nur per **Discord-ID**, nie per Name), aktivieren/deaktivieren, sperren (mit Begründung, optional befristet), entsperren, befristen/verlängern, entziehen (= archivieren, nie löschen), erneut freischalten (gleicher Eintrag, Historie bleibt), Begründungen, Suche nach Discord-ID/Name/Dienstgrad/Abteilung/Funkname, Filter aktiv/ausstehend/gesperrt/abgelaufen/deaktiviert/entzogen.
- **Status**: `PENDING` (ausstehend) · `ACTIVE` · `DISABLED` (deaktiviert) · `SUSPENDED` (gesperrt) · `EXPIRED` (abgelaufen) · `REVOKED` (entzogen, archiviert). Funkberechtigt ist nur `ACTIVE` mit Ablaufdatum in der Zukunft (oder ohne).
- **Ablauf**: jede Minute speichert das System abgelaufene Freigaben (`EXPIRED`) und beendet abgelaufene Sperren. Nach einem Neustart wird sofort nachgeholt. Abgelaufene Freigaben gelten auch vorher schon als nicht berechtigt.
- **Folgen jeder Änderung**: Discord-Funkrolle geben/nehmen (über die Bot-Warteschlange), Funkdienst (Zello Work: synchronisieren bzw. als „wartet auf Abgleich“ markieren; ohne API: „Im Funkdienst zu erledigen“), Direktnachricht an das Mitglied (abschaltbar; Antragsentscheidungen immer).
- **Anträge** (`/funkantrag` in Discord): Formular mit Begründung, Dienstgrad, Abteilung; Discord-ID und Zeitpunkt speichert das System. Führungskräfte (`radiowhitelist.requests`) genehmigen (optional befristet) oder lehnen ab (Begründung Pflicht); das Mitglied bekommt eine DM. Doppelte offene Anträge werden verhindert (abschaltbar). Bearbeitete Anträge bleiben einsehbar. Optional Meldung neuer Anträge in einen Kanal.
- **Discord-Rollen** (optional): berechtigende Rollen, erforderliche Rollen, Verhalten bei Rollengewinn (aktiv/ausstehend/nichts) und -verlust (entziehen/deaktivieren/nichts), eigene Regel für manuell/per Antrag erteilte Freigaben (Standard: **behalten**). Sperren werden nie durch Rollen aufgehoben; manuell entzogene Freigaben kommen nie automatisch zurück. Der Bot meldet Rollenänderungen sofort, gleicht nach dem Start und alle 30 Minuten vollständig ab und auf Knopfdruck („Jetzt abgleichen“). **Entschieden wird ausschließlich im Backend** (`POST /bot/radio-whitelist/roles`, nur mit Bot-Token, nur vom konfigurierten Server). Fehler werden je Mitglied protokolliert und im Reiter angezeigt.
- **Protokoll**: wer wann was getan hat (Freigabe erteilt/entzogen, Sperre eingerichtet/aufgehoben, Antrag genehmigt/abgelehnt, Einstellungen geändert, Verbindungstest, Synchronisierung erfolgreich/fehlgeschlagen, Rollenabgleich). Grundlage ist das vorhandene Audit-Log – auf Datenbankebene **unveränderlich** (Trigger verweigert UPDATE/DELETE/TRUNCATE).

## Berechtigungen (deny-by-default, im Backend geprüft)

| Recht | erlaubt |
|---|---|
| `radiowhitelist.view` | Whitelist, Übersicht, Einstellungen (ohne Zugangsdaten), Export |
| `radiowhitelist.grant` | freischalten, Angaben ändern, aktivieren/deaktivieren, verlängern, erneut freischalten, CSV-Import, „im Funkdienst erledigt“ |
| `radiowhitelist.suspend` | sperren und entsperren |
| `radiowhitelist.remove` | Freigabe entziehen (archivieren) |
| `radiowhitelist.requests` | Anträge einsehen und entscheiden, Antragseinstellungen |
| `radiowhitelist.roles` | Rollenregeln und Funkrolle, Rollenabgleich anstoßen |
| `radiowhitelist.integration` | Funkdienst-Anbindung inkl. Zugangsdaten, Verbindung testen, synchronisieren |
| `radiowhitelist.logs` | Änderungsprotokoll |

`/funkfreigabe pruefen` (nur Ja/Nein) bleibt mit `team.view` möglich. Startrollen (neue Installationen): *Police Administration* alle Rechte, *Supervisor* `view` + `requests`, *System Administrator* alles.

## Sicherheit

- Zugangsdaten (Passwort, API-Schlüssel) nur **AES-256-GCM-verschlüsselt** in der Datenbank (Schlüssel aus `ERLC_SECRET_KEY`, sonst `SESSION_SECRET` – wie beim ER:LC-Server-Key). Sie werden nie an das Dashboard zurückgegeben (nur „gespeichert ja/nein“), nie protokolliert (nur *dass* sie geändert wurden) und erscheinen nie in Fehlermeldungen (auch nicht die Sitzungs-ID).
- Bot-Routen `/bot/radio-whitelist/*` nur mit Bot-Token; Anträge nur vom konfigurierten Server.
- Versionsschutz (409 bei gleichzeitigen Änderungen), Transaktionen, keine Lösch-Routen.

## CSV-Export / -Import (Funkdienste ohne API)

Spalten (Kopfzeile Pflicht, Komma oder Semikolon, UTF-8):
`discord_id, discord_name, external_name, status, rank, department, expires_at, reason`

- **Export** (*Import & Export*): wählbar nach Status; Zellen mit `=`, `+`, `-`, `@` werden gegen Formel-Ausführung geschützt (`'` davor).
- **Import**: Pflichtspalte `discord_id`. Neue IDs → aktive manuelle Freigabe (optional `expires_at` als `JJJJ-MM-TT`). Vorhandene Einträge werden nur **ergänzt** (`discord_name`, `external_name`, `rank`, `department`); **Status werden nie per Import geändert, nichts wird gelöscht**. Spalte `status` wird beim Import ignoriert. Immer erst **Probelauf**, dann übernehmen; Fehler mit Zeilennummer. Max. 2000 Zeilen.

Ablauf mit der kostenlosen Zello-App: Änderungen im Dashboard → Eintrag erscheint unter „Im Funkdienst zu erledigen“ → Moderator setzt in der Zello-App „Trusted“ bzw. entfernt es → im Dashboard „✔ Im Funkdienst erledigt“.

## Migrationsplan

Migration `20261112100000_radio_whitelist_external` ist **rein additiv**:

1. Neue Tabellen `RadioGrant`, `RadioRequest`, `RadioIntegration` (keine bestehende Tabelle wird geändert oder gelöscht).
2. Übernahme der bisherigen Tabelle `RadioWhitelist`: je Benutzer der älteste Eintrag → `RadioGrant` (Status `ACTIVE`, Quelle „Übernommen“), Discord-ID aus der Discord-Verknüpfung. Einträge **ohne** verknüpftes Discord-Konto werden ohne Discord-ID übernommen und im Dashboard mit „⚠️ Discord-ID fehlt“ markiert (bitte nachtragen). Idempotent – mehrfaches Ausführen erzeugt keine Doppel.
3. **`RadioWhitelist` bleibt unverändert erhalten** (Altbestand, wird nicht mehr beschrieben). Ein Entfernen wäre eine eigene, ausdrücklich freizugebende Migration – sie ist nicht Teil dieser Änderung.
4. Rechte `radiowhitelist.*` angelegt. Wer die Whitelist bisher ändern durfte (`personnel.edit` bzw. `personnel.*`), bekommt `radiowhitelist.view`, `.grant` und `.remove` – damit fällt keine bisherige Möglichkeit weg. Alles andere muss ausdrücklich vergeben werden.

Vorher: Backup (*Protokolle & Backups* bzw. `deploy/` → tägliche DB-Sicherung). Rückweg: die neuen Tabellen sind unabhängig; der Altbestand in `RadioWhitelist` ist vollständig vorhanden.

## Einschränkungen

- Zello Work: nur gegen die Dokumentation und einen simulierten Server getestet, nicht gegen ein echtes Netzwerk. Zello-Konten werden nicht angelegt/gelöscht.
- Kostenlose Zello-App und andere Funkdienste: **keine** automatische Synchronisierung (keine offizielle API) – manuell + CSV.
- Discord-Teil (`/funkantrag`, DMs, Rollen, Rollenabgleich) nicht gegen echtes Discord getestet. Ohne den privilegierten Intent „Server Members“ kennt der vollständige Abgleich nur Mitglieder im Bot-Cache; Einzelereignisse funktionieren trotzdem.
- Ein Synchronisierungslauf gleichzeitig je API-Instanz (bei mehreren Instanzen kann ein zweiter Lauf parallel starten; die Zello-Aufrufe sind idempotent).
