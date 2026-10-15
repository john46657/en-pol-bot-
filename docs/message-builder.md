# Discord Message Builder

Ein Discohook-ähnlicher Nachrichten- und Embed-Editor direkt im Dashboard (Menü *Verwaltung → Discord-Nachrichten → Message Builder*, Pfad `/message-builder`). Er nutzt die Anmeldung, die Rollen und Rechte und das Design des Dashboards und sendet über den **vorhandenen Discord-Bot**. Es gibt keinen zweiten Bot und keine eigene Anwendung. Er arbeitet **je Discord-Server** (oben links gewählt): Vorlagen, Entwürfe, Kategorien, Verlauf und Webhooks eines Servers sind auf anderen Servern unsichtbar ([multi-server.md](multi-server.md)).

Der ältere *Embed-Baukasten* (*Discord-Nachrichten → Embeds*) bleibt unverändert bestehen.

## Aufbau

| Bereich | Inhalt |
|---|---|
| Links | Nachrichten der Gruppe (hinzufügen, duplizieren, sortieren, entfernen), *Meine Entwürfe*, *Vorlagen* nach Kategorien (Suchen, Laden, Bearbeiten, Duplizieren, Umbenennen, Löschen) |
| Mitte | Nachrichtentext mit Markdown-Leiste (fett, kursiv, unterstrichen, durchgestrichen, Code, Codeblock, Spoiler, Link, Zitat, Überschrift, Liste, Kleintext, Zeitstempel, Emojis, @Rolle, #Kanal), Pings (Benutzer/Rollen/@everyone), Embeds, Felder, Bilder, Buttons und Auswahlmenüs |
| Rechts | Live-Vorschau aller Nachrichten im Discord-Stil und der Versand |

Weitere Reiter: **Versandhistorie** (Recht `messagebuilder.history`) und **Einstellungen** (Kategorien, erlaubte Kanäle, Webhooks; jeweils mit eigenem Recht).

**JSON**: Über „JSON“ lässt sich der Inhalt einer Gruppe kopieren und wieder einfügen. Eingefügter Inhalt wird geprüft.

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
| **Auswahlmenü** (eine Auswahl) | jede Option hat eine eigene Aktion (Antwort oder Rolle) | nur Bot |

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

1. Versandweg wählen:
   - **Über den Bot** (Standard)
   - **Testmodus**: prüft alles wie echt, sendet nichts und zeigt die Discord-Daten
   - **Webhook**: optional, nur mit Recht
2. Kanal wählen. Es gibt nur Textkanäle des fest eingerichteten Servers aus dem Kanalverzeichnis des Bots.
3. Bestätigen. Der Dialog nennt Kanal, Nachrichten und Hinweise.

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

## Webhooks (optional)

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

## Versandhistorie

Gespeichert werden je Versand:
- Zeitpunkt, Kanal (ID und Name), Versandweg (Bot, Webhook, Test)
- verwendete Vorlage bzw. verwendeter Entwurf (Name)
- ausführender Benutzer, Gesamtstatus
- je Nachricht: Kurzbeschreibung („Text · 1 Embed · 2 Buttons“), Status, Discord-Nachrichten-ID (mit Link „öffnen“) und Fehler ohne Geheimnisse

Die eigentlichen Inhalte (Discord-JSON) liegen nur bis zum Versand in der Datenbank und werden danach geleert. Webhook-URLs erscheinen nie in Fehlertexten. Wer sendet, sieht den Status des eigenen Versands auch ohne Historienrecht.

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

Alle Rechte werden in der API geprüft. Ausgeblendete Knöpfe sind keine Sicherheitskontrolle. Neue Installationen geben der Startrolle *Police Administration* alle `messagebuilder.*`-Rechte. Bestehende Rollen bleiben unverändert: Die Rechte müssen unter *Rollen & Rechte* vergeben werden (*System Administrator* hat sie über `*`).

## Datenbank

Die Migration `20261108100000_message_builder` ist **nicht destruktiv**. Sie legt nur neue Tabellen und die Standard-Kategorien an:
- `MessageBuilderCategory`
- `MessageBuilderDocument`
- `MessageBuilderSend`
- `MessageBuilderSendItem`
- `MessageBuilderAction`
- `MessageBuilderWebhook`

Bestehende Tabellen und Daten werden nicht verändert. Erlaubte Kanäle stehen in der Einstellung `messagebuilder.channels`.

## Tests

| Bereich | Datei | Inhalt |
|---|---|---|
| Shared | `packages/shared/tests/message-builder.test.ts` | Limits, URL/Emoji-Prüfung, Discord-JSON, keine interaktiven Komponenten ohne Aktion, Webhook-Regeln |
| API | `apps/api/test/message-builder.test.ts` | Rechte (auch direkte API-Aufrufe), private Entwürfe, Vorlagen/Kategorien, Autosave-Konflikt (409), Kanäle nur vom eigenen Server, Prüfungen vor dem Versand, Bot-Ablauf mit Teilfehler, einmaliges Abholen, Testmodus, Ablauf nach 10 Minuten, Interaktionen, Webhooks mit Rate-Limit (429) und Teilfehler, verschlüsselte URL, Neustart der API |
| Bot | `apps/bot/tests/message-builder.test.ts` | Versand in Reihenfolge, Stopp nach Fehler, fehlende Rechte, kein Doppelversand, Fehlertexte, Outbox-Aufgabe, Buttons (Antwort, Rolle, veraltet, fremder Server), Bot-Rechte im Kanalverzeichnis |
| Web | `apps/web/tests/message-builder.test.tsx` | Markdown-Vorschau (ohne HTML), Embed-/Feld-/Button-Vorschau, simulierter Klick, Autosave (gespeichert erst nach Bestätigung, Fehler, lokale Wiederherstellung, Konflikt) |

**Nicht getestet**: gegen echtes Discord (kein Bot-Token/Server in der Testumgebung). Die Discord-Seite des Bots ist mit Fakes getestet, die Webhook-Aufrufe mit einem nachgebildeten Discord.
