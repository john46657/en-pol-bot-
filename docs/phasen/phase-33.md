# Phase 33 – Tests

**Stand:** abgeschlossen (2026-10-04). Neu: ein **End-to-End-Test über HTTP** (`apps/api/test/e2e.test.ts`, 13 Tests), der die echte Nest-App (alle Module, Guards, Middleware, Filter) gegen die Test-Datenbank `nexus_test` startet und den Nutzerweg des Dashboards durchläuft. `pnpm -r test` ist komplett grün (API: 92 Tests; insgesamt rund 450 in 30 Paketen/Apps).

## Abdeckung nach Plan

| Plan-Punkt | Wo getestet |
| --- | --- |
| **Unit: Permissions** | `packages/permissions` (Engine, Grants, Service – 37), `apps/api/test/permissions-admin.test.ts` |
| **Unit: Shifts / Zeitberechnung** | `packages/shifts` (`shifts`, `time`, `stats`, `units` – 38): Pausen, Korrekturen, Zeitzonen/Wochen, Überlänge |
| **Unit: Bewerbungen** | `packages/core` (Statusmaschine, Bedingungen, Validierung, Cooldown – 73), `packages/validation`, `packages/automation` |
| **Unit: Beförderungen** | `packages/promotions` (7) |
| **Unit: Ausbildungen** | `packages/training` (13), `packages/qualifications` (6) |
| **Unit: Fahndungen** | `packages/wanted` (6) |
| **Unit: Einsätze** | `packages/operations` (8), `packages/sek` (7) |
| **Integration: Datenbank** | `packages/database` (25) sowie alle Fachpakete gegen echte PostgreSQL-Testdatenbank (Constraints, Transaktionen, Race-Schutz) |
| **Integration: Discord Services** | `packages/discord` (Panels), `packages/automation` (`applyRoleChanges` inkl. Fehlerfälle 403/404/429), `apps/api/test/guild.test.ts` (Bot-Rechte, Rollenhierarchie), Rollen-Attrappe im E2E |
| **Integration: API** | `apps/api/test` (6 Dateien) + E2E |
| **Integration: Permission System** | `permissions-admin`, Autorisierungs-Sweep (`security.test.ts`), E2E „Rolle erhält Rechte → Zugriff ändert sich“ |
| **E2E** | siehe unten |

## E2E-Test (`e2e.test.ts`)

Läuft über echtes HTTP (`fetch` gegen `app.listen(0)`), echte Datenbank, echte Guards. Ersetzt sind nur **Discord-REST/OAuth** (`fetch` zu `discord.com`) und der **Rollen-Port** (`restDiscordPort`, hält Rollen im Speicher); Mitgliedschaft/Verwalter-Status kommt aus einer Attrappe des `DiscordRolesService`.

| Plan-Punkt | Test |
| --- | --- |
| Dashboard-Login | Login-Redirect mit `state`; Callback mit falschem `state` → `/login?error=state`; richtiger → `nexus_session` (HttpOnly), `/auth/me` ohne Access-Token; CSRF (Cookie-POST ohne Herkunft → 403); Bearer-Token; manipuliertes Token → 401 |
| Serverauswahl | `/auth/me/guilds` zeigt nur Server mit Rechten (`botPresent`, `canManage`), fremder Server fehlt |
| Rollenauswahl | Rollenliste von Discord; Rechte pro Rolle setzen; Mitglied ohne/mit Rolle wird 403/200; nichts darüber hinaus; Audit-Eintrag |
| Bewerbung erstellen | Anlegen mit Validierung (leer, unbekannte Felder, doppelter Slug) |
| Bewerbung abschließen | Einreichen (Datenbank), Ansehen vs. Entscheiden (403), Annehmen → `ACCEPTED`, DM, Doppelentscheidung 409, Verlauf |
| Shift starten | Start (Service), Doppelstart abgelehnt, im Dashboard sichtbar, Leitung beendet (403 ohne Recht), Statistik |
| Einsatz erstellen | Validierung, Rechte, Status ohne Einheit 409, Einheit zuweisen, `ACTIVE` → `COMPLETED`, Verlauf |
| Beförderung genehmigen | Antrag (403 ohne Recht), Genehmigung, Rang geändert, alte Rolle entzogen/neue vergeben, zweite Genehmigung abgelehnt |
| Audit | Schicht-, Einsatz-, Beförderungs-, Rollenwechsel-Einträge und Bewerbungsentscheidung sind protokolliert |

**Technik:** `apps/api/vitest.config.ts` nutzt jetzt `unplugin-swc` (Decorator-Metadaten für die Konstruktor-Injektion, die esbuild nicht erzeugt) und ein `globalSetup`, das `nexus_test` anlegt und Migrationen einspielt (wie in den Paketen). Neue Dev-Abhängigkeiten: `@nestjs/testing`, `unplugin-swc`, `@swc/core`.

## Bekannte Grenzen / ehrlich benannt
- **Kein Browser-E2E:** Das Dashboard hat weiterhin keine automatisierten UI-Tests (kein Playwright/jsdom). Die E2E-Tests prüfen exakt die API-Aufrufe, die das Dashboard macht; das Rendern, Routing und Formulare wurden **nicht** im Browser getestet. Das Dashboard wird nur gebaut (`vite build` + `tsc`).
- **Kein echtes Discord:** OAuth2, Rollenvergabe und Nachrichten laufen gegen Attrappen (kein Token/Client-Secret). Das echte Verhalten von Discord (Rate Limits, Rollenhierarchie live) ist nur durch die Fehlerfall-Tests von `applyRoleChanges` abgedeckt.
- **Bewerbung einreichen und Schicht starten** geschehen im echten System über den Bot (DM-Fluss bzw. `/schicht`); der E2E ruft dafür die Dienste/Datenbank direkt auf. Die Bot-Interaktionen selbst (Slash-Commands, Buttons, Modals) sind nur über die Panel-Rendertests und Dienst-Tests abgedeckt, nicht über eine simulierte Discord-Verbindung.
- Last-/Dauertests gehören zu Phase 34, Abhängigkeits-Audit zu Phase 35.
