# MDT (Polizei-Terminal)

Das MDT ist eine **eigene Vollbild-Oberfläche** unter `/mdt`, aufgebaut wie ein Streifen-Terminal. Anmeldung und Rechte sind dieselben wie im Dashboard:
- **Dashboard → MDT:** Button „MDT öffnen“ oben rechts oder Menüpunkt „MDT“.
- **MDT → Dashboard:** „Zum Dashboard“ oben rechts.

Jeder Menüpunkt erscheint nur mit dem passenden Recht. Die API prüft dieselben Rechte.

| Bereich | Route | Recht | Inhalt |
|---|---|---|---|
| Übersicht | `/mdt` | `dashboard.view` | Suche (Person, Kennzeichen, Aktenzeichen, Roblox-Name/-ID), Schnellaktionen (Einsatz, Bericht, Ermittlung, Fahndung anlegen), Lagebild |
| Meine Einheit | `/mdt/unit` | `cad.view` | Einheit, Dienststatus, Einsatzaufträge, Rückmeldungen an die Leitstelle (siehe [cad.md](cad.md)) |
| Bürger | `/mdt/citizens` | `persons.view` | Bürgersuche als Karten (Name, Roblox-Name/-ID, Telefon; Filter nach Merkmal), Klick öffnet die **Bürgerakte** |
| Fahrzeuge | `/mdt/vehicles` | `vehicles.view` | Kennzeichen, Modell oder Halter; Akte mit Halter, Fahndungen, Einsätzen |
| Haftbefehle | `/mdt/warrants` | `wanted.view` | aktive Fahndungen nach Personen und Fahrzeugen |
| Waffen | `/mdt/weapons` | `weapons.view` | Waffenregister: Seriennummer, Art, Modell, Besitzer, Status (registriert, gestohlen, beschlagnahmt, vernichtet) |
| Berichte, Einsätze, Ermittlungen | `/mdt/reports` … | wie im Dashboard | dieselben Listen und Akten, im MDT geöffnet |
| Dienstliste, Beamte | `/mdt/roster`, `/mdt/officers` | `team.view`, `personnel.view` | Teamliste und Personal |
| MDT-Einstellungen | `/mdt/settings` | `settings.manage` | Lizenzen, Merkmale/Warnhinweise (mit Farbe), Waffenarten, Geschlechter – automatisch gespeichert |

## Bürgerakte

- **Kopf:** Foto, Name, Roblox-ID, Warnhinweise („Aktiver Haftbefehl“ und die gesetzten Merkmale), Geburtsdatum, Alter, Geschlecht, Telefon, Beruf, Adresse.
- **Roblox-Profil (live):**
  - Statt eines Platzhalters zeigt die Akte den **Roblox-Avatar** (Ganzkörper), dazu Kopfbild, Anzeigename, @Name, Verifiziert-Haken und „Auf Roblox gesperrt“, mit Link zum Profil.
  - Der Reiter **„Roblox“** zeigt Erstelldatum, Kontoalter, Freunde, Follower/folgt, „Über mich“, Gruppen mit Rolle und Rang sowie frühere Namen.
  - Alles kommt von den öffentlichen Roblox-APIs und wird 10 Minuten zwischengespeichert. Ist ein Teil nicht abrufbar, steht „nicht abrufbar“ da, nichts wird geraten.
  - Fehlt in der Akte die Roblox-ID, wird sie über den exakten Roblox-Namen nachgetragen.
  - Die Karten der Bürgersuche zeigen das Roblox-Kopfbild (eine gebündelte Abfrage je Seite).
- **Foto:** „Foto ändern“ (Datei) oder „Foto aufnehmen“ (öffnet am Handy die Kamera). PNG, JPG oder WebP bis 8 MB; das Foto ersetzt das vorige. Gibt es Foto und Roblox-Avatar, schaltet man unter dem Bild zwischen „Roblox“ und „Foto“ um.
- **Zähler:** aktive Haftbefehle, Fahrzeuge, Waffen, Einsätze, Berichte. Ein Klick öffnet den Reiter.
- **Reiter:** Übersicht (Personalien, äußere Merkmale, Adresse), Lizenzen, Haftbefehle, Fahrzeuge, Waffen (mit „Registrieren“), Einsätze, Berichte, Ermittlungen, Notizen, Merkmale, Verlauf.
- **Rechte:** Bearbeiten braucht `persons.edit`. Reiter, deren Bereich man nicht sehen darf, fehlen. Zum Beispiel erscheinen ohne `wanted.view` keine Haftbefehle.
- **Nur gespeicherte Daten:** Was nicht erfasst ist, steht als „Nicht erfasst“ da und wird nie erfunden. Personen aus ER:LC kommen mit Roblox-Name und -ID. Die Personalien (Rollenspiel-Identität) trägt die Polizei ein.
- **Protokoll und Konflikte:** Jede Änderung steht im Verlauf der Person und im Audit (`person.update`, `person.photo`). Hat jemand anderes die Akte inzwischen geändert, wird das Speichern abgelehnt (Versionsprüfung).

## Waffenregister

- Seriennummern sind je Akten-Bereich eindeutig. Sie werden in Großbuchstaben gespeichert, Leerzeichen fallen weg.
- Rechte:
  - `weapons.view`: Register ansehen
  - `weapons.create`: Waffen registrieren
  - `weapons.edit`: Status, Besitzer und Notizen ändern
- Die Migration gibt die Rechte jeder Rolle, die die entsprechenden Fahrzeugrechte hat (`vehicles.view` / `create` / `edit`).
- Audit-Aktionen: `weapon.create` und `weapon.update`.

## API

`/api/v1/mdt/…`:
- `config` (GET; PUT nur mit `settings.manage`)
- `citizens` (Liste), `citizens/:id` (Profil, PATCH Personalien), `citizens/:id/photo` (POST), `citizens/:id/roblox` (Roblox-Profil live)
- `vehicles`, `vehicles/:id`
- `weapons` (GET, POST), `weapons/:id` (PATCH)
- `warrants`

Bürger, Fahrzeuge und Waffen gelten je gewähltem Discord-Server bzw. Server-Verbund (Akten-Bereich).
