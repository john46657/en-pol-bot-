# Phase 25 – Ticket-System

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/tickets`, Datenmodell, neue Discord-Funktionen (Kanal anlegen/löschen, Nachrichten lesen, Kanalrechte), API, Bot (`/ticket`, Panel, Buttons), Dashboard „Tickets“. Tests gegen echte Datenbank mit **Discord-Attrappe**. **Nicht gegen echtes Discord getestet** (Kanalanlage, Rechte, Transkript-Abruf); Dashboard nicht im Browser getestet.

## Funktionen
- **Kategorien** (Name, Emoji, Beschreibung, Discord-Kategorie für die Kanäle, Bearbeiter-Rollen, Standard-Priorität, max. offene Tickets je Mitglied); Löschen nur ohne Tickets (sonst deaktivieren).
- **Erstellung:** per Panel (Select → Modal „Betreff/Beschreibung“), oder per `/ticket neu`; privater Kanal `ticket-0001-name` nur für Ersteller, Bearbeiter-Rollen und Bot; Nummer fortlaufend und atomar; Limit je Kategorie; schlägt die Kanalanlage fehl, wird das Ticket zurückgerollt (keine „leeren“ Nummern) und der Grund verständlich gemeldet. Willkommens-Nachricht mit Buttons **Übernehmen / Schließen**.
- **Übernahme:** genau ein Bearbeiter (Rolle der Kategorie + `tickets.handle`), bereits übernommene Tickets nur durch die Verwaltung neu zuweisbar, Freigeben, alles im Verlauf.
- **Priorität** (niedrig–dringend) durch Bearbeiter; **Mitglieder hinzufügen/entfernen** (Kanalrecht wird gesetzt) durch Ersteller oder Bearbeiter.
- **Schließen** (Ersteller oder Bearbeiter, optionaler Grund): **Transkript** wird aus dem Kanal gelesen und im Ticket gespeichert, Zusammenfassung in den **Ticket-Protokoll-Kanal**, **DM an den Ersteller**, Kanal wird gelöscht; Fehler bei Log/DM/Löschen brechen das Schließen nicht ab (Ergebnis nennt, was geklappt hat). Audit-Log.
- **Archiv:** geschlossene Tickets bleiben durchsuchbar (Betreff, Nummer, Beschreibung; Filter Kategorie/Ersteller/Bearbeiter/Priorität/Status) samt **Transkript** (Dashboard, `/ticket transkript`).
- **Ehrlich zu Inhalten:** Ohne den privilegierten *Message Content Intent* liefert Discord keine Nachrichtentexte. Das wird erkannt, im Ticket markiert (`transcriptContent=false`), im Transkript und in den Antworten benannt (siehe docs/BOT-SETUP.md).

## Rechte
`tickets.create` (eröffnen; Mitglieder-Vorlage), `tickets.view` (alle Tickets/Archiv), `tickets.handle` (übernehmen, Priorität, schließen), `tickets.manage` (Kategorien, Panel, jedes Ticket; Serverleitung). Neuer Auswahl-Slot „Ticket-Protokoll“.

## Tests
`tickets.test.ts` (9): Kategorien, Eröffnung (Kanal/Rechte/Nummer/Limit/Rollback), Übernahme/Freigabe, Priorität, Teilnehmer, Schließen mit Transkript/Log/DM/Kanal, fehlende Inhalte, Archivsuche + Statistik. Bot `ticket.int.test.ts` (3): Lebenszyklus per Befehl, Fehlermeldungen, Modal-Eröffnung.

## Grenzen
- Transkript wird erst beim Schließen gelesen (max. 1000 Nachrichten); es gibt kein Live-Mitschreiben und keine HTML-Datei als Anhang (Text im Dashboard).
- Bei hoher Last im Ticket-Kanal können Discord-Rate-Limits die Anlage verzögern; kein automatisches Wiederholen (Phase 34).
- Automatisches Schließen inaktiver Tickets folgt mit den Hintergrund-Jobs (Phase 31).
