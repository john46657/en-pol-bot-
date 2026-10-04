# Phase 6b – Rollen-, Profil- und Nutzerflüsse-Erweiterung des Permission-Systems

**Stand:** abgeschlossen (2026-10-04) – Datenmodell, Engine, API, Bot, Dashboard, Rollenänderungs-Protokoll, Tests, HTTP- und Browser-Praxistest. **Nicht gegen echtes Discord getestet.** Grundlage: ergänzende Spezifikation 61–85 ([Abgleich](spec-rollen-nutzerfluesse.md)). Die **Leitstelle ist nicht Teil des Systems** (entfernt).

## Umsetzung gegenüber der Spezifikation
| Abschnitt | Umsetzung |
| --- | --- |
| 61.1 Rollen als Vorlage, nicht fest im Code; beliebige eigene Rollen | `PERMISSION_TEMPLATES` (Daten in `@nexus/types`): Serverleitung, Polizeileitung, Stellv. Polizeileitung, Personalabteilung, Ausbildungsleitung, Ausbilder, Teamleitung, Stellv. Teamleitung, SEK-Leitung, SEK-Mitglied, Beamter, Polizeianwärter. Eine Vorlage erzeugt ein **frei änderbares Profil** (`POST …/permission-profiles/from-template`); Rollennamen sind nur Vorschläge – jedes Profil kann jeder Discord-Rolle zugewiesen werden |
| 61.2–61.13 Beispielrechte | Katalog auf ~110 Rechte erweitert (System, Konfiguration, Rollenzuordnung, Berechtigungen, Module, Audit, Backup, Personal, Bewerbungen inkl. zurückziehen/wieder öffnen, Beförderungen, Teams, Ausbildung, Prüfungen, Qualifikationen, Berichte, Abwesenheiten, Shifts, SEK, Eigene Daten). Spezifikationsnamen (z. B. `APPLICATION_ACCEPT`) sind **Aliase**, intern gelten `modul.aktion`-Schlüssel |
| 61.4/61.9 Stellvertretungen: gleiche Rechte, kritische einzeln gesperrt | Vorlagen mit `extends` + Sperren (`config.edit`, `permissions.edit`, `roles.edit`, `modules.manage` bzw. `promotions.*`, `personnel.archive`) |
| 61.8/74 Teamleitung nur eigenes Team | Zuordnungen mit Geltungsbereich **TEAM**; ohne Teambezug gewähren sie nichts serverweit. Die Teams selbst kommen mit den Personal-Phasen – die Engine wertet `teamId`/`teamIds` bereits aus (getestet mit synthetischen Teams) |
| 76 Rolle → Profil → Rechte → Aktionen | `Permission` (direkt je Rolle), `PermissionProfile` + `RoleProfile` (Profile), `UserPermission` (Ausnahmen je Benutzer) |
| 77 Mehrere Rollen = Vereinigung, optionale **Sperre** | Vereinigung aller Quellen; **eine passende Sperre schlägt jede Erlaubnis** (`<modul>.manage` erlaubt das ganze Modul, eine Sperre trifft nur ihren Schlüssel) |
| 78 Ebenen GLOBAL/SERVER/MODUL/TEAM/DATENSATZ/BENUTZER | GLOBAL = Discord-Besitzer/Administrator/„Server verwalten“ (`bypass`), SERVER/TEAM/RECORD = Geltungsbereich einer Zuordnung, MODUL = Schlüsselpräfix + `<modul>.manage`, BENUTZER = Benutzer-Ausnahmen |
| 79 Eigene Profile | Dashboard „Profile“: anlegen, aus Vorlage, bearbeiten (je Recht „–/Erlaubt/Gesperrt“, optional „nur eigenes Team“), löschen, Rollen zuordnen |
| 80 Benutzer-/Rollenübersicht | Dashboard „Benutzer“: Mitglieder mit Rollen und Anzahl effektiver Rechte; Detail mit Rollen, effektiven Rechten, Ausnahmen, letzten protokollierten Aktionen. **Teams, Personalakte, Sessions** werden mit ihren Modulen/Phase 32 ergänzt (im Detail als „folgt“ ausgewiesen) |
| 81 Warum besitzt er ein Recht | „Warum?“ je Recht: `@Rolle → Profil „…“ → Recht`, „über Alles im Bereich“, „Ausnahme für diesen Benutzer“, Sperre mit Quelle, „Server-Besitzer/Administrator“ |
| 82 Berechtigungsfehler | `❌ Keine Berechtigung. Du benötigst: <Bezeichnung>. Wende dich an einen Administrator.` – nur Bezeichnungen, nie interne Schlüssel (API und Bot) |
| 75 Dashboard-Login | Guard prüft zuerst die **Mitgliedschaft** (nicht mehr auf dem Server → „nicht (mehr) Mitglied“), dann Rollen/Rechte; ohne jede Berechtigung → „kein Zugriff auf das Dashboard“; Übersicht für jeden mit mindestens einem Recht |
| 83/84 Automatische Rollenänderungen | `@nexus/automation` → `applyRoleChanges`: protokolliert vorherige/neue Rollen, Auslöser, Automation, Berechtigung, Zeitpunkt, Ergebnis; Nachher-Stand wird bei Discord **nachgelesen**; Ergebnis `success`/`partial`/`failed` mit verständlichem Grund („Bot besitzt keine ausreichende Discord-Rollenposition …“); **meldet nie Erfolg ohne Bestätigung** |
| 85 Auditierbarkeit | `AuditLog` um `result`, `permission`, `automation`, `reason` erweitert (neben Akteur, Aktion, Ressource, alt/neu, Zeit); alle Rechte-Änderungen werden mit Berechtigung und Ergebnis protokolliert |

## Behoben (Fund beim Bau)
`addGuildMemberRole`/`removeGuildMemberRole` in `@nexus/discord` **schluckten Fehler** (Entfernen ohne Statusprüfung, Hinzufügen mit Wiederholung ohne Prüfung) – eine fehlgeschlagene Rollenänderung wäre als Erfolg erschienen. Beide werfen jetzt `DiscordApiError`, der Audit-Grund steht im Header.

## Datenmodell (Migration `20261004030000_permission_profiles`)
`permissions` + `effect`, `scope`, `scopeRef`; neue Tabellen `permission_profiles`, `role_profiles`, `user_permissions`; `audit_logs` + `result`, `permission`, `automation`, `reason`. Bestehende Zuordnungen bleiben als „Erlaubt, serverweit“ erhalten.

## Tests
`packages/permissions` (36: Sperre schlägt Erlaubnis, manage-Regel, Team/Datensatz, Erklärung, Vorlagen-Integrität inkl. „keine Leitstelle“, Alias), `packages/database` (25: Profile, Isolation, Ausnahmen, gelöschte Rollen, Audit-Felder), `packages/automation` (6), `apps/api` (54), `apps/bot` (29).
HTTP-Praxistest (laufende API + DB + Fake-Discord): Vorlagen anwenden (404 bei „leitstelle“, 409 bei doppeltem Namen); Rolle→Profil; direkte Erlaubnis + Sperre (Sperre gewinnt, Meldung „Du benötigst: Formulare bearbeiten“); Mitglied ohne Rechte → Dashboard-Meldung; Nicht-Mitglied → „nicht (mehr) Mitglied“; Benutzer-Ausnahme erteilt/entzogen; Rechte-/Profil-/Benutzer-/Audit-Endpunkte nur für Verwalter; Erklärung mit Quelle und Alias; Browser: Benutzer-Detail mit „Warum?“, Berechtigungsmatrix.

## Grenzen
- **Teams, Personalakte, Sessions** existieren noch nicht; TEAM-Bereiche sind getestet, aber wirken erst mit den Modulen. Datensatz-Bereich (RECORD) ist in Engine/API/Datenbank vorhanden, im Dashboard noch nicht auswählbar.
- Ein Recht kann im Profil-Editor nur mit **einem** Eintrag je Recht gepflegt werden (API/Datenbank erlauben mehrere, z. B. Erlaubnis serverweit + Sperre für ein Team).
- „Ausbilder nur für zugewiesene Bereiche“ (61.7) ist als Team-Bereich abbildbar, die Zuweisung folgt mit dem Ausbildungsmodul.
- Die Auto-Rollenänderung (`applyRoleChanges`) ist gebaut und getestet, wird aber erst von den Flüssen (Annahme, Beförderung, Ausbildung, Teamwechsel) aufgerufen; die bestehende Rollenvergabe bei Annahme im Bot (`review-service`) nutzt noch discord.js direkt und wird in Phase 10 umgestellt.
- Pro Prüfung weiterhin eine Datenbankabfrage-Gruppe (Cache in Phase 34).
