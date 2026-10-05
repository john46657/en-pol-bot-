# Phase 63 – Automatische Nachrichten

Aus der Spezifikation „Rollen- & Rechtesystem“ (Punkt 3/18: „automatische Nachrichten konfigurieren“, Recht `messages.manage`).

## Umgesetzt
- **Automatische Nachrichten** (Tabelle `scheduled_messages`, Migration `20261005100000_scheduled_messages`): Name, Kanal, Text, optional Embed (Titel, Beschreibung, Farbe, Bild, Fußzeile), Rollen-Erwähnungen, Link-Knöpfe; Wiederholung **einmalig**, **alle N Minuten** (10 Min. bis 7 Tage, optional mit erstem Termin), **täglich** zur Uhrzeit, **an Wochentagen** zur Uhrzeit – in deutscher Zeit inkl. Sommer-/Winterzeit. Platzhalter `{datum}`, `{uhrzeit}`, `{wochentag}`.
- **Versand:** Worker-Job `scheduled-messages` (jede Minute) legt fällige Nachrichten in die Benachrichtigungs-Warteschlange (Wiederholung bei Fehlern, nie doppelt), berechnet den nächsten Termin (atomar vor dem Versand), deaktiviert einmalige danach. Modul „Automatische Nachrichten“ abschaltbar (dann wird nicht gesendet).
- **API** `guilds/:id/scheduled-messages` (Recht `messages.view` / `messages.manage`): anlegen, ändern, löschen, „Jetzt senden“ (sofort, Zeitplan bleibt). Prüfung: Textkanal dieses Servers, Inhalt vorhanden, gültige Wiederholung (Zukunft, Intervallgrenzen, HH:MM, Wochentage), nur https für Bilder/Knöpfe. Audit `messages.scheduled.*`.
- **Dashboard:** Seite „Automatische Nachrichten“ (Gruppe Service) mit Liste (nächster/letzter Versand), Editor und „Jetzt senden“.
- **Tests:** `packages/jobs/test/schedule.test.ts` (Zeitzone, einmalig, Intervall, täglich, wöchentlich über die Zeitumstellung), `scheduled-messages.test.ts` (Versand einmal, nächster Termin, einmalig deaktiviert, Modul aus, Inhalt), Browser `e2e/messages.spec.ts` (anlegen, Fehlermeldung, nächster Termin am richtigen Wochentag, sofort senden über Fake-Discord, löschen).

## Grenzen
- Bis zu einer Minute Verzögerung (plus Zustellung der Warteschlange); keine Bilder-Uploads, nur Links.
