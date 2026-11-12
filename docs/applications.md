# Bewerbungssystem

Komplette Übersicht über das Bewerbungssystem: Polizei-Bewerbung, Bewerbungen für Einheiten/Qualifikationen
(SEK, Flugstaffel, Ausbilder …), Discord-Bot, Web-Formulare, Dashboard, Sperren, KI-Checker und Statistik.

> Kurzfassung: Bewerber klicken in Discord auf ein Panel → der Bot stellt die Fragen per Direktnachricht (oder schickt
> einen persönlichen Link zum Browser-Formular) → die Bewerbung landet mit Annehmen/Ablehnen-Buttons im Team-Kanal und im
> Dashboard → die Entscheidung geht per DM an die Person, Rollen werden automatisch vergeben/entfernt.

---

## 1. Bewerbungsarten

| Art | Datenbank-Modell | Nummer | Statusablauf | Fragen kommen aus |
|---|---|---|---|---|
| **Polizei-Bewerbung** (Polizeianwärter) | `Application` | `APP-…` | `SUBMITTED → SCREENING → INTERVIEW → PENDING_DECISION → ACCEPTED \| REJECTED \| WITHDRAWN` | Setting `application.form` (bzw. `application.form@<guildId>`) |
| **Einheit / Qualifikation** (SEK, Flugstaffel, Ausbilder, eigene) | `QualificationApplication` | `Q-…` | `OPEN → ACCEPTED \| REJECTED \| WITHDRAWN` | `units[].questions` im Setting `qualifications.config` |

Einheiten können wahlweise im **Qualifikations-Panel** (`panel: 'quali'`, Standard) oder als weitere Bewerbungsart im
**Bewerbungs-Panel** neben der Polizei-Bewerbung (`panel: 'apply'`) stehen.

Statusübergänge der Polizei-Bewerbung (`packages/shared/src/statuses.ts`, `APPLICATION_TRANSITIONS`):

| von | erlaubt nach |
|---|---|
| SUBMITTED | SCREENING, REJECTED, WITHDRAWN |
| SCREENING | INTERVIEW, REJECTED, WITHDRAWN |
| INTERVIEW | PENDING_DECISION, REJECTED, WITHDRAWN |
| PENDING_DECISION | ACCEPTED, REJECTED, WITHDRAWN |
| ACCEPTED / REJECTED / WITHDRAWN | – (Endzustand) |

Über Discord-Buttons kann aus **jedem offenen Status** direkt angenommen/abgelehnt werden.

---

## 2. Wege zur Bewerbung

### 2.1 Discord – Fragen per Direktnachricht (Standard, `mode: 'DM'`)
1. Person klickt im Panel auf **Jetzt bewerben** bzw. wählt eine Einheit im Auswahlmenü – oder nutzt `/bewerbung`.
2. Vorabprüfungen (`offer()` in `apps/bot/src/commands/qualifications.ts`):
   - läuft schon eine Bewerbung im DM-Chat?
   - Bewerbung aktiviert (`enabled`)?
   - **Rollen-Voraussetzungen**: *erforderliche* Rollen (alle/mindestens eine) und *gesperrte* Rollen
   - **Bewerbungssperre** (`GET /bot/application-bans/check`)
   - schon eine **offene Bewerbung** derselben Art auf diesem Server?
3. Bot schickt per DM die **Bestätigungsnachricht** mit *Bewerbung starten* / *Abbrechen*; im Kanal erscheint
   „Zur Bewerbung“ (Link in die DMs).
4. Nach *Starten* kommen die Fragen **einzeln**:
   - **Text** → Antwort als Nachricht (Mindest-/Höchstlänge wird geprüft)
   - **Multiple choice / Role select** → Auswahlmenü (+ *Überspringen* bei optionalen Fragen)
   - **Roblox User** → Bot sucht das Konto und zeigt es mit Profilbild, Person bestätigt mit „Ja, das bin ich“
   - Abbrechen jederzeit durch Schreiben von **abbrechen**
5. Zeitlimit (Standard 3 Stunden, je Bewerbung einstellbar). Der Fortschritt wird an das System gemeldet
   (Dashboard: „in Bearbeitung“).
6. Nach der letzten Antwort wird eingereicht; Person erhält die **Abschlussnachricht** mit Bewerbungsnummer.

> Laufende DM-Bewerbungen liegen im Speicher des Bots. Ein Neustart des Bots bricht sie ab
> (`POST /bot/application-progress/reset` räumt die Anzeige „in Bearbeitung“ auf).

### 2.2 Discord – Formular im Browser (`mode: 'WEB'`)
Statt DM-Fragen schickt der Bot einen **persönlichen, signierten Link** (`/bewerbung/<token>`, HMAC-SHA256 mit
`SESSION_SECRET`, gültig so lange wie das Zeitlimit). Die Discord-Identität steckt im Link, ein Konto ist nicht nötig.
Beim Absenden laufen exakt dieselben Prüfungen wie bei der DM-Bewerbung (`apps/api/src/qualifications/web-apply.service.ts`).

### 2.3 Öffentliche Webseite `/apply` (nur Polizei)
Ohne Login und ohne Discord. Formular = `application.form`. Begrenzung: 5 Einsendungen pro Stunde und IP.
Roblox-Name (oder eine eigene Frage „Roblox User“) ist Pflicht. Bei aktiver **Team-Chance** mit
„nur während offener Phase“ sind Bewerbungen nur im offenen Zeitraum möglich.

---

## 3. Prüfungen beim Einreichen (serverseitig)

Gilt für alle Wege, im Code `ApplicationsService.submit()` bzw. `QualificationsService.submit()`:

1. Bewerbung aktiviert? (sonst „Bewerbungen sind derzeit geschlossen“)
2. Team-Chance erlaubt Bewerbungen? (nur Polizei)
3. Jede Antwort gegen ihre Frage (`checkAnswer()` in `packages/shared/src/forms.ts`): Pflicht, Länge, gültige Auswahl,
   gültiger Roblox-Name. **Roblox User**-Fragen werden bei Roblox nachgeschlagen und als `Name (ID 123)` gespeichert.
4. **Bewerbungssperre** per Discord-ID oder Roblox-ID
5. **Keine zweite offene Bewerbung** derselben Art (je Discord-Server getrennt; Polizei zusätzlich je Roblox-ID)
6. **Wartezeit** seit der letzten Bewerbung (`cooldownMinutes`)

Danach:
- Datensatz wird angelegt, „in Bearbeitung“ entfernt
- 🔔 Benachrichtigung im Dashboard an alle mit `applications.review` (Polizei)
- Audit-Eintrag (`application.submit` / `qualifications.application.submit`)
- Discord-Nachricht in den Team-Kanal (über die Outbox, siehe 5.)
- Rollen „ausstehend“ werden vergeben, Rollen „beim Einreichen entfernen“ genommen

---

## 4. Entscheiden

### 4.1 Im Dashboard
- `/applications` – **eine Liste für alles** (Polizei + Einheiten; Einheiten nur mit `qualifications.view`), Filter nach
  Art, Status (`OPEN`/angenommen/abgelehnt/zurückgezogen), Server, Suche, Sortierung; Profilbilder; KI-Verdacht-Badge;
  aufklappbare Antworten. Darunter die Bewerbungen **„in Bearbeitung“**.
- Polizei-Workflow: Prüfschritte (`PUT /applications/:id/status`, Recht `applications.review`), Entscheidung
  (`POST /applications/:id/decide`, Recht `applications.decide`, **Begründung Pflicht**). Der Grund aus dem Web ist
  **intern** und geht nicht an den Bewerber.
- Einheiten: `POST /qualifications/applications/:id/decision` (Recht `qualifications.decide`). Über die eigene Bewerbung
  kann niemand entscheiden.
- „Ticket mit Bewerber öffnen“, Verlauf, Löschen (`applications.delete` / `qualifications.delete`).

### 4.2 In Discord (Team-Kanal)
Jede eingegangene Bewerbung hat Buttons:

| Button | Wirkung |
|---|---|
| **Annehmen** / **Ablehnen** | sofort entscheiden |
| **Annehmen mit Grund** / **Ablehnen mit Grund** | Modal; der Grund geht **per DM an die Person** |
| **Verlauf** | alle bisherigen Bewerbungen dieser Discord-ID |
| **🎫 Ticket mit Bewerber öffnen** | privater Kanal mit Bewerber, Team-Rolle und dir |

Wer klicken darf: wer im System das Recht hat (verknüpftes Konto) **oder** eine der eingestellten
**Manager-Rollen** dieser Bewerbung auf diesem Server hat. Doppelte Klicks sind abgesichert (Versionsprüfung).

### 4.3 Was bei der Entscheidung passiert
- Status, Entscheider, Zeitpunkt (und ggf. Grund) werden gespeichert, Audit-Eintrag
- **DM an die Person** mit dem eingestellten Annahme-/Ablehnungstext (Variablen siehe 6.3)
- **Rollen**: bei Annahme die Annahme-Rollen + Rolle der Einheit + in „Role select“-Fragen gewählte Rollen; bei Ablehnung
  die Ablehnungs-Rollen; jeweils „entfernen“-Rollen und „ausstehend“-Rollen werden genommen
- Die Bewerbungs-Nachricht im Team-Kanal wird aktualisiert (grün/rot, wer, Grund). Gibt es keine Original-Nachricht
  (z. B. Web-Bewerbung), wird die Bewerbung in den Kanal für **angenommene/abgelehnte** Einsendungen gepostet
- Annahme startet die **Personal-/Dienstnummern-Automatik** (`hireEvents` → `hr/service-numbers.service.ts`;
  braucht beim Entscheider `applications.auto_assign_dienstnummer`)
- SEK-Annahme mit verknüpftem Konto: Person wird SEK-Mitglied und bekommt die Rolle „SEK“ des Servers

### 4.4 Person verlässt den Server
Einstellung **Aktion beim Verlassen** (`onLeave`): `NONE` (nichts), `DENY` (automatisch ablehnen) oder
`WITHDRAW` (zurückziehen). Grund: „Hat den Discord-Server verlassen.“ Braucht den *Server Members Intent*.

---

## 5. Discord-Nachrichten (Outbox)

Die API schreibt Aufträge in die Outbox, der Bot verschickt sie (`apps/bot/src/outbox.ts`, `apps/bot/src/format.ts`):

| Typ | Inhalt |
|---|---|
| `application.submitted` / `qualification.submitted` | Bewerbung im Team-Kanal: alle Fragen + Antworten (lange Antworten werden gekürzt, mehrere Embeds), Bewerber-Infos (Discord-ID, Name, Roblox, Dauer, **KI-Checker**, Server-Beitritt, Server), Ping-Rollen, optional Team-Thread, Buttons |
| `application.decided` / `qualification.decided` | Entscheidungs-DM + Rollen vergeben/entfernen |
| `application.archived` / `qualification.archived` | entschiedene Bewerbung in den Kanal für angenommene/abgelehnte |
| `member.roles` | Rollen beim Einreichen |

Kanal für neue Bewerbungen: Polizei → `police.channelId`, sonst der **Bewerbungs-Kanal** aus *Administration → Einstellungen*;
Einheit → `unit.channelId`, sonst der **Qualifikations-Kanal**.

---

## 6. Einrichtung (Dashboard → Bewerbungen → Einrichtung)

Gespeichert im Setting `qualifications.config` (Panels, Einheiten, Polizei-Einstellungen) und `application.form`
(Fragen der Polizei-Bewerbung). Recht: `qualifications.manage`. **Jeder Discord-Server kann eigene Einstellungen haben**
(`…@<guildId>`); ohne eigene gilt die gemeinsame Grundeinstellung („Zurücksetzen“ löscht die eigenen).

### 6.1 Panels
- **Bewerbungs-Panel** (Titel, Beschreibung, Kanal) – nur Polizei → Button *Jetzt bewerben*; mit weiteren
  Bewerbungsarten → Auswahlmenü.
- **Qualifikations-Panel** (Titel, Einleitung, Kanal) – Beschreibung jeder Einheit + Auswahlmenü.
- Senden/Aktualisieren direkt aus dem Dashboard („aktualisieren“ oder „neu senden“); Änderungen an Texten/Einheiten
  ziehen ein bereits gepostetes Panel automatisch nach. Alternativ in Discord: `/bewerbungspanel`, `/qualipanel`
  (Recht „Server verwalten“).

### 6.2 Einheiten
Schlüssel (`a-z0-9_-`, 2–24), Name, Beschreibung, Rolle bei Annahme, eigener Kanal, Ping-Rollen, Panel (`quali`/`apply`),
Fragen (max. 50) und alle Einstellungen aus 6.4. Standard: Flugstaffel, SEK, Ausbilder.

### 6.3 Fragen
| Typ | Beschreibung |
|---|---|
| `TEXT` | Freitext, Pflicht ja/nein, Mindest-/Höchstlänge (bis 5000) |
| `CHOICE` | Multiple choice, eine oder mehrere Optionen (max. 25) |
| `ROLE` | Rollen-Auswahl: jede Option hat eine Discord-Rolle, die bei **Annahme** vergeben wird |
| `ROBLOX` | Roblox-Benutzer: wird bei Roblox gesucht und geprüft |

Standardfragen der Polizei-Bewerbung: Erfahrung im Polizei-RP, Aktivität, Motivation, gutes Roleplay, ER:LC-Kenntnisse,
Umgang mit Konflikten.

### 6.4 Einstellungen je Bewerbung (`appSettingsSchema`)
**Voraussetzungen:** aktiviert, Name (`{applicationName}`), Art (DM/Web), Kanäle für offene/angenommene/abgelehnte Einsendungen.

**Texte** (mit Variablen `{applicationName}`, `{user}` = Entscheider, `{applicant}`, `{number}`, `{reason}`,
`{questionCount}`, `{timeLimit}`; ein Grund wird angehängt, wenn `{reason}` fehlt):
- Nachricht bei Annahme, bei Ablehnung, Bestätigungsnachricht (Start), Abschlussnachricht

**Rollen:**
- gesperrte Rollen / erforderliche Rollen (jeweils *alle* oder *mindestens eine*)
- bei Annahme geben / entfernen, bei Ablehnung geben / entfernen
- „ausstehend“ (beim Einreichen geben, bei Entscheidung nehmen), beim Einreichen entfernen
- Ping-Rollen, **Manager-Rollen** (dürfen in Discord entscheiden)

**Sonstiges:** Team-Threads, Wartezeit, Zeitlimit (5 Min. – 7 Tage, Standard 3 Std.), Aktion beim Verlassen.

---

## 7. Bewerbungssperren (`/application-bans`)

Person per **Discord-ID und/oder Roblox-Name/-ID** sperren – für alle Bewerbungen (`*`), die Polizei-Bewerbung
(`police`) oder bestimmte Einheiten (Schlüssel). Mit Grund und optionalem Ablaufdatum; aufheben jederzeit.
Gesperrte Personen können die Bewerbung gar nicht erst starten und werden beim Absenden abgewiesen (Meldung mit Grund
und Ablaufdatum). Sperren gelten je Discord-Server; Sperren ohne Server überall.
Rechte: ansehen `applications.view`, anlegen/aufheben `applications.decide`.

---

## 8. KI-Checker

`packages/shared/src/ai-check.ts` – läuft lokal ohne externen Dienst. Bewertet die Antworten mit **gering / mittel / hoch**
und nennt Gründe: typische KI-Formulierungen, Chat-Spuren („Gerne! Hier ist …“, Platzhalter wie „[Dein Name]“),
Geviertstrich/Markdown, Tipp-Tempo (Zeichen pro Minute → hineinkopiert), gleichförmiger Aufbau. Anzeige als Badge mit
markierten Antworten im Dashboard und als Zeile in den Bewerber-Infos im Discord-Embed.
**Nur ein Hinweis, kein Beweis** – im Zweifel im Gespräch nachfragen.

---

## 9. Statistik (`/analytics?tab=bewerbungen`)

`GET /applications/analytics` – Zeitraum 7–365 Tage, verglichen mit der Vorperiode; Filter nach Bewerbungsart, Status,
Prüfer. Kennzahlen: Anzahl, Annahmequote, ⌀ Bearbeitungszeit, offene, Abschlussquote; Verlauf je Tag mit
7-Tage-Schnitt; Aufteilung angenommen/offen/abgelehnt; je Bewerbungsart; Top-10-Prüfer; Heatmap Wochentag × Stunde
(Berliner Zeit).

---

## 10. Rechte

| Recht | wofür |
|---|---|
| `applications.view` | Bewerbungen, „in Bearbeitung“, Sperren, Statistik ansehen; Ticket öffnen |
| `applications.review` | Prüfschritte der Polizei-Bewerbung (SCREENING, INTERVIEW, PENDING_DECISION, WITHDRAWN) |
| `applications.decide` | Polizei-Bewerbung annehmen/ablehnen; Sperren anlegen/aufheben |
| `applications.delete` | Polizei-Bewerbung löschen (bleibt im Audit-Log festgehalten) |
| `applications.auto_assign_dienstnummer` | bei Annahme automatisch Dienstnummer vergeben |
| `qualifications.view` | Bewerbungen für Einheiten sehen |
| `qualifications.decide` | Einheiten-Bewerbungen entscheiden |
| `qualifications.delete` | Einheiten-Bewerbungen löschen |
| `qualifications.manage` | Einrichtung (Panels, Einheiten, Fragen, Einstellungen) |
| `dashboard.applications.view` | Bereich „Bewerbungen“ im Dashboard |

In Discord reichen zum Entscheiden auch die **Manager-Rollen** der jeweiligen Bewerbung.

---

## 11. Discord-Befehle

| Befehl | Wer | Wirkung |
|---|---|---|
| `/bewerbung` | alle | Polizei-Bewerbung starten |
| `/bewerbungspanel` | „Server verwalten“ | Bewerbungs-Panel in den Kanal posten |
| `/qualipanel` | „Server verwalten“ | Qualifikations-Panel in den Kanal posten |

Interaktions-IDs (Präfix `quali:`): `pick`, `start`, `cancel`, `ans`, `skip`, `rb` (Roblox bestätigen),
`decide`, `reason`/`reasonsubmit`, `history`, `ticket`.

---

## 12. API-Endpunkte

**Polizei** (`apps/api/src/applications/`)

| Methode + Pfad | Recht |
|---|---|
| `GET /applications/form?guildId=` | öffentlich |
| `GET /applications/roblox?q=` | öffentlich (30/min) |
| `POST /applications` | öffentlich (5/h) |
| `GET /applications` · `/inbox` · `/in-progress` · `/analytics` · `/history` · `/:id` | `applications.view` |
| `PUT /applications/:id/status` | `applications.review` |
| `POST /applications/:id/decide` | `applications.decide` |
| `POST /applications/:id/discord-decision` | `applications.decide` oder Manager-Rolle |
| `POST /applications/:id/ticket` | `applications.view` |
| `DELETE /applications/:id` | `applications.delete` |

**Einheiten** (`apps/api/src/qualifications/`)

| Methode + Pfad | Recht |
|---|---|
| `GET /qualifications/config` | `qualifications.view` |
| `PUT` / `DELETE /qualifications/config` | `qualifications.manage` |
| `POST /qualifications/police-panel/send` · `/quali-panel/send` | `qualifications.manage` |
| `GET /qualifications/applications` · `/applications/:id` · `/history` | `qualifications.view` |
| `POST /qualifications/applications/:id/decision` | `qualifications.decide` oder Manager-Rolle |
| `POST /qualifications/applications/:id/ticket` | `qualifications.view` |
| `DELETE /qualifications/applications/:id` | `qualifications.delete` |
| `GET` / `POST /web-apply/:token` | öffentlich (signierter Link; 10 Einsendungen / 10 Min.) |

**Sperren** (`apps/api/src/application-bans/`): `GET /application-bans`, `POST /application-bans`, `POST /application-bans/:id/lift`.

**Nur für den Bot** (Service-Token): `GET /bot/qualifications`, `GET /bot/qualifications/open`,
`POST /bot/qualifications/applications`, `POST /bot/qualifications/web-link`, `GET /bot/application-bans/check`,
`POST|DELETE /bot/application-progress`, `POST /bot/application-progress/reset`.

---

## 13. Datenbank (`apps/api/prisma/schema.prisma`)

| Modell | Inhalt |
|---|---|
| `Application` | Polizei-Bewerbung: Nummer, Status, Antworten (`{ key: text }`), Roblox-Name/-ID, Discord-ID/-Name, Quelle (`WEB`/`DISCORD`), Dauer, Server-Beitritt, Server, Rollen aus Rollen-Auswahl, Entscheider/Zeitpunkt/Grund, Version |
| `QualificationApplication` | Einheiten-Bewerbung: Nummer, Einheit, Antworten (`[{ question, answer }]`), Discord, verknüpfter Benutzer, Status, Entscheidung |
| `ApplicationProgress` | angefangene Bewerbungen („in Bearbeitung“), eine je Person und Bewerbungsart, mit Ablaufzeit |
| `ApplicationBan` | Sperren: Server, Discord-ID, Roblox-ID, Bereiche, Grund, Ablauf, aufgehoben |
| `SystemSetting` | `application.form[@guild]`, `qualifications.config[@guild]` |

---

## 14. Dateien im Überblick

| Bereich | Dateien |
|---|---|
| Shared | `packages/shared/src/forms.ts` (Fragetypen, Prüfung, Texte/Variablen), `application-panels.ts` (Panel-Aufbau), `ai-check.ts`, `statuses.ts` |
| API | `apps/api/src/applications/*`, `apps/api/src/qualifications/*` (Config, Entscheidung, Web-Link), `apps/api/src/application-bans/*`, `apps/api/src/common/hire-events.ts`, `apps/api/src/teamchance/*` |
| Bot | `apps/bot/src/commands/qualifications.ts` (Befehle, DM-Ablauf, Buttons, Ticket), `apps/bot/src/format.ts` (Embeds, Buttons), `apps/bot/src/outbox.ts` |
| Web | `apps/web/src/pages/Applications.tsx`, `Qualifications.tsx`, `ApplicationBans.tsx`, `ApplicationAnalytics.tsx`, `Apply.tsx` (`/apply`), `WebApply.tsx` (`/bewerbung/:token`), `components/ApplicationSettings.tsx`, `components/FormQuestionsEditor.tsx` |

---

## 15. Schnellstart: Bewerbungen einrichten

1. Bot auf dem Server; unter *Administration → Einstellungen* den **Bewerbungs-Kanal** und den **Qualifikations-Kanal** setzen.
2. Dashboard → **Bewerbungen → Einrichtung**: Polizei-Bewerbung aktivieren, Fragen anlegen, Kanäle, Texte, Rollen
   (mindestens Annahme-Rollen und Manager-Rollen) einstellen. Einheiten nach Bedarf anlegen.
3. Panel-Kanal wählen → **Panel senden** (oder `/bewerbungspanel` bzw. `/qualipanel` im Kanal).
4. Testbewerbung mit einem zweiten Konto durchspielen: DM-Fragen → Nachricht im Team-Kanal → Annehmen →
   DM + Rollen prüfen.
5. Optional: Sperren, Wartezeit, Zeitlimit, Team-Threads, Aktion beim Verlassen, Team-Chance.

> Hinweis: Die Discord-Teile sind automatisiert getestet, aber laut README **nicht gegen echtes Discord** getestet.
