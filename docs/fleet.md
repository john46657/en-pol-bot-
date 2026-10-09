# Polizeifahrzeuge (ER:LC)

**CAD → 🚓 Polizeifahrzeuge** (`/cad/fleet`), im MDT unter **Polizeifahrzeuge** (`/mdt/fleet`). Die Seite beantwortet zwei Fragen: Welche Polizeifahrzeuge meldet ER:LC gerade, und wem gehören sie? Wer sie gerade fährt, gehört nicht dazu, siehe unten.

## Was die ER:LC-API liefert (und was nicht)

Pro gespawntem Fahrzeug liefert `GET /v2/server` (`Vehicles=true`):

| Feld | Bedeutung |
|---|---|
| `Name` | Modellname |
| `Owner` | Spieler, der das Fahrzeug gespawnt hat (Besitzer) |
| `Plate` | Kennzeichen |
| `Texture` | Lackierung |
| `ColorHex`, `ColorName` | Farbe |

Die API liefert **keine Fahrzeug-ID**, **keine Fahrzeugposition** und **keinen Fahrer**. Deshalb gilt:

- **Fahrer:** steht immer als „Fahrerdaten nicht verfügbar“ da. Den Besitzer (gespawnt von) zeigen wir getrennt; er ist nicht zwingend der Fahrer. Räumliche Nähe wird nie als Fahrer gewertet.
- **Position:** höchstens die Position des Besitzers aus der Spielerliste, immer beschriftet mit „Position des Besitzers – keine Fahrzeugposition“. Ist der Besitzer nicht im Spiel: „Nicht verfügbar“.
- **Wiedererkennung:** über Besitzer, Modell und Kennzeichen. Hat ein Besitzer mehrere gleiche Fahrzeuge, werden sie nummeriert und als **„Zuordnung unsicher“** markiert. Wiederholte Abrufe erzeugen keine Duplikate (eindeutig je ER:LC-Server + Schlüssel).
- **Unbekannte Angaben** stehen als „Unbekannt“ bzw. „Nicht verfügbar“ da.

## Was als Polizeifahrzeug zählt

- Der Besitzer ist laut Spielerliste im **Team Police**. Sheriff und alle anderen Teams zählen nie.
- Ist der Besitzer gerade nicht im Spiel (Team unbekannt), zählt das Fahrzeug nur, wenn sein Modell als **aktives Modell im Katalog** steht.

## Abgleich

- Der Abgleich läuft nach jedem erfolgreichen ER:LC-Abruf. Das Abrufintervall stellt ihr je Server ein (CAD → Einstellungen → ER:LC), dazu kommt ein Mindestabstand zwischen zwei Abgleichen (Reiter Einstellungen, Standard 10 s).
- Rate-Limits, begrenzte Wiederholungen und Backoff übernimmt der bestehende ER:LC-Abruf. „Erneut verbinden“ gleicht sofort ab.
- Der Abgleich schreibt **nur API-Felder**. Was nicht mehr gemeldet wird, wird als „nicht mehr gemeldet“ markiert und nicht gelöscht. Gelöscht werden nur Einträge ohne interne Daten, die nach X Tagen nicht wieder auftauchen (einstellbar, Standard 7).
- Ist die Datenart „Fahrzeuge“ für einen Server aus, wird nichts als verschwunden markiert.
- **Bei einem API-Ausfall** bleibt der letzte Stand sichtbar und ist als „veraltet“ gekennzeichnet. Oben stehen Status und letzte Synchronisierung je Server.

## Liste, Filter, Details

- **Tabelle:** Fahrzeug, Modell (Katalog), Farbe, Fahrer, Roblox-Spieler (Besitzer, ID, im Spiel ja/nein), Discord-Mitglied (über die Teamübersicht bzw. ein verknüpftes Konto mit Roblox-ID), Einheit (intern), Status und letzte Aktualisierung.
- **Bedienung:** Spalten sind sortierbar. Filter gibt es für Modell, Farbe, Besitzer, Einheit, gemeldet/nicht mehr gemeldet und Besitzer im Spiel. Die Suche durchsucht Modell, Spieler, Kennzeichen und interne Kennung. Filter und Sortierung werden pro Benutzer gespeichert.
- **Details**, zweigeteilt:
  - **„Laut ER:LC-API“:** Modell, Farbe, Lackierung, Kennzeichen, Fahrer (nicht verfügbar), Besitzer, Roblox-ID, Team, Discord, Besitzerposition, Erkennungsgrund, zuerst/zuletzt gemeldet, Rohdaten des letzten Abrufs.
  - **„Intern (CAD) – keine Live-Daten“:** Einheit, Status, interne Kennung, Tags, Notizen. Diese Felder werden automatisch gespeichert.
- Dazu kommen „Bei Einsatz dokumentieren“ (Eintrag in der Einsatzchronik), die verknüpften Einsätze und der **Verlauf** (gespawnt, API-Änderungen, nicht mehr gemeldet, interne Änderungen, Einsätze).

## Modellkatalog

Der Katalog ist getrennt von den Live-Fahrzeugen, denn ER:LC liefert keine vollständige Modellliste.

- **Felder:** Name, **ER:LC-Modellname** (genau wie ER:LC ihn meldet; darüber erfolgt die Zuordnung), Kategorie (mit Symbol), Beschreibung, interne Kennung, aktiv/inaktiv, Tags, Abteilung, optional ein Bild. Echte Bilder erscheinen nur, wenn ihr eins hochladet; sonst steht das Kategorie-Symbol da.
- **„Von ER:LC gemeldet, noch nicht im Katalog“** schlägt Modelle vor, die schon gesehen wurden, zum Übernehmen.
- Änderungen an bestehenden Modellen werden automatisch gespeichert.

## Karte, CAD, MDT, Discord

- **Karte:** Die Ebene „Polizeifahrzeuge (Position des Besitzers)“ zeigt einen Marker je Besitzer mit seinen Fahrzeugen, Symbol nach Kategorie. Mit Filterfeld in der Ebenen-Auswahl (Modell, Besitzer, Einheit); aktualisiert sich alle 5 Sekunden.
- **CAD/MDT:** Fahrzeuge werden intern Einheiten zugewiesen. Im MDT („Meine Einheit“) stehen die zugewiesenen Fahrzeuge, ausdrücklich als interne Zuweisung und nicht als Live-Nutzung.
- **Discord:** `/cad fahrzeuge` listet die gemeldeten Polizeifahrzeuge mit Besitzer und Einheit.

## Rechte

| Recht | Erlaubt | Bekommt per Migration, wer … hat |
|---|---|---|
| `fleet.view` | Liste und Katalog ansehen | `cad.view` |
| `fleet.view_details` | Detailansicht | `cad.view` |
| `fleet.edit` | Status, Kennung, Tags, Notizen, bei Einsatz dokumentieren | `cad.manage_units` |
| `fleet.assign` | Einheit zuweisen | `cad.manage_units` |
| `fleet.manage_catalog` | Katalog pflegen | `settings.manage` |
| `fleet.manage` | Einstellungen | `settings.manage` |

Alle Änderungen landen im Audit (`fleet.*`). Der ER:LC-Key bleibt im Backend. Moderationsfunktionen gibt es hier keine.
