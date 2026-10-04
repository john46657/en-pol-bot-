# Phase 40 – Widgets im 12-Spalten-Raster

**Stand:** abgeschlossen (2026-10-04). Vierte Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 15–24 und 17–18). Die Übersicht besteht jetzt aus Widgets, die im Design-Editor frei angeordnet werden; Banner-Builder, eigene Seiten und Vorlagen folgen in Phase 41.

## Umfang
- **Modell** (`layout` im Theme, Paket `@nexus/design`): je Seite eine Widget-Liste. Widget = Typ, Position (Spalte 1–12, Zeile), Größe, Titel, Icon, sichtbar, Rollen, eigenes Aussehen (Hintergrund, Textfarbe, Rahmen, Rundung, Schatten, Glas – jeweils „Standard“ oder eigener Wert) und typabhängige Einstellungen. Höchstens 60 Widgets je Seite, 30 Seiten; ungültige Werte werden bereinigt, Überlappungen aufgelöst. Ältere Themes ohne `layout` erhalten die Standard-Übersicht.
- **Bibliothek (12 Typen):** Statistik, Tickets, Bewerbungen, Team (im Dienst), Diagramm (Balken nach Status), Aktivität (Audit-Log), Datum/Uhrzeit, Text, Link, Bild, Banner, Konfigurations-Check. Standard-Übersicht: vier Kennzahlen, Tickets- und Bewerbungsliste, Konfigurations-Check.
- **Größen** wie in der Spezifikation (1x1 … 4x2 als Schnellwahl) oder frei in Spalten/Zeilen.
- **Raster-Logik** (rein, getestet): Verschieben und Vergrößern verdrängt andere Widgets nach unten (nichts überlappt), „Aufräumen“ zieht alles nach oben, Hinzufügen unten, Duplizieren mit neuer ID, Obergrenzen.
- **Editor** (Tab „📊 Widgets“, volle Breite): Leinwand mit Ziehen (⠿ in der Titelzeile) und Vergrößern (◢); alles zusätzlich per Tasten/Zahlenfeldern; je Widget Titel, Icon, Sichtbarkeit, Größe/Position, Typ-Einstellungen, Aussehen, Rollen; Duplizieren und Entfernen.
- **Button-Builder** (in Link-, Bild- und Banner-Widgets): Text, Icon, Aktion (Dashboard-Seite, Externe Adresse https, Discord-Link, Tickets öffnen, Bewerbungen öffnen), Farbe, Hover-Farbe, Textfarbe, Rundung, Rahmen, Schatten. Eine Aktion „Modal öffnen“ gibt es nicht.
- **Text-Widget:** einfache Formatierung (`# Überschrift`, `**fett**`, `*kursiv*`, `- Liste`, `[Link](https://…)`); aus der Eingabe entsteht nie HTML (getestet mit `<script>`, `<b>` und `javascript:`).
- **Daten** (`GET design/widget-data`): jeder Bereich kommt **nur mit dem passenden Recht** (Tickets, Einreichungen, Schichten, Einsätze, Fahndungen, Personal, Abmeldungen, Audit); ohne Recht liefert der Server `null` und das Widget zeigt „🔒 Kein Zugriff“ – nie eine erfundene Zahl. Alle Abfragen sind auf den Server (Guild-ID) begrenzt; jedes Recht wird je Abruf nur einmal geprüft.
- **Leistung:** Daten werden nur geladen, wenn die Seite Daten-Widgets enthält (60 s Aktualisierung, 30 s Cache); Bilder laden verzögert; Diagramme sind reines CSS.
- **Mobil:** Widgets stapeln sich untereinander (abschaltbar unter Responsive → „Karten stapeln“).

## Beim Testen gefundene und behobene Fehler
1. **Mehrzeilige Texte verloren ihre Zeilenumbrüche** (die Bereinigung entfernte alle Steuerzeichen) – Listen und Überschriften brachen. Neue Bereinigung erhält `\n`.
2. **Adressfelder** (Logo, Hintergrundbild, Bild-Widget, Links) nahmen beim Tippen kein Zeichen an, solange die Adresse nicht vollständig gültig war – nur Einfügen ging. Neues URL-Feld hält Zwischeneingaben lokal und übernimmt nur Gültiges (mit Hinweis).
3. Ein Button verlor seine gewählte Art, sobald das Ziel noch leer war. Die Art bleibt jetzt; ohne gültiges Ziel gibt es keinen Button.
4. Bereichsnamen (Screenreader) von Statistik-Widgets nennen jetzt die Kennzahl.
5. Beim Verlassen der Übersicht entfernte ein zweiter `useDesign`-Aufruf die Design-Variablen – die Konfiguration wird jetzt per Kontext verteilt.

## Tests
- `@nexus/design`: 66 (neu: Widgets, Raster-Algorithmen, Buttons, Text-Formatierung, Banner-Ablauf, mehrzeilige Texte, Widget-Daten mit zwei Servern und Rechten).
- API-E2E: 23 (neu: Widget-Daten je Recht: Verwalter sieht Zahlen, Benutzer nur mit Einsätzen sieht Tickets/Schichten/Aktivität als `null`).
- Browser (`design-widgets.spec.ts`): Standard-Übersicht mit echten Zahlen → Editor: Text- und Link-Widget (ungültige Adresse wird nicht übernommen), Ziehen mit der Maus, Tastatur, Größe 2x1, Duplizieren, Entfernen, Standard-Widget löschen, Speichern → Übersicht zeigt Überschrift/Fett/Kursiv/Liste/Link, kein ausgeführtes HTML, Button mit `target`/`rel`, entferntes Widget fehlt. 7 Browser-Tests, 3 Läufe hintereinander grün.

## Grenzen / nicht in dieser Phase
- Nur die **Übersicht** hat ein Widget-Layout; weitere Seiten (Page Builder) und Vorlagen folgen in Phase 41. Das Modell kennt bereits mehrere Seiten.
- **Banner-Builder** als seitenübergreifende Banner (auf jeder Seite, mit Ablauf) folgt in Phase 41; das Banner-**Widget** (mit Ablaufdatum) gibt es.
- Das Diagramm zeigt Status-Verteilungen, keine Zeitverläufe; „+12 % diese Woche“ ist ein fester Text, keine Berechnung.
- Rollen-Auswahl pro Widget blendet nur aus; **Daten** liefert der Server ohnehin nur nach Recht.
- Bilder nur per https-Adresse (Upload fehlt); „Modal öffnen“ als Button-Aktion fehlt; die Vorschau (Tab „Layout“ usw.) zeigt die Widgets nicht – dafür ist die Leinwand gedacht.
- Ziehen mit Touch ist nicht eigens geprüft (Zeiger-Ereignisse sind aktiviert, `touch-action: none`); am Handy besser die Tasten im Bereich „Größe und Position“ nutzen.
