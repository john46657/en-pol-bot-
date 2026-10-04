# Phase 41 – Eigene Seiten, Seitenvorlagen und Banner

**Stand:** abgeschlossen (2026-10-04). Fünfte Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 23, 43–46 und 49). Der Administrator legt eigene Dashboard-Seiten an, füllt sie mit Widgets aus Phase 40 und blendet Banner auf beliebigen Seiten ein.

## Umfang
- **Eigene Seiten** (Page Builder): Name, Icon, Beschreibung, Adresse (`/guilds/…/p/<adresse>`, aus dem Namen erzeugt und eindeutig), Rollen, Widget-Layout wie bei der Übersicht. Bis zu 20 Seiten. Neue Seiten erscheinen automatisch im Menü (Tab „Navigation“ erlaubt Reihenfolge, Gruppe, Titel, Rollen) und sind Ziel für Buttons und Hintergründe (`page-<adresse>`).
- **Seitenvorlagen:** Leere Seite, Statistik-Seite, Team-Seite, Info-Seite, Management-Seite – danach frei änderbar.
- **Editor** (Tab „📊 Seiten & Widgets“): Seitenwahl, „+ Seite erstellen“ (Dialog mit Vorlage und Adress-Vorschau), Seiteneinstellungen, Löschen mit Bestätigung, darunter der Widget-Editor aus Phase 40.
- **Banner-Builder** (Tab „📢 Banner“): Titel, Text (fett/kursiv/Link), Icon, Bild (https), Größe, Akzent-/Hintergrund-/Textfarbe, Button (Button-Builder), Ablaufdatum, Seitenauswahl („alle“ oder bestimmte), Rollen, Reihenfolge, Vorschau. Höchstens 10 Banner, je Seite werden höchstens 3 angezeigt; abgelaufene und versteckte Banner erscheinen nicht.
- **Rollen werden serverseitig durchgesetzt:** `GET design/effective` schneidet für Benutzer ohne die Rolle eingeschränkte Seiten (samt Widgets), Widgets, Banner und Menüeinträge aus der Konfiguration – sie verlassen den Server nicht. Server-Verwalter sehen alles. (In Phase 39/40 war das nur eine Menü-/Anzeige-Sichtbarkeit; jetzt ist es echte Auslieferungs-Kontrolle. Die **Daten** der Widgets kamen schon vorher nur nach Recht.)

## Beim Testen gefundene und behobene Punkte
1. **Eingabeprüfung** meldete bei Listeneinträgen (Seiten, Banner, Menü) fehlende Standardfelder als „ungültig“ – die API lehnte teilweise angegebene Listen mit 400 ab. `findIssues` meldet jetzt nur, was angegeben und verworfen/verändert würde.
2. Diagramm-Widgets hießen für Screenreader und als Überschrift nur „Diagramm“; sie tragen jetzt ihre Datenquelle („Bewerbungen nach Status“).
3. Phase-40-Modell erlaubte beliebige Seitenschlüssel; jetzt haben nur die Übersicht und eigene Seiten ein Layout (fremde Schlüssel werden verworfen).

## Tests
- `@nexus/design`: 81 (neu: eigene Seiten, Vorlagen, Banner, Sichtweise je Benutzer inkl. „Inhalt der versteckten Seite ist nicht im Ergebnis“, Seitenadressen).
- API-E2E: 24 (neu: Rollen-Einschränkung – Verwalter sieht Seite/Banner/Menü, Mitglied nur mit Rolle „Anwärter“ sieht die interne Seite, deren Widget-Text und das Leitungs-Banner **nirgends in der Antwort**).
- Browser (`design-pages.spec.ts`): Seite „Fortbildung“ aus der Statistik-Vorlage, zwei Banner (eines abgelaufen), Speichern → Banner auf Übersicht, Seite und eingebauter Seite (Link `target`/`rel`), abgelaufenes fehlt, Menüeintrag, Seite mit Daten-Widgets, unbekannte Seite → „Seite nicht gefunden“. 8 Browser-Tests, 4 Läufe hintereinander grün.

## Grenzen / nicht in dieser Phase
- Die Rollen-Auswahl nutzt Discord-Rollen; ändert jemand seine Rollen, gilt das nach dem nächsten Laden der Konfiguration (60 s Cache bzw. Neuladen).
- Seiten sind Widget-Seiten; eigener HTML-/Markdown-Seiteninhalt jenseits des Text-Widgets ist nicht vorgesehen.
- Beim Löschen einer Seite bleiben Verweise (Banner-Seitenliste, Menü-Eintrag, Hintergrund) als tote Schlüssel gespeichert, sind aber wirkungslos und werden beim nächsten Bearbeiten nicht mehr angezeigt.
- Uploads (Bilder), Suche und Benachrichtigungs-Center fehlen weiterhin; Bilder nur per https-Adresse.
- „Modal öffnen“ als Button-Aktion fehlt.
