# Phase 38 – Dashboard-Design: Anwendung und Editor

**Stand:** abgeschlossen (2026-10-04). Zweite Phase der Spezifikation „Vollständig anpassbares Dashboard“. Das Design aus Phase 37 wird jetzt im Dashboard angewendet und lässt sich in der Oberfläche „🎨 Design & Erscheinungsbild“ bearbeiten.

## Umfang
- **Anwendung** (`useDesign`, `GuildLayout`): Die wirksame Konfiguration (`/design/effective`, 60 s gecacht) wird in CSS-Variablen übersetzt (`designVars`, im Paket `@nexus/design/client`, ohne Datenbank-Abhängigkeit). Farben, Typografie, Rundungen (global, je Karte, je Button), Schatten, Glas-Effekt, Sidebar (Breite, Position links/rechts, Stil, Rahmen, Rundung), Header (Höhe, Deckkraft, Unschärfe, Rahmen, Logo/Name/Profil ein/aus), Animationen (global aus, Geschwindigkeit, je Bereich), mobile Navigation (Drawer, Leiste unten, ausgeblendet). Bis zum Laden und bei Fehlern gilt der Standard – nie ein leerer Bildschirm.
- **Hintergründe**: einfarbig, Farbverlauf (Winkel), Bild/GIF (https-URL, Position, Größe, Deckkraft, Unschärfe, Helligkeit), Overlay. Global und je Seite; Seiten ohne eigenen Hintergrund erben den globalen.
- **Modus**: Eigene Wahl (Umschalter) > Vorgabe des Servers (Dark/Light/System) > Systemeinstellung (gemeinsamer Speicher in `theme.ts`). Dark und Light haben je eigene 15 Farben.
- **Schriften** (Inter, Roboto, Poppins, Open Sans) kommen vom eigenen Server (`@fontsource`) und werden nur bei Auswahl nachgeladen.
- **Editor** mit Tabs Allgemein, Hintergrund, Farben, Typografie, Navigation, Karten & Buttons, Layout, Animationen, Responsive, Modi, Themes. Jede Einstellung hat „↩ Zurücksetzen“ auf den Standard. Color Picker mit HEX, RGB, HSL und Alpha (ungültige Zwischeneingaben werden markiert, aber nicht übernommen); Lesbarkeits-Hinweis (Kontrast nach WCAG).
- **Live-Vorschau** für Desktop, Laptop, Tablet, Mobil und Dark/Light; die Vorschau nutzt dieselben Variablen, verändert aber nur ihren eigenen Rahmen.
- **Speichern**: Leiste „Ungespeicherte Änderungen“ (Verwerfen/Speichern), Warnung beim Schließen und beim Anklicken von Links, optionales Autosave (1,5 s nach der letzten Änderung, jede Speicherung bleibt eine Version).
- **Themes-Tab**: Neues Theme (Dialog), Duplizieren, Aktivieren (mit Bestätigung), Löschen (mit Bestätigung), Export, Import mit Vorschau (Name, Autor, Version, bereinigte Werte), Versionsverlauf mit Wiederherstellen, gesamtes Design zurücksetzen (mit Bestätigung). Vorlagen sind schreibgeschützt; „Eigene Kopie zum Bearbeiten anlegen“ dupliziert und aktiviert.
- Navigationspunkt „Design & Erscheinungsbild“ nur mit `design.view`; serverseitig prüft die API ohnehin.

## Beim Testen gefundene und behobene Fehler
1. **Erster Aufruf parallel** (Dashboard fragt `design` und `effective` gleichzeitig): beide legten die Vorlagen an, eine Anfrage scheiterte mit 500. Jetzt Datenbanksperre pro Server (`pg_advisory_xact_lock`) + Test mit 6 parallelen Aufrufen.
2. **Ratenbegrenzung**: Die strenge Anmelde-Regel (30/min je IP) zählte auch `/auth/me…`, das jede Seite abfragt – mehrfaches Neuladen führte zu „Zu viele Anfragen“. `/auth/me…` fällt jetzt unter die allgemeine Regel (+ Test).
3. **Entwurf des alten Themes** wurde nach „Eigene Kopie anlegen“ kurzzeitig im neuen Theme bearbeitbar und danach überschrieben. Der Entwurf ist jetzt fest an Theme und Version gebunden.
4. **Farbfelder** zeigten nach „Zurücksetzen“ kurz den alten Text (lokaler Zustand hinterher); die Anzeige wird jetzt aus dem Entwurf abgeleitet.
5. Auswahl- und Textfelder des Editors hatten keinen zugänglichen Namen (Screenreader) – ergänzt.

## Tests
- `@nexus/design`: 28 (neu: Farbumrechnung, CSS-Variablen, Hintergründe, parallele Erstaufrufe). API: 176 (+1, Ratenbegrenzung).
- Browser (`pnpm e2e`, 5 Tests, eigener Vite-Port 3101, eigene Datenbank und Redis-Datenbank 15, vor jedem Lauf frisch): Anmeldung, alle Menüseiten ohne Fehler, mobile Ansicht, Design-API, Design-Editor (Kopie anlegen, Farbe per HEX ändern, ungültige Eingabe, Zurücksetzen, Geräte-Umschaltung, Verwerfen, Speichern, wirksam im echten Dashboard, Versionsverlauf). Der Editor-Test lief 20-mal hintereinander fehlerfrei.

## Grenzen / nicht in dieser Phase
- Sidebar-Einträge einzeln bearbeiten, Drag & Drop, Gruppen, Rollen je Eintrag, Badges, Header-Suche und Benachrichtigungen: Phase 39 (die Schalter `showSearch`/`showNotifications` im Modell haben noch keine Wirkung und sind nicht im Editor).
- Widgets, Grid, Banner/Button-Builder, eigene Seiten, Seitenvorlagen: Phasen 40–41. Die Tabs „Widgets“ fehlen deshalb noch.
- Bilder/Logo nur per https-URL; ein Upload-Endpunkt mit Prüfung und Optimierung fehlt.
- Der Editor bearbeitet das **Theme**; die serverweiten Überschreibungen (Phase 37, API) haben noch keine Oberfläche.
- Modal-Animation wirkt erst, wenn es Dialoge im Dashboard-Stil gibt (nur der neue Dialog nutzt sie nicht).
- Keine automatische Prüfung der Vorschau auf Pixel-Ebene; visuell einmal im Browser kontrolliert (Screenshot).
