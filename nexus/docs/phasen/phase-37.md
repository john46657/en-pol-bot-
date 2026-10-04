# Phase 37 – Dashboard-Design: Datenmodell, Themes, API

**Stand:** abgeschlossen (2026-10-04). Erste Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 35–41, 47, 49–52 und das Fundament für alles Weitere). Alles Optische soll aus gespeicherter Konfiguration kommen – diese Phase liefert die Speicherung, Prüfung und Verwaltung; die Anwendung im Dashboard folgt in Phase 38.

## Umfang
- **Paket `@nexus/design`**: Konfigurationsmodell (Allgemein, Modus, 15 Farben je Dark/Light, Typografie, Hintergründe global + pro Seite, Rundung, Glas, Schatten, Sidebar, Header, Karten, Buttons, Animationen, Mobile), Standardwerte, Normalisierung, Auflösung, Themes-Service.
- **Datenbank**: `dashboard_settings` (aktives Theme, Server-Überschreibungen, zuletzt fehlerfreie Konfiguration, Autosave), `dashboard_themes`, `dashboard_theme_versions` – alle über die Guild-ID getrennt (Migration `dashboard_design`).
- **Rechte**: `design.view`, `design.edit` (in Serverleitung bzw. Polizeileitung-Vorlage; Rollenzuordnung wie üblich im Dashboard unter „Berechtigungen“).
- **API** `guilds/:guildId/design`: `effective` (jeder mit Dashboard-Zugang), Übersicht, Themes anlegen/ändern/löschen/duplizieren/aktivieren, Versionen + Wiederherstellen, Überschreibungen, Zurücksetzen (einzelner Wert oder alles mit `confirm`), Autosave-Schalter, Export, Import-Vorschau, Import.

## Verhalten
- **Vorrang** (Punkt 52): Server-Überschreibung > aktives Theme > Standardwert; einzelne Werte lassen sich per Pfad zurücksetzen (`colors.dark.primary`).
- **Fallback** (Punkt 47): `getEffective` wirft nie wegen kaputter Daten – ungültiges Theme → zuletzt fehlerfreie Konfiguration → Standard. Einzelne ungültige Werte werden beim Lesen auf den Standard gesetzt.
- **Themes**: fünf Vorlagen (Standard, Midnight, Purple, Blue, Red) werden beim ersten Aufruf je Server angelegt, sind schreibgeschützt und nicht löschbar, aber duplizierbar („Purple Copy“, „Purple Copy 2“). Nur ein Theme ist aktiv, das bisherige bleibt erhalten; das aktive Theme ist nicht löschbar. Höchstens 30 Themes, Namen je Server eindeutig.
- **Versionen**: jede echte Änderung erzeugt eine Version mit Zusammenfassung („Farben: dark.primary“); keine Änderung → keine Version; Wiederherstellen legt eine neue Version an; die letzten 100 bleiben.
- **Audit-Log**: `design.theme.created/updated/activated/deleted`, `design.overrides.updated`, `design.reset` mit Zusammenfassung.
- **Sicherheit**: Rechte serverseitig; Servertrennung (jede Theme-Abfrage filtert nach Guild-ID – ein Theme eines anderen Servers ist „nicht gefunden“); URLs nur `https` oder lokale `/uploads/…` (kein `javascript:`/`data:`/`//`/`..`/Zugangsdaten); eigener Schatten nur als Zahlen+Farbe (keine CSS-Injektion); unbekannte Schlüssel werden verworfen; Importdatei ≤ 200 kB, Format/Version geprüft, ungültige Werte werden bereinigt und in der Vorschau gemeldet.
- **Export**: nur Name, Beschreibung, Version, Design – keine Server-, Benutzer- oder Theme-IDs, keine Tokens.

## Tests
- `@nexus/design`: 21 (Normalisierung, URLs, Vorrang, Servertrennung, Vorlagen, Versionen, Audit, Fallback, Export/Import).
- API-E2E: 5 neue (Rechte ansehen/bearbeiten, Fehlercodes, Reset-Bestätigung, Export, Audit).
- Browser-/API-Praxistest `pnpm e2e` (`e2e/design-api.spec.ts`): echte gebaute API + Fake-Discord + Besitzer-Session: Theme anlegen → ändern → ungültige URL abgelehnt (400) → aktivieren → effective → exportieren → zurücksetzen; ohne Anmeldung 401.

## Grenzen / nicht in dieser Phase
- Das Dashboard **wendet das Design noch nicht an** und hat noch keine Oberfläche („Design & Erscheinungsbild“) – Phase 38.
- Navigation (Sidebar-Einträge/Gruppen, Rollen je Eintrag), Widgets/Grid, eigene Seiten, Banner/Button-Builder: Phasen 39–41. Das Modell ist dafür erweiterbar (`normalizeConfig`).
- Uploads (Logo, Hintergrundbild) und deren Prüfung/Optimierung (Punkt 49/48): bisher nur URL-Validierung; Upload-Pfad `/uploads/…` ist vorbereitet, aber es gibt noch keinen Upload-Endpunkt.
- Eigene Webfonts (Punkt 8) sind nicht enthalten; erlaubt sind System, Inter, Roboto, Poppins, Open Sans.
- Seitenspezifische/rollenabhängige Sichtbarkeit von Widgets (Punkt 43) folgt mit den Widgets.
