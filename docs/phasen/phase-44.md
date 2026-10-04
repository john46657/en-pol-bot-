# Phase 44 – Lücken der Spezifikation schließen

**Stand:** abgeschlossen (2026-10-04). Nach Phase 43 wurde die Spezifikation „Vollständig anpassbares Dashboard“ Punkt für Punkt gegen den Stand geprüft (siehe Tabelle) und das Schließbare nachgezogen.

## Neu in dieser Phase
- **Eigene Webfonts** (Punkt 8): „Eigene Schrift“ bei Haupt- und Überschriftschrift mit Name und https-Adresse (woff2/woff/ttf). Der Name darf nur Buchstaben, Ziffern, Leerzeichen, `-`, `_` enthalten; die Adresse wird geprüft; `@font-face` entsteht nur, wenn eine eigene Schrift gewählt ist – ungültige Angaben ergeben die Systemschrift (nie eingeschleustes CSS). Hinweis im Editor: Der Betreiber der Schrift-Adresse sieht die IP-Adressen der Besucher.
- **Button-Aktion „Fenster mit Text öffnen“** (Punkt 24): Titel und Text (mit der einfachen Formatierung) erscheinen in einem Dialog.
- **Bild-Widget mit Overlay** (Punkt 21): Farbe und Deckkraft (0 = aus).
- **Modal-Animation** (Punkt 28): Dialoge folgen der Einstellung „Modal-Animation“.
- **Änderungsprotokoll** (Punkt 41): `GET design/history`; im Tab Themes lesbare Einträge („Theme „X“ aktiviert“, „Theme geändert: Farben: dark.primary“, „Bild hochgeladen: …“) mit Zeit und Benutzer-ID; Design-Ereignisse zählen jetzt zum Bereich „Konfigurationsänderungen“ im Audit-Log.
- **Adresse eigener Seiten frei wählbar** (Punkt 44), mit Prüfung und Ersatz bei Kollision.

## Beim Testen gefundene und behobene Fehler
1. **Schwerer Fehler aus Phase 41:** Wer im Widget-Editor ein Widget hinzufügte oder verschob, löschte im Entwurf alle **eigenen Seiten und Banner** (der Editor schrieb das Layout ohne diese Felder zurück); beim Speichern wären sie verloren gewesen. Der Test für Phase 41 hatte nie ein Widget auf einer eigenen Seite bearbeitet. Behoben; der Test deckt es jetzt ab.
2. Die Vorschau lud eine eigene Schrift nur bei Wechsel der Schriftwahl, nicht bei Änderung von Name/Adresse.

## Tests
- `@nexus/design`: 110 (neu: Modal-Aktion, Overlay, eigene Schrift inkl. Einschleusungsversuche, Protokoll); API-E2E: 27; Audit: 23.
- Browser (`design-extras.spec.ts`): Webfont (Vorschau und Dashboard), Seite mit eigener Adresse (`Regeln!` → `regeln`), Modal-Button mit Liste und Esc, hochgeladenes Bild mit Overlay 50 %, Protokoll. 11 Browser-Tests, 3 Läufe hintereinander grün. Mehrere ältere Tests wurden von der Reihenfolge unabhängig gemacht.

## Abgleich mit der Spezifikation (53 Punkte)
| Punkte | Stand |
|---|---|
| 1–2 Struktur, 13 Tabs | ✅ (Karten und Buttons teilen sich einen Tab, Widgets/Seiten einen Tab) |
| 3 Name, Logo | ✅ inkl. Upload |
| 4–5 Hintergrund global/pro Seite | ✅ Farbe, Verlauf, Bild, GIF, Overlay, Unschärfe, Helligkeit |
| 6–7 Farben, Picker | ✅ 15 Farben, HEX/RGB/HSL/Alpha, Kontrast-Hinweis |
| 8 Typografie | ✅ inkl. eigener Webfont (Buchstabenabstand nur für den Fließtext) |
| 9–11 Sidebar, Drag & Drop, Gruppen | ✅ |
| 12 Header | ✅ |
| 13–14 Suche, Benachrichtigungen | ✅ (Suche über „Benutzer“ ohne Personalakte nicht) |
| 15–18 Karten, Größen, Raster, Widget-Builder | ✅ |
| 19–22 Bibliothek, Text, Bild, Link | ✅ |
| 23 Banner | ✅ |
| 24 Buttons | ✅ alle sechs Aktionen inkl. Fenster |
| 25–27 Rundung, Glas, Schatten | ✅ global und je Element |
| 28 Animationen | ✅ |
| 29 Dark/Light | ✅ unabhängig konfigurierbar; **Modus „Custom“ nicht umgesetzt** |
| 30–31 Mobil, Vorschau | ✅ 4 Geräte |
| 32–34 Reset, Warnung, Autosave | ✅ |
| 35–39 Themes, Duplizieren, Aktivieren, Import/Export | ✅ |
| 40–41 Versionen, Protokoll | ✅ (Benutzer als ID, nicht als Name) |
| 42–43 Rechte | ✅ `design.view/edit`; Rollen je Menüpunkt, Widget, Seite, Banner **serverseitig** |
| 44–46 Eigene Seiten, Page Builder, Vorlagen | ✅ |
| 47 Fallback | ✅ |
| 48 Leistung | ✅ Bilder optimiert/lazy, Daten nur bei Bedarf, Cache |
| 49 Sicherheit | ✅ Uploads, Import, URLs, Rechte serverseitig |
| 50 Datenmodell | ➖ Abweichung: Konfiguration liegt als eine JSON-Konfiguration je Theme (statt getrennter Spalten); Einstellungen, Themes, Versionen sind getrennte Tabellen |
| 51 Servertrennung | ✅ |
| 52 Vorrang | ✅ Standard ← Theme ← Server-Überschreibung; **Überschreibungen nur per API, ohne Oberfläche** |
| 53 Ziel | ✅ |

## Grenzen
- Eigener Webfont wird extern geladen (Datenschutz-Hinweis im Editor); ein Upload von Schriftdateien (selbst gehostet) ist nicht umgesetzt.
- Benutzer im Protokoll erscheinen als Discord-ID.
- Modus „Custom“ (Punkt 29) und die Oberfläche für serverweite Überschreibungen (Punkt 52) fehlen bewusst.
