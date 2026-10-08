# EN Polizei erweitern

Drei Stufen, von ohne Code bis Code.

## 1. Ohne Code (Admin → Studio / Einstellungen)
- **Eigene Felder** für Personen und Fahrzeuge, **Akzentfarbe**, **Bewerbungsformular**, Standard-**Dashboard-Anordnung**, Organisationsname, Aufbewahrung, **Workflows**.
- **Rollen, Rechte, Ausnahmen je Benutzer**: Admin → Rollen & Rechte / Benutzer.
- **Tatbestände**: Admin → Tatbestände.

## 2. Ein Recht hinzufügen
1. Die Aktion in `PERMISSION_CATALOG` in `packages/shared/src/permissions.ts` eintragen (z. B. `evidence: [..., 'destroy']`).
2. `pnpm db:seed` legt es an (mehrfach ausführbar). In der Oberfläche Rollen zuweisen (oder für neue Installationen in `STARTER_ROLES` in `apps/api/src/seed/seed-lib.ts` eintragen).
3. Endpunkte mit `@RequirePermission('evidence.destroy')` schützen; in der Oberfläche mit `can('evidence.destroy')` ausblenden.

## 3. Ein neues Modul anlegen (Beispiel: Sicherstellungen → `seizures`)
Ein bestehendes kleines Modul als Vorlage nehmen – **Fahrzeuge** (`apps/api/src/vehicles`, `apps/web/src/pages/resources.tsx`).

**Backend**
1. `apps/api/prisma/schema.prisma`: Modell anlegen (UUID-ID, `version Int @default(1)` für optimistisches Sperren, Indizes) → `pnpm db:migrate:dev --name seizures`. Soll es je Discord-Server getrennt sein: Spalte `serverId String? @db.Uuid` mit Index und das Modell in `SERVER_SCOPED_MODELS` (`apps/api/src/prisma/server-scope.ts`) eintragen.
2. `apps/api/src/seizures/`: `seizures.service.ts`, `seizures.controller.ts`, `seizures.module.ts`. Regeln für jeden Service:
   - Schreibzugriffe auf mehrere Tabellen in `this.prisma.$transaction(async (tx) => …)`;
   - `this.audit.record(actor, {…}, tx)` und `this.timeline.add(tx, {…})` aufrufen;
   - Personen mit `linkPerson(tx, personId, 'Seizure', id)` verknüpfen (ohne Dubletten);
   - Nummern mit `makeNumber('S')` erzeugen; Statuswechsel mit `nextStatus(MAP, from, to)`;
   - nie löschen – mit Begründung archivieren, stornieren oder abbrechen.
3. Controller: `@RequirePermission(...)` an **jeder** Route, Body/Query über `zodBody(schema)`, Listen über `pageQuery`.
4. Das Modul in `apps/api/src/app.module.ts` eintragen.
5. Ist der Statusablauf neu, ihn in `packages/shared/src/statuses.ts` festlegen (+ Test in `packages/shared/tests`).
6. Bei Bedarf in die globale Suche (`search/search.controller.ts`, nur hinter dem Ansehen-Recht) und in die Exporte aufnehmen.
7. Tests: Muster aus `apps/api/test/ops.test.ts` übernehmen (403 ohne Recht, Normalfall, Audit- und Zeitleisten-Einträge, Rollback). `test/security.test.ts` schlägt automatisch fehl, wenn eine Route keine ausdrückliche Berechtigungsentscheidung hat.

**Frontend**
1. `apps/web/src/pages/resources.tsx`: eine `ResourceConfig` (Spalten, Felder im Anlegen-Formular) und eine `RecordConfig` (Detailfelder + Aktionen je nach Recht) anlegen.
2. `apps/web/src/nav.ts`: Menüeintrag mit `perm`. `apps/web/src/App.tsx`: zwei Routen mit `list(...)` / `rec(...)`.
3. Bei Bedarf als MDT-Schnellaktion in `pages/Mdt.tsx` und/oder als Dashboard-Kachel in `pages/Dashboard.tsx` aufnehmen.

**Echtzeit** (optional): `this.rt.publish('room', 'event', {id})` nach dem Abschluss der Transaktion; Raum + nötiges Recht in `ROOM_PERMISSION` in `realtime/realtime.service.ts` eintragen; in der Seite mit `useRealtime` abonnieren.

## Einen Discord-Befehl hinzufügen
Siehe den letzten Abschnitt in [discord-bot.md](discord-bot.md) (neuer Eintrag in `COMMANDS`; neue API-Route nur über die ausdrückliche Bot-Freigabeliste).

## Konventionen
Rechte zuerst im Backend prüfen; keine Geheimnisse im Code; Zod für alle Eingaben; Texte in Oberfläche, Bot, Fehlermeldungen und Logs auf Deutsch; die Doku in `docs/` passend zum Code halten (sie beschreibt, was es gibt – und was nicht).

## Entfernte Integrationen
Galaxy AI (Assistent mit von Menschen bestätigten Vorschlägen) ist entfernt. Code, Tests und Doku liegen archiviert in `enrp-nexus-removed-erlc-galaxy.tar.gz` (neben dem Repository). Bestehende Datenbanken behalten ungenutzte `galaxy.*`-Rechte; sie sind harmlos. ER:LC ist inzwischen fester Teil der Leitstelle (siehe [cad.md](cad.md)).
