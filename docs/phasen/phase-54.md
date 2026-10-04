# Phase 54 – Bewerbungssystem „Discord only“: Abgleich und Lücken

**Stand:** abgeschlossen (2026-10-05). Die Spezifikation „Bewerbungssystem – Discord only“ (27 Punkte) wurde gegen NEXUS geprüft. Der größte Teil (Panels, DM-Ablauf, 28 Fragetypen, Rollen-Regeln, Cooldown, Zeitlimit, Annahme-Pipeline mit Personalakte, Nachrichten, Verlassen-Aktionen) bestand seit Phase 6–10; gefundene Lücken sind geschlossen.

## Neu
- **Bewerbungs-ID (Punkt 10/11):** `submissionNumber` wurde bisher nie vergeben. Jetzt beim Absenden fortlaufend je Server und **Präfix je Bewerbungsart** (Dashboard → Bewerbung → „ID-Präfix“, z. B. `POL` → `#POL-00152`, 5 Stellen; ohne Angabe `SUB`; Testbewerbungen zählen getrennt als `T…`). Die ID steht in der Bestätigung per DM (mit Status „In Bearbeitung“), in der Review-Nachricht, in Liste, Detailansicht und Export.
- **Bewerbung übernehmen (Punkt 15):** Knopf „👤 Übernehmen“ (Discord, Umschalter Übernehmen/Freigeben) und im Dashboard „Bewerbung übernehmen“, „Freigeben“, „Zuweisen“. Genau ein Bearbeiter; andere lesen „Diese Bewerbung wird bereits von … bearbeitet.“; mit dem neuen Recht **`applications.submissions.reassign`** („Zuständigkeit ändern“, im Leitungs-Template) darf man übernehmen, zuweisen und trotz Zuweisung entscheiden. Der Bearbeiter erscheint in der Review-Nachricht („Noch nicht zugewiesen“ bis dahin), in der Liste und im Detail; Audit `submission.assigned/released`.
- **Annehmen mit Bestätigung (Punkt 16):** Im Discord erscheint „Bewerbung annehmen? Bewerber, Bewerbung, ID – Bestätigen / Abbrechen“; erst „Bestätigen“ entscheidet. (Dashboard hatte die Rückfrage schon.)
- **Ablehnen mit Grund (Punkt 20):** Der Discord-Knopf lehnt nicht mehr sofort ab, sondern verlangt die Auswahl eines (konfigurierbaren) Ablehnungsgrunds oder „Eigener Ablehnungstext …“ (Pflicht-Formular).
- **Zurücknehmen durch das Team (Punkt 21):** `POST submissions/:id/withdraw` und Dashboard-Knopf „↩ Zurücknehmen“ (Recht `applications.submissions.withdraw`): Status WITHDRAWN, Grund Pflicht, Bearbeiter und Grund im Audit-Log, Bewerber bekommt eine DM.
- **Bewerbungshistorie (Punkt 22):** `GET submissions/by-user/:userId` und Abschnitt „Bewerbungshistorie dieses Benutzers“ in der Detailansicht (ID, Bewerbung, Status, Datum).
- **Export (Punkt 23):** `GET submissions/export?format=csv|json&applicationId&status&from&to` (Recht `applications.submissions.export`, bisher ohne Funktion), Buttons „⬇ CSV/JSON“ in der Einreichungsliste. Eine Zeile je Bewerbung mit Stammdaten und einer Spalte je Frage; Optionen als Beschriftung; CSV mit UTF-8-BOM und **Schutz vor Formel-Einschleusung**; höchstens 5000 Zeilen; der Export wird protokolliert (`submissions.exported`).
- **Fragen-Optionen (Punkt 6):** **Eigene Fehlermeldung** je Frage (ersetzt bei ungültiger Antwort die Standardtexte; der Pflicht-Hinweis bleibt) und **Regex-Feld** im Builder (Mindest-/Höchstlänge gab es schon). **Drag & Drop** zum Sortieren der Fragen (zusätzlich zu ↑/↓).
- **Offene Bewerbung (Punkt 2):** „⚠️ Du hast bereits eine offene Bewerbung. Status: IN REVIEW (ID …)“.

## Abgleich der übrigen Punkte
Kein öffentliches Web-Formular (1, 24) ✅ · Panel mit Button/Dropdown, mehrere Panels (1) ✅ · Prüfungen beim Start: erforderliche/gesperrte Rolle, Cooldown mit Datum ✅; Ablaufdatum einer Sperre über das Sperren-System (Phase 47) · DM-Dialog, „Frage x von y“, Zurück/Überspringen (nur optionale)/Abbrechen, Zusammenfassung mit Bearbeiten ✅ · beliebig viele Fragen (bis 500) ✅ · Rollenaktionen bei Einreichung/Annahme/Ablehnung ✅ · konfigurierbare Annahme-Schritte, Personalakte, Nachrichten ✅ · Verlassen des Servers ✅.

## Tests
`@nexus/core` 75 (Fehlermeldung); Bot 154 (ID je Präfix, Review-Nachricht, Übernehmen/Freigeben/Zuweisen, Entscheidung nur durch Bearbeiter/Leitung, Annahme-Bestätigung, Ablehnen per Auswahl, Zurücknehmen, offene Bewerbung mit Status); API 205 (Rechte, Präfix-Prüfung, Übernehmen/Zuweisen/Freigeben, Zurücknehmen, Verlauf, Export inkl. Formatprüfung und Audit; Export-Aufbau mit Formelschutz); Browser (`applications.spec.ts`): Fragen per Drag & Drop umsortieren, Präfix, Regex und Fehlermeldung speichern; Bewerbung übernehmen/freigeben, Historie, Zurücknehmen. Bestehende Tests für Annehmen/Ablehnen wurden an die neuen Abläufe angepasst.

## Grenzen
- Der Review-Nachricht fehlt der in der Spezifikation genannte Knopf **„👤 Profil“** (Bewerber sind meist noch keine Mitglieder mit Akte); stattdessen „Ansehen“, „Verlauf“ und der Dashboard-Link.
- Rollen-basierte Sperren (Bewerbungssperre als Discord-Rolle) haben kein Ablaufdatum; befristete Sperren laufen über das Sperren-System.
- Die Bearbeiter-Zuweisung nutzt ein eigenes Feld; die ältere Reviewer-Tabelle (Round-Robin) bleibt ungenutzt.
- Nicht gegen einen echten Discord-Bot ausgeführt (Interaktionen mit Attrappen getestet).
