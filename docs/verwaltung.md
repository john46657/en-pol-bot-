# Verwaltung 3.0 – Schichtplanung, Anträge, Kalender, Besprechungen, Ankündigungen, Dokumente, Benachrichtigungen, Statistiken

Neun Verwaltungsmodule, eingebaut in die bestehende Plattform (eine Datenbank, eine Benutzer- und Rechteverwaltung,
ein Bot, eine API). Discord-Bot, MDT, Leitstelle und Dashboard greifen auf **dieselben Datensätze** zu – es gibt kein
paralleles Verwaltungssystem.

## Bestandsaufnahme (Ausgangslage)

| Bereich | Vorher vorhanden | Entscheidung |
|---|---|---|
| Dienstzeit | Stempeluhr `DutySession` (`/shift`, Dienst-Panel, Wochen-Reset) | bleibt unverändert; Schichtplanung ist **zusätzlich** (Plan ≠ tatsächlicher Dienst) |
| Abwesenheit | `LeaveRequest` (Trident-artig, `/abmeldung`, `/leave`, Rolle, DMs) | **erweitert** (In Prüfung, Prüfer, Integration) – kein zweites System |
| Beförderung/Versetzung | `HrRequest` mit Genehmigungsstufen, Durchführung tauscht Rollen | **erweitert** (Selbstantrag, Rückfrage, Zurückziehen) |
| Benachrichtigungen | `Notification` + Center + Stummschalten je Art | **erweitert** (Ereigniskatalog, Link, Dubletten-Schutz, DM-Zustimmung) |
| Statistik | `/analytics` (Einsätze, Berichte …) | bleibt; neue Personal-Statistik daneben |
| Uploads | `Media` (Allowlist + Magic Bytes) | wiederverwendet für Dokumente |
| Discord-Nachrichten | Outbox (`message.post`, `bot.dm`), Embed Builder | wiederverwendet für Ankündigungen, Besprechungen, DMs |
| Kalender, Besprechungen, Dokumente, Ankündigungen | – | neu |

Bewusst **nicht** wieder eingeführt: die entfernten „Mitteilungen“ mit Lesebestätigung und Abstimmungen
(Migration `20261115100000_remove_announcements_polls`) und die 20 entfernten Slash-Befehle. Der Ankündigungsmanager
veröffentlicht nur in Discord (ohne Lesebestätigung); neue Bot-Befehle sind wenige, gebündelte Befehle mit Unterbefehlen.

## Datenmodell (Migration `20261203100000_administration_suite`, rein additiv)

Neue Tabellen: `PlannedShift`, `ShiftAssignment`, `CalendarEvent`, `CalendarParticipant`, `CalendarReminderLog`, `Meeting`,
`MeetingTask`, `Announcement`, `AnnouncementDelivery`, `Document`, `DocumentVersion`.
Neue optionale Spalten: `LeaveRequest.reviewerId/reviewStartedAt`, `HrRequest.queries/reviewerId/origin`,
`Notification.event/link/important/dedupeKey` (+ eindeutig `(userId, dedupeKey)`).

- Nichts wird gelöscht oder umbenannt; Fremdschlüssel der neuen Kindtabellen sind `RESTRICT` (Historie kann nicht versehentlich mitgelöscht werden).
- Server-Trennung: `PlannedShift`, `CalendarEvent`, `Meeting`, `Announcement`, `Document` sind je Server (`serverId`, siehe `server-scope.ts`); Kindtabellen nur über den Elterndatensatz erreichbar.
- Bestehende Rollen bekommen in der Migration passende neue Rechte (abgeleitet von vorhandenen Rechten, z. B. `leave.request` → `shiftplan.view`); vorhandene DENY-Einträge bleiben.
- Backups (`/admin/backups`) lesen alle Prisma-Modelle → neue Tabellen sind automatisch enthalten (Test: `backup.test.ts`).
- Ein Modul ausschalten (`/admin/multi-server` → Module) blendet nur aus; Daten bleiben.

## Rechte

| Recht | Zweck | Startrollen |
|---|---|---|
| `shiftplan.view` / `.signup` / `.manage` | Plan sehen · selbst an-/abmelden · planen, zuweisen, veröffentlichen | Member · Member · Supervisor, Administration |
| `calendar.view` / `.manage` | Termine sehen und teilnehmen · Termine anlegen/ändern/absagen | Member · Supervisor, Training Staff |
| `meetings.view` / `.organize` / `.minutes` / `.view_private` | Besprechungen · anlegen · Protokoll · private Protokolle | Member · Supervisor · Supervisor · Administration |
| `announce.view` / `.create` / `.publish` / `.mention` / `.manage` | Ankündigungen · Entwürfe · veröffentlichen/planen/zurückziehen · Rollen erwähnen · Einstellungen | Administration (+ wer `messagebuilder.send` hat) |
| `documents.view` / `.upload` / `.manage` / `.confidential` | Dokumente · hochladen/neue Version · Zugriff/Archiv/Wiederherstellen · vertrauliche | Member · Administration, Training Staff · Administration · Administration |
| `promotion.request`, `transfer.request` | eigenen Antrag stellen | Member |
| `transfer.review` | Versetzungsanträge prüfen/Rückfragen | wer `transfer.approve` hat |
| `analytics.leaderboard` / `.personal_all` / `.export` | Ranglisten · Statistik anderer · CSV | Supervisor/Administration |
| `notifications.manage` | Ereignisse systemweit abschalten | wer `settings.manage` hat |

Alle Rechte werden in der API geprüft (Controller + Service). Der Bot darf nur die ausdrücklich freigegebenen Routen
(`BOT_USER_ROUTES` in `authz/guards.ts`) im Namen des verknüpften Benutzers aufrufen – Planung, Freigaben, Uploads und
Verwaltung gehen **nicht** über Discord.

## Module

### 1. Schichtplanung (`/shiftplan`, Bot `/schichtplan`)
- Schicht: Name, Beginn/Ende (Europe/Berlin), Abteilung, Beschreibung, Leiter, Einheit, Mindest-/Höchstbesetzung, Status (Entwurf → veröffentlicht → abgeschlossen bzw. abgesagt).
- Planen (auch wiederkehrend, gleiche Ortszeit über die Zeitumstellung, max. 52), bearbeiten (Versionsprüfung), kopieren, veröffentlichen, absagen, CSV-Export. **Löschen nur ohne Nachweise** (Entwurf, Zukunft, nie zugewiesen) – sonst absagen.
- Regeln: keine doppelte Anmeldung (Unique + Status), keine überlappenden Schichten je Person, keine Einteilung während genehmigter/geprüfter Abwesenheit, volle Schicht unter Zeilensperre geprüft. Abmeldungen bleiben als `WITHDRAWN` erhalten.
- Benachrichtigung Betroffener bei Veröffentlichung, Änderung, Absage, Austragen; Erinnerung vor Beginn (einstellbar) genau einmal. Alles im Audit.
- MDT: aktuelle/nächste Schicht mit Leiter und Einheit. Leitstelle: **geplant vs. tatsächlich** (✅ geplant + im Dienst · ⭕ geplant, nicht im Dienst · 🌴 abgemeldet, ohne Grund · ➕ im Dienst, nicht geplant).

### 2. Abwesenheit und Urlaub (`/leave`, Bot `/abmeldung`, `/leave`)
Status: Eingereicht (`PENDING`) → In Prüfung (`IN_REVIEW`, mit Prüfer) → Genehmigt/Abgelehnt; Zurückgezogen (`CANCELLED`).
Genehmigte Abwesenheit: blockiert Schichteinteilungen, meldet bestehende Schicht-Zuweisungen an die Schichtleitung
(ändert sie aber **nicht** automatisch), erscheint im MDT (eigene) und in der Leitstelle (nur „abgemeldet“). Historische
Dienstzeiten und Berichte werden nie verändert. Der Grund steht im Log-Kanal nur noch, wenn ausdrücklich eingeschaltet
(*Administration → Abmeldungen → Grund im Log-Kanal*, Standard aus).

### 3. Beförderungs- und Versetzungsanträge (`/my-requests`, `/promotions`, Bot `/antrag`)
Selbstantrag nur mit erfüllten Voraussetzungen (Beförderung). Status: Eingereicht, In Prüfung, **Rückfrage erforderlich**,
Zurückgestellt, Genehmigt, Abgelehnt, Durchgeführt, Zurückgezogen. Rückfragen stellt, wer prüfen/genehmigen darf; antworten
nur der Antragsteller (Dashboard oder `/antrag antworten`). **Sicherheitsregel:** Ein Antrag ändert nie selbst Rang/Rollen;
erst die Genehmigung einer berechtigten Führungskraft (nie beim eigenen Antrag) und die Durchführung (bzw. die eingestellte
Auto-Durchführung **nach** Genehmigung) ändern Rang, Abteilung, Discord-/Dashboard-Rollen – mit Audit und Personalakte.

### 4. Kalender (`/calendar`, Bot `/termine`)
Kategorien: Dienstbesprechung, Ausbildung, Prüfung, Schicht (virtuell aus dem Schichtplan), Veranstaltung, interner Termin,
Frist. Monat/Woche/Tag/Übersicht, Filter, Serien, Einladungen, Zusage/Absage/Abwesenheit, Höchstzahl, Anwesenheit,
Verschieben/Absagen mit Benachrichtigung, Erinnerungen (10 min … 7 Tage) **genau einmal je Beginn** (nach Verschieben
erneut, alte Einträge bleiben). **Doppelte Einträge:** Schichten werden nicht kopiert; jede Anlage trägt einen
Idempotenz-Schlüssel (Dashboard/Discord/Doppelklick ergeben genau einen Termin).

### 5. Besprechungen (`/meetings`)
Besprechung = Kalendertermin + Besprechungsdaten (Discord-Kanal, Pflicht, privat, Tagesordnung, Notizen, Entscheidungen,
Nachbereitung, Aufgaben mit Zuständigen und Fristen). Ankündigung/Erinnerung/Änderung im Discord-Kanal mit Buttons
*Zusagen/Absagen/Abwesenheit melden* (Antworten gehen nur ans System). Anwesenheit über dieselbe Teilnehmerliste,
„durchgeführt“ im Audit, Teilnehmer-CSV. **Private Protokolle** sehen nur Organisator, Protokollführer, Anwesende und
`meetings.view_private`; Protokollinhalte stehen nicht im Audit.

### 6. Ankündigungen (`/announcements`)
Arten: Allgemein, Dienstanweisung, Ausbildung, Besprechung, Wartung, Systemmeldung. Editor mit Titel, Beschreibung, Farbe,
Bild/Thumbnail (nur https), Footer, Zeitstempel, Feldern, Link-Buttons, Vorlagen und Live-Vorschau (serverseitig berechnet –
genau das, was gesendet wird). Veröffentlichen, planen, wiederholen (täglich/wöchentlich/monatlich; je Zeitpunkt genau einmal),
bearbeiten (dieselbe Discord-Nachricht, ohne erneuten Ping), zurückziehen (Nachricht wird als zurückgezogen markiert,
Datensatz bleibt), Versandhistorie, optionale Kanal-Freigabeliste. **Erwähnungen:** nur gewählte Rollen (höchstens 3, Recht
`announce.mention`), `@everyone`/`@here` werden nie gepingt (auch nicht aus dem Text).

### 7. Dokumente (`/documents`, Bot `/dokument`)
Kategorien: Dienstanweisung, Regelwerk, Ausbildungs-/Prüfungsunterlage, Leitstelleninformation, Richtlinie, Vorlage, Sonstiges.
Upload: PDF, Text, PNG/JPG/WebP bis 10 MB, Typ **und** Inhalt (Signatur) geprüft, zufälliger Speichername, nie ausgeführt.
Versionen bleiben erhalten; „Wiederherstellen“ legt die alte Datei als neue Version an. Zugriffsgruppen: alle /
bestimmte Rollen / vertraulich – serverseitig bei **jedem** Abruf geprüft; Dateien sind nie über `/media/:id` erreichbar.
Download nur als Anhang (`Content-Security-Policy: sandbox`), jeder Download im Audit. Archivieren statt Löschen.
In Discord nur private Antworten mit Links ins Dashboard – nie Dateien in Kanäle.

### 8. Zentrale Benachrichtigungen
Ereigniskatalog `NOTIFICATION_EVENTS` (`packages/shared/src/administration.ts`) mit Kanälen Dashboard, Discord, MDT,
Leitstelle. `NotifyService.emit()` speichert je Empfänger, meldet offene Dashboards live, schickt **DMs nur mit Zustimmung**
(`/benachrichtigungen dm:true` oder *Persönlich → Benachrichtigungen*) und nie den Text-Inhalt (`body`) per DM. Dubletten-
Schutz: `(Empfänger, Ereignis:Anlass)` eindeutig → keine doppelten Meldungen, keine Endlosschleifen. Benachrichtigungscenter:
ungelesen/gelesen/archiviert, Filter nach Bereich und „wichtig“, alle als gelesen, direkter Link. Administratoren können
Ereignisse systemweit abschalten (`/notifications/rules`).

Angebunden: Schichten, Abwesenheit, Anträge, Termine, Besprechungen, Ankündigungen, Dokumente, Bewerbung (neu), Ticket
(übernommen), fehlgeschlagene geplante Ankündigung (Systemfehler). **Noch nicht angebunden** (Katalog vorhanden):
KI-Check, Ticket neu/geschlossen, Backup fehlgeschlagen, Verbindungsproblem – diese Stellen benachrichtigen weiter über ihre
bisherigen Wege.

### 9. Statistiken und Ranglisten (`/statistics`)
Nur Zählwerte aus gespeicherten Daten: Dienstzeit (Stempeluhr), Schichtteilnahmen (abgeschlossene Schichten), Dienst- und
Wochenberichte, Ausbildungen, Prüfungen, Ticketbearbeitungen (geschlossen), Besprechungsteilnahmen (anwesend),
Abwesenheitstage, Terminzusagen. Zeiträume heute/Woche/Monat/Jahr/frei (Europe/Berlin). Ranglisten mit gleichen Plätzen bei
Gleichstand, ein-/ausschaltbar, Größe einstellbar, sichtbar nur mit `analytics.leaderboard`; Werte anderer Personen nur mit
`analytics.personal_all`; CSV-Export im Audit. Es gibt **keine** schreibende Statistik-Route und keine Leistungsbewertung.

## API-Übersicht
`/shiftplan`, `/shiftplan/{current,staffing,mine,people,export,config}`, `/calendar`, `/calendar/upcoming`, `/meetings`,
`/meetings/tasks`, `/announcements`, `/announcements/{preview,templates,config}`, `/documents`, `/documents/:id/{download,versions,archive}`,
`/hr/requests/{self,mine,targets}`, `/hr/requests/:id/{query,answer,withdraw}`, `/leave/:id/review`,
`/notifications/{events,preferences,rules,feed}`, `/analytics/{personal,team,leaderboards,export,config}`,
`/workspace/{mdt,dispatch}` (Swagger: `/api/docs`).

## Hintergrundprozesse
Je Minute (nicht in Tests): Schichten abschließen + Erinnerungen, Kalender-Erinnerungen + Abschluss, geplante/wiederkehrende
Ankündigungen. Alle Zeitpunkte und „schon erledigt“-Merker liegen in der Datenbank (Neustart-fest); doppelte Ausführung bei
mehreren Instanzen verhindern eindeutige Schlüssel bzw. atomare Statuswechsel.

## Deployment
Keine neuen Umgebungsvariablen. Ablauf wie bisher (`deploy/update.sh` bzw. Hosting-Paket): **vorher Backup**
(`/admin/backups` → „Jetzt sichern“ bzw. `deploy/update.sh` sichert die DB), dann `prisma migrate deploy` (läuft beim Start),
Neustart von API und Bot (der Bot registriert `/schichtplan`, `/termine`, `/antrag`, `/dokument` je Server neu).
Danach: *Personal → Einstellungen → Abteilungen* prüfen (Schichtplanung nutzt sie), Rollen-Rechte kontrollieren,
optional Kanal-Freigaben für Ankündigungen setzen.

## Bekannte Einschränkungen
- Nicht gegen echtes Discord getestet (Bot-Logik mit Fake-API getestet; Buttons/DMs laufen über die vorhandene Outbox).
- Einstellungen der Hintergrundaufgaben (z. B. Erinnerungsvorlauf der Schichten) gelten serverübergreifend aus dem globalen Wert, wenn kein Server-Kontext besteht.
- Rollen-Auswahl für Dokument-Zugriffsgruppen braucht zusätzlich `roles.view` (sonst bleibt nur „alle“/„vertraulich“).
- Ankündigungs-Zielgruppe „Rollen“ steuert Benachrichtigungen und Erwähnungen; wer den Discord-Kanal sieht, bestimmt weiterhin Discord.
- Kalender zeigt Abwesenheiten nicht als Termine (dafür gibt es die Kalenderansicht unter Abmeldungen).
