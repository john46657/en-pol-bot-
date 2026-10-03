# Phase 6 – Zentrales Permission-System

**Stand:** abgeschlossen (2026-10-04) – Engine, API, Bot, Dashboard, Migration, Tests und HTTP-Praxistest. **Der Bot-Teil ist nur mit Attrappen getestet** (kein Discord-Token).

## Modell
- **Katalog** (`@nexus/types`, `PERMISSION_CATALOG`): einzige Quelle für Schlüssel und Beschriftungen. Module: `applications` (18 Schlüssel), `training`, `promotions`, `shifts`, `sek` – u. a. `training.view/manage`, `promotions.create/approve`, `shifts.start/pause/end`, `sek.view/manage`.
- **Regel:** `<modul>.manage` schließt alle Schlüssel **desselben** Moduls ein. (Vorher implizierte `applications.manage` fest *alles* – eine Superuser-Lücke, sobald weitere Module existieren.)
- **Speicherung:** nur noch Tabelle `permissions` (Rolle ↔ Schlüssel, n:m). `guilds.rolePermissions` (JSON) entfällt.
- **Engine** (`@nexus/permissions`): `engine.ts` (reine Logik: `hasPermission`, `effectivePermissions` …) und `service.ts` (`permissions.can/canAll/canAny/forRoles` gegen die Datenbank). API-Guard **und** Bot verwenden dieselbe Prüfung. Server-Besitzer/Administratoren/„Server verwalten“ umgehen die Zuordnung (`bypass`); gelöschte Rollen gewähren nichts; unbekannte Schlüssel in der DB werden ignoriert (fail closed).

## Migration `20261004010000_central_permissions`
Übernimmt vorhandene JSON-Zuordnungen in `permissions` (fehlende Rollen werden als „Unbekannte Rolle“, gelöscht markiert, angelegt; der Bot-Sync reaktiviert sie, falls es sie gibt) und entfernt die Spalte. Auf der Dev-DB mit echten Altdaten angewendet und geprüft; auf leeren Datenbanken läuft sie in den Integrationstests.

## API
- `PermissionGuard` nutzt die Engine; `@RequireGuildAdmin()` bleibt Verwalter-only.
- `GET /guilds/:id/permissions` liefert den **Katalog nach Modulen**, Rollen mit Zuordnung und verwaiste Zuordnungen.
- `GET /auth/me/guilds/:id/permissions`: effektive Rechte des Users (nur für die Oberfläche; durchgesetzt wird serverseitig).

## Bot
`discord/permissions.ts` nutzt die Engine. **Neu abgesichert:** Review-Verlauf (`applications.submissions.view`), Notiz anlegen und Notiz-Modal (`applications.notes.create`), Accept/Deny-Modals und -Entscheidungen (Review-Rechte) werden jetzt serverseitig geprüft – vorher konnte jeder, der einen Review-Button erreichte, Verlauf und Notizen nutzen. Die Prüfung im Review-Service wurde in die Handler verlegt (einheitlich mit Discord-Admin-Bypass).

## Dashboard
Berechtigungen nach Modulen gruppiert mit lesbaren Namen; durch „Alles im Bereich“ enthaltene Rechte sind markiert; Menü blendet Einträge ohne Recht aus (Komfort, Server verweigert ohnehin).

## Tests
- `packages/permissions` (11): Katalog, Auflösung, Modul-`manage`, keine modulübergreifende Vererbung, all/any, Bypass ohne DB, fail closed.
- `packages/database` (15): Rollen-Permissions setzen/entfernen/Parallelität, gelöschte Rollen, Guild-Isolation, Audit-Paginierung.
- `apps/api` (30), `apps/bot` (23, inkl. Review-/Admin-/Besitzer-Fälle und `requireMemberPermission`).
- HTTP-Matrix gegen laufende API + DB: keine Rolle 403/403/403; `applications.view` 200/403/403; `applications.manage` 200/200/403; `training.manage`+`shifts.start` 403/403/403 (Modul-`manage` gilt nur im eigenen Bereich); Owner 200 auf allem; ungültiger Schlüssel 400.

## Grenzen
- Für die späteren Module existieren erst die Schlüssel; durchgesetzt werden sie, sobald die Endpunkte entstehen (jede neue Route muss `@RequirePermissions` setzen).
- Pro Prüfung eine Datenbankabfrage (Cache folgt in Phase 34).
- Kein Verweigern-Recht (nur Gewähren) und keine benutzerbezogenen Ausnahmen – bewusst einfach gehalten.

> Nachtrag 2026-10-04: Der Bereich `dispatch` (Leitstelle) wurde auf Entscheidung des Nutzers aus dem Katalog entfernt.
