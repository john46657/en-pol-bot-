# CAD-Leitstelle + ER:LC-Integration

Menü **CAD-Leitstelle** (`/cad`). Alles, was ein Administrator einstellen soll, liegt unter **CAD → Einstellungen** und wird automatisch gespeichert.

## Architektur

```
Dashboard (Browser) ──► API/Backend ──► ER:LC Private Server API (api.erlc.gg)
                            │
                            └──► Outbox ──► Discord-Bot ──► Leitstellen-Server / SEK+K9-Server
```

- Die ER:LC-API wird **nur im Backend** angesprochen (`apps/api/src/cad/erlc-client.ts`, `erlc.service.ts`). Browser und Bot sehen den Server-Key nie.
- Server-Keys liegen **AES-256-GCM-verschlüsselt** in der Datenbank (`ErlcServer.keyCipher`). Schlüssel: `ERLC_SECRET_KEY` (empfohlen, ≥ 32 Zeichen), sonst abgeleitet aus `SESSION_SECRET`. Wird das Geheimnis geändert, meldet die Verbindung „Key kann nicht entschlüsselt werden“ – Key dann im Dashboard neu eintragen.
- API-Antworten zeigen nur `••••••••••••`; Audit-Einträge vermerken „Key geändert“ ohne Wert; Fehlermeldungen werden vom Key bereinigt.

## ER:LC-Abruf

- Ein Abruf von `GET /v2/server` mit allen freigegebenen Datenarten (Spieler inkl. Positionen, Staff, Queue, Fahrzeuge, Emergency Calls, Mod Calls, Join/Kill/Command Logs).
- Intervall je Server: 5, 10, 15, 30 oder 60 Sekunden.
- Warteschlange je Server (nie parallel), Auswertung von `X-RateLimit-*`. Bei **429** wird bis `Retry-After` gar nichts gesendet; danach wachsender Backoff bis max. 5 Minuten. Ungültiger/gesperrter Key (Code 2002/2004, 401/403) → Status ⚠️ Fehler und Pause bis zum neuen Key (die ER:LC-Doku verlangt, wiederholt fehlschlagende Keys nicht weiter zu benutzen).
- Status: 🟢 Verbunden · 🟡 Eingeschränkt (Rate-Limit, API-Fehler) · 🔴 Offline (nicht erreichbar oder Server leer) · ⚠️ Fehler (Key).
- Bei Ausfall bleibt der **letzte Datenstand** sichtbar (`ErlcServer.snapshot`), das CAD läuft weiter, oben erscheint „ER:LC API momentan nicht erreichbar“.
- Abruf abschalten (z. B. Testsystem): `ERLC_POLLING=false`.

### Event-Webhook

ER:LC sendet Notrufe (und `;`-Befehle) per Webhook. URL im Dashboard (Server bearbeiten → „Event-Webhook nutzen“), z. B. `https://deine-domain/api/v1/erlc/webhook/<id>/<geheimer-teil>` (nur für `cad.manage_erlc` sichtbar – PRC signiert für alle Server mit demselben Schlüssel, der geheime Teil bindet die Zustellung an euren Server; doppelte Zustellungen werden ignoriert); in den ER:LC-Servereinstellungen unter **Event Webhook** eintragen. Jede Zustellung wird mit dem öffentlichen Ed25519-Schlüssel von PRC geprüft (Zeitstempel + Rohdaten, max. 5 Minuten alt). Notrufe landen sofort im CAD; der normale Abruf läuft weiter.

### Command Center

ER:LC → Command Center (Recht `cad.erlc_command`). Kritische Befehle (Liste je Server, Standard z. B. `:ban :kick :kill …`) brauchen zusätzlich `cad.erlc_command_critical` und eine Bestätigung; gesperrte Befehle (Standard `:shutdown`) laufen nie über das Dashboard. Jeder Befehl wird mit Benutzer, Discord-ID, Zeit, Server, Ergebnis und Fehler protokolliert (`ErlcCommandLog` + Audit). Laut ER:LC max. 1 Befehl / 5 s.

## Karte

- **Kartenbild hochladen** unter Einstellungen → Karte & Layer (PNG/JPG/WebP bis 40 MB). Die offiziellen Bilder von `api.erlc.gg` lassen sich nicht direkt einbinden (die Seite verbietet das Einbetten) – herunterladen und hochladen.
- Positionen werden in **Spielkoordinaten** gespeichert (ER:LC: Ursprung Kartenmitte, X nach rechts, Z nach unten). Kalibrierung (Ursprung/Maßstab) ist einstellbar; Standard passt zu den 5355-px-Karten.
- Layer (einzeln ein-/ausblendbar, jeder Benutzer für sich): Einsätze, Notrufe, SEK, K9, weitere Einheiten, Fahrzeuge, Staff, Spieler, POIs, Zonen, Sperrbereiche, eigene Layer.
- Einheiten erscheinen dort, wo ein zugeordneter Spieler (Teamübersicht → ER:LC-Name) gerade ist; sonst an ihrer manuellen Position. Fahrzeuge haben in der ER:LC-API keine eigene Position und werden beim Besitzer angezeigt.
- Map-Editor (`cad.manage_map`): POI setzen, Zone zeichnen (Punkte klicken), Name, Beschreibung, Kategorie, Icon, Farbe, Layer, sichtbare Rollen, Einsatzart, automatische Aktion.

## Einsätze, Einheiten, Notrufe, Funk

- Einsatznummer fortlaufend `E-2026-00421` (Präfix einstellbar). Einsatzarten, Prioritäten, Status (inkl. „schließt ab“), Einheitenstatus und Einheitentypen sind frei konfigurierbar.
- **Automatisches Aufräumen:** Beendete Einsätze (Status mit „schließt ab“, z. B. Abgeschlossen/Abgebrochen) werden **einen Tag nach Abschluss gelöscht** – samt Chronik. Berichte, Notrufe und Funkmeldungen bleiben erhalten, nur der Verweis auf den Einsatz entfällt. Die API prüft das stündlich.
- Notruf → **Einsatz erstellen** übernimmt Ort, Text und Position; die Verknüpfung bleibt gespeichert (`ErlcEmergencyCall.incidentId`). Einheit direkt zum Notruf zuweisen legt den Einsatz automatisch an.
- Funkmeldungen (Dashboard oder Discord `/cad funk`) mit Einsatz landen in der **Einsatzchronik**. Ohne Angabe wird der aktuelle Einsatz der eigenen Einheit genommen. Im Dashboard wählt man die **Einheit**, als die man funkt (Leitstelle mit `cad.assign_unit`: jede Einheit; alle anderen nur die eigene – der Server prüft das). Funk-Codes sind eine **Einzelauswahl**: ein Klick setzt genau diesen Code, ein zweiter Klick hebt ihn auf.
- **📟 Tablet** (CAD → Tablet): aufgebaut wie das Polizei-Tablet in ER:LC – *Meldungen* (offene Notrufe), *Aktivitätsbrett* (Polizisten im Spiel bzw. im Dashboard im Dienst mit Rufname, Rang, Dienstzeit; Farbe = Status ihrer Einheit; „Werde (nicht) verfügbar“ setzt den Status der eigenen Einheit), *Gesucht* (Personen-Fahndungen + im Spiel gesuchte Spieler mit Sternen) und *Auto BOLOs* (Fahrzeug-Fahndungen). Fahndungen nur mit `wanted.view`.
- **Position sofort bei neuen Notrufen/Einsätzen:** Die Position kommt direkt aus ER:LC (Notruf-Position; fehlt sie, der Live-Standort des Anrufers). Im CAD erscheint ein Hinweis mit **Kartenausschnitt** und Ort, Klick öffnet die Einsatzkarte; Einsatz-Details zeigen denselben Ausschnitt. Beim Anlegen eines Einsatzes lässt sich die Position per **„Position aus ER:LC übernehmen“** (Live-Standort eines Spielers) setzen. Die Discord-Meldung „Neuer Einsatz“ hat „Auf Karte anzeigen“.
- **Nur Polizei:** Übernommen werden nur ER:LC-Notrufe an das Team Police (nicht Sheriff/Feuerwehr/DOT); Sheriffs erscheinen weder auf der Karte noch in der Spielerauswahl.
- **Schnellsuche** oben in der Leitstelle: Personen (Roblox-Name/-ID) und Fahrzeuge (Kennzeichen) direkt suchen und öffnen.
- **Fahrzeug-GPS:** Die Ebene „Polizeifahrzeuge (GPS)“ zeigt nur Fahrzeuge von Spielern im Team Police. ER:LC liefert keine Fahrzeugposition – das Fahrzeug steht dort, wo sein Besitzer gerade ist.
- Discord: `/cad status`, `/cad funk`, `/cad einsaetze`; unter Notruf-Meldungen die Buttons Übernehmen / Einsatz erstellen / Einheit zuweisen / Schließen / Auf Karte anzeigen.

## MDT für SEK, K9 und andere Einheiten

**CAD → 📱 MDT** (`/cad/mdt`, Recht `cad.view`, auf dem Handy bedienbar) zeigt jedem Mitglied seine Einheit(en). Zugeordnet wird über die Teamübersicht (Benutzerkonto bzw. Discord-ID → Einheit).
- Dienststatus der eigenen Einheit mit einem Klick (konfigurierte Einheitenstatus).
- Aktuelle Einsatzaufträge mit Stichwort, Einsatzart, Ort (Link zur Karte), Beschreibung, beteiligten Einheiten und Einsatzchronik.
- **Rückmeldungen an die Leitstelle** (optional mit Zusatz): ✅ Auftrag angenommen · 🚓 Ausgerückt · 📍 Am Einsatzort · 🆘 Unterstützung benötigt · 🛡️ Einsatz unter Kontrolle · 🏁 Einsatz abgeschlossen (Meldung). Sie stehen in der Einsatzchronik und gehen nach Discord (Ereignisse „Rückmeldung einer Einheit“ und „Unterstützung benötigt“). „Ausgerückt“/„Angenommen“ setzen die Einheit auf *Unterwegs*, „Am Einsatzort“ auf *Am Einsatzort* – nur, wenn es diese Einheitenstatus gibt. Bei „Unterstützung benötigt“ und „Abschluss gemeldet“ bekommt der Disponent des Einsatzes zusätzlich eine Benachrichtigung.
- **Den Einsatz selbst ändern Rückmeldungen nie.** Status und Abschluss bleiben bei der Leitstelle (`cad.edit_incident` / `cad.close_incident`).
- Melden dürfen die Besatzung, die Leitstelle (`cad.assign_unit`) und aus Discord die Rolle der Einheit bzw. die freigegebenen Status-Rollen, vom SEK/K9-Server nur mit der Server-Verbindungs-Aktion „Status zurückmelden“.
- Discord: `/cad rueckmeldung art:<…> [notiz] [einheit]`.
- Daneben: Funkmeldungen der eigenen Einsätze, letzte Benachrichtigungen, Einsatzhistorie der eigenen Einheiten.

## Schichtübergabe

**CAD → Schichtübergabe** (`/cad/handover`). Ansehen mit `cad.view`, anlegen und bestätigen mit `cad.handover`.
- Die Übergabe hält den Stand fest: offene Einsätze, eingesetzte Einheiten, offene Notrufe ohne Einsatz, die letzten Status- und Rückmeldungsänderungen seit der vorigen Übergabe (höchstens 12 Stunden) und die Notizen des abgebenden Disponenten. Vertrauliche Einsätze erscheinen nur als Anzahl.
- Die nächste Schicht bestätigt die Übernahme, optional mit Notiz. Das geht nur einmal und nicht durch den Ersteller. Der Ersteller wird benachrichtigt.
- Ersteller, Bestätigender und Zeiten werden gespeichert (Audit `cad.handover.create` / `cad.handover.acknowledge`). Discord-Ereignis: „Schichtübergabe“.

## Leitstellenstatistik

**CAD → Statistik** (`/cad/stats`, Recht `cad.view_stats`), Zeitraum 24 Stunden bis 365 Tage:
- neue, abgeschlossene und offene Einsätze; Ø- und Median-Bearbeitungszeit (Anlage → Abschluss)
- Einsätze je Tag, Woche oder Monat, umschaltbar als Tabelle
- Einsatzarten, Prioritäten, Abschlussart, Herkunft (CAD oder ER:LC-Notruf)
- Beteiligung der Einheiten und der Einheitentypen
- Dienstzeiten aus den im System erfassten Dienstsitzungen, nicht aus der ER:LC-Onlinezeit

Abgeschlossene Einsätze werden beim Abschluss als Kennzahlen gesichert (`CadIncidentStat`). So zählen sie weiter, auch wenn der Einsatz einen Tag später gelöscht wird. Wird ein Einsatz wieder geöffnet, verschwindet sein Eintrag wieder. Bereits abgeschlossene Einsätze übernimmt die Migration.

## Discord-Kanäle und Cross-Server

- **Einstellungen → Discord-Kanäle**: je Server und Ereignis (neuer Einsatz, Status, Zuweisung, abgeschlossen, Notruf, Leitstellenmeldung, Funk) Kanäle und Rollen-Pings. Nichts ist fest eingebaut.
- **Cross-Server**: Verbindung Quelle (Leitstelle) → Ziel (SEK + K9). Je Verbindung: welche Datenarten die Leitstelle schickt (mit eigenen Zielkanälen) und welche Aktionen der Ziel-Server zurück darf (Status melden, Funk, Einsatzstatus sehen, Notrufe/Einsätze bearbeiten), optional nur mit bestimmten Rollen. Ohne Verbindung bleiben die Server vollständig getrennt; Aktionen vom fremden Server werden abgelehnt.
- Heimat-Server der Leitstelle: Einstellungen → Allgemein. Solange er fehlt und Server-Verbindungen existieren, werden Aktionen aus Discord abgelehnt.
- Funk aus Discord: wer keine Leitstellen-Rechte hat, funkt immer als eigene Einheit und nur in Einsätze, denen sie zugewiesen ist.
- Neue Notrufe: im CAD erscheint ein Hinweis mit Ton (abschaltbar über 🔔).

## Rechte (deny-by-default)

`cad.view`, `cad.create_incident`, `cad.edit_incident`, `cad.close_incident`, `cad.assign_unit`, `cad.manage_units`, `cad.view_persons`, `cad.view_vehicles`, `cad.manage_map`, `cad.view_erlc`, `cad.manage_erlc`, `cad.erlc_command`, `cad.erlc_command_critical`, `cad.manage_cross_server`, `cad.view_logs`, `cad.manage_settings`, `cad.radio`, `cad.handover`, `cad.view_stats` + Bereich `dashboard.cad.view`. Rechte gelten wie überall je Discord-Server (Rollen-Editor). Die Migration gibt bestehenden Rollen passende Rechte (Leitstelle → Einsatzrechte, Einstellungen → Verwaltung); **kritische ER:LC-Befehle bekommt niemand automatisch**. `cad.handover` erhält, wer Einsätze anlegen darf. `cad.view_stats` erhält, wer Einsätze abschließen oder CAD-Protokolle sehen darf.

## Rechte pro Einsatz und pro Einheit

- **Vertrauliche Einsätze:** Im Einsatz-Formular „Vertraulich – nur diese Rollen“. Dann sehen und bearbeiten ihn nur diese Dashboard-Rollen, der Disponent des Einsatzes und wer `cad.manage_settings` hat (🔒 in der Liste). Vertrauliche Einsätze werden nicht nach Discord gemeldet.
- **Einheiten:** Den Status einer Einheit melden die Leitstelle (`cad.assign_unit`), die Besatzung und – aus Discord – Mitglieder mit der Discord-Rolle der Einheit oder einer der „weiteren Status-Rollen“ (Einheit bearbeiten).

## Persönliche Ansicht

Jeder Benutzer stellt für sich ein: Widgets und Reihenfolge der Startseite, kompakte Ansicht, Kartenausschnitt/Zoom, sichtbare Layer, Favoriten-Einsätze, bevorzugter ER:LC-Server. Gespeichert in den persönlichen Einstellungen – andere Benutzer sind nicht betroffen.

## Audit

Alles mit `module: cad` oder `erlc`: Verbindung angelegt/geändert/Key geändert/getestet/entfernt, Einsätze, Zuweisungen, Status, Notrufe, Funk, Befehle, Server-Verbindungen, Karte (POI/Zone), Einstellungen. Ansicht: CAD → Protokolle (`cad.view_logs`).

## Grenzen / offen

- Die Webhook-Nutzlast ist von PRC nur teilweise dokumentiert; Notrufe werden erkannt, andere Ereignisse nur protokolliert.
- Zonen-„automatische Aktion“: „warn“ schreibt einen Hinweis in die Chronik, „notify“ zusätzlich eine Leitstellenmeldung – geprüft beim Anlegen eines Einsatzes mit Kartenposition.
- Gegen den echten ER:LC-Server und echtes Discord nicht getestet (nur mit nachgebauter API und Tests).

## Personen und Fahrzeuge aus ER:LC
Bei jedem erfolgreichen Abruf eines ER:LC-Servers (Daten „Players“ und „Vehicles“ aktiv) übernimmt das System automatisch:
- **Spieler → Personenakte** mit Roblox-Name und Roblox-ID. Eine vorhandene Akte mit gleichem Namen (ohne ID) wird ergänzt; ändert jemand seinen Roblox-Namen, wird die Akte angepasst. Neue Akten tragen den Hinweis „Automatisch aus ER:LC übernommen.“
- **Gespawnte Fahrzeuge mit Kennzeichen → Fahrzeugregister** mit Modell, Farbe und Halter (über den Roblox-Namen verknüpft). Vorhandene Fahrzeuge (gleiches Kennzeichen) werden aktualisiert, nicht doppelt angelegt.
- Geschrieben wird nur, was neu ist oder sich geändert hat; Notizen und Status aus dem Dashboard bleiben.

Auf den Seiten **Personen** und **Fahrzeuge** zeigt „🎮 Gerade im Spiel (ER:LC)“ live, wer bzw. was gerade auf dem Server ist – mit Link zur Akte. Mit einem oben gewählten Discord-Server erscheinen dessen ER:LC-Server und die ohne Zuordnung.
