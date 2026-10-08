# Studio

Braucht `studio.view` / `studio.manage` (oder `settings.manage`). Alle Werte werden über `PUT /api/v1/admin/settings/:key` gespeichert, je Schlüssel streng per Zod geprüft und auditiert (`studio.config.changed` mit vorher/nachher).

| Schlüssel | Wirkung |
|---|---|
| `studio.customFields` | Eigene Felder für **Personen** und **Fahrzeuge**: `key`, `label`, `type` (Text, Zahl, Auswahl, Datum), `required`, `options`. Schlüssel sind je Art eindeutig. |
| `theme.accent` | Akzentfarbe: eine der 16 Vorgaben (blue, green, amber, red, cyan, violet, orange, pink, indigo, teal, lime, sky, rose, emerald, gold, slate) oder eine eigene Farbe `#rrggbb`. Hell/Dunkel wählt jeder unter *Persönlich*. |
| `theme.customAccents` | Eigene Akzentfarben mit Namen (Studio → Design → „Eigene Farbe hinzufügen“), bis 24. |
| `application.form` | Felder des öffentlichen Bewerbungsformulars (`/apply`). |
| `dashboard.defaultLayout` | Standard-Anordnung der Kacheln (jeder kann sie anpassen; Zurücksetzen stellt den Standard wieder her). |

Werte eigener Felder stehen in `Person.custom` / `Vehicle.custom` (JSON). Der Server prüft sie bei jedem Anlegen und Ändern: unbekannte Schlüssel werden abgewiesen, Typen und Pflichtfelder durchgesetzt, Teil-Änderungen behalten vorhandene Werte. Entfernt man eine Definition, wird der Wert in der Oberfläche ausgeblendet, gespeicherte Daten bleiben erhalten.
`GET /api/v1/studio/config` (jeder angemeldete Benutzer) liefert Organisationsnamen, Akzentfarbe und Felddefinitionen für die Anzeige.

## Workflows (Automationen)

Studio → **Workflows** (`studio.view` ansehen, `studio.manage` ändern). Ein Workflow ist „**Wenn** Ereignis **und** Bedingungen → **dann** Aktionen“:

- **Ereignis:** jede Aktion aus dem Audit-Protokoll, z. B. `incident.create`, `cad.incident.create`, `report.submitted`, `wanted.create`, `leave.request`, `application.submit`; mit `*` am Ende für Gruppen (`report.*`). Der Editor schlägt die üblichen vor.
- **Bedingungen** (alle müssen passen) prüfen Felder des neuen Stands: ist / ist nicht / enthält / ist eins von / gesetzt / leer – z. B. `priority` ist eins von `HIGH, CRITICAL`.
- **Aktionen** (bis 5): Benachrichtigung an alle mit einem Recht, Benachrichtigung an eine Dashboard-Rolle, Discord-Meldung in bis zu 5 Kanäle (optional mit Rollen-Ping, Farbe). Titel/Text mit Platzhaltern `{{title}}`, `{{priority}}`, `{{location}}` …, `{{actor}}`, `{{action}}`.

Technik: Der Server liest alle 5 s die neuen (bestätigten) Audit-Einträge (`apps/api/src/workflows`). Jeder Workflow läuft je Ereignis genau einmal (`WorkflowRun`, mit Ergebnis/Fehler – „Läufe“ im Editor), höchstens 30-mal pro Minute. Neu angelegte oder wieder eingeschaltete Workflows wirken nur auf neue Ereignisse. Workflow-Aktionen erzeugen keine Audit-Ereignisse (keine Schleifen); Änderungen an Workflows werden auditiert (`studio.workflow.*`). Abschalten des Abrufs: `WORKFLOWS=false`. Benachrichtigungsart „⚙️ Workflows“ kann jeder für sich ausblenden.

## Nicht verfügbar
- **Einstellbare Status.** Die Statusabläufe (Leitstelle, Berichte, Beschwerden, …) sind bewusst fest in `packages/shared/src/statuses.ts`: Rechte, Audit und Tests hängen daran. Workflows reagieren darauf, ändern sie aber nicht.
- **Einstellbare Prioritäten** (fest LOW…CRITICAL) und eigene Felder für weitere Arten.
