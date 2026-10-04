# Phase 43 – Globale Suche und Benachrichtigungs-Center

**Stand:** abgeschlossen (2026-10-04). Siebte Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 13 und 14). Die Schalter `showSearch`/`showNotifications` im Header-Modell haben jetzt eine Funktion.

## Umfang
- **Globale Suche** (`GET design/search?q=`): Tickets (nach Nummer `#4711`/`4711` oder Betreff), **Transcripts** (geschlossene Tickets), Bewerbungen (`SUB-0007`/`sub7`, Name), Teammitglieder (Name, Dienstnummer, Discord-ID). Dazu **Seiten des Dashboards** (lokal aus dem Menü, ohne Server). Mindestens 2 Zeichen, höchstens 60, höchstens 5 Treffer je Gruppe.
- **Rechte serverseitig:** Tickets/Transcripts brauchen `tickets.view`, Bewerbungen `applications.submissions.view`, Teammitglieder `personnel.view`. Eine Gruppe wird ohne Recht weder durchsucht noch erwähnt – auch kein „3 Treffer ausgeblendet“. Alle Abfragen sind auf den Server (Guild-ID) begrenzt.
- **Bedienung:** Feld im Header, Strg/Cmd+K fokussiert, ↑/↓ wählen, Enter öffnet, Esc schließt; 250 ms Verzögerung gegen Abfragen bei jedem Tastendruck; Zustände „Suche …“, „Keine Treffer“, „deaktiviert“, „nicht erreichbar“.
- **Benachrichtigungen** (`GET design/notifications`) aus dem Audit-Log: 🎫 Neues Ticket, 📋 Neue Bewerbung, 🟢 angenommen, 🔴 abgelehnt, ⚠️ Ticket wartet, 👥 Teamänderung, ⚙️ Systemeinstellungen geändert. Letzte 14 Tage, höchstens 30; Texte nennen Nummer und Betreff bzw. Name, keine internen Daten. Jede Art braucht das passende Recht (`tickets.view`, `applications.submissions.view`, `personnel.view`, `config.view`).
- **Glocke:** Zähler ungelesen, Liste, Klick öffnet die Stelle, „Alle gelesen“. Der Lesestatus liegt im Browser (je Server). Abfrage alle 60 s, nur bei sichtbarem Tab. Animation folgt der Einstellung „Benachrichtigungs-Animation“.
- **Editor** (Tab Navigation → Header): „Globale Suche aktivieren“, „Benachrichtigungen anzeigen“ und die Auswahl der angezeigten Arten (Einstellung `header.notificationTypes`); die Vorschau zeigt 🔍 und 🔔.
- **Abschalten gilt auch auf dem Server:** Ist die Suche ausgeschaltet, antwortet `search` mit 403; ist die Glocke aus oder die Art abgewählt, liefert `notifications` nichts dazu.

## Beim Testen gefundene und behobene Punkte
1. **Art-Prüfung mit `in`:** `'__proto__' in objekt` ist wahr – ein manipulierter Art-Name wäre durch die Prüfung gekommen und hätte die Datenbankabfrage zerlegt. Geprüft wird jetzt gegen die feste Liste der Arten; die Konfiguration bereinigt ohnehin auf diese Liste.

## Tests
- `@nexus/design`: 104 (10 neu in `search.test.ts`: Suche über 4 Gruppen mit zwei Servern, Nummern-Formate, Rechte je Gruppe, Sonderzeichen/SQL-Versuche/500 Zeichen, 5-Treffer-Grenze, Zuordnung Audit-Aktion → Art, Texte, Arten-Auswahl, 14 Tage/30 Einträge, `__proto__`).
- API-E2E: 26 (neu: Suche/Glocke je Recht, abgewähltes/ausgeschaltetes Verhalten, 403 bei deaktivierter Suche).
- Browser (`design-search.spec.ts`): Strg+K, Treffer nach Gruppen, Klick/Enter, Dienstnummer, Seiten-Treffer, „Keine Treffer“, Esc; Glocke mit Zähler, Liste, „Alle gelesen“, Lesestatus bleibt nach Neuladen, Klick öffnet Tickets; im Design Suche und eine Art ausschalten → Feld verschwindet, Server liefert 403 bzw. nichts. Testdaten legt `e2e/prepare-db.mts` an.

## Grenzen
- **Lesestatus nur im Browser:** auf einem anderen Gerät sind Ereignisse wieder „ungelesen“. Kein Push, kein Ton, keine E-Mail.
- Die Glocke zeigt nur, was das Audit-Log kennt; „Ticket wartet“ erscheint, wenn der Bot/Worker die Erinnerung (`ticket.ping`) auslöst.
- Gesucht wird in Betreff, Nummern, Namen und Dienstnummern – **nicht im Inhalt** von Tickets oder Transcripts (Nachrichtentexte).
- Suche über Discord-Benutzer ohne Personalakte („Benutzer“) ist nicht umgesetzt; Teammitglieder sind die Personalakten.
- Teilstring-Suche (`contains`) auf Tabellen mit Index nur auf `guildId`; bei sehr großen Servern (Zehntausende Tickets) wäre ein Volltextindex nötig.
- Eigene Webfonts und Berechtigungs-Oberfläche auf Seitenebene fehlen weiterhin.
