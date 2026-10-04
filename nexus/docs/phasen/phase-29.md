# Phase 29 – Logging & Audit

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/audit`, Lücken in den Fachmodulen geschlossen, API `/guilds/:id/audit-log`, Dashboard „Logs“ (Filter + CSV-Export). Tests gegen echte Datenbank. **Dashboard und CSV-Download nicht im Browser getestet, kein echtes Discord.**

## Was protokolliert wird
Jede wichtige Aktion schreibt einen Eintrag ins zentrale, **nur anhängende** Audit-Log (kein Ändern/Löschen im Repository): **Benutzer** (oder Automation) · **Aktion** · **Zeitpunkt** · **Server** · **betroffener Datensatz** (Art + ID) · **alte/neue Daten** · **Berechtigung** · **Ergebnis** · **Grund**. Neu in dieser Phase – die zuvor nur im Fach-Verlauf stehenden Aktionen werden jetzt zentral gespiegelt (`auditRepository.mirrorEvent`):
| Bereich | Aktionen (neu zentral) |
| --- | --- |
| Shifts & Streifen | Schicht gestartet/pausiert/fortgesetzt/beendet; Einheit gebildet/beigetreten/verlassen/geändert/automatisch aufgelöst |
| Einsätze | angelegt, geändert, Einheit zugewiesen/abgezogen/freigegeben, Einsatzleiter, Status-Wechsel, Übernahme in Personalakten (Abbruch hat weiterhin den ausführlichen Eintrag) |
| Fahndungen | erstellt, **bearbeitet (Vorher/Nachher)**, aufgehoben |
| Tickets | eröffnet, übernommen, freigegeben, Priorität, Mitglieder, geschlossen |
| Ausbildungen | Termin angelegt, angemeldet/abgemeldet/entfernt, gestartet, **bewertet (Vorher/Nachher)**, bestanden/nicht bestanden, beendet |
| Beförderungen | beantragt, zurückgezogen (genehmigt/abgelehnt bestanden bereits) |
| Abmeldungen | beantragt (genehmigt/abgelehnt/zurückgezogen/beendet bestanden bereits) |
| Strafen & Fahrzeuge | Strafe ausgestellt; Fahrzeug aufgenommen/Status/zugewiesen/Schaden/repariert |
| Berichte | erzeugt |
| bereits vorhanden | Bewerbungen, Rollenänderungen (`role.change` mit Rollen vorher/nachher), Gefahrenstatus, SEK, Funk, Qualifikationen, Konfiguration (Auswahlfelder, Rechte, Ticket-Kategorien …) |
Ereignisse ohne Zusatzdaten erhalten `{event: …}`, damit nie ein Eintrag „leer“ ist.

## Auswertung (`@nexus/audit`)
- **Bereiche** (Bewerbungen, Rollenänderungen, Personal, Beförderungen, Ausbildungen & Qualifikationen, Shifts & Streifen, Einsätze, Fahndungen, Strafen & Fahrzeuge, Gefahrenstatus, Tickets, Abmeldungen, SEK, Funk, Berichte, **Konfigurationsänderungen**) über Aktions-Präfixe; der spezifischste Präfix gewinnt (`ticket.category.*` zählt zur Konfiguration).
- **Filter/Suche/Blättern:** Bereich, Aktion, Benutzer, Datensatz, Ergebnis, Zeitraum, Freitext (Aktion, Grund, IDs); Cursor-Paging, neueste zuerst; Zähler je Bereich.
- **CSV-Export** (`audit.export`): Kopfzeile, Bereichsnamen, Vorher/Nachher als JSON, **Schutz vor Formelinjektion**, max. 20 000 Zeilen mit Kennzeichnung „abgeschnitten“, Excel-tauglich (BOM); der Export selbst wird protokolliert (`audit.exported`). Server sind strikt getrennt.

## Abnahme
`audit.test.ts` (23): führt **echte Abläufe** aus allen genannten Bereichen aus (Schichten, Einsätze, Fahndungen, Tickets, Abmeldungen, Strafen, Fahrzeuge, Ausbildung, Qualifikation, Beförderung mit Rollenwechsel, Gefahrenstatus, Funk, SEK, Berichte, Konfiguration, Bewerbung) und prüft je Bereich, dass die erwarteten Einträge existieren; dass **jeder** Eintrag Server, Aktion, Zeit, Benutzer/Automation, Datensatz und Daten enthält; Vorher/Nachher; Filter/Suche/Paging/Zähler/Export/Mandantentrennung/Append-only.

## Grenzen
- **Bewerbungs- und Konfigurations-Einträge** (Phasen 5–10) werden hier mit je einem Beispiel-Eintrag und in deren eigenen Tests abgedeckt; der komplette Bewerbungsfluss läuft in diesem Test nicht durch.
- Lesezugriffe (Ansehen) werden nicht protokolliert, nur Änderungen und der Export.
- Es gibt keine automatische Aufbewahrungsfrist/Archivierung (Phase 34/35); das Log wächst unbegrenzt.
