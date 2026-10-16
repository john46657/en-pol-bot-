# Dashboard: Rechte, Server-Trennung, persönliche Einstellungen, Teamliste, Voice, automatisches Speichern

## Zugang (Discord OAuth2)
- Anmeldung mit Discord. Wer Zugang bekommt, legt der Admin fest: **Settings → Sign in with Discord – Zugang zum Dashboard → Discord-Rollen mit Dashboard-Zugriff**. Ohne eine dieser Rollen: „🔒 Kein Zugriff“.
- Die Discord-Rollen werden **laufend** geprüft, nicht nur beim Login: bei Anfragen spätestens alle 2 Minuten je Benutzer, im Hintergrund alle 5 Minuten für alle angemeldeten Discord-Benutzer. Zugangsrolle verloren → alle Sessions sofort beendet (Audit `auth.discord.access_revoked`). Ist Discord kurz nicht erreichbar, bleibt der letzte Stand (kein Aussperren bei Störungen).
- `ADMIN_DISCORD_IDS` (Serverbesitzer) kommen immer rein und haben die Rolle „System Administrator“.

## Rollen & Rechte (Admin → Roles & Permissions)
- Rollen haben **Priorität** (Hierarchie, oben = höchster Rang, per Ziehen oder Pfeilen sortierbar), Farbe, Icon, Beschreibung, aktiv/deaktiviert (deaktiviert = verleiht nichts) und **verknüpfte Discord-Rollen**: Wer eine davon hat, bekommt die Dashboard-Rolle automatisch (und verliert sie mit der Discord-Rolle). Mehrere Discord-Rollen je Rolle möglich.
- Erstellen, bearbeiten, duplizieren, löschen, deaktivieren; Rechte je Rolle oder in der **Berechtigungsmatrix** (Bereiche/Aktionen × Rollen). Jede Änderung wird automatisch gespeichert.
- **Bereichsrechte** (`dashboard.tickets.view`, `dashboard.applications.view`, `dashboard.team.view`, `dashboard.offices.view`, `dashboard.voice.view`, `dashboard.logs.view`, `dashboard.settings.view`) blenden ganze Bereiche aus dem Menü/der Startseite aus; die API prüft zusätzlich immer die Modul-Rechte (z. B. `ticket.delete`). Bestehende Rollen bekamen die Bereichsrechte passend zu ihren Modul-Rechten (Migration).
- **Benutzer** (*Benutzer & Rollen → Benutzer*): Suche nach Name, Benutzername, Roblox- oder Discord-ID; Filter nach Status, Rolle und Discord-Verknüpfung. Die Detailansicht hat vier Reiter:
  - **Übersicht** – Konto, Anzeigename, Discord- und Roblox-Verknüpfung.
  - **Rollen** – Rollen des gewählten Servers (unter „Alle Server“: die serverübergreifenden), nach Rang sortiert. Manuell vergebene sind umschaltbar (nur unterhalb des eigenen Rangs), **über Discord** vergebene kommen und gehen mit der Discord-Rolle und sind gesperrt; Rollen anderer Server werden nur angezeigt.
  - **Rechte** – Sonderrechte (einzelne Rechte zusätzlich erlauben oder ausdrücklich verweigern, nur auf dem gewählten Server) und die **wirksamen Rechte** mit Herkunft (welche Rolle bzw. welches Sonderrecht) – dieselbe Auflösung wie bei jeder API-Prüfung (`GET /users/:id/permissions`). Reihenfolge: Benutzer-DENY → Benutzer-ALLOW → Rollen-DENY → Rollen-ALLOW → verweigert.
  - **Sicherheit** – 2FA zurücksetzen, Konto (de)aktivieren, löschen.
- Rollen speichern ändert nur manuelle Zuweisungen des gewählten Bereichs: Discord-Zuweisungen bleiben Discord-Zuweisungen (sie werden nicht mehr versehentlich dauerhaft), Rollen anderer Server bleiben unberührt.
- Im Rollen-Editor: Rollen- und Rechtesuche, Zähler je Bereich, **Mitglieder** der Rolle mit Herkunft (manuell/Discord, `GET /roles/:id/members`), in der Matrix ein-/ausblendbare Rollen-Spalten.
- **Sicherheit (serverseitig):** niemand ändert eigene Rollen/Rechte; Rollen und Benutzer nur **unterhalb des eigenen Rangs**; erlauben nur, was man selbst hat (Wildcards nur mit allen erfassten Rechten); die Serverbesitzer-Rolle ist im Dashboard nicht änderbar; Sperren/Entsperren nur von oben. Ausblenden im Menü ist nur Komfort.
- **Audit**: jede Änderung einzeln (Modul `permissions`) mit Benutzer, Discord-ID, Zeit, alter/neuer Wert, Rolle bzw. betroffener Benutzer und lesbarem Satz („Max hat der Rolle „Moderator“ die Berechtigung ticket.delete entzogen“).
- Geänderte Rechte wirken sofort (jede API-Anfrage rechnet neu); offene Dashboards laden ihr Profil per Echtzeit-Ereignis neu.

## Server laufen getrennt
- Die Server-Auswahl oben links gilt für alles: Das Dashboard schickt den Server bei jeder Anfrage mit (`X-Guild-Id`), der Bot bei jeder Interaktion.
- Rollen gehören einem Server (beim Anlegen im Server-Kontext automatisch) und gelten **nur dort**. Auf einem Server zählen ausschließlich dessen Rollen. Serverübergreifende Rollen sind Vorlagen für neue Server und gelten nur unter „Alle Server“. Siehe [multi-server.md](multi-server.md).
- Teamliste, Voice-Widget, Team-Aktivität, Support-Tickets und Bewerbungen zeigen nur den gewählten Server.
- Einstellungen je Server: Teams, Büros, Dienstgrade, Organisationsname, Akzentfarbe, Kanäle und die Konfiguration aller Module (`<key>@<serverId>`). Ohne eigenen Wert gelten die Standardwerte, **nicht** die Werte anderer Server.

## Menü (Seitenleiste)
- **Gruppen** Betrieb · Akten · Organisation · Verwaltung · Konto – jede Gruppe lässt sich einklappen (pro Benutzer gespeichert); die Gruppe der geöffneten Seite bleibt offen.
- **Menüsuche** oben in der Leiste (Taste `/`): findet Menüpunkte auch über ihre Reiter (z. B. „Beförderungen“ → Personal › Beförderungen) und Suchbegriffe; Enter öffnet den ersten Treffer.
- **Zähler offener Vorgänge** (gelb): offene Tickets, Bewerbungen, Abmeldungen, Berichte zur Prüfung, Beförderungsanträge, zu bestätigende Mitteilungen – nur für Benutzer mit dem jeweiligen Bearbeitungsrecht, Aktualisierung jede Minute.
- **Handy** (< 768 px): feste Schnellleiste unten (Favoriten zuerst, sonst Dashboard/Leitstelle/Personen/MDT) + „Menü“. **Tablet** (768–1023 px): Symbolleiste mit Gruppen-Trennern, ☰ öffnet das Menü mit Beschriftungen.
- Seitenköpfe zeigen das Symbol des Menüpunkts; Bestätigungen erscheinen als eigener Dialog (kein Browser-Popup); jede Seite lässt sich drucken bzw. als PDF speichern (nur Inhalt, hell).

## Listen, Akten, Export
- Personen, Fahrzeuge, Berichte, Ermittlungen, Fahndungen, Einsätze: Suche, Status und Seite stehen in der Adresse (Zurück aus der Detailansicht behält die Liste); **CSV** lädt alle Treffer (Excel, Semikolon). Ebenso CSV für Personal, Dienststunden (Team) und das Audit-Log (mit gewähltem Server).
- **Bearbeiten** auf der Detailseite (mit Versionsprüfung): Fahrzeuge (`vehicles.edit`), Fahndungen (`wanted.edit`, nur aktive), Ermittlungen (`investigations.edit`: Titel, Beschreibung, Leitung, **Fall-Notizen**). Der Verlauf nennt, wer was geändert hat.
- **Berichte**: Versionsvergleich (Unterschiede zwischen zwei Ständen), Drucken.
- **Abmeldungen**: Kalender der nächsten 4 Wochen (wer ist wann weg, offene gestrichelt), Suche.
- **Statistiken**: Tagesverlauf je Kennzahl (ab 90 Tagen je Woche), gleiche Rechte wie die Übersicht.
- **Audit**: Suche, Filter nach Benutzer, Modul und Zeitraum.

## Persönliche Einstellungen (Menü → Persönlich)
Nur für einen selbst, je Benutzer (Discord-Konto) in der Datenbank – auf PC und Handy gleich: Hell/Dunkel/System, Akzentfarbe, Hintergrund (Farbe, Verlauf, Bild per https-Link), Kartenstil (voll/Glas/Rahmen), Transparenz, Eckenradius, Schatten, Glow, Animationen, Sidebar-Größe und einklappen, Schriftgröße, kompakt/komfortabel, Sprache (Datumsanzeige), Zeitzone, Datumsformat, Benachrichtigungsarten, Favoriten (auch per ☆ im Menü), Schnellaktionen, Teamlisten-Ansicht und -Filter, Voice-Widget.

## Startseite aus Widgets
„Dashboard bearbeiten“: Widgets hinzufügen, entfernen, per Drag & Drop verschieben, Größe (klein/mittel/groß/ganze Breite), minimieren, ausblenden. Mehrere persönliche Layouts (Vorlagen Standard, Tickets, Team; eigene anlegen, umbenennen, löschen) und Umschalten oben. Widgets: Statistiken, Schnellzugriff, Favoriten, Benachrichtigungen, offene/meine Tickets, Ticket-Aktivität, Bewerbungen, Teamliste, Voice, Team-Aktivitäten, Büros, Dienstgrade, Einsätze, Leitstelle, Einheiten, Fahndungen, Berichte – jeweils nur mit den nötigen Rechten. Recht zum Anpassen: `dashboard.customize`.

## Teamliste (Menü → Teamliste, Widget „👥 Teamliste“)
- Aus den Discord-Teamrollen (Zugangsrollen + mit Dashboard-Rollen verknüpfte Rollen) und den Personalakten: Avatar, Name, Team, Dienstgrad, Online-Status, Büro, Dienstnummer, Beitritt. **Keine Voice-Daten.**
- Aktualisiert sich **verbindlich alle 5 Sekunden** (auch im Hintergrund-Tab), zusätzlich sofort bei Änderungen (Echtzeit) und per „🔄 Jetzt aktualisieren“ (der Bot meldet dann sofort neu). Erkannt werden neue/entfernte Mitglieder, Rollen-, Namens-, Avatar- und Statuswechsel (Team-Aktivität); Team, Dienstgrad, Büro und Dienstnummer kommen aus der Personalakte.
- Suche (Name, Benutzername, Dienstnummer, Team, Dienstgrad, Büro), Filter (Team, Dienstgrad, Büro, Status – Werte aus Einstellungen → Teamstruktur), Karten- oder Tabellenansicht, Profil per Klick (Discord-ID, Rollen, Beitritt nur mit `personnel.view`/`users.view`).
- Team/Büro/Dienstnummer pflegen: Personalakte (wird automatisch gespeichert).

## Voice-Widget („🎙️ Aktive Voice-Channels“)
Eigener Bereich (`dashboard.voice.view`), getrennt von der Teamliste: Channels mit Personenzahl, Avatar, Name, Mikrofon, Kopfhörer, Kamera, Streaming, Aufenthaltsdauer (seit Bot-Start bekannt). Persönlich einstellbar: Channels/Kategorien, Sortierung, kompakt, Anzahl, leere Channels, Dauer.

## Automatisches Speichern
- Jede Änderung (persönlich und zentral – Rollen, Rechte, Discord-Zuordnung, Teamstruktur, Bot-Channels, Ticket-Einstellungen/-Kategorien/-Panels/-Status, Bewerbungen, Qualifikationen, Abmeldungen, Custom Fields, Personalakte) wird kurz gesammelt (≈1 s) und automatisch gespeichert.
- Vorher liegt sie im Browser (localStorage): Seitenwechsel, Neuladen, Schließen, kurzer Verbindungsabbruch verlieren nichts; ausstehende Änderungen werden nach dem Neustart bzw. sobald wieder online nachgesendet. Beim Schließen wird zusätzlich sofort gesendet (keepalive).
- Status oben: ✅ Alle Änderungen gespeichert · 🔄 Änderungen werden gespeichert … · ⚠️ Ungespeicherte Änderungen · ❌ Speichern fehlgeschlagen (Netzwerk-/Serverfehler werden automatisch wiederholt; vom Server abgelehnte Änderungen – fehlende Rechte, ungültige Werte – werden angezeigt und nicht endlos wiederholt). „Jetzt speichern“ speichert sofort.
- Die Datenbank ist die Quelle der Wahrheit; nach dem Neuladen werden die gespeicherten Werte geladen.

## 📡 Funk-Codes (Menü → Funk-Codes, Widget „📡 Funk-Codes“, Discord `/funkcode`)
- Ansehen und suchen: `radio.view` (+ Bereich `dashboard.radio.view`); bearbeiten: `radio.manage`. Bestehende Rollen: sehen wie das Team (`team.view`), bearbeiten wie die Einstellungen (`settings.manage`).
- „Standard-Codes einfügen“ legt gängige 10-Codes an (vorhandene bleiben). Inline bearbeiten (automatisch gespeichert), sortieren per Ziehen, löschen.
- Je Server getrennt: Codes eines Servers überdecken gemeinsame Codes mit gleichem Namen. Auch in der globalen Suche (Strg+K).

## 📣 Team-Chance (Menü → Team-Chance, Widget, Discord `/teamchance`)
- Bewerbungsphase fürs Team öffnen/schließen – je Server; optional Start/Ende, Platzzahl, Ankündigungs-Channel mit Rollen-Erwähnung.
- Beim Öffnen: Ankündigung in Discord + Benachrichtigung an alle mit `teamchance.view`; beim Schließen: Ankündigung „geschlossen“. Alles im Audit-Log.
- Option „Bewerbungen nur während der Team-Chance“: Discord-Bewerbungen und `/apply` werden außerhalb abgelehnt (auch wenn alle Plätze vergeben sind). `/apply` zeigt den Status an.
- Rechte: `teamchance.view` (wer Bewerbungen sieht), `teamchance.manage` (wer Bewerbungen entscheidet).

## 🏢 Büros (Menü → Büros, Widget)
Teammitglieder nach Büro gruppiert (Bereich `dashboard.offices.view`); Büros unter Einstellungen → Teamstruktur, Zuordnung in der Personalakte.

## 🔔 Benachrichtigungen
Erzeugt werden: neue Bewerbung (an alle mit `applications.review`), Ticket übernommen (an den Ersteller), Teamänderung neu/nicht mehr im Team (an `team.manage`), neue Ankündigung (an alle Leser), Team-Chance geöffnet, ⚠️ Systemhinweis (Einstellungen → „Systemhinweis senden“, an alle Dashboard-Benutzer des gewählten Servers) sowie die bisherigen (Einsatz, Bericht, Beschwerde, Personal …). Neue Benachrichtigungen erscheinen sofort als Popup; Arten und Popups stellt jeder unter Persönlich ein.

## Sprache
Persönlich → Sprache: Deutsch (Standard) oder Englisch für Menü und Navigation; Datum/Uhrzeit nach persönlichem Format und Zeitzone. Viele Seiteninhalte sind noch englisch bzw. deutsch gemischt.

## Bot-Voraussetzungen
Developer Portal → Bot → Privileged Gateway Intents: **Server Members** (vollständige Teamliste) und **Presence** (Online-Status). Fehlen sie, startet der Bot trotzdem (Teamliste dann nur mit bekannten Mitgliedern bzw. Status „unbekannt“). Voice braucht kein privilegiertes Recht.

## Server-Verbund (mehrere Discord-Server)
*Administration → Server-Verbund* (ansehen `settings.view`, ändern `settings.manage`): Discord-Server **können zusammen sein, müssen aber nicht**.

**Je Server getrennt** (Akten-Bereich `serverId`, wie Personen/Fahrzeuge): Personen, Fahrzeuge, **Berichte, Fahndungen, Ermittlungen, Beschwerden, Beweismittel und Dienstzeiten**. Die Trennung sitzt zentral im Datenbankzugriff (`apps/api/src/prisma/server-scope.ts`): Jede Anfrage mit gewähltem Server (Dashboard oben links bzw. Discord-Server der Bot-Interaktion) sieht und ändert nur Einträge dieses Servers; neue Einträge bekommen ihn automatisch. Ohne gewählten Server („Alle Server“) sieht man alles. Bestehende Einträge von vor der Trennung ordnet die API beim Start einmalig dem Heimat-Server der Leitstelle zu (bzw. dem einzigen bekannten Discord-Server). **Seit der vollständigen Trennung ebenfalls je Server:** Leitstelle (CAD), Personalakte und HR, Dienstnummern, Tatbestände, Bußgelder, SEK, Funk-Freigaben, Academy, Workflows und Kommunikation. Übersicht: [multi-server.md](multi-server.md).
- **Gruppe** (z. B. Polizei + SEK): mindestens zwei Server. Je Gruppe wählbar:
  - **Akten teilen** – alle Server der Gruppe sehen dieselben Personen- und Fahrzeugakten (sonst hat jeder Server eigene).
  - **Einstellungen teilen** – Bewerbungen/Qualifikationen (Panels, Fragen, Rollen), Willkommen & Abschied, Design (Akzentfarbe), Name und Teamstruktur kommen vom **Haupt-Server** der Gruppe; wer auf einem anderen Server der Gruppe etwas ändert, ändert es für alle.
- **Server ohne Gruppe**: *eigene Akten* (Standard, getrennt) oder ausdrücklich *gemeinsame Akten* (gemeinsamer Bestand). „Gemeinsame Akten hierher verschieben“ übernimmt den bisherigen gemeinsamen Bestand in die eigenen Akten.
- Neue Akten – von Hand oder automatisch aus ER:LC – landen im Bereich des Servers, auf dem sie entstehen (bei ER:LC: der Discord-Server, dem der ER:LC-Server zugeordnet ist). Die Roblox-ID ist je Bereich eindeutig. Mit „Alle Server“ oben links sieht man alle Akten.
- Was schon immer je Server getrennt ist (Rollen/Rechte, Teamliste, Support-Tickets, Sprach-Support-Räume, CAD-Server-Verbindungen), bleibt so.
