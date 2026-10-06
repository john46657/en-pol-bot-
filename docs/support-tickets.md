# Support-Ticket-System

Ein komplett im Dashboard konfigurierbares Ticket-System für den Discord-Bot. **Nichts ist fest eingebaut** – Panels, Kategorien, Fragen, Buttons, Texte, Rollen, Channels, Status, Prioritäten und Schließgründe liegen in der Datenbank und werden unter **Operations → Support Tickets** verwaltet. Der Bot führt nur aus, was das System entscheidet. Rechte und Protokoll prüft bzw. schreibt immer das System.

*Hinweis:* „Tickets“ (`/tickets`) im System sind Strafzettel; Support-Tickets heißen intern `SupportTicket` und leben unter `/support-tickets`.

## Einrichten (in 5 Minuten)

1. **Discord Developer Portal → Bot:**
   - **Message Content Intent** einschalten, damit der Bot Nachrichten in Ticket-Channels für Dashboard und Transcript mitschneiden kann. Ohne den Intent startet der Bot trotzdem: Tickets funktionieren, aber der Verlauf bleibt leer.
   - Bot-Rechte: *View Channels*, *Send Messages*, *Embed Links*, *Attach Files*, *Read Message History*, **Manage Channels** und **Manage Roles** (Kanalrechte setzen). Die Bot-Rolle muss über den Team-Rollen stehen.
2. **Web → Administration → Settings → Discord:** die *Guild ID* (Server-ID) eintragen. Sie wird nur fürs Öffnen von Tickets aus dem Dashboard gebraucht.
3. **Support Tickets → Statuses & priorities:** Status, Prioritäten und vorgefertigte Schließgründe anpassen (Startwerte sind angelegt).
4. **Support Tickets → Categories:** Kategorie(n) anlegen. Die Startkategorie heißt *Support*.
   - Discord-Kategorie und Team-Rollen eintragen (Rechtsklick → *ID kopieren*; dafür in Discord den Entwicklermodus einschalten).
5. **Support Tickets → Panels:** Panel bearbeiten, Ziel-Channel eintragen, speichern, dann **Send to Discord**. Nach Änderungen: **Update in Discord** (bearbeitet dieselbe Nachricht).

**Mehrere Server:** Panels und Ticket-Arten haben ein Feld *Server*. Leer = auf allen Servern; mit Server = nur dort (auch bei `/support`). Ist oben links ein Server gewählt, zeigt das Dashboard nur dessen Tickets, Panels und Ticket-Arten; neue werden automatisch diesem Server zugeordnet. Status, Prioritäten und Gründe sind für alle Server gemeinsam.

## Ablauf

Ticket öffnen geht auf zwei Wegen:
- **Panel**: Button bzw. Dropdown in einem Channel (im Dashboard unter *Panels* gesendet).
- **`/support`** überall auf dem Server: gibt es nur eine passende Ticket-Art, wird das Ticket sofort geöffnet, sonst kommt eine Auswahl. Team-Mitglieder mit `ticket.create` öffnen mit **`/support mitglied:@…`** ein Ticket für jemand anderen. Dabei gelten keine Rollen-, Limit- und Cooldown-Prüfungen, und das Ticket gilt als vom Team geöffnet.


1. Ein Mitglied klickt im Panel auf einen Button oder wählt im Dropdown eine Kategorie.
2. Das System prüft:
   - ob die Kategorie aktiv ist,
   - die Rollen für Panel und Kategorie,
   - die erlaubten Benutzer,
   - das Limit offener Tickets,
   - den Cooldown.

   Danach legt der Bot einen **privaten Channel** an, mit dem Namensformat der Kategorie und ihren Platzhaltern. Sehen und schreiben können: Ersteller, Team-Rollen, Zusatzrollen und der Bot.
3. Im Channel erscheint die **Ticket-Nachricht**:
   - Titel und Text der Kategorie,
   - Status, Priorität und Bearbeiter,
   - die konfigurierten Buttons.

   Erwähnt werden der Ersteller und, falls eingestellt, die Team-Rollen.
4. Gibt es **Fragen**, stellt der Bot sie nacheinander im Ticket. Fragetypen:
   - kurze Antwort, lange Antwort,
   - Ja/Nein,
   - Auswahl, Mehrfachauswahl.

   Optionale Fragen haben „Überspringen“. Antworten nimmt nur der Ersteller an; sie erscheinen im Dashboard und im Transcript.
5. Das Team arbeitet über die Buttons. **Jede Aktion hat ein eigenes Recht**; der Klick läuft mit den Rechten des verknüpften Kontos. Die Ticket-Nachricht aktualisiert sich jedes Mal.
6. **Schließen:**
   - Je nach Kategorie ohne Grund, mit optionalem oder mit erforderlichem Grund – aus vorgefertigten Gründen, als eigener Text oder beides.
   - Der Ersteller kann sein Ticket selbst schließen, wenn die Kategorie das erlaubt.
   - Beim Schließen wird die „CLOSED“-Anzeige gepostet (Text in *General*). Falls eingestellt, werden außerdem der Zugriff des Erstellers entfernt, ein Transcript erstellt und eine Bewertungs-DM verschickt.
   - Der Channel wird nach der eingestellten Zeit gelöscht – vorher wird ein Transcript gespeichert.
7. **Wieder öffnen** (falls erlaubt) stellt Zugriff und Status wieder her.

## Aktionen und Rechte

| Aktion | Recht |
|---|---|
| Ansehen (Dashboard) | `ticket.view` |
| Ticket aus dem Dashboard für ein Mitglied öffnen | `ticket.create` |
| Übernehmen / Freigeben | `ticket.claim` |
| Schließen / Wieder öffnen / Löschen | `ticket.close` / `ticket.reopen` / `ticket.delete` |
| Benutzer oder Rollen hinzufügen (auch befristet) / entfernen | `ticket.add_user` / `ticket.remove_user` |
| Status / Priorität / Kategorie ändern | `ticket.change_status` / `ticket.change_priority` / `ticket.change_category` |
| Umbenennen / in andere Discord-Kategorie verschieben | `ticket.rename` / `ticket.move` |
| Sperren (Ersteller kann nicht schreiben) | `ticket.lock` |
| Eskalieren (Zusatzrollen, Priorität, Status, Meldung) | `ticket.escalate` |
| Transcript erstellen und ansehen / löschen | `ticket.transcript` / `ticket.transcript_delete` |
| Interne Notizen (nie für den Ersteller sichtbar) | `ticket.internal_notes` |
| Bewertung anfragen | `ticket.rate` |
| Alle Kategorien unabhängig von Zugriffsrollen | `ticket.manage` |
| Einrichtung (Panels, Kategorien, Status …) | `ticket.settings` |

Startrollen:
- *Ticket Support*: Ticket-Arbeit ohne Löschen und Einstellungen.
- *Ticket Leitung*: alle `ticket.*`-Rechte.
- *Police Administration*: bei neuen Installationen alle Ticket-Rechte.

Pro Kategorie lässt sich mit *Dashboard access: system roles* festlegen, welche Systemrollen die Tickets sehen. Pro Priorität: welche Rollen sie setzen dürfen und welche Discord-Rollen dabei benachrichtigt werden.

**Übernehmen-Modi:**
- *Nur ein Bearbeiter*
- *Mehrere Bearbeiter*
- *Hauptbearbeiter + Helfer*: Der erste ist Hauptbearbeiter.

## Dashboard

- **Tickets:**
  - Liste mit Filtern: offen, geschlossen, eskaliert, archiviert, gelöscht; Kategorie, Status, Priorität, „von mir übernommen“, Ersteller, Zeitraum und Suche (Name, Ersteller, `#Nummer`).
  - Detailansicht:
    - Antworten, kompletter Nachrichtenverlauf (mit Anhängen bis 8 MB, gespeichert unter `STORAGE_DIR/tickets`), interne Notizen, Protokoll aller Aktionen, Zugriffe, Transcripts und Bewertung.
    - Alle Aktionen als Buttons (nur die, für die man das Recht hat).
- **Transcripts:** suchen und filtern (Kategorie, Status, Ersteller, Bearbeiter, Zeitraum), öffnen, herunterladen, löschen. Die HTML-Datei ist eigenständig, mit eingebetteten Bildern, und wird in einer Sandbox angezeigt.
- **Ratings:** Durchschnitt, positive und negative Bewertungen, je Bearbeiter und je Kategorie, alle Kommentare.
- **Statistics:**
  - Tickets gesamt, offen, geschlossen; heute, Woche, Monat.
  - Ø erste Antwort, Ø Bearbeitungszeit, Eskalationen.
  - Tickets je Kategorie, aktivste Bearbeiter, Bewertungen.
- **Panels** (Panel-Builder mit Live-Vorschau wie in Discord):
  - Name, Titel, Beschreibung, Emoji, Farbe, Autor, Thumbnail, Banner/Bild, Footer.
  - Buttons oder Dropdown, Kategorien mit Reihenfolge, sichtbar für Rollen, Ziel-Channel.
  - Erstellen, bearbeiten, duplizieren, löschen, senden, aktualisieren.
- **Categories** (alles mit Vorschau der Ticket-Nachricht):
  - Allgemeines, Discord-Channel, Wer darf öffnen und Limits.
  - Fragen (hinzufügen, ändern, sortieren, Pflicht/optional), Ticket-Nachricht, Buttons (an/aus, Text, Emoji, Farbe, Reihenfolge).
  - Übernehmen, Schließen, Transcript und Bewertung, Automatik, Eskalation.
- **Statuses & priorities:** eigene Status (offen/geschlossen/archiviert, Rolle als Standard / beim Übernehmen / beim Eskalieren / beim Schließen), Prioritäten mit Farbe, vorgefertigte Schließgründe.
- **General:** Log-Channel (jede Aktion), Standard-Transcript-Channel, Aufbewahrung der Transcripts, CLOSED-Anzeige (Titel, Text, Farbe), Texte für Wieder-öffnen und Bewertung.

## Automatik (läuft jede Minute in der API)

- **Auto-Close** nach Inaktivität, mit optionaler Warnung vorher. Eine neue Nachricht setzt die Zeit zurück.
- **Auto-Delete** nach dem Schließen (Transcript vorher).
- **Befristeter Zugriff** läuft ab und wird entfernt.
- **Transcripts** werden nach den eingestellten Tagen gelöscht.

## Platzhalter

`{user}` `{username}` `{user_id}` `{ticket_id}` `{category}` `{staff}` `{status}` `{priority}` `{reason}` `{closed_by}` `{created_at}` `{closed_at}` `{channel}` `{actor}` – gelten in allen Ticket-Texten und im Channel-Namen. Unbekannte Platzhalter bleiben sichtbar stehen, damit Tippfehler auffallen. Die Liste steht auch im Dashboard.

## Technik

- Das System ist die einzige Stelle mit Regeln (`apps/api/src/support-tickets`). Es liefert **Effekte** (Channel anlegen, Rechte, Umbenennen, Posten, Ticket-Nachricht aktualisieren, DM, Transcript, Löschen, Panel), die der Bot ausführt (`apps/bot/src/discord-tickets.ts`).
  - Klicks in Discord bekommen die Effekte direkt zurück.
  - Aktionen aus dem Dashboard und der Automatik laufen über die Outbox (`ticket.effects`).
- Der Bot löscht nur Channels, die das System als Ticket-Channel kennt.
- Erwähnungen pingen nur ausdrücklich gewünschte Benutzer und Rollen, nie `@everyone`/`@here`.
- API:
  - Dashboard: `GET /support-tickets` (Filter), `GET /support-tickets/:id`, `POST /support-tickets/:id/actions`, `GET /support-tickets/stats|ratings|transcripts`.
  - Konfiguration: `GET /support-tickets/config`, CRUD unter `/support-tickets/{categories,panels,statuses,priorities,reasons}`, `PUT /support-tickets/settings`, `POST /support-tickets/panels/:id/publish`.
  - Bot-Dienst unter `/bot/support-tickets/*`.
