# Phase 36a – Ticket- und Bewerbungssystem nach Vorlage

**Stand:** abgeschlossen (2026-10-04). Auslöser: Anforderungsliste „Discord-Ticket- und Bewerbungssystem“ (Screenshots/Beschreibung). Abgleich gegen NEXUS, Lücken geschlossen. Tests: `@nexus/tickets` 26, Bot 138 (davon 9 neue Panel-Tests), API 168; `pnpm -r test` und `typecheck` grün.

## Abgleich: was war schon da, was ist neu

| Anforderung | Stand |
| --- | --- |
| Ticket-Kategorien frei konfigurierbar (Name, Beschreibung, Emoji, Discord-Kategorie, Teamrollen, Limit je Nutzer) | vorhanden (Phase 25) |
| **Farbe, Kapazität, benötigte Rollen, Namensvorlage, Formular, Transcript je Kategorie** | **neu** |
| Panel mit Select-Menü „🔽 Wähle eine Kategorie ...“ | neu gebaut: Titel, Kategorien mit Beschreibung, Platzhalter – alles aus der Konfiguration |
| **📊 Ticket-Auslastung** (offen/Kapazität, 🟢 0–49 · 🟡 50–79 · 🟠 80–99 · 🔴 100 %, volle Kategorie optional ausgeblendet) | **neu**; Panel aktualisiert sich selbst (Ticket auf/zu, Worker alle 2 Min.), Discord wird nur bei Änderung angefragt |
| Auswahl → Ticket sofort; „Du hast bereits ein offenes Ticket.“ | neu (vorher Betreff-Modal); Kapazität unter Datenbank-Sperre → auch parallel nie über der Grenze |
| Kanalname konfigurierbar (`ticket-{number}-{user}`, `support-{user}` …) | **neu** |
| Rechte: Ersteller sehen/schreiben/Dateien; Team zusätzlich **Nachrichten verwalten**; @everyone nichts | neu (Team-Rollen mit „Nachrichten verwalten“) |
| Start-Embed „🎫 Ticket geöffnet“ + 5 Buttons (🔒 Schließen · 📝 Schließen mit Grund · 👤 Claim/Übernehmen · 🔔 Benachrichtigung · 📋 Informationen), je nach Einstellung | **neu** |
| Claim: „🎫 Ticket übernommen – … wird aktuell von @X bearbeitet“, Claim an/aus, **nur Bearbeiter darf ändern** (optional) | neu; Umschalten (nochmal Claim = freigeben); Admin-Rollen/Verwaltung dürfen immer |
| Schließen: Bestätigung „Ticket schließen? … Ja, schließen / Abbrechen“ | **neu** (abschaltbar) |
| Schließen mit Grund: Modal „Ticket schließen“ / „Grund für das Schließen“ → „Ticket geschlossen … Grund“ | **neu**, Grund im Transcript |
| Nach dem Schließen: Ersteller verliert Zugriff, Team behält ihn, **Kanal nach konfigurierbarer Frist gelöscht** | **neu** (Worker-Job `ticket-cleanup`, Standard 10 Min., 0 = sofort) |
| **HTML-Transcript** (Server, Icon, Ticketname/-ID, Kategorie, Ersteller + ID, Zeiten, Schließer, Bearbeiter, Grund, Nachrichtenzahl, Verlauf mit Uhrzeit/Autor, Anhänge, Bilder inline, Links, Antworten, Systemaktionen) | **neu**; gespeichert in der Datenbank, Download im Dashboard; Dateiname `ticket-0001-john.html` |
| Transcript → Kanal mit Embed „📄 Ticket Transcript“ + Datei, optional Button „Transcript öffnen“ (Dashboard-Link), optional per DM | **neu** |
| Bewerbung per DM, Fragen einzeln, Timer, Abbrechen, Zusammenfassung, Abgabe, Submission stats, Verlauf/History, Sperrzeit, Rollenvergabe, Dashboard | vorhanden (Phasen 7–10) |
| **Accept / Deny sofort**, **Accept/Deny mit Grund** (Modals „Provide a reason for accepting/denying“, Pflichtfeld) | **repariert/neu**: im Code waren „Accept“ und „Deny mit Grund“ ohne Handler, „Ticket mit User“ ebenfalls |
| **🎫 Ticket mit User** → „🎫 Bewerbungsgespräch / Bewerber / Bewerbung“, nur einmal je Bewerbung | **neu** |
| **View Applicants Application** im Ticket (nur mit Bewerbungs-Recht, privat) | **neu** |
| Admin-Konfiguration (Panel-/Transcript-Kanal, Admin-Rollen, Texte, Farben, Emojis, Limits, Löschzeit, DM-Transcript, Claim, Close-with-reason …) | **neu**: Dashboard → Tickets → Einstellungen, plus Kategorie-Formular; Panel-Button „veröffentlichen“ |
| Fehlerbehandlung: verständliche Meldung, Details nur im Log, abgelaufene Interactions | geprüft/getestet (keine Interna in der Nutzermeldung) |

## Technik
- Migrationen `ticket_v2`, `ticket_settings_application_category`; neue Tabelle `ticket_settings`.
- `@nexus/tickets`: `settings.ts`, `panel.ts`, `html.ts`, `errors.ts`; Discord-Paket: Datei-Upload (`createChannelMessageWithFile`, `sendDirectMessageWithFile`), Kanalrecht „Nachrichten verwalten“.
- Sicherheit: Transcript maskiert **alle** Nutzerinhalte (Test mit Skript-/Attribut-Ausbrüchen, `javascript:`-Links), eigene CSP in der Datei, Download nur als `attachment` mit `sandbox`-CSP.

## Bekannte Grenzen
- **Nie mit echtem Discord ausprobiert** (kein Token): Aussehen der Embeds/Buttons, Select-Menü-Emojis, Datei-Upload-Format (multipart) und die Rechte der Kanäle sind nur gegen Attrappen getestet. Beim ersten Start mit echtem Bot bitte einmal alles durchklicken.
- Das Select-Menü behält nach der Auswahl clientseitig die Markierung; ob Discord dieselbe Option erneut auslöst, wurde nicht geprüft.
- Panel-Aktualisierung hängt vom Worker ab (alle 2 Min.) und von Ticket-Ereignissen; ohne Worker aktualisiert es nur beim Öffnen/Schließen.
- Zusatzanforderung „Ticket-Kanal nach Bewerbung mit Annahme-Text“ etc. nutzt die bestehende Annahme-Pipeline; Texte dort sind weiterhin im Dashboard unter Bewerbungen konfigurierbar.
- Ablehnungsgründe aus der Liste (Select) sind im Bot nicht mehr erreichbar (Deny ist sofort bzw. mit Freitext); sie bleiben im Dashboard-Ablauf nutzbar.
- „Mehrere Server“: alles ist je Server konfiguriert; die Server-ID kommt aus Discord (nicht fest im Code).
