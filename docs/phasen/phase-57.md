# Phase 57 – Spezifikation „Rollen- & Rechtesystem“: Abgleich und Ticket-Einzelrechte

## Abgleich (Stand 2026-10-05)
| Spec-Punkt | Stand |
|---|---|
| 1 Rollenverwaltung | **Neu (57c):** eigene Dashboard-Rollen (`NexusRole`): anlegen, bearbeiten, duplizieren, löschen, umbenennen, Farbe, Beschreibung, Priorität, aktiv/inaktiv, Rechte-Matrix mit Kategorie-Filter, Mitglieder hinzufügen/entfernen (mehrere, optional befristet), Kopplung an eine Discord-Rolle (Träger erhalten die Rolle automatisch). Seite „Rollen & Rechte“, API `guilds/:id/nexus-roles`. Discord-Rollen werden weiter über Profile/Matrix belegt. |
| 2 Hierarchie | Rangfolge der Discord-Rollen wird erzwungen (Phase 56). Für Dashboard-Rollen gilt die Priorität: nur Rollen unterhalb der eigenen höchsten Priorität ändern/vergeben, keine Priorität auf oder über der eigenen, sich selbst keine Rolle geben, nur Rechte vergeben, die man besitzt. Discord-Verwalter/Besitzer sind von der Prioritätsregel ausgenommen. |
| 3 Besitzer | Besitzer ist bypass und nicht einschränkbar (Phase 56). |
| 4/12 Einzelrechte | Katalog `modul.aktion`, Spec-Namen teils als Alias. **Neu:** Ticket-Einzelrechte (unten). **Offen:** Moderation, Logs, Embeds, Channels, Nachrichten, Commands, Team-Chance (Module existieren nicht bzw. ohne Rechte). |
| 5 Modulrechte | Ticket-Einzelrechte jetzt trennbar; Supporter-Beispiel (claim/close/members/transcript) abbildbar. |
| 6 Ticket-Kategorien mit eigenen Rollen | Bereits vorhanden (`staffRoleIds` je Kategorie). **Neu (57d):** `tickets.reopen`, `tickets.delete`, `tickets.transcript.delete` (nur ausdrücklich oder über `tickets.manage`, nie aus `tickets.handle`); Dashboard-Buttons und API (`POST :id/reopen`, `DELETE :id`, `DELETE :id/transcript`). Wieder öffnen nur solange der Kanal noch existiert (Standard: 10 Min. nach dem Schließen); Löschen nur geschlossener Tickets, Audit hält Nummer/Betreff/Ersteller fest. Im Bot gibt es dafür (noch) keinen Befehl. |
| 7 Bewerbungsrechte | Feingranular vorhanden (`applications.submissions.*`, Formulare, Einstellungen). |
| 8/9 Funk, Büro | Funk hat Rechte. **Neu:** `office.view`/`office.manage` (API und `/buero`; bisherige Rechte `applications.view`/`personnel.view` gelten weiter als Sammelrechte). Büros anlegen/Channels erstellen gibt es nicht – nur den Warteraum. |
| 11 Dashboard-Rechte | **Neu:** `dashboard.view` (Zugang ohne Schreibrechte; Dashboard-Zugang gilt für jede Berechtigung). Rechte je Seite (`dashboard.roles` …) fehlen. |
| 13 Matrix | Vorhanden (PermissionMatrix). |
| 14/15 Benutzerrechte, temporär | Vorhanden (Phase 56), Ablauf wirkt sofort bei der Auflösung. |
| 16 Audit | Rechte-Änderungen werden protokolliert. |
| 17 Sicherheitsregeln | Phase 56; Prüfung läuft in API und Bot über dieselbe Engine. |

## Neu in Phase 57
- Rechte `tickets.claim`, `tickets.priority.edit`, `tickets.members.manage`, `tickets.close`, `tickets.transcript.view`, `tickets.categories.manage`, `tickets.settings.manage`.
- **Sammelrechte** (`PERMISSION_IMPLIED_BY`): `tickets.handle` schließt claim/priority/members/close ein, `tickets.view` und `tickets.handle` das Transkript. Bestehende Zuordnungen bleiben gültig; eine Sperre auf das Einzelrecht schlägt das Sammelrecht.
- Durchgesetzt in API (Controller), Bot (`actorOf`) und Ticket-Dienst (`isStaff(t, actor, recht)`).
- Tests: Engine, Grants, Ticket-Dienst.

- **Sicherheitskorrektur Bot:** `permissionService.can` prüfte nur exakte Schlüssel direkt an der Rolle und ignorierte Profile, Sperren, Benutzerausnahmen, Ablauf und `.manage`. Sie nutzt jetzt dieselbe Engine wie die API (Spec 17). Betrifft u. a. /gefahr, /sperre, /fahrzeug, /funk, /einsatz, /sek, /bericht.

## Dashboard-Rollen (57c)
- Tabellen `nexus_roles`, `nexus_role_members` (Migration `20261005050000_nexus_roles`). Rechte (`entries`) fließen in `loadGrants` ein – damit gelten sie in API **und** Bot. Abgelaufene Mitgliedschaften und deaktivierte Rollen zählen nicht.
- Audit: `permissions.nexusrole.create|update|delete|member.add|member.remove` mit vorher/nachher.
- Tests: `packages/database/test/nexus-roles.test.ts`, `apps/api/test/rights.test.ts`.

## Grenzen
- Die Rechte-Matrix zeigt neue Rechte automatisch (Katalog), im Browser nicht geprüft.
- Kategorie-spezifische Rechte laufen weiter über Bearbeiter-Rollen je Kategorie.
- Dashboard-Rollen: Mitglieder-Zuordnung in der Übersicht „Benutzer“ (Rechte-Erklärung „Warum?“) zeigt die Quelle als Rolle, nicht als Dashboard-Rolle; Discord-Rollen werden nicht automatisch angelegt/gespiegelt; Seite im Browser nicht geklickt.
- Die Rechteübersicht je Discord-Rolle (`loadGrantIndex`) kennt Dashboard-Rollen nicht.
