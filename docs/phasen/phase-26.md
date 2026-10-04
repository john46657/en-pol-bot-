# Phase 26 – Abmeldungen

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/absences`, Datenmodell, API, Bot `/abmeldung`, Dashboard „Abmeldungen“, Anbindung an Personalakten und Schichten. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Benachrichtigungen nur mit Port-Attrappe, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Funktionen
- **Antrag:** Zeitraum (erster und letzter Tag zählen mit, Kalender **Europe/Berlin**), Kategorie (Urlaub, Krankheit, Beruflich/Schule, Sonstiges), Pflicht-**Begründung**; max. **60 Tage**, Beginn höchstens 120 Tage in der Zukunft, nicht in der Vergangenheit (**Krankheit** rückwirkend bis 3 Tage); **keine Überschneidung** mit offenen oder genehmigten Abmeldungen derselben Person; Nummer `A-0001` atomar. Neue Anträge werden im Kanal „Abmeldungen“ (Auswahl-Slot `absence-channel`) angekündigt.
- **Genehmigen** (`absence.manage`): nicht die eigene, nicht für vergangene Zeiträume; **Eintrag „ABSENCE“ in der Personalakte** (Zeitraum, Kategorie, Begründung, Genehmiger), Audit-Log, **DM an das Mitglied**. **Ablehnen** mit Pflicht-Grund (sieht das Mitglied).
- **Zurückziehen:** offen jederzeit; genehmigt nur **vor** Beginn (Akteneintrag wird widerrufen); nur selbst oder Führung. **Vorzeitig zurückmelden** (`/abmeldung zurueck`): laufende genehmigte Abmeldung endet heute.
- **Dienstsperre:** Wer genehmigt abgemeldet ist, kann **keine Schicht starten** (`/schicht start` meldet verständlich bis wann); Zurückmelden hebt die Sperre auf. Offene Anträge sperren nicht.
- **Historie** je Mitglied (alle Status), **„Wer ist heute abgemeldet?“** für die Führung, Listen/Filter.

## Rechte und Oberflächen
`own.absence.create` (Beamte: beantragen, zurückziehen, zurückmelden, eigene Historie), `absence.view` (Übersicht), `absence.manage` (genehmigen/ablehnen/fremde zurückziehen). Bot: `/abmeldung neu|meine|zurueckziehen|zurueck|liste|aktiv|genehmigen|ablehnen|historie`. API: `/guilds/:id/absences[/active|me|history/:userId|:id/(approve|reject|withdraw|end)]`. Dashboard: aktuell Abgemeldete, Anträge entscheiden, eigener Antrag.

## Tests
`absences.test.ts` (10): Datumshelfer inkl. Berlin-Tageswechsel, Validierung, Krankmeldung rückwirkend, Überschneidungen, parallele Nummern, Genehmigen/Akte/DM/Audit, Ablehnen, Zurückziehen, laufende Abmeldung, vorzeitig beenden, Historie. `shifts.test.ts` (+2): Dienstsperre. Bot `abmeldung.int.test.ts` (2): kompletter Ablauf inkl. Sperre und Freigabe.

## Grenzen
- Kein automatisches Ende/Erinnerung zum Abmeldungsende (Phase 31); abgelaufene Abmeldungen bleiben „genehmigt“, zählen aber nicht mehr als aktiv.
- Keine Vertretungsregeln und keine Begrenzung der gleichzeitig Abgemeldeten.
- Beim Genehmigen wird keine Discord-Rolle (z. B. „Abwesend“) vergeben.
