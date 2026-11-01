# Support-Ticket-System

> **Eingeschaltet** (wieder aktiv seit der Ticket-System-Erweiterung). Je Server lässt sich das Modul unter *Server → Module* weiterhin ausschalten. Neu: [Ticket-System-Erweiterung](#ticket-system-erweiterung-galaxybot-funktionsumfang).

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


## Ticket-System-Erweiterung (GalaxyBot-Funktionsumfang)

Eigenständige EN | POLIZEI-Umsetzung des Funktionsumfangs von GalaxyBots Ticket-Modul (kein fremder Code, keine fremden Assets). Erweitert das bestehende System – gleiche Tabellen, gleicher Bot, gleiches Dashboard (*Operations → Support-Tickets*). Migration `20261201100000_ticket_suite` ist rein additiv.

### Dashboard – Bereiche
| Reiter | Inhalt |
|---|---|
| **Übersicht** | offen, geschlossen, in Bearbeitung, nicht zugewiesen, Ø erste Antwort, Ø Bearbeitungszeit, Ø Bewertung, Tickets je Kategorie mit Auslastung |
| **Tickets** | alle Tickets mit Filtern (Status, Kategorie, Abteilung, Priorität, Ersteller, **Bearbeiter (mir / Discord-ID)**, Zeitraum, Suche); Detailansicht mit Verlauf, Notizen, Protokoll, Transkripten |
| **Transkripte** | Suche/Filter, Öffnen, Download – Team sieht die Team-Fassung (mit Notizen) |
| **Bewertungen** | Durchschnitt, positiv/negativ, je Mitarbeiter/Kategorie, Verlauf je Monat, alle Einzelbewertungen inkl. Formularantworten |
| **Statistik** | Gesamt, heute/Woche/Monat, **Tickets pro Tag (30) und Woche (12)**, Ø/**Median/p90** der ersten Antwort und der Bearbeitungszeit, Tickets pro Mitarbeiter, Auslastung je Kategorie, **Aktivitäts-Heatmap** (Wochentag × Stunde, Zeitzone der Organisation), **Ranglisten** (meiste Tickets, meiste geschlossen, schnellste erste Antwort, beste Bewertung ab 3) – alles aus gespeicherten Tickets berechnet |
| **Panels** | erstellen, bearbeiten, duplizieren, **aktivieren/deaktivieren**, veröffentlichen / in Discord aktualisieren, Kanal wählen; löschen nur ohne Tickets |
| **Kategorien** | erstellen, bearbeiten, sortieren (↑/↓), aktivieren/deaktivieren, archivieren, Rollen, Zusatzpersonen, Auslastungsgrenzen |
| **Formulare** | je Kategorie drei Formulare: **beim Öffnen**, **beim Schließen**, **bei der Bewertung**; Felder hinzufügen, Typ, Pflicht, Min./Max. Zeichen, Auswahlmöglichkeiten, Reihenfolge, **Formular testen** |
| **Automatisierungen** | Standardwerte je Panel, je Kategorie eigene Werte oder Panel-Werte übernehmen |
| Abteilungen · Status & SLA · Allgemein | wie bisher; *Allgemein → Bewertungen*: Skala, öffentliche Mindestbewertung |

### Panels
Je Panel: Name, **interne Beschreibung**, Kanal, Embed (Titel, Beschreibung, Farbe, Thumbnail, Bild/Banner, Footer, Autor), Buttons oder Dropdown, **Kanalname-Format** (überschreibt das der Kategorie), **Team-Erwähnung** (Rollen – gepingt werden nur Rollen mit Zugriff auf das Ticket), **gleichzeitige Tickets je Nutzer über dieses Panel**, sichtbar für Rollen, **aktiv/inaktiv**, Automatik-Standardwerte.
- Deaktivieren sperrt die Auswahl in der bereits veröffentlichten Nachricht sofort (Nachricht wird neu gezeichnet) – das System lehnt Öffnungen über ein deaktiviertes Panel zusätzlich ab.
- Über ein Panel können nur Kategorien geöffnet werden, die im Panel stehen (manipulierte Interaktionen werden abgelehnt).
- Panels, über die schon Tickets geöffnet wurden, lassen sich nicht löschen → deaktivieren (Historie bleibt zugeordnet).

### Kategorien
Neu je Kategorie: **zusätzliche berechtigte Personen** (sehen + schreiben in jedem Ticket), **Auslastungsgrenze** mit Verhalten bei voller Auslastung: *Neue Tickets verhindern* oder *Trotzdem öffnen, mit Hinweis*; **Schließformular**, **Bewertungsformular**, **wer eine Schließungsanfrage bestätigen muss**, Automatik (eigene Werte oder Panel). Inaktive Kategorien sind nicht mehr wählbar; bestehende Tickets funktionieren weiter.

**Auslastung** (Panel mit „Auslastung anzeigen“): 🟢 unter 80 % · 🟡 ab 80 % · 🔴 ab 100 %. Bei *verhindern* ist die Kategorie im Panel ausgegraut („(voll)“) und das System lehnt neue Tickets ab; `ticket.bypass_limits` umgeht das. Bestehende Kategorien mit Kapazität behalten durch die Migration ihr bisheriges Verhalten (*mit Hinweis*).

### Formulare
Feldtypen u. a.: einzeiliger Text, mehrzeiliger Text, Auswahl (auch Mehrfach, Ja/Nein, Bestätigung), Zahl, Datum, **Datei-Upload** (beim Öffnen). Je Feld: Titel, Beschreibung, Typ, Pflicht, Min./Max. Zeichen, Optionen, Reihenfolge, aktiv.
- **Öffnen:** wie bisher (Discord-Formular, mehrstufig, versioniert).
- **Schließen:** Discord-Formular beim Klick auf „Schließen“ bzw. Felder im Dashboard-Dialog (höchstens 5 Felder, Discord-Limit). Feld-ID `reason` wird Schließungsgrund. Antworten: Detailansicht (nur Team) und Team-Transkript.
- **Bewertung:** Klick auf eine Bewertung in der DM öffnet das Formular; erst mit dem Formular wird gespeichert. Feld-ID `comment` wird Begründung.
- Alle Eingaben prüft der Server (`validateForm`), unabhängig vom Discord-Formular.

### Ticket-Aktionen in Discord
Buttons (je Kategorie unter *Buttons am Ticket* ein-/ausschaltbar; für bestehende Kategorien über *Add button* hinzufügen): Schließen, Schließen anfragen, Übernehmen, Freigeben, Hinzufügen, Entfernen, Transkript, Notiz, Löschen, **Ersteller erinnern**, **Weiterleiten**, **Automatik**.

Slash-Befehle im Ticket-Kanal – **`/ticket`**: `claim`, `unclaim`, `schliessen [grund]`, `anfrage`, `weiterleiten (mitglied | rolle | kategorie) [notiz]`, `hinzufuegen mitglied`, `entfernen mitglied`, `umbenennen name`, `erinnern [text]`, `notiz text`, `automatik modus`, `oeffnen mitglied` (Ticket im Auftrag eines Mitglieds). `/support` bleibt zum Öffnen.

Jede Aktion läuft mit den Rechten des verknüpften Kontos und wird **im System** geprüft (der Bot zeigt nur an). Neue Rechte: `ticket.forward` (Weiterleiten), `ticket.remind` (Ersteller erinnern), `ticket.automation` (Automatik je Ticket). Bestehende Rollen bekommen sie per Migration nur, wenn sie das entsprechende bisherige Recht hatten (`change_category`/`assign` → forward, `claim` → remind, `change_status`/`manage` → automation).

**Claiming:** Anzeige im Ticket-Embed, Schutz vor Doppelübernahme (Modus *Nur ein Bearbeiter*: nur die Leitung übernimmt ein bereits übernommenes Ticket), Claim/Unclaim, Speicherung, Protokoll, optional Claim-Kategorie, optional Auto-Claim bei erster Teamantwort.

**Weiterleiten** an ein Teammitglied (muss verknüpft sein, `ticket.claim` und Zugriff haben), eine Team-Rolle (bekommt Zugriff; bei vertraulichen Kategorien nur durch `ticket.manage`) oder eine andere Kategorie (Kanalrechte werden umgestellt, Bearbeiter ohne Zugriff entfernt, Zusatzpersonen angepasst). Verlauf, Antworten, Notizen und Protokoll bleiben vollständig erhalten. Optionaler Begleittext wird als **interne Notiz** gespeichert.

**Ersteller erinnern:** Nachricht im Ticket + DM, höchstens alle 10 Minuten (Schutz vor doppelten Aktionen).

**Private Teamnotizen:** Autor + Zeitstempel, im Dashboard (Recht `ticket.internal_notes`) und in der **Team-Fassung** des Transkripts. Nie im Discord-Kanal, nie in der Fassung für den Ersteller, nie im Log-Kanal.

### Schließungsanfragen
Kategorie → *Schließungsanfrage bestätigen muss*: Ersteller · zuständiger Mitarbeiter (Bearbeiter, ohne Bearbeiter der anfragende Mitarbeiter) · beide · einer von beiden. Antworten über die Buttons im Ticket bzw. im Dashboard („Als Mitarbeiter bestätigen“). Eine **Ablehnung beendet die Anfrage ohne zu schließen**; sind alle nötigen Bestätigungen da, wird (falls *Schließen nach bestätigter Schließungsanfrage* an ist) geschlossen. Optional: ohne Reaktion nach X Minuten automatisch schließen. Jeder Schritt steht im Protokoll (`close_requested`, `close_request_approved`, `close_request_accepted`, `close_request_declined`).

### Automatisierungen
Je Panel (Standardwerte) und je Kategorie (eigene Werte oder *Panel übernehmen*): automatisch schließen nach Inaktivität (+ Warnung), **Erinnerung an den Ersteller** (Team hat zuletzt geschrieben, einmal je Team-Nachricht), **Team-Erinnerung** (nicht übernommen, keine Teamantwort), Bearbeiter-Erinnerung → Freigabe, Auto-Unclaim, Auto-Claim bei erster Teamantwort, Schließen nach bestätigter Schließungsanfrage, Schließungsanfrage ohne Reaktion → schließen, **automatische Antwort**, wenn das Team nicht reagiert.

Je Ticket: **pausieren** (Dauer) oder **dauerhaft ausschalten** / wieder einschalten (Button *Automatik*, `/ticket automatik`, Dashboard). Der Zustand liegt in der Datenbank (`automationDisabled`, `automationPausedUntil`) und wird bei jedem Lauf gelesen – ein Neustart schaltet nichts ungewollt wieder ein. Die Automatik läuft jede Minute in der API, auch für mehrere Instanzen nur über Datenbank-Zeitstempel (jede Erinnerung höchstens einmal).

### Transkripte
Zwei Fassungen je Version: **für den Ersteller / Discord-Dateien** (ohne Notizen, ohne interne Ereignisse, ohne Schließformular) und **Team-Fassung** (mit internen Notizen, allen Ereignissen, Claim-/Weiterleitungshistorie, Schließformular). Enthalten: Ticket-ID, Name, Kategorie, Ersteller, Bearbeiter, Erstellungs-/Schließungszeit, Nachrichtenverlauf mit Zeitstempeln, Anhänge, eingebettete Bilder, Formularantworten, Bewertung, Schließungsinformationen. Welche Fassung jemand bekommt, entscheidet der Server bei jedem Abruf (Mitarbeiter mit Zugriff → Team-Fassung, Ersteller → ohne Notizen, alle anderen → „nicht gefunden“). Der JSON-Export (nur Team) enthält – wie bisher – keine Notizen; Videos/sonstige Dateien erscheinen als Link (nur mit Dashboard-Zugriff abrufbar).

### Bewertungen
Skala 2–10 (*Allgemein → Bewertungen*; bis 5 als Sterne, darüber als Zahl), optionales Bewertungsformular mit Begründung, interner Bewertungs-Log (alles inkl. Formularantworten), optionaler öffentlicher Log (nur freigegebene Angaben, **nie** Formularantworten, nie vertrauliche Kategorien, erst ab einer Mindestbewertung), Durchschnitt (ältere Bewertungen anderer Skalen werden umgerechnet) und Historie. Eine Bewertung je Ticket, erst nach dem Schließen.

### Ticket-Logs
Log-Kanal unter *Allgemein*. Protokolliert u. a.: erstellt, übernommen, freigegeben, **weitergeleitet**, Nutzer hinzugefügt/entfernt, umbenannt, **Erinnerung versendet**, **Automatik geändert**, Schließungsanfrage, geschlossen, **Bewertung abgegeben**, Auslastungsgrenze überschritten. Vertrauliche Tickets: nur Ticket-ID und Art des Ereignisses. Keine Notiztexte, Nachrichten oder Formularantworten im Log-Kanal oder Audit.

### Setup (Kurzfassung)
1. Developer Portal → Bot: *Message Content Intent* (Verlauf/Transkript), optional *Server Members Intent* (Aktion beim Verlassen).
2. Bot-Rechte auf dem Server (Bot-Rolle **über** den Team-Rollen): siehe Liste unten.
3. Dashboard → *Server → Module*: „Support-Tickets“ ist an (je Server abschaltbar).
4. *Support-Tickets → Kategorien*: Kategorien anlegen (Rollen, Discord-Kategorie, Limits, Auslastung, Zusatzpersonen).
5. *Formulare*: Öffnen-/Schließ-/Bewertungsformular je Kategorie, *Formular testen*.
6. *Automatisierungen*: Panel-Standardwerte und Kategorie-Werte.
7. *Panels*: Panel anlegen, Kategorien zuordnen, Kanal wählen, **An Discord senden**.
8. *Allgemein*: Log-, Transkript-, Bewertungs-Kanäle, Skala.
9. Rollen & Rechte: `ticket.*` an die Team-Rollen vergeben (Startrollen *Ticket Support* / *Ticket Leitung*).
10. Bot neu starten, damit `/ticket` registriert wird (Slash-Befehle werden beim Start je Server nach aktiven Modulen registriert; nach dem Ein-/Ausschalten eines Moduls ebenfalls neu).

### Discord-Berechtigungen des Bots
| Recht | wofür |
|---|---|
| Kanäle ansehen, Nachrichtenverlauf lesen | Ticket-Kanäle, Mitschnitt |
| Nachrichten senden, Links einbetten, Dateien anhängen | Ticket-Nachrichten, Panels, Transkript-Dateien |
| **Kanäle verwalten** | Ticket-Kanäle anlegen, umbenennen, verschieben, löschen |
| **Rollen verwalten** (Berechtigungen) | Kanalrechte je Ticket setzen (privat: `@everyone` darf nicht sehen) |
| Nachrichten verwalten | Ticket-Nachricht aktualisieren |
| Erwähnen von Rollen | nur ausdrücklich konfigurierte Rollen werden gepingt, nie `@everyone`/`@here` |
| Privilegierte Intents | *Message Content* (Verlauf), optional *Server Members* |

### Datenbank (Erweiterung)
| Tabelle | neue Spalten |
|---|---|
| `TicketPanel` | `internalNote`, `active`, `channelNameFormat`, `mentionRoleIds`, `maxOpen`, `automation` (JSON) |
| `TicketCategory` | `extraUserIds`, `capacityAction`, `closeForm`, `ratingForm`, `closeRequestApprovers`, `automationSource`, `creatorReminderMinutes`, `creatorReminderMessage`, `teamReminderMinutes`, `noResponseMinutes`, `noResponseMessage`, `closeRequestTimeoutMinutes` |
| `SupportTicket` | `automationDisabled`, `automationPausedUntil`, `lastCreatorMessageAt`, `lastStaffMessageAt`, `creatorRemindedAt`, `teamRemindedAt`, `noResponseSentAt`, `closeRequestById`, `closeRequestApprovals`, `closeAnswers`; Index auf `panelId` |
| `TicketTranscript` | `staffHtml`, `staffText` (Team-Fassung) |
| `TicketRating` | `scale`, `answers` |
| `Permission` / `RolePermission` | `ticket.forward`, `ticket.remind`, `ticket.automation` (+ Übernahme für bestehende Rollen) |

Alle Tickets, Nachrichten, Notizen, Formularantworten, Bewertungen, Transkripte und Logs hängen über `ticketId` an genau einem Ticket. Nichts wird gelöscht oder umbenannt; deaktivierte/archivierte Panels und Kategorien behalten ihre Tickets. **Backup vor dem Update:** `deploy/update.sh` sichert die Datenbank (`backups/vor-update/`) vor `prisma migrate deploy`; im Panel-Hosting vorher die Datenbank sichern (Dashboard → Backups bzw. Anbieter).

### Tests
`apps/api/test/support-tickets-suite.test.ts` (19 Integrationstests gegen PostgreSQL), `apps/bot/tests/ticket-suite.test.ts` (Buttons, Formulare, `/ticket`), `packages/shared/tests/ticket-suite.test.ts` (Auslastung, Automatik, Bestätigungen, Skala, Median/p90, Zeitzonen). Die bisherigen Ticket-Tests laufen unverändert weiter.

### Bekannte Einschränkungen
- **Nicht gegen echtes Discord getestet** – Discord-Aufrufe sind in den Tests nachgebildet; die API-Tests laufen gegen eine echte PostgreSQL-Datenbank.
- Discord-Formulare haben höchstens 5 Felder → Schließ- und Bewertungsformular höchstens 5 Felder; Datei-Uploads nur im Formular beim Öffnen.
- Slash-Befehle können kein Formular nach einer Prüfung zeigen: `/ticket schliessen` bietet bei einem Schließformular einen Button an.
- „Team-Erwähnung“ des Panels pingt nur Rollen, die das Ticket sehen dürfen (Datenschutz) – andere Rollen werden bewusst nicht benachrichtigt.
- Erste-Antwort-Zeiten je Mitarbeiter werden dem Hauptbearbeiter zugerechnet (wer tatsächlich zuerst geschrieben hat, wird nicht gespeichert).
- Videos werden im Transkript nicht eingebettet, sondern verlinkt (Abruf nur mit Dashboard-Zugriff).
- Wie bisher: Nachrichten, die geschrieben werden, während der Bot offline ist, fehlen im Verlauf.
