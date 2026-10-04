# Phase 51 – Genauer Abgleich der Gesamtspezifikation: Dienstnummer, Dienstgrade, Ticket-Fragetypen

**Stand:** abgeschlossen (2026-10-04). Nach Phase 50 wurden die übrigen Punkte der 58-Punkte-Spezifikation im Code geprüft. Ergebnis und Behebung:

## Geprüft und bereits vorhanden
Login nur über Discord OAuth2 und Sitzungen/CSRF-Schutz, Serverauswahl, Rollen-Sync, frei konfigurierbares Rollen-Mapping, serverseitige Prüfung, Bewerbungen per DM mit 28 Fragetypen, Bewerbungsarten, Ablehnungsgründe, Zurücknehmen, automatische Personalakte bei Annahme, Transcripts, Ticket-Kategorien, Audit-Log, Design-Editor (Phasen 37–45), Mandantentrennung.

## Gefundene Lücken und Behebung
1. **Dienstnummer (Punkt 33)** wurde bei der *Annahme* vergeben, die Spezifikation verlangt die Vergabe nach der *ersten bestandenen Ausbildung*. Jetzt einstellbar: **„Nach der ersten bestandenen Ausbildung“ (neuer Standard)**, „Bei Annahme“ oder „Nie automatisch“ (Dashboard → Dienstgrade & Teams → Dienstnummern). Präfix, Stellenzahl, Startnummer und manuelle Korrektur bestanden bereits. Die Vergabe erfolgt höchstens einmal je Akte, nur für aktive Akten ohne Nummer, nie doppelt (`assignNumberAfterTraining`, aufgerufen beim Bestehen einer Ausbildung). *Änderung am Verhalten:* Server, die bisher bei Annahme nummerierten, müssen auf „Bei Annahme“ stellen.
2. **Dienstgrade (Punkt 32)**: Symbol und Farbe fehlten; Bearbeiten ging im Dashboard nur über Umschalter. Neu: Symbol (≤ 8 Zeichen), Farbe (#RRGGBB, normalisiert), Bearbeiten-Formular. **Nebenbei behoben:** die Umschalter „Als Einstieg“/„Deaktivieren“ schickten nicht alle Felder und löschten dabei den Kurznamen.
3. **Ticket-Fragetypen (Punkt 13)**: nur Kurz-/Langtext. Neu: Zahl, Datum, Ja/Nein, Auswahl, Mehrfachauswahl, Discord-Benutzer (zusätzlich Text/Langtext). Discord-Formulare kennen nur Textfelder; die Antwort wird je Typ geprüft und normalisiert (Datum `TT.MM.JJJJ`, Zahl mit Punkt, `<@ID>`), der Platzhalter zeigt das erwartete Format. Bei Fehlern erhält der Benutzer eine Liste der Korrekturen, es entsteht kein Ticket. Dabei hat der Test einen Fehler im Datumsformat aufgedeckt (behoben).

## Tests
Personal 33, Tickets 33, Ausbildung 13 (erste Ausbildung → Nummer), Bot 143 (Formular mit Typen), Browser (`ranks.spec.ts`): Dienstgrad mit Symbol/Farbe anlegen, deaktivieren (Symbol bleibt), bearbeiten (Status bleibt), Vergabe-Modus speichern.

## Grenzen
- **Datei-Antworten** im Ticket-Formular sind nicht möglich (Discord-Formulare erlauben keine Datei-Uploads); Auswahlfragen sind getippte Antworten gegen eine Liste, keine Auswahlmenüs.
- Dienstgrad-Symbol/-Farbe erscheinen im Dashboard (Dienstgradliste), noch nicht in Discord-Embeds oder der Teamliste.
- Punkt 29 (Teamliste automatisch aus Discord-Rollen, nach Gruppen) besteht über die Dienstgrad-/Team-Zuordnung, nicht als eigene gruppierte Teamliste.
- Nicht gegen einen echten Discord-Bot geprüft.
