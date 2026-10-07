# Dashboard: Rechte, Server-Trennung, persönliche Einstellungen, Teamliste, Voice, automatisches Speichern

## Zugang (Discord OAuth2)
- Anmeldung mit Discord. Wer Zugang bekommt, legt der Admin fest: **Settings → Sign in with Discord – Zugang zum Dashboard → Discord-Rollen mit Dashboard-Zugriff**. Ohne eine dieser Rollen: „🔒 Kein Zugriff“.
- Die Discord-Rollen werden **laufend** geprüft, nicht nur beim Login: bei Anfragen spätestens alle 2 Minuten je Benutzer, im Hintergrund alle 5 Minuten für alle angemeldeten Discord-Benutzer. Zugangsrolle verloren → alle Sessions sofort beendet (Audit `auth.discord.access_revoked`). Ist Discord kurz nicht erreichbar, bleibt der letzte Stand (kein Aussperren bei Störungen).
- `ADMIN_DISCORD_IDS` (Serverbesitzer) kommen immer rein und haben die Rolle „System Administrator“.

## Rollen & Rechte (Admin → Roles & Permissions)
- Rollen haben **Priorität** (Hierarchie, oben = höchster Rang, per Ziehen oder Pfeilen sortierbar), Farbe, Icon, Beschreibung, aktiv/deaktiviert (deaktiviert = verleiht nichts) und **verknüpfte Discord-Rollen**: Wer eine davon hat, bekommt die Dashboard-Rolle automatisch (und verliert sie mit der Discord-Rolle). Mehrere Discord-Rollen je Rolle möglich.
- Erstellen, bearbeiten, duplizieren, löschen, deaktivieren; Rechte je Rolle oder in der **Berechtigungsmatrix** (Bereiche/Aktionen × Rollen). Jede Änderung wird automatisch gespeichert.
- **Bereichsrechte** (`dashboard.tickets.view`, `dashboard.applications.view`, `dashboard.team.view`, `dashboard.offices.view`, `dashboard.voice.view`, `dashboard.logs.view`, `dashboard.settings.view`) blenden ganze Bereiche aus dem Menü/der Startseite aus; die API prüft zusätzlich immer die Modul-Rechte (z. B. `ticket.delete`). Bestehende Rollen bekamen die Bereichsrechte passend zu ihren Modul-Rechten (Migration).
- **Benutzer-Rechte** (Admin → Users): einzelne Rechte zusätzlich erlauben oder ausdrücklich verweigern. Reihenfolge: Benutzer-DENY → Benutzer-ALLOW → Rollen-DENY → Rollen-ALLOW → verweigert.
- **Sicherheit (serverseitig):** niemand ändert eigene Rollen/Rechte; Rollen und Benutzer nur **unterhalb des eigenen Rangs**; erlauben nur, was man selbst hat (Wildcards nur mit allen erfassten Rechten); die Serverbesitzer-Rolle ist im Dashboard nicht änderbar; Sperren/Entsperren nur von oben. Ausblenden im Menü ist nur Komfort.
- **Audit**: jede Änderung einzeln (Modul `permissions`) mit Benutzer, Discord-ID, Zeit, alter/neuer Wert, Rolle bzw. betroffener Benutzer und lesbarem Satz („Max hat der Rolle „Moderator“ die Berechtigung ticket.delete entzogen“).
- Geänderte Rechte wirken sofort (jede API-Anfrage rechnet neu); offene Dashboards laden ihr Profil per Echtzeit-Ereignis neu.

## Server laufen getrennt
- Die Server-Auswahl oben links gilt für alles: Das Dashboard schickt den Server bei jeder Anfrage mit (`X-Guild-Id`), der Bot bei jeder Interaktion.
- Rollen können einem Server gehören (beim Anlegen im Server-Kontext automatisch): Sie gelten **nur dort**. Unter „Alle Server“ zählen nur serverübergreifende Rollen. Wer nur auf einem Server Rollen hat, landet automatisch in diesem Server.
- Teamliste, Voice-Widget, Team-Aktivität, Support-Tickets und Bewerbungen zeigen nur den gewählten Server.
- Einstellungen je Server: Teams, Büros, Dienstgrade, Organisationsname, Akzentfarbe (`<key>@<serverId>`; ohne eigenen Wert gilt der gemeinsame).

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
- **Gruppe** (z. B. Polizei + SEK): mindestens zwei Server. Je Gruppe wählbar:
  - **Akten teilen** – alle Server der Gruppe sehen dieselben Personen- und Fahrzeugakten (sonst hat jeder Server eigene).
  - **Einstellungen teilen** – Bewerbungen/Qualifikationen (Panels, Fragen, Rollen), Willkommen & Abschied, Design (Akzentfarbe), Name und Teamstruktur kommen vom **Haupt-Server** der Gruppe; wer auf einem anderen Server der Gruppe etwas ändert, ändert es für alle.
- **Server ohne Gruppe**: *gemeinsame Akten* (Standard, wie bisher – ein Bestand für alle Server ohne eigene) oder *eigene Akten* (getrennt). „Gemeinsame Akten hierher verschieben“ übernimmt den bisherigen gemeinsamen Bestand in die eigenen Akten.
- Neue Akten – von Hand oder automatisch aus ER:LC – landen im Bereich des Servers, auf dem sie entstehen (bei ER:LC: der Discord-Server, dem der ER:LC-Server zugeordnet ist). Die Roblox-ID ist je Bereich eindeutig. Mit „Alle Server“ oben links sieht man alle Akten.
- Was schon immer je Server getrennt ist (Rollen/Rechte, Teamliste, Support-Tickets, Sprach-Support-Räume, CAD-Server-Verbindungen), bleibt so.
