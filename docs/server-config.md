# Server-Konfiguration, Branding und Bilder

Jeder registrierte Discord-Server (Mandant = Guild-ID, Tabelle `DiscordServer`) hat eine eigene Konfiguration: Name und Anzeige, Logo und Bilder, Farben/Design, Module. Server A beeinflusst Server B nie. Grundlage ist die bestehende Mehrserver-Struktur ([multi-server.md](multi-server.md)).

## Im Dashboard

- **Administration → Server-Konfiguration** öffnet die Konfiguration des oben links gewählten Servers (`/servers/<guildId>/settings`). Auch erreichbar über *Server & Module* → „Konfiguration & Branding“.
- Bereiche: **Allgemein**, **Branding & Bilder**, **Design & Farben**, **Module**, **Discord-Verbindung**, **Berechtigungen**, **Benachrichtigungen**, **Datensicherung**. Rechts steht eine **Live-Vorschau**, die ungespeicherte Änderungen sofort zeigt. Gespeichert wird erst mit „Speichern“.
- **Einrichtungsassistent** (`/servers/<guildId>/setup`) mit 8 Schritten:
  1. Bot verbinden
  2. Server & Berechtigungen
  3. Name & Anzeige
  4. Logo & Bilder
  5. Farben & Design
  6. Module
  7. Prüfen & speichern
  8. Vorschau & Abschluss

  Der Fortschritt wird gespeichert, sodass du jederzeit „Später fortsetzen“ und wieder einsteigen kannst. Abschließen ist erst nach dem Speichern möglich. Solange die Einrichtung offen ist, zeigt das Dashboard Benutzern mit `servers.manage` einen Hinweis.
- Das Branding gilt im Dashboard des gewählten Servers:
  - Name, Kurzname und Logo in der Seitenleiste
  - Primär- und Akzentfarbe
  - Dashboard-Titel und Begrüßungstext
  - Banner bzw. Bereichsbilder für Dashboard, Ticket-Center und Team
  - optional ein Hintergrundbild

  **Persönliche Einstellungen haben Vorrang:** Der Hell/Dunkel-Standard des Servers gilt nur für Benutzer, die „System“ gewählt haben, und das Server-Hintergrundbild nur für Benutzer ohne eigenen Hintergrund.
- **Module** werden nur ausgeblendet und gesperrt. Die Daten bleiben vollständig erhalten und sind nach dem Einschalten wieder da. Angezeigt werden nur Module, die es im Projekt tatsächlich gibt.

## Bilder

| Art | Größe max. | Abmessungen | Seitenverhältnis (B ÷ H) |
|---|---|---|---|
| Serverlogo | 2 MB | 64×64 bis 4096×4096 | 0,5–2 |
| Profilbild (rund) | 2 MB | 64×64 bis 4096×4096 | 0,8–1,25 |
| Dashboard-Banner / Bereichsbild | 5 MB | 600×100 bis 8192×4096 | 2–12 |
| Hintergrundbild | 5 MB | 800×450 bis 8192×8192 | 0,4–4 |

Erlaubt sind nur **PNG, JPG und WebP**. Diese Prüfungen laufen im Browser vorab und auf dem Server verbindlich:

- **Echter Dateityp:** Er wird aus den Dateibytes gelesen. Eine SVG- oder HTML-Datei mit `.png`-Endung wird abgelehnt, ebenso eine angegebene Dateiart, die nicht zum Inhalt passt.
- **Größe und Abmessungen** werden gegen die Tabelle oben geprüft.
- **Keine externen Bild-URLs:** Die Konfiguration speichert nur IDs eigener, geprüfter Uploads.
- **Speicherung:** Dateien liegen unter `STORAGE_DIR/branding/` mit zufälligem, nicht erratbarem Namen. Der Originalname wird nur als Anzeige gespeichert und nie als Pfad verwendet.
- **Datenbank:** Tabelle `ServerAsset` mit Server-ID und Guild-ID, Art, MIME-Typ, Größe, Abmessungen, SHA-256, hochladendem Benutzer und Zeitpunkt. Ein identisches Bild desselben Servers wird nicht doppelt gespeichert.
- **Auslieferung:** nur an Mitglieder desselben Servers, mit `X-Content-Type-Options: nosniff`, CSP-Sandbox und privatem Cache.
- **Ersetzen und Entfernen:**
  - Ersetzen löscht das alte Bild nicht.
  - Unter „Nicht verwendete Bilder“ lässt sich ein Bild nach Bestätigung entfernen, aber nur, wenn weder die aktuelle Konfiguration noch eine gespeicherte frühere Version es verwendet.
  - Bilder früherer Versionen bleiben für die Wiederherstellung erhalten.
  - Beim Entfernen wird die Datei gelöscht und der Datenbankeintrag als gelöscht markiert, damit das Protokoll erhalten bleibt.

## Sicherheit und Trennung

- Jede Lese- und Schreibanfrage wird serverseitig geprüft:
  - Mitgliedschaft im Server, sonst 404 wie bei einem nicht vorhandenen Server.
  - `servers.view` zum Ansehen, `servers.manage` zum Ändern, `modules.manage` für Module.
- Eine im Browser angegebene Guild-ID allein berechtigt zu nichts. Eine manipulierte ID liefert dieselbe Antwort wie ein unbekannter Server.
- Bild-IDs eines anderen Servers werden beim Speichern wie unbekannte IDs abgelehnt.
- Der Browser erhält keine Geheimnisse wie Bot-Token, API-Schlüssel oder OAuth-Secret.
- Gleichzeitiges Bearbeiten: Gespeichert wird mit der geladenen Versionsnummer. Bei einer zwischenzeitlichen Änderung antwortet der Server mit 409, und nichts wird überschrieben.
- Jede Änderung landet im Audit-Log, und zwar nur mit Metadaten (geänderte Bereiche, Version), nicht mit Inhalten.

## Datensicherung und Wiederherstellen

- Jede gespeicherte Version wird in `ServerConfigRevision` aufbewahrt, zusammen mit einer Momentaufnahme der Modul-Schalter.
- „Wiederherstellen“ legt eine **neue** Version mit dem alten Inhalt an. Optional lassen sich auch die Modul-Schalter von damals wiederherstellen. Es wird nichts gelöscht.
- Vollständige Datenbank-Backups gibt es unter *Backups* (nur Systemadministratoren). **Die Bilddateien selbst** liegen in `STORAGE_DIR` und müssen wie alle Uploads gesichert werden ([deployment.md](deployment.md)).

## API

Alle Endpunkte liegen unter `/api/v1/servers` und erfordern eine Anmeldung.

| Methode | Pfad | Recht |
|---|---|---|
| GET | `/branding/:guildId` | Mitglied des Servers |
| GET / PUT | `/:serverId/config` | `servers.view` / `servers.manage` |
| POST | `/:serverId/config/setup` | `servers.manage` (Assistent-Fortschritt, Abschluss) |
| GET | `/:serverId/config/revisions` | `servers.view` |
| POST | `/:serverId/config/revisions/:version/restore` | `servers.manage` (+ `modules.manage` für Modul-Schalter) |
| POST | `/:serverId/assets` | `servers.manage` (multipart: `kind`, `file`) |
| GET | `/:serverId/assets/:assetId` | Mitglied des Servers |
| DELETE | `/:serverId/assets/:assetId?confirm=true` | `servers.manage` (nur unbenutzte Bilder) |

Migration: `20261118100000_server_branding`. Sie ist rein additiv und legt nur neue Tabellen an. Ohne gespeicherte Konfiguration sieht alles aus wie bisher.

## Grenzen

- Die Bot-Rechte (Schritt „Server & Berechtigungen“) meldet erst die neue Bot-Version. Vorher steht dort „unbekannt“.
- Ein Server ist im Dashboard erst wählbar und damit gebrandet, wenn der Bot ihn gemeldet hat. Das galt schon vorher.
- Das Branding betrifft das Dashboard. Discord-Nachrichten (Embeds, Panels) werden weiterhin in ihren eigenen Bereichen gestaltet.
- **Getestet:**
  - API-Tests (Trennung, Rechte, Uploads, Persistenz nach Neustart, Module ohne Datenverlust)
  - Web-Tests
  - lokaler Durchlauf im Browser mit einer simulierten Bot-Meldung

  **Nicht getestet:** mit einem echten Discord-Server und auf dem Hosting.
