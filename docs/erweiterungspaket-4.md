# Erweiterungspaket 4.0

Personalakte 2.0 · Ausbildungs- und Prüfungssystem 2.0 · Organigramm · Zentraler Berechtigungseditor · Backup-Center 2.0 · Support- und Hilfe-Center

Das Paket **erweitert** das bestehende System. Es ersetzt keine Funktion, entfernt nichts und verändert keine vorhandenen Daten
(Migration `20261203100000_extension_pack_4` ist rein additiv). Nicht wieder eingeführt: altes Modul „Beamtenprofile und Laufbahn“,
Vorgangsverwaltung, KI-Lageassistent. Es gibt keine automatischen Beförderungen, Versetzungen oder Antragsentscheidungen und keine
vorgegebenen (erfundenen) Ränge, Abteilungen, Qualifikationen oder Ausbildungsaufgaben – alles legen berechtigte Personen an.

## Architektur

Alle vier Anwendungen nutzen **eine** Datenbank und **eine** Benutzer-/Rechteverwaltung:

| Anwendung | Zugang |
|---|---|
| Dashboard | Seiten unter Personal, Ausbildung, Organigramm, Hilfe-Center, Benutzer & Rollen → Berechtigungsmatrix, Protokolle → Backup-Center |
| MDT (`/mdt`) | „Personal & Qualifikationen“ (`/mdt/personnel`): Dienststatus, Zugehörigkeit, einsatzrelevante Qualifikationen, Führungsstruktur |
| Leitstelle (`/cad`) | „Qualifikationen & Führung“ (`/cad/personnel`): wie MDT, ohne vertrauliche Inhalte |
| Discord-Bot | `/personal akte`, `/personal qualifikationen`, `/organigramm`, `/hilfe suche:` (bestehender `/hilfe` erweitert); private DMs bei Qualifikationen und Prüfungsergebnissen; Backup-Statusmeldungen |

Rechte werden bei **jeder** Anfrage serverseitig geprüft (Dashboard, MDT, Leitstelle und Bot rufen dieselbe API mit demselben
`AuthorizationService` auf). Eine Rechteänderung wirkt damit sofort überall; Dashboards laden ihre Rechteanzeige per Live-Ereignis neu.

## Personalakte 2.0

Ergänzt die bestehende Personalakte (`/personnel/:id`, `HrPeopleService`) um neue Reiter. Die Grunddaten (Discord-/Roblox-Name und -ID,
Dienstnummer, Rang, Abteilung, Eintritt, Personalstatus) kommen weiter aus den bestehenden Benutzer-, Rollen- und Personaldaten; es
werden keine doppelten Personen angelegt (eine Akte je Benutzer und Server, Anlage per Discord-ID nutzt eine vorhandene Verknüpfung).

| Reiter | Inhalt | Recht |
|---|---|---|
| Dienst & Organisation | Dienststatus (aktueller Dienstabschnitt), Dienstzeiten 90 Tage, Dienstberichte, Einheiten mit Pfad und zuständiger Führungskraft, bewertete Theorie- und Praxisprüfungen | `personnel.view` oder `personnel.view_unit` (eigene Einheit) |
| Qualifikationen | Register mit Status, Herkunft, Abschlussdatum, Aussteller, Gültigkeit; bestätigen/ruhen lassen/entziehen | ansehen wie oben, ändern `qualification.grant` / `qualification.revoke` |
| Vermerke | sachliche Personalvermerke mit Kategorie, Verfasser, Zeitpunkt, Änderungsverlauf (Stand vor jeder Änderung); vertrauliche Vermerke | `personnel.notes_view`, `personnel.notes_create`, vertraulich `personnel.notes_confidential` |
| Dokumente | Personalunterlagen, Ausbildungs-/Prüfungsnachweise, sonstige Dokumente; Upload mit Inhalts-Typprüfung (PDF, Bild, Text, max. 10 MB), Archivieren statt Löschen | `personnel.documents`, vertrauliche zusätzlich `personnel.notes_confidential` |
| Aktivitäten | Wer hat wann was an der Akte geändert (Audit-Log, mit Vorher/Nachher) | `personnel.view_sensitive` oder `promotion.view_history` |

- **Meine Einheit** (`/personnel/unit`): Führungskräfte mit `personnel.view_unit` sehen nur Akten der Einheiten, die sie im Organigramm
  führen oder stellvertretend führen – einschließlich aller Untereinheiten. Fremde Akten antworten mit „nicht gefunden“.
- Dokumente sind **nicht** über den allgemeinen Datei-Download (`/media/:id`) abrufbar, nur über `/personnel-file/documents/:id/download`
  mit Akten- und Vertraulichkeitsprüfung; jeder Abruf wird protokolliert.
- Inhalte vertraulicher Vermerke werden nicht ins Audit-Log kopiert. Die bisherige Notizen-Ansicht zeigt vertrauliche Vermerke nur mit `personnel.notes_confidential`.
- Personalstatus-Änderungen benachrichtigen die betroffene Person privat (Dashboard, neutraler Text).

## Ausbildungs- und Prüfungssystem 2.0

Verbunden mit der bestehenden Ausbildungsverwaltung (Ausbildungen, Module, Termine mit Discord-Anmeldung, Theorieprüfungen mit
Multiple Choice/Mehrfachauswahl/Freitext/Ja-Nein, Punkte, Bestehensgrenze, Zeitlimit, Versuche, Zielgruppen – siehe [personnel.md](personnel.md)).

Neu:
- **Lernmaterial** (`/training/materials`): Lerninhalte, Regelwerke, interne Anleitungen, Bilder/Dokumente, Wissensabfragen (verknüpfte
  Theorieprüfung); verknüpfbar mit Ausbildungen und Qualifikationen; Entwurf/veröffentlicht, Versionszähler mit Konfliktschutz. Recht `training.materials`.
- **Praktische Prüfungen** (`/training/practical`): Aufgaben, Kriterien mit Höchstpunkten, Pflichtkriterien mit Mindestpunkten,
  Bestehensgrenze, Prüfer. Prüfling auswählen → je Kriterium Punkte und Bemerkung → Zwischenstand → Abschließen (erst wenn alle Kriterien
  bewertet sind). Kriterien werden beim Start eingefroren. Ergebnis als Eintrag in der Personalakte, private Benachrichtigung + DM.
  Bewerten dürfen nur eingetragene Prüfer oder `exam.manage`; niemand prüft sich selbst. Rechte `exam.create`, `exam.conduct`, `exam.results`.
- **Qualifikationsregister** (`/qualification-registry`): Katalog (`qualification.manage`) und Register. Eine Qualifikation entsteht nur
  - manuell durch Berechtigte (`qualification.grant`, nicht für sich selbst) oder
  - nach einer **bestätigten Leistung**: bestandene Ausbildung, bestandene Theorieprüfung oder bestandene praktische Prüfung, die mit der
    Qualifikation verknüpft ist. Standardmäßig landet sie dann als „Zur Bestätigung“ beim Personal mit `qualification.grant`; nur wenn im
    Katalog „sofort aktiv“ gesetzt ist, wird sie direkt aktiv.
  Bestehende Qualifikationen (Namen an der Personalakte) wurden bei der Migration als „Übernommen (Altbestand)“ eingetragen;
  `Personnel.qualifications` wird weiter mitgeführt, damit bestehende Anzeigen stimmen.

## Organigramm

`/org`: Baum mit Auf-/Zuklappen, Suche nach Einheiten und Personen, Filter nach Abteilung, Detailansicht (Führung, Stellvertretung,
Zuständigkeiten, Personen, frühere Zuordnungen, Änderungsprotokoll), mobil nutzbar.

- Arten: Polizeiführung, stellvertretende Führung, Abteilung, Dienstgruppe, Einheit, sonstige Einheit.
- **Abteilungen übernehmen**: legt für jede Abteilung aus den Personal-Einstellungen (nur fehlende) eine Abteilungs-Einheit an.
  Mitglieder einer verknüpften Abteilung sind die Personalakten dieser Abteilung – Versetzungen laufen weiter über den bestehenden
  Antrags-Workflow (keine Doppelpflege, keine automatische Versetzung).
- Andere Einheiten: ausdrückliche Zuordnungen mit Funktion; Beenden setzt ein Enddatum (Historie bleibt).
- Einheiten werden deaktiviert, nicht gelöscht; mit aktiven Untereinheiten nicht möglich. Kreise in der Hierarchie werden abgelehnt.
- Rechte: `org.view`, `org.edit` (Einheiten, Personen), `org.hierarchy` (übergeordnete Einheit, Führung, Stellvertretung, Übernahme).
- Änderungen werden protokolliert und an Verwalter sowie betroffene Führungskräfte gemeldet.

## Zentraler Berechtigungseditor

`/admin/access-matrix`: Matrix Rolle × Bereich (Präfix eines Rechts, z. B. `personnel`) mit den Stufen
**Kein Zugriff · Nur ansehen · Bearbeiten · Vollzugriff · Gesperrt**; abweichende Einzelrechte erscheinen als „Individuell“ und bleiben unter
„Rollen & Rechte“ fein einstellbar. Die Stufen werden in die bestehenden Einzelrechte übersetzt – es gibt keine zweite Rechte-Logik.

- „Nur ansehen“ = `view`-artige Aktionen; „Bearbeiten“ = alle nicht verwaltenden Aktionen; „Vollzugriff“ = `bereich.*`;
  „Gesperrt“ = ausdrückliche Sperre `bereich.*` DENY. Verwaltende/sensible Aktionen (z. B. `manage`, `delete`, `restore`, `view_sensitive`,
  `notes_confidential`, `hierarchy`) gibt es nur mit Vollzugriff.
- **Priorität** (unverändert): Benutzer-Sperre > Benutzer-Sonderrecht > höchste Rolle mit Angabe (in einer Rolle Sperre vor Erlaubnis) > kein Zugriff.
  Rollen-Sonderrechte je Server, individuelle Benutzerrechte (Benutzer → Ausnahmen) und Vererbung über das Organigramm (`personnel.view_unit`) sind unterstützt.
- **Sicherheit**: nur Rollen unterhalb des eigenen Rangs, nur Rechte, die man selbst hat; Vorschau vor dem Speichern; jede Einzeländerung im
  Audit-Log; **Aussperrschutz** (Änderungen, nach denen man `roles.view`/`roles.manage` verlöre, werden abgelehnt).
- **Wiederherstellung der Systemadministration**: Die Rolle „System Administrator“ ist im Dashboard nicht änderbar; Discord-IDs in
  `ADMIN_DISCORD_IDS` erhalten beim Discord-Login immer „System Administrator“ (Notfallzugang).
- **Migration**: Wer bisher eine Funktion nutzen durfte, behält sie (z. B. `settings.manage` → `backup.*`, `personnel.view_sensitive` →
  `personnel.notes_view`/`notes_confidential`, `personnel.edit` → `personnel.notes_create`/`documents`/`qualification.grant`, `dashboard.view` → `help.view`).
  Sperren (DENY) des Grundrechts werden mit übertragen.

## Backup-Center 2.0

`/admin/backups` → Dashboard-Daten (globale Systemadministratoren). Gesichert wird in den nicht öffentlichen Speicherordner der API
(`STORAGE_DIR/backups`); Zugriff nur über geschützte Serverfunktionen mit `backup.*` **und** globalem Administrator.

- **Umfang**: Datenbank (alle Tabellen), vollständig (Datenbank + Dateien/Uploads), Konfiguration (Einstellungen, Rollen/Rechte, Module,
  Server, Ränge, Qualifikations-Katalog, Organigramm, Hilfe-Kategorien), Dateien, Modul (Einstellungen, Hilfe-Center, Organigramm,
  Lernmaterial, praktische Prüfungen, Rollen & Rechte, Personal, Support-Tickets).
- **Anlass**: manuell, „vor Update/Migration“, automatisch nach Zeitplan (aus, stündlich, täglich, wöchentlich, monatlich, Uhrzeit/Tag einstellbar).
  Archivierte Backups werden nie automatisch gelöscht. Auf dem VPS sichert `deploy/update.sh` vor jedem Update zusätzlich die Datenbank (`pg_dump`).
- **Sicherheit**: AES-256-GCM-Verschlüsselung mit `BACKUP_ENCRYPTION_KEY` (ohne Schlüssel deutlich als unverschlüsselt angezeigt),
  SHA-256-Prüfsumme im Manifest, Dateirechte 0600, Download nur für Berechtigte (protokolliert). Passwörter und 2FA-Geheimnisse liegen
  in der Datenbank nur gehasht bzw. verschlüsselt vor.
- **Verwaltung**: Name, Erstellungsdatum, Typ/Umfang, Größe, Status (geprüft/fehlerhaft/fehlt/ungeprüft), Speicherort, Ersteller, Prüfsumme,
  Prüfergebnis; erstellen, herunterladen, prüfen, archivieren, durchsuchen, wiederherstellen.
- **Wiederherstellung**: 1. Recht 2. Integrität (Prüfsumme, Entschlüsselung, Aufbau) 3. Version/Kompatibilität (Backups aus neueren Versionen
  werden abgelehnt) 4. automatische Sicherung des aktuellen Stands 5. Plan mit Umfang je Tabelle 6. Bestätigung „WIEDERHERSTELLEN“ –
  **würden neuere Daten überschrieben, zusätzlich ausdrücklich bestätigen** 7. Einspielen in einer Transaktion 8. Audit-Protokoll
  9. Ergebnisprüfung (Zeilen je Tabelle). Vollständig oder selektiv je Bereich – selektiv nur, wenn keine anderen Daten auf den Bereich
  verweisen (sonst wird die selektive Wiederherstellung mit Begründung abgelehnt). Sitzungen, Audit-Log und Wochenarchive bleiben erhalten.
- **Statusmeldungen**: Erfolg/Fehler automatischer Backups und Wiederherstellungen an globale Administratoren (Dashboard) und optional in einen
  privaten Discord-Kanal (`statusChannelId`) – nur Status, nie Inhalte.
- MDT und Leitstelle haben kein eigenes Backup-System; der Backup-Status ist für berechtigte Administratoren unter `GET /backups/status` abrufbar.

## Support- und Hilfe-Center

**Support** nutzt das bestehende Ticket-System ([support-tickets.md](support-tickets.md)): Anfragen per Panel mit Buttons und `/support`,
konfigurierbare Kategorien (z. B. Technisches Problem, MDT, Leitstelle, Discord-Bot, Dashboard, Berechtigungsproblem, Ausbildung, Allgemeine Hilfe),
Prioritäten, Status, Zuständigkeiten, Übernehmen, Antworten, interne Notizen (nie für den Anfragesteller sichtbar), Anhänge, Rückfragen,
Statusbenachrichtigungen, Statistiken (Anzahl, offen, gelöst, Bearbeitungszeit inkl. Median/p90, je Kategorie, Auslastung).
Die „zugehörige Anwendung“ wird über die Kategorie abgebildet (kein eigenes Feld, siehe Einschränkungen).

**Hilfe-Center** (`/help`, Bot `/hilfe suche:`): Kategorien, Artikel, Anleitungen, FAQ, serverseitige Suche (Titel, Kurzfassung, Inhalt,
Schlagwörter), Bilder/Dokumente (`HelpAsset`), Status Entwurf/Veröffentlicht/Archiviert, Änderungsverlauf mit Grund, Konfliktschutz.
Lesen `help.view` (nur veröffentlichte), Bearbeiten `help.manage`. Es sind keine Artikel vorgegeben.

## API (neu)

| Methode | Pfad | Recht |
|---|---|---|
| GET | `/personnel-file/:id`, `/personnel-file/:id/activity` | `personnel.view` oder `personnel.view_unit` (+ Feinprüfung) |
| GET | `/personnel-file/my-unit` | `personnel.view_unit` |
| GET | `/personnel-file/directory?q=&onDuty=&page=` | `personnel.view` oder `cad.view` oder `team.view` |
| GET | `/personnel-file/lookup?discordId=` | `personnel.view` oder `personnel.view_unit` |
| GET/POST | `/personnel-file/:id/notes` · PATCH `/personnel-file/notes/:id` · GET `/personnel-file/notes/:id/revisions` | `personnel.notes_*` |
| GET/POST | `/personnel-file/:id/documents` · POST `/personnel-file/documents/:id/archive` · GET `/personnel-file/documents/:id/download` | `personnel.documents` |
| GET/POST/PUT | `/qualification-registry/definitions[/:id]` | `qualification.view`/`manage` |
| GET/POST | `/qualification-registry` · POST `/qualification-registry/:id/status` · GET `/qualification-registry/personnel/:id`, `/mine` | `qualification.*`, Leitstelle `cad.view` |
| GET/POST/PUT | `/training-ext/materials[/:id]` · POST `…/:id/archive` | `training.view` / `training.materials` |
| GET/POST/PUT | `/training-ext/practical[/:id]` · POST `/training-ext/practical/:id/assessments` | `exam.view`/`exam.create`/`exam.conduct` |
| GET/PUT/POST | `/training-ext/assessments[/:id]`, `…/:id/scores`, `…/:id/complete`, `…/:id/cancel` | `exam.conduct`/`exam.results` |
| GET | `/org/units`, `/org/units/:id`, `/org/summary`, `/org/people/:personnelId` | `org.view` |
| POST/PATCH | `/org/units`, `/org/units/:id`, `…/deactivate`, `…/activate`, `…/members`, DELETE `…/members/:personnelId` | `org.edit` (+ `org.hierarchy` für Struktur) |
| POST | `/org/import-departments` | `org.hierarchy` |
| GET | `/access-matrix`, `/access-matrix/preview`, `/access-matrix/users/:userId` | `roles.view` / `users.view` |
| PUT | `/access-matrix/roles/:roleId/:area` | `roles.manage` |
| GET | `/backups/status`, `/backups/data?archived=` | `backup.view` + global |
| POST | `/backups/data` (Umfang, Module, Anlass, Notiz) | `backup.create` + global |
| POST | `/backups/data/:name/verify` · `/archive` · `/plan` · `/restore` | `backup.verify`/`archive`/`restore` + global |
| GET/POST/PUT | `/help/categories[/:id]`, `/help/articles[/:idOrSlug]`, GET `/help/articles/:id/revisions` | `help.view` / `help.manage` |

## Datenbank (Migration `20261203100000_extension_pack_4`)

Neue Tabellen: `PersonnelRecordRevision`, `PersonnelDocument`, `QualificationDefinition`, `PersonnelQualification`, `HrLearningMaterial`,
`HrPracticalExam`, `HrPracticalAssessment`, `OrgUnit`, `OrgAssignment`, `BackupRecord`, `HelpCategory`, `HelpArticle`, `HelpArticleRevision`.
Neue Spalte: `PersonnelRecord.confidential` (Standard `false`). Fremdschlüssel, Indizes, Teil-Indizes (eine laufende Bewertung je Prüfling,
eine aktive Zuordnung je Person/Einheit, eindeutige Namen auch im gemeinsamen Bestand). Serverbezogen wie die übrigen Personaldaten.
Rückweg: neue Tabellen und die Spalte entfernen, neue `Permission`-Zeilen löschen – bestehende Daten sind nicht betroffen.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | empfohlen | 64 Hex-Zeichen (`openssl rand -hex 32`). Ohne Schlüssel sind Backups unverschlüsselt (Hinweis im Backup-Center). Schlüssel sicher aufbewahren – ohne ihn lassen sich verschlüsselte Backups nicht einspielen. |
| `ADMIN_DISCORD_IDS` | empfohlen | Notfallzugang Systemadministration (bestehend) |

Alle übrigen Variablen sind unverändert.

## Bekannte Einschränkungen

- Die „zugehörige Anwendung“ einer Supportanfrage ist kein eigenes Feld; sie wird über die konfigurierbaren Ticket-Kategorien abgebildet.
- Hosting-Panel (bot-hosting.net): Migrationen laufen beim Start automatisch – ein Backup *unmittelbar* vor der Migration gibt es dort nicht
  (die automatischen Backups nach Zeitplan und „Vor Update“ im Backup-Center vor dem Einspielen eines Updates nutzen). Auf dem VPS erledigt das `deploy/update.sh`.
- Datei-Backups sind auf 400 MB Uploads begrenzt; größere Speicherordner bitte über das Server-Backup des Volumes sichern.
- Nicht gegen echtes Discord und nicht auf dem Produktionsserver getestet (siehe Testbericht im Pull Request).
