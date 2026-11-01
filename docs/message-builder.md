# Embed Builder (Discord-Nachrichten und Embeds)

Ein Discohook-ähnlicher Nachrichten- und Embed-Editor direkt im Dashboard (Menü *Administration → Discord-Nachrichten → Embed Builder*, Pfad `/message-builder`, auch `/embed-builder`). Eigene Implementierung – kein Code, keine Grafiken und kein Branding von Discohook. Früher hieß der Bereich „Discord Message Builder“; Daten, Rechte (`messagebuilder.*`) und Pfade sind gleich geblieben. Er nutzt die Anmeldung, die Rollen und Rechte und das Design des Dashboards und sendet über den **vorhandenen Discord-Bot**. Es gibt keinen zweiten Bot und keine eigene Anwendung. Er arbeitet **je Discord-Server** (oben links gewählt): Vorlagen, Entwürfe, Kategorien, Verlauf und Webhooks eines Servers sind auf anderen Servern unsichtbar ([multi-server.md](multi-server.md)).

Der ältere *Embed-Baukasten* (*Discord-Nachrichten → Embeds*) bleibt unverändert bestehen.

## Aufbau

| Bereich | Inhalt |
|---|---|
| Links | Nachrichten der Gruppe (hinzufügen, duplizieren, sortieren, entfernen), *Meine Entwürfe*, *Vorlagen* nach Kategorien (Suchen, Laden, Bearbeiten, Duplizieren, Umbenennen, Löschen) |
| Mitte | Nachrichtentext mit Markdown-Leiste (fett, kursiv, unterstrichen, durchgestrichen, Code, Codeblock, Spoiler, Link, Zitat, Überschrift, Liste, Kleintext, Zeitstempel, Emojis, @Rolle, #Kanal), Pings (Benutzer/Rollen/@everyone), Embeds, Felder, Bilder, Buttons und Auswahlmenüs |
| Rechts | Live-Vorschau aller Nachrichten im Discord-Stil und der Versand |

Weitere Reiter: **Gesendete Nachrichten** (Links, Bearbeiten, Laden per Link), **Versandhistorie** (Recht `messagebuilder.history`), **Webhooks** (Recht `messagebuilder.webhooks`) und **Einstellungen** (Kategorien, erlaubte Kanäle).

## JSON-Editor

Umschalter **Grafisch / JSON-Editor** über dem Editor. Der JSON-Editor zeigt alle Nachrichten der Gruppe im **echten Discord-Format** (wie die REST-API *Create Message* / *Execute Webhook*):

```json
{ "messages": [ { "content": "…", "embeds": [ … ], "components": [ … ], "allowed_mentions": { "parse": ["users"] } } ],
  "webhook": { "username": "…", "avatar_url": "…" } }
```

- **Prüfen beim Tippen**: Syntaxfehler mit **Zeile und Spalte** (eigener Parser, unabhängig vom Browser) und Knopf „Zur Fehlerstelle“; Aufbaufehler mit Pfad (z. B. `messages[0].embeds[1].color`); danach die Discord-Limits wie im grafischen Editor.
- **Synchronisierung**: Gültige Änderungen gehen sofort in den grafischen Editor, die Live-Vorschau und den Autosave. Ungültiges JSON wird nie übernommen; solange es ungültig ist, sind Umschalten auf „Grafisch“ und **Senden gesperrt**. Die API prüft unabhängig davon jeden Versand.
- **Formatieren**, **Importieren** (Datei, max. 1 MB), **Exportieren** (Datei), **Kopieren**.
- Import nimmt auch eine einzelne Nachricht, eine Liste von Nachrichten und `{ "messages": [ { "data": { … } } ] }` an.
- Interaktive Buttons/Menüs: Die `custom_id` im JSON ist die interne Komponenten-ID. Solange sie gleich bleibt, behält die Komponente ihre Aktion. Neue interaktive Komponenten brauchen eine Aktion im grafischen Editor (die Prüfung meldet das). „Zeitpunkt des Sendens“ bleibt beim Hin- und Zurückwandeln erhalten.
- Nicht unterstützt (Fehlermeldung): Premium-Buttons, andere Auswahlmenü-Typen als Text-Auswahl, Components v2.

## Embeds

Titel, Titel-URL, Beschreibung, Farbe (Farbwähler, HEX, Schnellfarben), Autor (Name, URL, Icon), Thumbnail, großes Bild, Fußzeile (Text, Icon), Zeitstempel (keiner, Zeitpunkt des Sendens oder eigenes Datum) und bis zu 25 Felder (inline oder nicht, sortieren, duplizieren, entfernen). Je Nachricht sind bis zu 10 Embeds möglich, ebenfalls sortier- und duplizierbar.

Bilder werden als URL angegeben (`https://…`). Ungültige URLs werden sofort am Feld gemeldet. Für `http://` gibt es einen Hinweis.

## Discord-Limits (geprüft im Editor **und** in der API vor dem Versand)

| Was | Limit |
|---|---|
| Nachrichtentext | 2000 Zeichen |
| Embeds je Nachricht | 10 |
| Titel / Autorname / Feldname | 256 |
| Beschreibung | 4096 |
| Felder je Embed / Feldwert | 25 / 1024 |
| Fußzeile | 2048 |
| Alle Embeds einer Nachricht zusammen | 6000 Zeichen (Titel, Beschreibung, Felder, Fußzeile, Autor) |
| Komponenten-Reihen / Buttons je Reihe | 5 / 5 |
| Button-Beschriftung / Link-URL | 80 / 512 |
| Auswahlmenü: Optionen / Platzhalter / Option (Text, Wert, Beschreibung) | 25 / 150 / 100 |

Außerdem: keine leere Nachricht, kein leeres Embed, Feldname und Feldwert nötig, Autor-URL/-Icon nur mit Autorname, Fußzeilen-Icon nur mit Fußzeilentext, gültige Emojis (Unicode oder `<:name:id>`). Gruppenlimit (eigene Vorgabe, keine Discord-Grenze): 10 Nachrichten.

Entwürfe dürfen beim Speichern unfertig sein. Die strenge Prüfung greift erst beim Senden; Fehler werden im Editor aber schon live angezeigt.

## Buttons und Auswahlmenüs

| Art | Funktion | Versand |
|---|---|---|
| **Link-Button** | öffnet eine URL; Discord braucht dafür keine Interaktion | Bot und Webhook |
| **Aktions-Button** | **Antwort** nur für die klickende Person (ephemeral) oder **Rolle** geben/nehmen/umschalten | nur Bot |
| **Auswahlmenü** | Platzhalter, Optionen mit Beschreibung/Emoji, **Mindest-/Höchstanzahl** (0–25), **Pflichtauswahl** (= Mindestanzahl ≥ 1); jede Option hat eine eigene Aktion. Bei Mehrfachauswahl führt der Bot alle gewählten Aktionen aus und antwortet gesammelt. | nur Bot |

Jede interaktive Komponente braucht eine festgelegte Aktion, sonst wird nicht gesendet. Es entstehen also keine Buttons ohne Funktion.

Beim Senden wird die Aktion festgeschrieben (`MessageBuilderAction`, custom_id `mb:<id>`). Spätere Änderungen an einer Vorlage ändern bereits gesendete Buttons nicht.

Klickt jemand, fragt der Bot die API (`POST /bot/message-builder/interactions`). Klicks von anderen Servern werden abgewiesen. Ein Discord-Konto muss dafür **nicht** verknüpft sein.

Rollen-Aktionen anlegen darf nur, wer `messagebuilder.roles` hat. Der Bot braucht *Rollen verwalten*, und seine Rolle muss über der Rolle stehen.

## Vorschau

Die Vorschau ist eine Simulation. Sie zeigt Bot-Name/Avatar, Text mit Discord-Markdown, Embeds (Farbe, Autor, Titel, Felder mit Inline-Anordnung, Thumbnail, Bild, Fußzeile, Zeitstempel), Buttons und Menüs. Klicks auf Aktions-Buttons werden nur simuliert. Über Webhooks nicht mögliche Komponenten sind rot gestrichelt markiert.

Bekannte Abweichungen (stehen auch unter der Vorschau):
- Schriftarten und Bildgrößen können abweichen.
- Automatische Link-Vorschauen aus URLs im Text werden nicht simuliert.
- Benutzer-Erwähnungen zeigen nur die ID; Rollen und Kanäle zeigen den Namen vom Server.

Damit Bilder beliebiger https-Adressen in der Vorschau erscheinen, erlaubt die Content-Security-Policy des Dashboards Bilder von `https:` (`img-src`; Skripte bleiben gesperrt). Beim Anzeigen lädt der Browser das Bild von der angegebenen Adresse.

## Versand

Vor dem Senden wählt man (der Discord-Server ist der oben links gewählte):

1. Nachrichtenprofil / Versandweg wählen:
   - **Über den Bot** (Standard)
   - **Testmodus**: prüft alles wie echt, sendet nichts und zeigt die Discord-Daten
   - **Webhook**: optional, nur mit Recht
2. Kanal wählen: Textkanäle (auch Ankündigungskanäle) und **Forum-Kanäle** des gewählten Servers aus dem Kanalverzeichnis des Bots.
3. Optional **Thread**: aktiver Thread des Kanals aus der Liste oder eine Thread-ID (archivierte Threads). **Forum**: bestehenden Beitrag wählen oder Titel eines **neuen Beitrags** angeben – die erste Nachricht eröffnet ihn, weitere gehen in denselben Beitrag. Auch über Webhooks (`thread_id` bzw. `thread_name`).
4. „Nachricht senden“ → **Vorschau & Bestätigung** (vollständige Live-Vorschau, Ziel, Hinweise). Danach Status je Nachricht mit Link „in Discord öffnen“; Fehler verständlich auf Deutsch.

Ablauf beim Bot-Versand:
- Die API prüft serverseitig Rechte, Limits, Kanal (eigener Server, Textkanal, freigegeben) und die vom Bot gemeldeten **Bot-Rechte im Kanal**: *Kanal ansehen*, *Nachrichten senden*, *Links einbetten* bei Embeds und *@everyone erwähnen*, wenn ein solcher Ping eingeschaltet ist.
- Danach legt sie **einen** Outbox-Auftrag `mb.send` an. Er enthält nur die Versand-ID, keine Inhalte.
- Der Bot holt den Auftrag ab. Abholen geht nur einmal (`QUEUED → SENDING`), damit eine Wiederholung nie doppelt sendet.
- Der Bot prüft die Rechte im Kanal erneut und sendet die Nachrichten **einzeln in Reihenfolge**. Discord-Rate-Limits wartet discord.js ab.
- Jede Nachricht wird sofort zurückgemeldet: gesendet (mit Nachrichten-ID) oder fehlgeschlagen (mit verständlichem Grund).
- Schlägt eine Nachricht fehl, werden die folgenden **nicht** gesendet (*Nicht gesendet*), damit die Reihenfolge erhalten bleibt.
- Der Gesamtstatus ist *Gesendet*, *Teilweise gesendet* oder *Fehlgeschlagen*. Etwas Fehlgeschlagenes wird nie als gesendet angezeigt.
- Holt der Bot einen Auftrag nicht innerhalb von 10 Minuten ab (Bot offline), wird er als fehlgeschlagen markiert, und es wird nichts mehr gesendet.
- Bleibt ein begonnener Versand 15 Minuten ohne Abschluss, werden offene Nachrichten als fehlgeschlagen mit dem Hinweis „Status unbekannt“ markiert.

Der Bot-Token bleibt im Bot. Die API und der Browser sehen ihn nie.

Die Bot-Rechte je Kanal meldet der Bot im Kanalverzeichnis (`PUT /bot/guilds`, Feld `bot` je Textkanal). Ältere Bot-Versionen melden sie nicht. Dann prüft nur der Bot beim Senden.

## Webhooks (optional, Reiter „Webhooks“)

- Hinzufügen mit Name, Webhook-URL und optionalem **Standard-Absenderprofil** (Name, Profilbild-URL). Liste mit Namen, Avatar, Zielkanal und Ergebnis des letzten Tests.
- **Bearbeiten**: Name im Dashboard, Standardprofil und – soweit Discord es mit dem Webhook-Token erlaubt – den **Namen des Webhooks in Discord** (`PATCH /webhooks/{id}/{token}`). Kanal und das in Discord hinterlegte Bild lassen sich nur in Discord ändern.
- **Verbindung testen**: fragt den Webhook bei Discord ab (sendet nichts), aktualisiert Name/Avatar/Kanal, meldet Fehler verständlich.

- Einrichten unter *Einstellungen → Webhooks* (Recht `messagebuilder.webhooks`). Die URL wird bei Discord geprüft: Der Webhook muss zum Server der EN Polizei gehören.
- Gespeichert wird die URL nur AES-256-GCM-verschlüsselt (Schlüssel: `ERLC_SECRET_KEY`, sonst aus `SESSION_SECRET`). Sie wird nie wieder ausgeliefert. Beim Entfernen wird sie gelöscht.
- Der Webhook wird nur benutzt, wenn er beim Senden **ausdrücklich** gewählt wird. Die Oberfläche weist darauf hin, dass die Nachricht dann nicht vom Bot kommt.
- Gesendet wird direkt aus der API (`?wait=true&with_components=true`) mit optionalem eigenem Namen und Profilbild.
- Bei Rate-Limits (429) wartet die API `retry_after` ab (höchstens 3 Versuche). Bei leerem Rate-Limit-Bucket wartet sie bis zum Zurücksetzen.
- Webhooks, die nicht dem Bot gehören, dürfen laut Discord nur nicht-interaktive Komponenten senden. Deshalb sind über Webhooks nur **Link-Buttons** erlaubt.

## Vorlagen, Entwürfe, Autosave

- **Entwürfe** gehören der Person, die sie angelegt hat. Andere sehen sie nicht, auch nicht über die API.
- **Vorlagen** sind gemeinsam und nach bearbeitbaren Kategorien geordnet. Standard-Kategorien: Allgemein, Polizei, Leitstelle, Dienstantritt, Dienstende, Einsatzmeldung, Personalinformation, Ankündigung, Wartung, Sonstiges.
- Mit Vorlagen lässt sich Folgendes tun:
  - *Laden*: als neuer Entwurf
  - *Bearbeiten*: direkt, mit Hinweis, dass die Änderung für alle gilt
  - *Duplizieren*, *Umbenennen*
  - *Löschen*: nach Bestätigung
  - *Als Vorlage speichern*: aus einem Entwurf
- **Autosave**: Jede Änderung wird nach 1 s gespeichert. Die Anzeige wechselt zwischen „Speichert …“, „Gespeichert“ und „Speichern fehlgeschlagen“.
  - Bis zur Bestätigung durch den Server liegt der Stand zusätzlich im Browser. Nach Absturz oder Neuladen wird *Wiederherstellen* angeboten.
  - Netzwerkfehler werden automatisch wiederholt. Abgelehnte Änderungen werden als Fehler gezeigt, nie als gespeichert.
  - Versionsprüfung: Hat ein anderer Tab oder eine andere Person zwischendurch gespeichert, wird nichts überschrieben. Die Person entscheidet dann, welche Fassung gilt.
  - Beim Verlassen der Seite mit ungespeicherten Änderungen fragt der Browser nach.
- **Löschen = Archivieren**: Gelöschte Entwürfe und Vorlagen bleiben in der Datenbank (`archivedAt`) und in Backups. Eine gelöschte Kategorie lässt ihre Vorlagen ohne Kategorie bestehen.

## Gesendete Nachrichten (laden, bearbeiten, duplizieren)

- Jede erfolgreich gesendete Nachricht wird als **gespeicherte Nachricht** mit Link, Kanal, Absender und Inhalt gemerkt (`MessageBuilderMessage`).
- **Per Link laden**: Discord-Nachrichtenlink einfügen → der Bot holt die Nachricht (Outbox-Auftrag `mb.fetch`). Nur Nachrichten des gewählten Servers, die **vom Bot selbst oder von einem hier eingerichteten Webhook** stammen, werden bearbeitbar; fremde Nachrichten werden mit Begründung abgelehnt.
  - Buttons/Menüs früherer Embed-Builder-Versände bekommen ihre Aktion zurück. Komponenten anderer Bot-Funktionen (z. B. Ticket-Panel) behalten ihre `custom_id` unverändert; die API erlaubt beim Bearbeiten nur `custom_id`s, die in der geladenen Nachricht schon standen.
- **Bearbeiten**: grafischer Editor oder JSON-Editor mit Live-Vorschau; Speichern erst nach **Vorschau-Bestätigung**. Bot-Nachrichten bearbeitet der Bot (Outbox `mb.send`, Art `EDIT`; er prüft, dass die Nachricht von ihm stammt), Webhook-Nachrichten die API über den Webhook (`PATCH …/messages/{id}`, mit `thread_id` in Threads). Bearbeitungen stehen in der Historie.
- **Duplizieren / erneut senden**: Inhalt als neuer Entwurf mit vorbelegtem Kanal. **Neu laden** holt den aktuellen Stand aus Discord. **Link entfernen** archiviert nur den Eintrag – die Discord-Nachricht bleibt.

## Versandhistorie

Gespeichert werden je Versand:
- Zeitpunkt, Kanal (ID und Name), Thread/Forum-Beitrag, Versandweg (Bot, Webhook, Test), Art (Versand oder Bearbeitung)
- Nachrichtenname und **verwendete Vorlage** (auch wenn ein Entwurf aus einer Vorlage geladen wurde)
- der Inhalt (`data`) – **„In Editor laden“** öffnet ihn als neuen Entwurf
- ausführender Benutzer, Gesamtstatus
- je Nachricht: Kurzbeschreibung („Text · 1 Embed · 2 Buttons“), Status, Discord-Nachrichten-ID (mit Link „öffnen“) und Fehler ohne Geheimnisse

Das fertige Discord-JSON je Nachricht (`payload`) liegt nur bis zum Versand in der Datenbank und wird danach geleert; der Inhalt im Editor-Format bleibt für „In Editor laden“ erhalten. Webhook-URLs erscheinen nie in Fehlertexten. Wer sendet, sieht den Status des eigenen Versands auch ohne Historienrecht.

## Rechte (`messagebuilder.*`, Modul „Discord Message Builder“ unter *Administration → Module* abschaltbar)

| Recht | Erlaubt |
|---|---|
| `view` | Editor öffnen, Vorlagen ansehen (Voraussetzung für alles) |
| `create` | eigene Entwürfe anlegen/bearbeiten/löschen, Testmodus |
| `templates_create` / `templates_edit` / `templates_delete` | Vorlagen anlegen (auch duplizieren, „als Vorlage speichern“) / bearbeiten, umbenennen, Kategorien verwalten / löschen |
| `send` | über den Bot senden |
| `history` | Versandhistorie |
| `channels` | erlaubte Kanäle festlegen (leer = alle Textkanäle des Servers) |
| `webhooks` | Webhooks verwalten und, zusammen mit `send`, darüber senden |
| `roles` | Aktions-Buttons/-Menüs anlegen, die Discord-Rollen vergeben |
| `edit` | eigene gesendete Discord-Nachrichten bearbeiten, Nachrichten per Link laden |
| `edit_others` | Nachrichten anderer Nutzer und per Link geladene Nachrichten (Absender unbekannt) bearbeiten; alle gesendeten Nachrichten sehen |

Alle Rechte werden in der API geprüft. Ausgeblendete Knöpfe sind keine Sicherheitskontrolle. Neue Installationen geben der Startrolle *Police Administration* alle `messagebuilder.*`-Rechte. Bestehende Rollen bleiben unverändert: Die Rechte müssen unter *Rollen & Rechte* vergeben werden (*System Administrator* hat sie über `*`).

## Vorlagen: Import/Export, Beispielvorlagen

- Suche und **Filter nach Kategorie**; **Export** (alle gefilterten oder eine Vorlage) als JSON-Datei (`enpol-embed-builder-templates`, Version 1); **Import** legt immer **neue** Vorlagen an (gleicher Name → „(Import)“), Kategorien werden per Name zugeordnet (fehlende nur mit `templates_edit` angelegt).
- Standard-Kategorien für neue Server: Ankündigungen, Dienstanweisungen, Bewerbungen, Tickets, Ausbildung, Informationen, Berichte, Sonstiges. Bestehende Kategorien werden nicht verändert.
- **Beispielvorlagen** (Willkommen, Dienstbeginn, Bewerbungsinformationen, Ticket-Eröffnung, Ausbildungsankündigung, Regelwerk-Hinweis): ein neuer Server bekommt sie automatisch; sonst Knopf „Beispiele“. Es werden nur fehlende Namen ergänzt – auch gelöschte (archivierte) Vorlagen gleichen Namens werden nicht wieder angelegt; nichts wird überschrieben.

## Datenbank

Die Migration `20261108100000_message_builder` ist **nicht destruktiv**. Sie legt nur neue Tabellen und die Standard-Kategorien an:
- `MessageBuilderCategory`
- `MessageBuilderDocument`
- `MessageBuilderSend`
- `MessageBuilderSendItem`
- `MessageBuilderAction`
- `MessageBuilderWebhook`

Bestehende Tabellen und Daten werden nicht verändert. Erlaubte Kanäle stehen in der Einstellung `messagebuilder.channels`.

Die Migration `20261202100000_embed_builder` ist ebenfalls **nicht destruktiv**: nur neue, optionale Spalten (bzw. mit Standardwert) an `MessageBuilderSend`, `MessageBuilderSendItem`, `MessageBuilderDocument`, `MessageBuilderWebhook` und die neue Tabelle `MessageBuilderMessage`. Kein Löschen, kein Umbenennen, keine Datenänderung. Abgeschaltetes Modul löscht keine Daten.

Das Kanalverzeichnis des Bots (`PUT /bot/guilds`) meldet zusätzlich `forums` und `threads`; ältere Bot-Versionen ohne diese Felder funktionieren weiter (dann keine Foren/Thread-Liste).

## Tests

| Bereich | Datei | Inhalt |
|---|---|---|
| Shared | `packages/shared/tests/message-builder.test.ts` | Limits, URL/Emoji-Prüfung, Discord-JSON, keine interaktiven Komponenten ohne Aktion, Webhook-Regeln |
| API | `apps/api/test/message-builder.test.ts` | Rechte (auch direkte API-Aufrufe), private Entwürfe, Vorlagen/Kategorien, Autosave-Konflikt (409), Kanäle nur vom eigenen Server, Prüfungen vor dem Versand, Bot-Ablauf mit Teilfehler, einmaliges Abholen, Testmodus, Ablauf nach 10 Minuten, Interaktionen, Webhooks mit Rate-Limit (429) und Teilfehler, verschlüsselte URL, Neustart der API |
| Bot | `apps/bot/tests/message-builder.test.ts` | Versand in Reihenfolge, Stopp nach Fehler, fehlende Rechte, kein Doppelversand, Fehlertexte, Outbox-Aufgabe, Buttons (Antwort, Rolle, veraltet, fremder Server), Bot-Rechte im Kanalverzeichnis |
| Web | `apps/web/tests/message-builder.test.tsx` | Markdown-Vorschau (ohne HTML), Embed-/Feld-/Button-Vorschau, simulierter Klick, Autosave (gespeichert erst nach Bestätigung, Fehler, lokale Wiederherstellung, Konflikt) |
| Shared | `packages/shared/tests/message-builder-json.test.ts` | JSON-Parser mit Zeile/Spalte, Export im Discord-Format, Rundreise (Aktionen, Zeitstempel, Profil), Importformate, Fehlerpfade, übernommene custom_ids nur erlaubt, Mehrfachauswahl-Limits, Beispielvorlagen gültig, Export-Format |
| API | `apps/api/test/embed-builder.test.ts` | Beispielvorlagen ohne Überschreiben, Import/Export, Foren/Threads, Historie mit Vorlage + „In Editor laden“, gespeicherte Nachrichten, Bearbeiten (Bot/Webhook, eigene vs. fremde, parallele Bearbeitung), Laden per Link (Aktionen zurück, fremde custom_ids, Ablehnungen), Mehrfachauswahl, Webhook bearbeiten/testen, Forum-Webhook, Discord-Fehler beim Bearbeiten |
| Bot | `apps/bot/tests/embed-builder.test.ts` | Thread- und Forum-Versand, Bearbeiten, alte Bot-Seite ohne Bearbeiten, Rechteprüfung Thread/Forum/fremder Server, nur eigene Nachrichten bearbeiten, Laden (Bot/Webhook/fremd), Outbox `mb.fetch`, Mehrfachauswahl, Kanalverzeichnis mit Foren/Threads |
| Web | `apps/web/tests/embed-builder.test.tsx` | JSON-Editor (Sync mit Vorschau, Aktionen bleiben, Fehler mit Zeile/Spalte und Pfad, Formatieren), Mindest-/Höchstanzahl/Pflichtauswahl, Versand mit Forum-Titel/Thread, Vorschau im Bestätigungsdialog, Sperre bei ungültigem JSON |

**Nicht getestet**: gegen echtes Discord (kein Bot-Token/Server in der Testumgebung). Die Discord-Seite des Bots ist mit Fakes getestet, die Webhook-Aufrufe mit einem nachgebildeten Discord.
