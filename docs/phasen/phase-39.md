# Phase 39 – Sidebar-Customizer (Navigation)

**Stand:** abgeschlossen (2026-10-04). Dritte Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 9–11, 43 teilweise). Das Menü des Dashboards kommt jetzt aus der Design-Konfiguration.

## Umfang
- **Modell** (`navigation` im Theme): Gruppen (Name, Icon, sichtbar, Reihenfolge) und Einträge (Seite, Titel, Icon, sichtbar, Gruppe, Farbe, Hover-Farbe, Badge, Rollen, bei Links die Adresse). Begrenzungen: 12 Gruppen, 80 Einträge, 10 Rollen je Eintrag; Titel ≤ 40, Badge ≤ 12 Zeichen; Links nur `https`; unbekannte Schlüssel und ungültige Gruppen-Zuordnungen werden verworfen.
- **Auflösung** (`resolveNavigation`, rein funktional, 17 Tests): Reihenfolge laut Konfiguration; neue Dashboard-Seiten, die noch nicht gespeichert sind, erscheinen automatisch am Ende; ungruppierte Einträge oben, danach die Gruppen in ihrer Reihenfolge; versteckte und leere Gruppen entfallen; Einträge ohne Recht auf die Seite entfallen; Rollen-Einschränkung blendet für Mitglieder ohne die Rolle aus; **Server-Verwalter sehen immer alles**; der Eintrag „Design & Erscheinungsbild“ ist für Berechtigte **angeheftet** (kein Aussperren).
- **Dashboard**: Sidebar rendert das aufgelöste Menü mit Gruppenüberschriften, Badges, eigenen Farben (Text/Hover) und Link-Einträgen (`target=_blank`, `rel=noopener noreferrer`).
- **Editor** (Tab Navigation): Gruppen anlegen/umbenennen/ein- und ausblenden/sortieren/löschen; Einträge per **Drag & Drop** (Griff ⠿) oder Pfeiltasten verschieben; je Eintrag „Bearbeiten“ (Titel, Icon, Gruppe, Badge, Farben, Rollen-Auswahl, bei Links Adresse); eigene Links hinzufügen/löschen; „Gesamte Navigation zurücksetzen“. Die Live-Vorschau zeigt das echte Menü.
- **API**: `GET design/roles` (`design.view`; Rollen ohne @everyone, nur Name/Farbe/Rang) und `roleIds` in `auth/me/guilds/:id/permissions`.

## Sicherheit / Hinweise
- Die Rollen-Auswahl blendet **nur im Menü aus**. Wer die Adresse kennt, kommt trotzdem nur auf eine Seite, wenn er das **Recht** dafür hat – das prüft die API serverseitig bei jedem Aufruf (wie bisher).
- Link-Adressen werden serverseitig und im Editor auf `https` geprüft (kein `javascript:`).

## Tests
- `@nexus/design`: 43 (15 neu: Normalisierung, Auflösung, Gruppen, Rollen, angeheftete Einträge, Verschieben).
- API-E2E: 22 (2 neu: Rollenliste/roleIds, Speichern und Ablehnen ungültiger Links).
- Browser: `design-nav.spec.ts` – Gruppe anlegen, Eintrag umbenennen, in die Gruppe legen, Badge, Eintrag ausblenden, Link (javascript: wird abgelehnt), **Drag & Drop** und Pfeiltasten, Vorschau, Speichern, danach im echten Dashboard: Titel, Badge, Gruppenüberschrift, ausgeblendeter Eintrag fehlt, Link mit `target`/`rel`, Reihenfolge wie im Editor, „Design“ bleibt erreichbar.

## Grenzen / nicht in dieser Phase
- Ziehen über sehr lange Strecken: Die Liste scrollt im Panel, Browser scrollen beim Ziehen nur begrenzt automatisch – für weite Wege die Pfeiltasten nutzen.
- Badges sind feste Texte (keine Live-Zähler wie „3 offene Tickets“).
- Globale Suche und Benachrichtigungs-Center (Spezifikation 13/14) sind nicht umgesetzt; die Header-Schalter dafür fehlen deshalb noch im Editor.
- Eigene Seiten (Page Builder) als Menüziel: Phase 41; bis dahin sind Ziele die eingebauten Seiten und externe Links.
- Rollen-Sichtbarkeit pro **Widget** (Punkt 43) folgt mit den Widgets.
