# Phase 8 – Bewerbungs-Framework

**Stand:** abgeschlossen (2026-10-04) – Fragen-Builder (API + Dashboard), Validierung, Veröffentlichung, Tests, Praxistest mit 23 Fragen. DM-Durchlauf gegen echtes Discord ist Phase 9.

## Bestand und Befund
Das Datenmodell (`Application`, Versionen, Submissions …) und die Antwort-Logik (`@nexus/core`: Validierung je Typ, Bedingungen, Branching) existierten. **Es gab aber keinen Weg, Fragen zu verwalten:** Fragen lagen als ungeprüftes JSON in `Application.config.questions` und konnten nur über einen `PATCH` der gesamten Konfiguration (ohne Validierung) geändert werden. Die relationalen Tabellen `ApplicationQuestion`/`…Option`/`…Condition` werden von nichts verwendet (bleiben vorerst bestehen, Aufräumen später).

## Umgesetzt
- **Fragen-Builder (reine Logik)** in `@nexus/validation` (`question-builder.ts`): `addQuestion`, `updateQuestion`, `removeQuestion`, `moveQuestion`, `checkQuestionsForPublish`. Lückenlose Nummerierung, eindeutige IDs, Limit 100.
- **Typen im Builder:** Text, Langtext, Zahl, Dezimal, Ja/Nein, Auswahl, Mehrfachauswahl, Datum, Uhrzeit, Datum+Uhrzeit, Bewertung, Schieberegler, Link, E-Mail, Telefon, Discord-Name, Discord-Benutzer, Bestätigung, Anzeige-Text, Hinweis.
- **Regeln:** Auswahlfragen brauchen aktive Optionen mit eindeutiger Beschriftung/Wert; Min/Max-Plausibilität; Regex-Muster nur bei Textfragen, müssen kompilieren und dürfen nicht verschachtelt wiederholen (`(a+)+` – Schutz vor Regex-Stillstand im Bot); Anzeige-Elemente nicht verpflichtend; **Bedingungen nur auf existierende, vorherige Fragen**; Löschen einer Frage, von der andere abhängen, wird abgelehnt (mit Liste); Verschieben vor eine Abhängigkeit wird abgelehnt.
- **Aktiv/Deaktiviert** (`Question.enabled`): deaktivierte Fragen bleiben erhalten, werden aber im DM-Flow nie gestellt (`computeVisibleQuestions`). Beim Veröffentlichen ist es ein Fehler, wenn eine aktive Frage von einer deaktivierten abhängt.
- **API** `…/applications/:id/questions`: `GET`, `POST` (mit `position`), `PUT :qid` (Bearbeiten inkl. Pflicht/optional, aktiv), `DELETE :qid`, `POST :qid/move`. Jede Änderung: Transaktion mit Zeilensperre (keine verlorenen parallelen Änderungen), `ApplicationAuditEvent` (`question.created/updated/deleted/moved`, alt/neu), Rechte `applications.view`/`applications.edit`. `GET` meldet `unpublishedChanges` (Vergleich mit der letzten Version).
- **Veröffentlichen** prüft zusätzlich alle Fragen vollständig und liefert verständliche Fehlerlisten; Versionen frieren den Stand ein (laufende Bewerbungen bleiben unberührt).
- **Weitere Mängel behoben:** `PATCH` der Konfiguration wird jetzt validiert und kann die Fragen **nicht** mehr überschreiben; doppelter Slug liefert 409 statt 500; mehrfaches Duplizieren erzeugt `-kopie`, `-kopie-2` …
- **Dashboard:** `/guilds/:id/applications` (Liste, Anlegen) und `…/:id` (Builder): Liste mit Nummer/Typ/Pflicht/Bedingung/Deaktiviert, ↑/↓, Aktivieren/Deaktivieren, Bearbeiten, Löschen, „+ Frage“ mit typabhängigen Feldern (Längen, Min/Max, Optionen, Auswahl-Grenzen), Veröffentlichen mit Fehlerliste.

## Abnahme „23 Fragen“
`packages/core/tests/acceptance-23.test.ts` und Fixture `scripts/fixtures/application-23.json`: 23 unterschiedliche Fragen (alle Basistypen + Verzweigungen). Unit-Test: Builder nimmt alle an, Veröffentlichungsprüfung ok, **DM-Logik durchläuft 22 sichtbare Fragen** (SEK-Zusatzfrage übersprungen), Antworten werden normalisiert (Zahl, Datum ISO, Mehrfachauswahl, E-Mail …), ungültige Antworten pro Typ werden abgelehnt, Deaktivieren/Verschieben wirken im Flow.
HTTP-Praxistest gegen laufende API + DB: 23 Fragen angelegt (Orders lückenlos), doppelte ID 409, leerer Titel 400, Löschen mit Abhängigkeit 409, Verschieben vor Abhängigkeit 409, fremder Server 403, ohne Recht 403, Deaktivieren/Verschieben/Pflicht→optional ok, Config-Patch überschreibt Fragen nicht, Veröffentlichen → Version 1, danach Änderung → `unpublishedChanges`, leere Bewerbung nicht veröffentlichbar, Audit-Events vollständig.
Browser: Builder zeigt 23 Fragen, Deaktivieren, neue Auswahlfrage mit Optionen anlegen, Auswahlfrage ohne Optionen → verständlicher Fehler-Toast.

## Tests
`packages/validation` (24 Builder-/Panel-Tests), `packages/core` (67 inkl. Abnahme), Rest unverändert grün.

## Grenzen
- Der Builder bietet noch **keinen Editor für Bedingungen** (Sichtbarkeit abhängig von Antworten) – die API/Logik unterstützt sie, das UI folgt. Datei-/Bildfragen (FILE/IMAGE/ATTACHMENT) sind absichtlich nicht im Builder (Anhang-Pipeline fehlt).
- Option-Reihenfolge nicht per UI verschiebbar; Fragen per ↑/↓ (kein Drag-and-drop).
- Keine Frage-Vorlagen/Import (Fixture `application-23.json` dient als Beispiel).
