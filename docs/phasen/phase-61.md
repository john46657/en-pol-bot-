# Phase 61 – Module und Befehle an-/abschalten

Aus der Spezifikation „Rollen- & Rechtesystem“ (Punkt 3: „Bot-Module aktivieren/deaktivieren“, „Commands konfigurieren“). Befund: Die Rechte `modules.view/manage` existierten, die Pakete `@nexus/modules` und `@nexus/integrations` waren leer – es gab keine Möglichkeit, Module abzuschalten.

## Umgesetzt
- **Paket `@nexus/modules`:** Verzeichnis der 18 Module (Bewerbungen/Team-Chance, Tickets, Moderation, Personal, Ausbildung & Qualifikationen, Beförderungen, Schichten & Streifen, Funk, Büro, Einsätze, Fahndungen, Gefahrenstatus, Fuhrpark, Strafen, Sperren, Abmeldungen, Berichte, SEK) mit ihren Slash-Befehlen, API-Pfaden und Menüpunkten; Grundbefehle (`/nexus`, `/server`, `/health`, `/diagnose`) und Grundfunktionen (Rechte, Design, Logs, Module) sind nicht abschaltbar. Zustand in `guild_settings.data.modules` (`disabled`, `disabledCommands`).
- **Bot:** abgeschaltete Module/Befehle antworten „⛔ Das Modul „…“ ist auf diesem Server deaktiviert.“ bzw. „Der Befehl /… ist … deaktiviert.“; auch das Bewerbungs-Panel und das Ticket-Panel prüfen ihr Modul.
- **API:** globaler `ModuleGuard` – Pfade eines abgeschalteten Moduls (`/guilds/:id/tickets/…` usw.) antworten mit 403 und Klartext (5 s Zwischenspeicher, nach dem Speichern sofort wirksam). `GET /guilds/:id/modules` (Dashboard-Zugang), `PUT …/modules` (`modules.manage`, Audit `config.modules.update` mit vorher/nachher; unbekannte Module/Befehle und Grundbefehle werden abgewiesen).
- **Dashboard:** Seite „Module & Befehle“ (Verwaltung); Menüpunkte abgeschalteter Module werden ausgeblendet. Gespeicherte Daten bleiben beim Abschalten erhalten.
- **Tests:** `packages/modules/test` (Eindeutigkeit, tolerantes Lesen, Befehle, Zuordnung), Bot `modules.int.test.ts` (jeder registrierte Befehl ist zugeordnet; Ablehnung; Grundbefehle), Browser `e2e/modules.spec.ts` (abschalten → Menüpunkt weg, API 403 mit Klartext; wieder an).

## Grenzen
- Slash-Befehle werden global registriert; abgeschaltete Befehle erscheinen daher weiterhin in der Discord-Befehlsliste und antworten mit dem Hinweis.
- Hintergrundjobs eines abgeschalteten Moduls (z. B. Fahndungsablauf, Ticket-Aufräumen) laufen weiter, damit keine Daten in einem Zwischenzustand hängen bleiben.
