# Phase 60 – „Team-Chance“-Spezifikation: Abgleich mit dem Bewerbungssystem

**Kernaussage:** Eine **Team-Chance** ist im Projekt eine **Bewerbungsart** (`Application`, Dashboard → Bewerbung). Fragen, DM-Ablauf, Rollenregeln, Prüfung im Discord, Historie und Export bestehen seit Phase 6–10, 36a und 54. Es wurde **kein zweites System gebaut**, sondern der Bestand gegen die 21 Punkte geprüft; Lücken werden in den Teilphasen 60a… geschlossen. Rechte-Zuordnung: `teamchance.accept` = `applications.submissions.accept`, `teamchance.deny` = `…deny`, neu `…accept_reason`/`…deny_reason`.

## Abgleich (Stand 2026-10-05)
| Punkt | Stand |
|---|---|
| 1/2 Arten, Einstellungen | ✅ Name, Beschreibung, Icon/Emoji, Farbe, Banner (`image`), Status, Panel-/Bewerbungs-Kanal, Prüf-Kanal (`submissionChannelId`), zuständige und Bearbeiter-Rollen, Rollenregeln, Zeitlimit, Cooldown, Mindest-Account-Alter, Mindest-Mitgliedschaft, erforderliche/ausgeschlossene Rollen, Vorgänger-Bewerbungen. ❌ **Ergebnis-Kanal**, ❌ **Ticket-Kategorie je Bewerbungsart**, ❌ **maximale Bewerbungen**, ❌ Mindestaktivität/Fraktion/Rang. |
| 3 Start (Buttons/Select) | ✅ Panels (Button, Select, beides). |
| 4 Fragen | ✅ 28 Fragetypen (alle genannten inkl. Zahl, Discord-Benutzer, Datum, Mehrfachauswahl; Roblox-Name über Benutzername/Text mit Regex), Pflicht/optional, verschieben (Drag & Drop), Bedingungen. |
| 5 Ablauf | ✅ DM Frage für Frage, „Frage x von y“, Abbrechen; Thread-Option. |
| 6 Status anpassbar | ✅ Status vorhanden; ❌ Statusnamen/-farben **nicht** konfigurierbar. ❌ „Zurückstellen“. |
| 7 Prüf-Nachricht | ✅ Annehmen, Ablehnen, Übernehmen, Ansehen, Verlauf, Dashboard-Link; ❌ „Zurückstellen“, „Ticket öffnen“ als Knopf. |
| 8–10 Annehmen/Ablehnen (mit Grund) | ✅ Bestätigung, Gründe, DM, Rollen, Archiv. **Neu (60a):** getrennte Rechte `…accept_reason` / `…deny_reason` (siehe unten). ❌ Wartezeit nach Ablehnung **getrennt** vom allgemeinen Cooldown. |
| 11 Historie | ✅ Verlauf je Bewerbung und je Benutzer, Audit-Ereignisse. |
| 12 Bewerbungs-Ticket | ◐ Option `createTicket` vorhanden; Kategorie/Knöpfe nicht je Bewerbungsart einstellbar. |
| 13 Bewertungssystem | ❌ nicht vorhanden. |
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
