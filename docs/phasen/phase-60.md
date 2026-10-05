# Phase 60 – „Team-Chance“-Spezifikation: Abgleich mit dem Bewerbungssystem

**Kernaussage:** Eine **Team-Chance** ist im Projekt eine **Bewerbungsart** (`Application`, Dashboard → Bewerbung). Fragen, DM-Ablauf, Rollenregeln, Prüfung im Discord, Historie und Export bestehen seit Phase 6–10, 36a und 54. Es wurde **kein zweites System gebaut**, sondern der Bestand gegen die 21 Punkte geprüft; Lücken werden in den Teilphasen 60a… geschlossen. Rechte-Zuordnung: `teamchance.accept` = `applications.submissions.accept`, `teamchance.deny` = `…deny`, neu `…accept_reason`/`…deny_reason`.

## Abgleich (Stand 2026-10-05)
| Punkt | Stand |
|---|---|
| 1/2 Arten, Einstellungen | ✅ Name, Beschreibung, Icon/Emoji, Farbe, Banner (`image`), Status, Panel-/Bewerbungs-Kanal, Prüf-Kanal (`submissionChannelId`), zuständige und Bearbeiter-Rollen, Rollenregeln, Zeitlimit, Cooldown, Mindest-Account-Alter, Mindest-Mitgliedschaft, erforderliche/ausgeschlossene Rollen, Vorgänger-Bewerbungen. ❌ **Ergebnis-Kanal**, ❌ **Ticket-Kategorie je Bewerbungsart**, ❌ **maximale Bewerbungen**, ❌ Mindestaktivität/Fraktion/Rang. |
| 3 Start (Buttons/Select) | ✅ Panels (Button, Select, beides). |
| 4 Fragen | ✅ 28 Fragetypen (alle genannten inkl. Zahl, Discord-Benutzer, Datum, Mehrfachauswahl; Roblox-Name über Benutzername/Text mit Regex), Pflicht/optional, verschieben (Drag & Drop), Bedingungen. |
| 5 Ablauf | ✅ DM Frage für Frage, „Frage x von y“, Abbrechen; Thread-Option. |
| 6 Status anpassbar | ✅ Status vorhanden; ❌ Statusnamen/-farben **nicht** konfigurierbar. ✅ **60c** „Zurückgestellt“ (`ON_HOLD`). |
| 7 Prüf-Nachricht | ✅ Annehmen, Ablehnen, Übernehmen, Ansehen, Verlauf, Dashboard-Link, **Zurückstellen/Fortsetzen (60c)**; ❌ „Ticket öffnen“ als Knopf. |
| 8–10 Annehmen/Ablehnen (mit Grund) | ✅ Bestätigung, Gründe, DM, Rollen, Archiv. **Neu (60a):** getrennte Rechte `…accept_reason` / `…deny_reason` (siehe unten). ❌ Wartezeit nach Ablehnung **getrennt** vom allgemeinen Cooldown. |
| 11 Historie | ✅ Verlauf je Bewerbung und je Benutzer, Audit-Ereignisse. |
| 12 Bewerbungs-Ticket | ◐ Option `createTicket` vorhanden; Kategorie/Knöpfe nicht je Bewerbungsart einstellbar. |
| 13 Bewertungssystem | ✅ **60b**: frei definierbare Bewertungsfelder je Bewerbungsart (Name, 2–10 Sterne), jede Person bewertet sich selbst, Mittelwerte je Feld und Gesamt (in %), Rechte `…ratings.view/edit`, Audit `submission.rated`. Nur Dashboard (kein Discord-Knopf). |
| 14 Mehrere Bearbeiter | ❌ genau ein Bearbeiter (Übernehmen/Freigeben/Zuweisen); Notizen ✅. |
| 15 Voraussetzungen | ◐ siehe Punkt 2. |
| 16 Cooldown | ✅ je Bewerbungsart (Tage/Stunden/Minuten). |
| 17 Automatische Rollen | ✅ Rollenaktionen bei Einreichung/Annahme/Ablehnung. |
| 18 Benachrichtigungen | ◐ DM-/Review-Texte konfigurierbar; je Ereignis eigene Embeds/Kanal/Buttons/Erwähnungen ❌. |
| 19 Auswertung | ◐ Analytics vorhanden (täglich, je Art); Kennzahlen im Detail zu prüfen. |
| 20 Export | ✅ CSV, JSON (Rechte `…export`); ❌ PDF. |
| 21 Anpassbarkeit | ✅ weitgehend; Lücken wie oben. |

## 60a – getrennte Rechte „mit Grund“
- Neue Rechte `applications.submissions.accept_reason` („Einreichungen mit eigenem Grund annehmen“) und `…deny_reason`.
- **Regel:** Annehmen/Ablehnen **ohne eigenen Text** (Ablehnen mit vorgegebenem Grund) braucht `accept`/`deny`; **mit eigenem Text** `accept_reason`/`deny_reason`. Wer bisher annehmen/ablehnen durfte, darf es weiterhin auch mit Grund (Sammelrecht), umgekehrt nicht: „mit Grund“ allein erlaubt keine Entscheidung ohne Grund; eine Sperre auf „mit Grund“ schlägt die Freigabe.
- Durchgesetzt in der API (`submissions.controller.ts`) und im Bot (Knöpfe, Auswahl, Formulare; `REVIEW_KEYS`).
- Tests: `grants.test.ts` (4), `apps/api/test/e2e.test.ts` (Annehmen/Ablehnen mit/ohne Grund, Rückwärtskompatibilität, Sperre).

## 60b – Bewertungssystem (Punkt 13)
- **Konfiguration:** `Application.config.rating.fields[]` (`id`, `label`, `max` 2–10, höchstens 20 Felder); ohne Felder ist die Bewertung aus. Dashboard: Bewerbungsart bearbeiten → „Interne Bewertung“.
- **Bewertungen:** Tabelle `application_ratings` (Migration `20261005080000_application_ratings`), je Bearbeiter und Feld ein Wert 1…max; jeder ändert nur die eigene Bewertung (Klick auf den gesetzten Stern entfernt sie); nur für eingereichte Bewerbungen.
- **Auswertung:** Mittelwert je Feld, Gesamtwert = Mittel der auf Prozent normierten Feld-Mittelwerte; Einzelbewertungen aufklappbar.
- **Rechte:** `applications.ratings.view` (nur Team, nie für Bewerber), `applications.ratings.edit`; `applications.manage` schließt beides ein. Die Standard-Vorlagen enthalten sie bewusst **nicht** (ausdrücklich vergeben).
- **Tests:** `apps/api/test/ratings.test.ts` (Felder, Mittelwerte, Prüfung der Werte, Entfernen, Verlauf, nur eingereicht, Mandantentrennung), Browser `e2e/ratings.spec.ts` (Felder einrichten, Sterne setzen, Mittelwert, 403 ohne Recht).
- **Grenze:** Keine Bewertung im Discord (nur Dashboard); Bewertungen werden im CSV/JSON-Export noch nicht ausgegeben.

## 60b – Bewertungssystem (Punkt 13)
- **Konfiguration:** `Application.config.rating.fields[]` (`id`, `label`, `max` 2–10, höchstens 20 Felder); ohne Felder ist die Bewertung aus. Dashboard: Bewerbungsart bearbeiten → „Interne Bewertung“.
- **Bewertungen:** Tabelle `application_ratings` (Migration `20261005080000_application_ratings`), je Bearbeiter und Feld ein Wert 1…max; jeder ändert nur die eigene Bewertung (Klick auf den gesetzten Stern entfernt sie); nur für eingereichte Bewerbungen.
- **Auswertung:** Mittelwert je Feld, Gesamtwert = Mittel der auf Prozent normierten Feld-Mittelwerte; Einzelbewertungen aufklappbar.
- **Rechte:** `applications.ratings.view` (nur Team, nie für Bewerber), `applications.ratings.edit`; `applications.manage` schließt beides ein. Die Standard-Vorlagen enthalten sie bewusst **nicht** (ausdrücklich vergeben).
- **Tests:** `apps/api/test/ratings.test.ts` (Felder, Mittelwerte, Prüfung der Werte, Entfernen, Verlauf, nur eingereicht, Mandantentrennung), Browser `e2e/ratings.spec.ts` (Felder einrichten, Sterne setzen, Mittelwert, 403 ohne Recht).
- **Grenze:** Keine Bewertung im Discord (nur Dashboard); Bewertungen werden im CSV/JSON-Export noch nicht ausgegeben.

## 60c – Zurückstellen (Punkt 6/7)
- **Neuer Status `ON_HOLD` („🟠 Zurückgestellt“)** (Migration `20261005090000_submission_on_hold`). Übergänge: eingereicht/in Prüfung → zurückgestellt → fortsetzen (in Prüfung) **oder direkt** annehmen/ablehnen/zurücknehmen.
- Gemeinsame Konstante `OPEN_SUBMISSION_STATUSES` (eingereicht, in Prüfung, zurückgestellt); alle Stellen, die „offene“ Bewerbungen prüfen (Entscheidung, Zuweisung, Zurücknehmen, offene Bewerbung beim Start, Server verlassen, Zählungen, Widgets, Statistik), berücksichtigen den neuen Status. **Keine Team-Erinnerung** für zurückgestellte Bewerbungen (bewusst).
- **Bedienung:** Discord-Knopf „🟠 Zurückstellen“ / „▶️ Fortsetzen“ in der Prüf-Nachricht; Dashboard-Knöpfe in der Detailansicht (Grund optional), Filter „Zurückgestellt“ in der Liste. API `POST submissions/:id/hold { hold, reason? }`.
- **Rechte:** `applications.submissions.hold` (folgt aus `…review`). Ist die Bewerbung einer anderen Person zugewiesen, darf nur eine Führungskraft (`…reassign`).
- **Verlauf:** `submission.on_hold` / `submission.resumed` (mit Grund).
- **Tests:** Zustandsautomat (2), Bot (Rechte, Umschalter, Knopfbeschriftung, Entscheidung aus „zurückgestellt“, fremd zugewiesen), Browser `e2e/teamchance.spec.ts`.
- **Grenze:** Keine DM an den Bewerber beim Zurückstellen (gehört zu den konfigurierbaren Benachrichtigungen, Punkt 18).
