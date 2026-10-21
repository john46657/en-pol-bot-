# Premium-Funktionen – Lage, Laufbahn, Vorgänge, Qualität, Prüfungen, Karte, Prognose, Überwachung

Erweiterung des bestehenden Dashboards und Bots. Es wurden **keine separaten Anwendungen** gebaut, keine Funkanlage, keine Multi-Server-Funktionen ergänzt. Alle neuen Daten liegen dauerhaft in PostgreSQL; die Migration ist rein **additiv**.

## Übersicht

| Funktion | Dashboard | API | Rechte |
|---|---|---|---|
| Lageassistent | *Betrieb → Lageassistent* (`/situation`) | `GET /situation`, `POST/GET /situation/reports` | `situation.view`, `situation.create` |
| Beamtenlaufbahn | Personalakte → Reiter *Laufbahn* | `GET /hr/people/:id/career` | `career.view` (Verwarnungen/Notizen zusätzlich `warning.view` / `personnel.view_sensitive`) |
| Vorgangsverknüpfung | *Akten → Vorgänge* (`/cases`) | `/cases…` | `cases.view`, `cases.manage` |
| Qualitätsprüfer | *Akten → Qualitätsprüfer* (`/quality`), Panel in Bericht/Einsatz | `/quality…` | `quality.view`, `quality.exception`, `quality.manage` |
| Prüfungszentrum | Ausbildung → Prüfungen (Editor/Bewertung), Personalakte → *Prüfungsfortschritt* | `/hr/exams…`, `/hr/people/:id/exam-progress`, `/hr/me/exam-progress` | bestehende `exam.*` |
| Einsatzkarte | CAD → Karte | `GET /cad/map` (erweitert) | bestehende `cad.view`, `cad.manage_map` |
| Personalprognose | *Organisation → Personalprognose* (`/forecast`) | `GET /forecast` | `forecast.view` |
| Überwachung | *Verwaltung → Protokolle → Systemstatus* (`/admin/system`) | `/integrations…` | `integrations.view`, `integrations.manage` (API-Schlüssel ändern: bestehendes `cad.manage_erlc`) |
| Backups | *Verwaltung → Protokolle → Backups* | `/backups…` (+ `verify`, `runs`) | `backups.view`, `backups.manage`, `backups.restore` |
| Discord | `/lage`, `/vorgang` | – | wie oben (Bot nutzt die Rechte des verknüpften Benutzers) |

Standard ist **verweigert**: neue Rechte hat zunächst nur die Rolle „System Administrator“ (`*`). Ausnahme zur Besitzstandswahrung: wer bisher `settings.manage` hatte, behält über die Migration die Backup-Rechte.

## Fachliche Regeln (Kurzfassung)

- **Lage**: nur gespeicherte Daten; jeder Abschnitt nennt Quelle und Stand. Lageberichte sind per DB-Trigger unveränderlich.
- **Laufbahn**: liest Personalakten-Einträge, Anträge (jede Entscheidungsstufe), Bewerbung, Dienstzeiten, Berichte, Abmeldungen. Nichts wird überschrieben. Beförderungsvoraussetzungen nutzen die bestehende Prüfung je Dienstgrad; die Entscheidung bleibt im Beförderungsantrag.
- **Vorgänge**: Nummer `V-JJJJ-00001`. Verknüpfen nur sichtbarer Datensätze; Lösen nur mit Begründung (bleibt sichtbar). Duplikate nur als Vorschlag (gleicher Einsatz/Notruf/Bericht/Fahndung oder sehr ähnlicher Titel binnen 48 h) – ähnliche Personennamen allein nie. Zusammenführen nur manuell. **Mit einem Vorgang verknüpfte Einsätze werden nicht mehr nach einem Tag gelöscht.**
- **Qualität**: Fehler/Warnungen getrennt, Feld und Korrekturhinweis; begründete Ausnahmen (protokolliert); optional Pflicht vor Einreichen bzw. Abschluss (Abbrechen bleibt möglich). Der Prüfer verändert keine Inhalte.
- **Prüfungen**: Themen, Schwierigkeit, Ziehregeln, Bevorzugung zuletzt schwacher Themen, Fallbeispiele (Verkehrskontrolle, Festnahme, Führungsaufgabe) mit Kriterienkatalog. Verkehrsunfall und Leitstellenübung werden serverseitig abgelehnt. Ergebnis, Feedback und schwache Themen landen in der Personalakte; Bestehen befördert nicht. Prüfungen mit Versuchen können nicht mehr gelöscht werden (Nachweise bleiben).
- **Karte**: Positionsherkunft je Notruf (`CALLER`, `API`, `POI`, `POSTAL`, `CALIBRATED`, `NONE`); ungefähre/veraltete Daten gestrichelt; Liste „Ohne genaue Position“ statt Raten. Funktioniert ohne ER:LC mit den CAD-Daten.
- **Prognose**: volle Wochen, Europe/Berlin; Aussagekraft (keine/gering/mittel/hoch), Datenbasis und Lücken werden angezeigt; Zugriff wird protokolliert; löst nichts aus.
- **Überwachung**: Fehlerserie je ER:LC-Server dauerhaft (`failureCount`, `failingSince`), Störungen je Quelle zusammengefasst, Alarm nach Dauer/Anzahl (einstellbar) an alle mit `integrations.view` und den Logging-Kanal; Verarbeitungsschritte einzeln abgesichert und idempotent; Discord-Ausgang wird überwacht.
- **Backups**: Lauf-Protokoll; Wiederherstellungstest spielt wirklich ein, vergleicht Zeilen je Tabelle und rollt zurück; Fehler werden sofort gemeldet. Vor ausstehenden Migrationen erzwingt `start.js`/Docker eine Sicherung (`vor-migration-…json.gz`), sonst kein Start (Notfall: `SKIP_PRE_MIGRATION_BACKUP=1`).

## Abschlussbericht

### Tatsächlich implementiert
Alle acht Funktionen wie oben beschrieben (API, Dashboard, Bot-Befehle `/lage`, `/vorgang`), Rechte, Migration, Doku.

### Erfolgreich durchgeführte Tests
- Shared (Regeln, Prognose, Ziehung, Rechte): 104 Tests grün.
- API-Integrationstests gegen echtes PostgreSQL: alle bestehenden 387 Tests weiterhin grün, dazu 36 neue (`premium-ops`, `premium-hr`, `premium-system`): Rechte je Funktion (403 ohne Recht), Lage + unveränderlicher Lagebericht, Vorgänge (Nummer, doppelte Verknüpfung 409, Lösen mit Begründung, Suche nach Einsatznummer/Datum, Duplikat-Vorschlag/Entscheidung, keine Zusammenführung über Namen, vertrauliche Einsätze), Qualitätsregeln + Pflichtprüfung + Ausnahmen, Karte (Vorgänge, veraltet, ohne Position), Laufbahn (Reihenfolge, Bearbeiter, geschützte Einträge, Voraussetzungen), Prüfungen (Ziehregeln, Kriterienbewertung, schwache Themen, adaptive Wiederholung, gesperrte Aufgaben, Löschschutz), Prognose (Schätzung, Auffälligkeit, Engpässe), ER:LC-Ausfall/Netzwerkfehler/Rate-Limit (Retry-After eingehalten, keine Anfrage gesendet), Alarm nach Schwelle, **Neustart der App** mit erhaltener Störung, Wiederverbindung, einzelner Schritt fällt aus und andere laufen weiter, keine doppelten Notrufe, nicht mehr gemeldete Notrufe, Discord-Ausgang, Backup-Lauf/Test/Fehler/Wiederherstellung, Sicherung vor Migration inkl. Einspielen.
- Bot: 184 Tests grün (3 neue).
- Web: 51 Komponenten-/Navigationstests grün; Browser-Durchlauf (Chromium) aller neuen Seiten ohne Fehler, Lagebericht erzeugt, Backup erstellt und Wiederherstellungstest im Browser bestanden, Karte auf Handybreite.
- Lint und Typecheck für alle Pakete sauber.

### Noch offen / bewusst nicht umgesetzt
- **Beweismittel** sind nicht verknüpfbar: das Modul wurde zuvor auf Wunsch komplett entfernt (Tabelle `Evidence` existiert noch). Bitte entscheiden, ob es dafür zurückkommen soll.
- **Multi-Server**: Der Code enthält weiterhin die Server-Trennung aus früheren Änderungen (Server-Übersicht, Server & Module). Es wurde nichts Neues dazu gebaut; die neuen Tabellen folgen nur der bestehenden Datentrennung. Ein vollständiger Rückbau auf genau einen fest konfigurierten Server wäre eine eigene, größere Änderung.
- Bußgelder/HR-Anträge/Personalakten-Einträge haben im Verknüpfungsdialog keine Suche (Eingabe der ID).
- Nicht gegen echtes Discord und echten ER:LC-Server getestet (wie bisher alle Discord/ER:LC-Teile).

### Nicht von ER:LC unterstützt
- Eine **eigene Einsatz-/Notrufposition** liefert ER:LC nicht verlässlich: genutzt werden nur der Spielerstandort des Anrufers (per Roblox-ID), eine Postleitzahl bzw. ein POI aus der Ortsangabe oder die Notruf-Position, wenn sie auf der Karte liegt – sonst „keine genaue Position“.
- Keine Fahrzeugpositionen, keine Beitritts-Webhooks (bestehende Einschränkungen).
- Ob ein Notruf in ER:LC „erledigt“ ist, meldet die API nicht – fehlt er im nächsten Abruf, wird er nur als „nicht mehr gemeldet“ markiert, nicht geschlossen.

### Manuell erforderliche Einstellungen
1. Rollen & Rechte: neue Rechte (`situation.*`, `career.view`, `cases.*`, `quality.*`, `forecast.view`, `integrations.*`) den Führungsrollen geben.
2. Qualitätsprüfer → Einstellungen: ggf. Pflichtprüfung vor Einreichen/Abschluss einschalten.
3. Systemstatus → Alarmierung: Schwellen prüfen; Logging-Kanal „Einstellungen & System“ einrichten, wenn Discord-Alarme gewünscht sind.
4. Backups: optional „Täglicher Wiederherstellungstest“ einschalten (nachts, Schreibzugriffe warten kurz).
5. Prüfungen: Themen/Schwierigkeit an bestehenden Fragen ergänzen, falls Ziehregeln genutzt werden.
6. Discord: Befehle `/lage`, `/vorgang` erscheinen nach dem Bot-Neustart.

### Datenbankänderungen (`20261117100000_premium_features`)
- Neue Tabellen: `CaseFile`, `CaseLink`, `CaseDuplicateDecision`, `QualityException`, `SituationReport` (unveränderlich per Trigger), `IntegrationEvent`, `BackupRun`.
- Neue Spalten: `ErlcServer.failingSince/failureCount`, `ErlcEmergencyCall.positionSource/lastSeenAt`, `HrExam.drawRules`, `HrExamAttempt.rubricScores/weakTopics`.
- Teil-Indizes (aktiv eindeutige Verknüpfung/Ausnahme/offene Störung), neue Rechte; Backup-Rechte an Rollen mit `settings.manage`.
- Keine Daten gelöscht oder verändert. Bei Wiederherstellung bleiben Lageberichte, Backup-Verlauf und Störungsprotokoll erhalten.
