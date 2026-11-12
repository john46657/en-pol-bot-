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

---

## KI-Bewerbungsprüfung (Google Gemini, Groq, OpenRouter, Mistral, Ollama)

Eine echte KI wertet eine **vorhandene** Bewerbung aus (Polizei-Bewerbung und Bewerbungen für Einheiten, egal ob über das Dashboard `/apply` oder Discord eingegangen) und liefert Prüfern eine **Entscheidungshilfe**. Sie nimmt nie an, lehnt nie ab, löscht nichts, sperrt niemanden, vergibt keine Rollen und ändert keinen Status – entscheiden tut immer ein Mensch über die bestehenden Buttons.

Nicht zu verwechseln mit dem lokalen **KI-Checker** (`packages/shared/src/ai-check.ts`, Abzeichen „KI-Verdacht“), der ohne externen Dienst schätzt, ob Antworten mit ChatGPT & Co. geschrieben wurden. Beide bleiben unabhängig voneinander erhalten.

### Automatischer Ablauf (neu)
1. Bewerbung wird regulär gespeichert (Dashboard/Web `/apply` **und** Discord nutzen dieselben Datensätze).
2. Die API meldet die neue Bewerbung intern (`applicationEvents`), die KI-Prüfung nimmt sie in eine Warteschlange.
3. Nach ca. 3 Sekunden startet die Analyse **im Hintergrund** – das Einreichen wartet nie darauf.
4. Ergebnis wird dauerhaft gespeichert (`ApplicationAiReview`, `via = AUTO`).
5. Das Dashboard zeigt es sofort an (gleiche Zeile wie bei manuellem Start); Prüfer erhalten eine Benachrichtigung **„🤖 KI-Analyse … abgeschlossen“** bzw. **„⚠️ … fehlgeschlagen“** (Art `AI_REVIEW`, in *Persönlich* abschaltbar).
6. Im Discord-Kanal der Bewerbung erscheint eine **kurze Meldung** nur mit Empfehlung und Richtwert (keine Antworten, keine Begründungen) und dem Button **„Details (privat)“**.

Grenzen: Tageslimit und gleichzeitige Analysen gelten auch für die Automatik; wartende Analysen laufen nacheinander (max. 200 in der Warteschlange). Ist das Tageslimit erreicht, wird **nicht** analysiert und die Prüfer erhalten den Hinweis „KI-Analyse nicht gestartet“ – manuell geht es später jederzeit. Ohne eingerichteten Anbieter passiert nichts. Je Server abschaltbar (*Einrichtung → „Neue Bewerbungen automatisch analysieren“*).

### Bedienung
- **Dashboard:** *Bewerbungen* → Bewerbung aufklappen → **„KI-Bewerbung prüfen“**. Ladeanzeige, danach Empfehlung, Gesamtbewertung (Richtwert 0–10, ausdrücklich keine objektive Bewertung/Erfolgswahrscheinlichkeit), zehn Einzelkriterien, Stärken, Schwächen, fehlende Angaben, Widersprüche, Rückfragen, Unsicherheiten, Zeitpunkt, Modell und wer sie gestartet hat. „Erneut analysieren“ startet bewusst eine neue Analyse.
- **Discord:** Unter jeder neu eingehenden Bewerbung im Team-Kanal gibt es (nur wenn ein Schlüssel hinterlegt ist) den Button **🤖 KI-Prüfung**. Die Zusammenfassung sieht **nur der klickende Prüfer** (private Antwort); ausführlich mit Link ins Dashboard (`/applications?q=<Nummer>`). Bewerbungen, die vor dem Update gepostet wurden, haben den Button nicht – dort im Dashboard prüfen.
- **Einrichtung** (*Bewerbungen → Einrichtung → KI-Bewerbungsprüfung*, Recht `qualifications.manage`, je Server): an/aus, automatisch an/aus, **geltende RP-Regeln** und **Auswahlkriterien**. Ohne Regeln bzw. Kriterien bewertet die KI diese Punkte ausdrücklich als „nicht beurteilbar“ – sie erfindet keine Anforderungen.

### Rechte
| Aktion | Polizei-Bewerbung | Einheiten-Bewerbung |
|---|---|---|
| Ergebnis ansehen / Analyse starten | `applications.review` | `qualifications.decide` |
| Discord-Button | dazu reicht auch eine eingestellte Manager-Rolle der Bewerbung | ebenso |
| Einstellungen | `qualifications.manage` | `qualifications.manage` |

### Kriterien und Ergebnis
Die zehn Kriterien: Vollständigkeit · Verständnis der RP-Regeln · Qualität/Nachvollziehbarkeit · Verhalten in Situationen · Verständnis von Aufgaben/Verantwortung im Polizeidienst · Widersprüche · fehlende/unklare Angaben · Verständlichkeit · sinnvolle Rückfragen · Übereinstimmung mit den konfigurierten Auswahlkriterien. Jede Bewertung ist `gut`, `ausreichend`, `mangelhaft` oder `nicht_beurteilbar`. Empfehlung: `geeignet`, `rueckfragen_noetig` oder `manuelle_pruefung`.

Die KI antwortet als JSON nach festem Schema (`generationConfig.responseSchema`); die API prüft es zusätzlich selbst (`parseAiReview`). Ungültige oder unvollständige Antworten werden **nicht** gespeichert, sondern als fehlgeschlagene Analyse mit verständlicher Meldung angezeigt; das letzte gültige Ergebnis bleibt sichtbar.

### Speicherung, erneute Analyse, veraltete Ergebnisse
- Tabelle `ApplicationAiReview` (eine Zeile je Analyse, zugeordnet über Art + Bewerbungs-ID). Dashboard und Discord lesen dieselben Zeilen.
- Öffnen einer Bewerbung startet **nie** eine Analyse (automatisch nur einmal beim Eingang, sofern eingeschaltet). Ein vorhandenes, aktuelles Ergebnis wird wiederverwendet; eine laufende Analyse wird nie doppelt gestartet (auch nicht bei Doppelklick).
- Ändern sich Antworten oder die hinterlegten Regeln/Kriterien (Fingerabdruck/Hash), wird das Ergebnis als **„möglicherweise veraltet“** markiert.
- Fehlgeschlagene Analysen beschädigen die Bewerbung nicht. Nach einem Neustart werden unterbrochene Analysen als fehlgeschlagen markiert und **nicht** automatisch erneut gesendet.
- Wird eine Bewerbung gelöscht, werden ihre KI-Ergebnisse mitgelöscht. Die Daten-Backups (*Einstellungen → Backups* und die täglichen Datenbank-Dumps) enthalten die Tabelle automatisch.

### Datenschutz
- Übermittelt werden nur Fragen und Antworten. **Nicht** übermittelt: Discord-/Roblox-Namen, IDs, Antworten auf Identitätsfragen (Roblox-/Discord-Name, Alter, Wohnort …). E-Mail-Adressen, Telefonnummern, Links, Discord-IDs/Erwähnungen und IP-Adressen werden vor dem Versand entfernt (`redactPersonalData`). Namen im Freitext lassen sich nicht zuverlässig erkennen.
- Bewerbungstexte werden nicht geloggt. Das Audit-Log (`application.ai_review.start|done|failed`) hält fest, wer wann eine Analyse gestartet hat und ob sie erfolgreich war – ohne Bewerbungstext.
- **Wichtig:** In der kostenlosen Gemini-Stufe können übermittelte Inhalte laut Google zur Verbesserung der Produkte verwendet werden (Stand der Preisseite bei Einführung). Vor dem Livebetrieb die aktuellen [Gemini-API-Nutzungsbedingungen](https://ai.google.dev/gemini-api/terms) und die [Preisseite](https://ai.google.dev/gemini-api/docs/pricing) prüfen, Bewerber ggf. informieren und zunächst nur fiktive/anonymisierte Testbewerbungen verwenden.

### Einrichtung (Server)
Umgebungsvariablen der API (nur serverseitig, nie im Frontend, nie in Discord, nie im Repository – `.env` ist per `.gitignore` ausgeschlossen):

| Variable | Standard | Bedeutung |
|---|---|---|
| `AI_PROVIDER` | automatisch | `gemini` · `groq` · `openrouter` · `mistral` · `ollama`. Leer = der erste Anbieter (in dieser Reihenfolge), für den ein Schlüssel hinterlegt ist – bestehende Installationen mit nur `GEMINI_API_KEY` bleiben unverändert. |
| `GEMINI_API_KEY` | – | Schlüssel aus [Google AI Studio](https://aistudio.google.com). |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `MISTRAL_API_KEY` | – | Schlüssel der jeweiligen Anbieter (OpenAI-kompatible Chat-Completions-API). |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Selbst betriebenes Ollama (kein Schlüssel) – nur mit `AI_PROVIDER=ollama`. Nur http(s)-Adressen. |
| `AI_MODEL` | je Anbieter | Modell überschreiben. Standard: `gemini-3.8-flash` · `llama-3.3-70b-versatile` (Groq) · `meta-llama/llama-3.3-70b-instruct:free` (OpenRouter) · `mistral-small-latest` · `llama3.1` (Ollama). `GEMINI_MODEL` gilt weiter für Gemini. Verfügbarkeit und kostenlose Kontingente prüfen – sie ändern sich. |
| `AI_REVIEW_DAILY_LIMIT` | `50` | höchstens so viele Analysen in 24 Stunden (alle Server zusammen) |
| `AI_REVIEW_MAX_CONCURRENT` | `2` | gleichzeitige Analysen |
| `AI_REVIEW_TIMEOUT_MS` | `45000` | Zeitlimit je Anfrage (5 000–120 000) |
| `AI_REVIEW_MAX_RETRIES` | `1` | Wiederholungen nur bei vorübergehenden Fehlern (Netzwerk, 5xx, ungültige Antwort), nie bei Limit (429) oder ungültigem Schlüssel |
| `AI_REVIEW_MAX_INPUT_CHARS` | `12000` | max. Zeichen je Bewerbung (längere Antworten werden gekürzt, das Ergebnis vermerkt es) |

Ungültige Werte fallen auf den Standard zurück; die API startet trotzdem. Ein fehlender oder ungültiger Schlüssel, ein nicht verfügbares Modell, erreichte Limits (HTTP 429), Zeitüberschreitung und Ausfälle werden verständlich gemeldet; die Rohmeldung des Anbieters und der Schlüssel erscheinen nie in Antworten oder Logs.

Ohne Schlüssel/Anbieter ist die KI-Prüfung aus (Button/Bereich zeigt den Grund mit der passenden Variable).

### Kosten
Jeder Anbieter hat eigene Bedingungen; Gemini, Groq, OpenRouter (`:free`-Modelle) und Mistral bieten zeitweise kostenlose Stufen, garantiert ist das nicht. Für Groq/OpenRouter/Mistral gelten deren Datenschutz- und Nutzungsbedingungen – vor dem Livebetrieb prüfen. Ollama läuft vollständig auf eigener Hardware (keine Daten an Dritte). Für Gemini: Die Anbindung nutzt nur die Gemini-API ohne Zusatzdienste. Ohne verknüpftes Abrechnungskonto bleibt es bei der kostenlosen Stufe; dann lehnt Google Anfragen über dem Kontingent mit 429 ab (die Prüfung meldet „Nutzungslimit erreicht“), es entstehen keine Kosten. Kostenlose Kontingente, Modelle und Bedingungen kann Google jederzeit ändern – sie sind nicht garantiert. Eine Analyse ist ein einzelner Aufruf (ca. 2 000–5 000 Eingabe-Token je nach Bewerbung).

### Technik
`packages/shared/src/ai-review.ts` (Kriterien, Prompt, Schema, Prüfung, Datenminimierung) · `apps/api/src/applications/ai-review/` (Anbieter-Schnittstelle `AiProvider`; `GeminiProvider` über `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` mit Header `x-goog-api-key`; `OpenAiCompatibleProvider` über `POST {base}/chat/completions` mit `response_format: json_object` – das Schema steht im Prompt und wird serverseitig geprüft) · `apps/api/src/common/application-events.ts` (Ereignis „neue Bewerbung“) · `apps/bot/src/commands/ai-review.ts` · `apps/web/src/components/AiReviewPanel.tsx`.

API: `GET|POST /applications/:id/ai-review`, `GET|POST /qualifications/applications/:id/ai-review` (`{ force: true }` = bewusst neu), `GET /application-ai-review/status`, `GET|PUT /application-ai-review/settings`, Bot: `GET /bot/ai-review/status`.
