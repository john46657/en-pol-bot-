# Support-Ticket-System

> **Derzeit ausgeschaltet:** Das Modul ist global deaktiviert und ausgeblendet (`off: true` in `packages/shared/src/modules.ts`). Code und Daten bleiben erhalten; Menüpunkt, Rechte (`ticket.*`), API-Zugriffe mit Server und der Befehl `/support` sind gesperrt. Zum Einschalten `off: true` entfernen.

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
  - Übernehmen, Schließen, Transcript und Bewertung, Automatik.
- **Statuses & priorities:** eigene Status (offen/geschlossen/archiviert, Rolle als Standard / beim Übernehmen / beim Eskalieren / beim Schließen), Prioritäten mit Farbe, vorgefertigte Schließgründe.
- **General:** Log-Channel (jede Aktion), Standard-Transcript-Channel, Aufbewahrung der Transcripts, CLOSED-Anzeige (Titel, Text, Farbe), Texte für Wieder-öffnen und Bewertung.

## Automatik (läuft jede Minute in der API)

- **Auto-Close** nach Inaktivität, mit optionaler Warnung vorher. Eine neue Nachricht setzt die Zeit zurück.
- **Auto-Delete** nach dem Schließen (Transcript vorher).
- **Befristeter Zugriff** läuft ab und wird entfernt.
- **Transcripts** werden nach den eingestellten Tagen gelöscht.
- **Auto-Team-Alert** (Kategorie → Automation): Bearbeiter wird nach X Minuten Inaktivität markiert; passiert dann X Minuten nichts, wird das Ticket freigegeben.
- **Auto-Unclaim** nach X Minuten Inaktivität.

## Wie bei GalaxyBot
- **Claim-Kategorie**: übernommene Tickets wandern in eine eigene Discord-Kategorie (nach dem Freigeben zurück).
- **Chat nach Übernahme einschränken**: nur Bearbeiter, Ersteller und die Zusatzrollen schreiben; nach dem Freigeben wieder alle Supporter.
- **Auto-Claim**: das erste Teammitglied (mit `ticket.claim`), das im Ticket schreibt, übernimmt.
- **Schließen anfragen** (Button `close_request`, bei bestehenden Kategorien unter *Buttons → Add button* hinzufügen): der Ersteller bekommt *Ja, schließen* / *Nein, offen lassen*; mit „Close request“ an wird bei *Ja* sofort geschlossen.
- **Ersteller darf Personen hinzufügen** (Kategorie → Who may open).
- **Ticketauslastung**: *Capacity* je Kategorie und im Panel *Show ticket load* – das Panel zeigt 🟢/🟡/🔴 mit offenen Tickets und aktualisiert sich bei jedem Öffnen/Schließen.
- **Bild im Eröffnungs-Embed** (Kategorie → Ticket message → Image).
- **Fragen**: Beschreibung sowie Mindest-/Höchstzahl an Zeichen (wird im Discord-Formular und im System geprüft).
- **Bewertungen**: Team-Channel (alle Angaben) und öffentlicher Channel (nur die gewählten Werte: Ersteller, Kategorie, Bearbeiter, Bearbeitungszeit, Kommentar) unter *General → Ratings*.
- **Aktion beim Verlassen des Servers** (*Allgemein → Wenn der Ersteller den Server verlässt*): offene Tickets des Erstellers auf diesem Server automatisch schließen, mit einstellbarem Grund (wie beim Schließen von Hand: CLOSED-Anzeige, Transcript, Log). Braucht den *Server Members Intent*.

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

## Premium-Erweiterung (Ticket-Center)

Erweitert das bestehende System – keine zweite Anwendung, kein zweiter Bot. Alle bisherigen Kategorien, Tickets, Transkripte und Einstellungen bleiben unverändert erhalten (Migration `20261117100000_ticket_premium` ist rein additiv).

### Standardkonfiguration (einmalig, nichts wird überschrieben)
Beim Start (`seed`) werden – nur falls noch nicht vorhanden (gleicher Name) – angelegt:
- **8 Kategorien:** Beschwerden · Support und technische Probleme · Allgemeine Fragen · Bewerbungen und Personalangelegenheiten · Leitung und vertrauliche Anliegen · Vorschläge und Verbesserungen · Partnerschaften und externe Anfragen · **Sonstiges** (verbindliches Formular: Betreff max. 100, „Worum geht es?“ 7 Optionen, Beschreibung 10–2000 mit Hilfetext, optional Betroffener Bereich, Zusätzliche Informationen max. 2000, Anhang/Screenshot).
- **Abteilungen:** Allgemeiner Support, Technik, Personalabteilung, Beschwerdestelle, Leitung, Öffentlichkeitsarbeit – **ohne Discord-Rollen** (siehe „Noch zu konfigurieren“).
- **Panel „Ticket-Center“** (Dropdown mit allen 8 Kategorien) – noch nicht gesendet.
- Fehlende **Lebenszyklus-Status** (Offen, Übernommen, In Bearbeitung, Wartet auf Nutzer, Wartet auf interne Rückmeldung, Gelöst, Geschlossen, Archiviert) und Prioritäten (Niedrig, Normal, Hoch, Dringend). Vorhandene Status behalten Name und Schalter und bekommen nur eine feste Bedeutung.
Gelöschte Standard-Einträge kommen nicht zurück (Merker `tickets.premiumSeeded`).

### Ticket-IDs
Jedes Ticket hat die dauerhafte ID **`EMD-000123`** (fortlaufende Nummer, nie wiederverwendet; Präfix unter *Allgemein*). Platzhalter `{ticket_ref}`. Suche im Ticket-Center nach `EMD-000123`, `#123` oder `123`.

### Formulare vor dem Erstellen
Kategorie → *Formular* → „Discord-Formular vor dem Erstellen“ (neue Kategorien) oder „Nacheinander im Ticket-Kanal“ (bisheriges Verhalten, Standard für bestehende Kategorien).
- Feldtypen: kurzer/mehrzeiliger Text, Auswahl, Mehrfachauswahl, Ja/Nein, Bestätigung (Kontrollkästchen – in Discord als Auswahlmenü), Zahl (min/max), Datum (TT.MM.JJJJ), Anhang (Discord-Datei-Upload im Formular; Bilder/PDF/Text, je max. 8 MB, höchstens 1–10 Dateien).
- Je Feld: ID, Bezeichnung, Hilfetext, Pflicht, Platzhalter, Reihenfolge, Zeichen-/Wertgrenzen, Optionen, aktiv/deaktiviert.
- Discord erlaubt **höchstens 5 Eingaben je Formular** → das System teilt automatisch in Schritte (Button „Weiter (Schritt 2/2)“). Ungültige Eingaben: Hinweis mit „Erneut ausfüllen“ (Werte bleiben vorausgefüllt). Entwürfe verfallen nach 30 Minuten.
- Gleiche Prüfung im Browser (Vorschau) und auf dem Server (`packages/shared/src/ticket-premium.ts`). **Formular testen** in der Kategorie prüft ohne Ticket.
- **Versionen:** jede gespeicherte Änderung der Felder = neue Version (*Formular-Versionen anzeigen*). Tickets speichern Antworten mit Bezeichnung und Version – spätere Änderungen verändern alte Tickets nicht.
- Panels: Kategorien mit Formular öffnen das Discord-Formular direkt nach der Auswahl. Dropdown-Panels mit mehr als 25 Kategorien werden auf mehrere Menüs verteilt (bis 100); Buttons höchstens 25 (Discord-Limit). Schlägt das Senden fehl (Kanal weg, Rechte fehlen), steht der Grund am Panel.

### Schutz vor Doppelungen und Limits
- Dieselbe Discord-Interaktion bzw. derselbe Formular-Entwurf erzeugt nie zwei Tickets (eindeutiger Schlüssel + Sperre je Nutzer); Doppelklick-Schutz 10 s.
- *Allgemein → Offene Tickets je Nutzer insgesamt* zusätzlich zum Limit je Kategorie. Recht `ticket.bypass_limits` (bzw. `ticket.manage`) hebt Limits und Cooldown auf.

### Abteilungen, Zuständigkeit, Vertraulichkeit
- Kategorie → Abteilung; die Discord-Rollen von Kategorie **und** Abteilung sehen/bearbeiten das Ticket. *Dashboard-Zugriff: Systemrollen* von Kategorie und Abteilung bestimmen, wer es im Dashboard sieht.
- **Vertraulich:** ohne Zugriffsrollen nur `ticket.manage`; nie ersatzweise die allgemeine Staff-Rolle. Fehlt die Zuständigkeit, sieht den Discord-Kanal nur der Ersteller plus die *Ersatz-Rollen für vertrauliche Tickets* – mit sichtbarem Hinweis im Log-Kanal und Audit. Log- und Benachrichtigungskanäle zeigen nur Ticket-ID und Art des Ereignisses. In eine nicht vertrauliche Kategorie verschieben darf nur `ticket.manage`.
- **Zuweisen** (`ticket.assign`): nur an Teammitglieder mit verknüpftem Konto, `ticket.claim` und Zugriff auf die Kategorie. **Abteilung wechseln** (`ticket.change_department`): Kanalrechte werden umgestellt, Bearbeiter ohne Zugriff entfernt.

### Lebenszyklus und Aktionen
Statuswechsel prüft das System zentral: Schließen nur über „Schließen“, Archivieren nur geschlossener Tickets (`ticket.archive`), archivierte Tickets öffnen nur mit Archiv-Recht. **Rückfrage an Nutzer** (Dashboard) setzt „Wartet auf Nutzer“; schreibt der Ersteller, geht es automatisch auf „In Bearbeitung“ zurück (Bearbeiter werden höchstens alle X Minuten benachrichtigt). Archivieren löscht nichts.

### SLA, Erinnerungen, Eskalation
*Status & SLA*: Zielzeiten je Priorität (erste Antwort, Lösung) – **ohne Eintrag keine Frist**. Die Lösungsfrist ruht, solange auf den Nutzer gewartet wird. Überfällige Tickets: Warteschlange „Überfällig“, Erinnerung an die Bearbeiter (DM) bzw. den Abteilungskanal, wiederholt nach Einstellung; danach einmalig Meldung an die Leitung (Abteilung → Leitung, sonst *Allgemein → Leitung*). Unzugewiesene Tickets: *Kategorie → Unzugewiesen an die Leitung melden nach …*. Eskalationen geben **niemandem** zusätzlichen Zugriff.

### Benachrichtigungen
*Allgemein → Benachrichtigungen*: je Ereignis (neues Ticket, Übernahme, Zuständigkeit, Nutzernachricht, Rückfrage, Priorität, Eskalation, Schließen, Wiedereröffnung, Transkript fertig/fehlgeschlagen) Kanal (interner Kanal der Abteilung) / DM an Bearbeiter / Dashboard-Glocke. Empfänger sind nur Berechtigte.

### Online-Transkripte
- Beim Schließen entsteht ein **Hintergrund-Auftrag** (alle 15 s abgearbeitet, auch nach Neustarts; max. 5 Versuche mit Wartezeit, danach „fehlgeschlagen“ + Hinweis, „Erneut versuchen“ mit `ticket.transcript_manage`). Der Verlauf liegt bereits in der Datenbank – fehlschlagende Erstellung verliert keine Nachrichten. Jede Erstellung ist eine neue **Version**; derselbe Abschluss erzeugt nie zwei Aufträge.
- Formate: sichere HTML-Ansicht (Sandbox, keine Skripte, escaped), **TXT**, **JSON** (nur Mitarbeiter mit `ticket.transcript_export`), mit **SHA-256** der Transkriptdaten.
- **Adresse:** `https://<deine-domain>/transcript/EMD-000123` (z. B. `https://tnnyq4svmz.apps.bot-hosting.cloud/transcript/EMD-000123`). Die Seite gehört zum Dashboard (gleicher Port, keine Hosting-Änderung nötig). **Der Link allein gewährt keinen Zugriff:** bei jedem Abruf prüft das System Anmeldung, Recht und Zugriff auf genau dieses Ticket (Mitarbeiter) bzw. ob es das eigene Ticket ist (Ersteller mit verknüpftem Discord-Konto – nur Ansicht/TXT). Unberechtigte erhalten dieselbe Antwort wie bei nicht vorhandenen IDs; Versuche landen im Audit. Antworten: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, Rate-Limit 60/min. Interne Notizen und interne Ereignisse erscheinen nie im Transkript.
- In Discord wird das Transkript (falls eingestellt) als Datei mit Button „Online ansehen“ gesendet. Nach „Mit Discord anmelden“ landet man direkt wieder auf dem Transkript.

### Audit
Ticket-Aktionen, Konfigurationsänderungen, Transkript-Abrufe/-Exporte und abgelehnte Zugriffe stehen im unveränderlichen Audit-Protokoll (Tab *Audit*, Recht `ticket.audit`) mit Korrelations-ID – nur Metadaten, keine Notiztexte, Gründe oder Nachrichten.

### Rechte (neu)
| Vorschlag | Umsetzung | bestehende Rollen bekommen es, wenn sie … hatten |
|---|---|---|
| tickets.view / view_assigned / create | `ticket.view` (+ Sichtbarkeitsregeln) / `ticket.create` | – |
| tickets.claim / assign | `ticket.claim` / **`ticket.assign`** | `ticket.manage` |
| tickets.change_status / priority / category | `ticket.change_status` / `ticket.change_priority` / `ticket.change_category`, **`ticket.change_department`** | `ticket.change_category` |
| tickets.add_internal_note / close / reopen | `ticket.internal_notes` / `ticket.close` / `ticket.reopen` | – |
| tickets.archive | **`ticket.archive`** | `ticket.change_status` (Archivieren ging bisher darüber) |
| tickets.transcript.view / export / manage | `ticket.transcript` / **`ticket.transcript_export`** / **`ticket.transcript_manage`** | `ticket.transcript` |
| tickets.categories/forms/panels/settings.manage | `ticket.settings` | – |
| tickets.departments.manage | **`ticket.departments`** | `ticket.settings` |
| tickets.audit.view | **`ticket.audit`** | `ticket.manage` |
| (Limits umgehen) | **`ticket.bypass_limits`** | `ticket.manage` |

### Noch zu konfigurieren (manuell)
1. *Abteilungen*: Discord-Rollen (zuständig, Leitung), interner Benachrichtigungs-Kanal, ggf. Dashboard-Zugriffsrollen – besonders für Beschwerdestelle, Personalabteilung und Leitung (vertraulich).
2. *Allgemein*: Ersatz-Rollen für vertrauliche Tickets, Leitung, Log-/Transkript-Kanal, optional „Tickets nur auf diesem Discord-Server“.
3. *Status & SLA*: Zielzeiten je Priorität (bewusst leer – keine erfundenen Fristen).
4. *Panels*: „Ticket-Center“ einen Kanal geben und **An Discord senden**.
5. Discord Developer Portal: *Message Content Intent* (Verlauf/Transkript), Bot-Rechte *Kanäle verwalten*, *Rollen verwalten*; Discord-Login (`DISCORD_CLIENT_SECRET`), damit Ersteller ihr Transkript online öffnen können.

### Bekannte Einschränkungen
- Nachrichten, die geschrieben werden, während der Bot offline ist, fehlen im Verlauf (der Bot schneidet live mit; kein nachträgliches Einlesen).
- „Kontrollkästchen“ erscheint im Discord-Formular als Auswahlmenü mit einer Option.
- Ticket-Einstellungen gelten – wie bisher – je Discord-Server (gewählter Server im Dashboard bzw. Server der Bot-Anfrage).
- Echte Discord- und Hosting-Tests wurden nicht durchgeführt; geprüft mit automatisierten Tests (gemockte Discord-Aufrufe) und einem lokalen Durchlauf (API + Web wie im Hosting, Browser).
