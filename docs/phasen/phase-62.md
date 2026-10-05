# Phase 62 – Sicherung, Wiederherstellen, Zurücksetzen

Aus der Spezifikation „Rollen- & Rechtesystem“ (Punkt 3: „Backups erstellen/wiederherstellen“, „sämtliche Einstellungen zurücksetzen“). Befund: Die Rechte `backup.create/restore` existierten ohne Funktion.

## Umgesetzt
- **Konfigurations-Sicherung** (`GET /guilds/:id/backup`, Recht `backup.create`): JSON-Datei mit 36 Tabellen – Grundeinstellungen (inkl. Kanal-/Rollenauswahl, Module), Design (Einstellungen, Themes, Versionen), gespiegelte Rollen, Rollenrechte, Profile, Benutzerausnahmen, Dashboard-Rollen mit Mitgliedern, Panels, Log-Weiterleitungen, Dienstgrade, Teams, Schicht-Typen, Funkkanäle, Gefahrenstufen, Ausbildungskurse, Qualifikationen, Beförderungsregeln, SEK-Einstellungen, Ticket-Einstellungen und -Kategorien, Bewerbungsarten mit Versionen, Fragen, Optionen, Bedingungen, Rollenregeln, Integrationen, Automationen, Panels und Vorlagen. **Keine Nutzdaten** (Bewerbungen, Tickets, Akten, Schichten, Audit-Log …).
- **Wiederherstellen** (`POST …/backup/restore`, `backup.restore`, bis 10 MB nur für diese Route): nur in denselben Server; Upsert je Eintrag in Abhängigkeitsreihenfolge (gesicherte Einträge erhalten ihren Stand, gelöschte kommen zurück, neuere bleiben; so bleiben Bewerbungen/Tickets mit Verweisen gültig). Jeder Eintrag wird geprüft: falscher Server bzw. Kind eines fremden Elternteils → übersprungen; Namenskonflikte mit neueren Einträgen → übersprungen mit Hinweis. Ergebnis mit Anzahl je Tabelle und Liste der übersprungenen Einträge.
- **Zurücksetzen** (`POST …/backup/reset`, nur Server-Verwalter, Bestätigung „ZURÜCKSETZEN“): wählbare Bereiche – Grundeinstellungen, Design, Ticket-Einstellungen, Log-Weiterleitungen, Rechte. Vorher automatische Sicherung, die das Dashboard sofort herunterlädt. Bewerbungsarten, Kategorien und Nutzdaten werden nie gelöscht.
- **Audit:** `backup.created`, `backup.restored`, `backup.reset` (Bereich „Konfiguration“).
- **Dashboard:** Seite „Sicherung“ (Verwaltung).
- **Tests:** `apps/api/test/backup.test.ts` (Inhalt, Wiederherstellen inkl. JSON/Datum, fremde Einträge, Konflikte, Zurücksetzen je Bereich), Browser `e2e/backup.spec.ts` (Download, Einspielen per Datei, fremde Sicherung 400, Zurücksetzen mit automatischer Sicherung).

## Grenzen
- Hochgeladene Bilder des Designs (Dateien) sind nicht in der Sicherung, nur die Verweise darauf.
- Einspielen in einen anderen Server ist bewusst nicht möglich (Discord-IDs von Rollen/Kanälen wären dort ungültig).
- Einträge, die nach der Sicherung angelegt wurden, werden beim Einspielen nicht gelöscht.
