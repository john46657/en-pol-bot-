# Phase 57 – Spezifikation „Rollen- & Rechtesystem“: Abgleich und Ticket-Einzelrechte

## Abgleich (Stand 2026-10-05)
| Spec-Punkt | Stand |
|---|---|
| 1 Rollenverwaltung | Discord-Rollen werden synchronisiert und über Profile/Matrix mit Rechten belegt. **Offen:** eigene, nicht an Discord gebundene Rollen (anlegen, duplizieren, Beschreibung, Aktiv-Schalter, Mitglieder zuweisen). Profile haben Farbe, Priorität, Aktiv, Duplizieren (Phase 56). |
| 2 Hierarchie | Rangfolge der Discord-Rollen wird erzwungen (Phase 56). Freie Priorität nur bei Profilen. |
| 3 Besitzer | Besitzer ist bypass und nicht einschränkbar (Phase 56). |
| 4/12 Einzelrechte | Katalog `modul.aktion`, Spec-Namen teils als Alias. **Neu:** Ticket-Einzelrechte (unten). **Offen:** Moderation, Logs, Embeds, Channels, Nachrichten, Commands, Team-Chance (Module existieren nicht bzw. ohne Rechte). |
| 5 Modulrechte | Ticket-Einzelrechte jetzt trennbar; Supporter-Beispiel (claim/close/members/transcript) abbildbar. |
| 6 Ticket-Kategorien mit eigenen Rollen | Bereits vorhanden (`staffRoleIds` je Kategorie). Ticket löschen/wieder öffnen/Transcript löschen: nicht umgesetzt. |
| 7 Bewerbungsrechte | Feingranular vorhanden (`applications.submissions.*`, Formulare, Einstellungen). |
| 8/9 Funk, Büro | Funk hat Rechte; Büro-API hängt an `applications.view` – **offen:** eigene Büro-Rechte. |
| 11 Dashboard-Rechte | `dashboard.manage` existiert; **offen:** `dashboard.view`-Nur-Lesen-Modus. |
| 13 Matrix | Vorhanden (PermissionMatrix). |
| 14/15 Benutzerrechte, temporär | Vorhanden (Phase 56), Ablauf wirkt sofort bei der Auflösung. |
| 16 Audit | Rechte-Änderungen werden protokolliert. |
| 17 Sicherheitsregeln | Phase 56; Prüfung läuft in API und Bot über dieselbe Engine. |

## Neu in Phase 57
- Rechte `tickets.claim`, `tickets.priority.edit`, `tickets.members.manage`, `tickets.close`, `tickets.transcript.view`, `tickets.categories.manage`, `tickets.settings.manage`.
- **Sammelrechte** (`PERMISSION_IMPLIED_BY`): `tickets.handle` schließt claim/priority/members/close ein, `tickets.view` und `tickets.handle` das Transkript. Bestehende Zuordnungen bleiben gültig; eine Sperre auf das Einzelrecht schlägt das Sammelrecht.
- Durchgesetzt in API (Controller), Bot (`actorOf`) und Ticket-Dienst (`isStaff(t, actor, recht)`).
- Tests: Engine, Grants, Ticket-Dienst.

## Grenzen
- Die Rechte-Matrix zeigt neue Rechte automatisch (Katalog), im Browser nicht geprüft.
- Kategorie-spezifische Rechte laufen weiter über Bearbeiter-Rollen je Kategorie.
