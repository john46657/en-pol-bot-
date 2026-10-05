# Phase 47 – Sperren (Spezifikation 26–28)

**Stand:** abgeschlossen (2026-10-04).

## Neu
- Paket `@nexus/restrictions`, Tabelle `restrictions`: Art (Bewerbungs-, Ticket-, Fraktions-, Funk-/Kommunikationssperre), Grund, interne Notiz, Start, Ende (leer = unbefristet), Status `ACTIVE`/`EXPIRED`/`REVOKED`, Ersteller; beim Aufheben Benutzer, Grund, Zeit.
- **Wirksam**, solange `ACTIVE`, Start erreicht und Ende nicht erreicht. Eine Sperre mit Start in der Zukunft wirkt erst ab dann.
- **Automatisches Ablaufen:** Worker-Job `restriction-expiry` (jede Minute) setzt `EXPIRED`; zusätzlich zieht jede Prüfung/Liste des Servers das nach, der Zugriff ist also genau ab dem Ende frei. Bei mehreren Sperren derselben Art bleibt er gesperrt, bis die letzte endet. Audit: `restriction.created`, `restriction.revoked`, `restriction.expired` (ohne Benutzer, „Automatisch abgelaufen“).
- **Durchsetzung:** Bewerbung starten (`startApplication`, Meldung an den Bewerber, nichts wird angelegt), Ticket öffnen (nicht, wenn das Team das Ticket für jemanden eröffnet, z. B. Bewerbungsgespräch), Funk (`checkChannel`/`checkMember`: Zugriff `none`, Grund `restricted`, Bot-Anzeige „Funk gesperrt“).
- **Verständliche Meldung:** „Du bist bis zum 08.10.26, 12:00 Uhr für Tickets gesperrt. Grund: …“ bzw. „bis auf Weiteres“.
- API `guilds/:id/restrictions` (Liste mit Filtern, verhängen, aufheben, Arten); Rechte `restrictions.view/create/revoke` (in der Vorlage für Leitung enthalten). Dashboard-Seite „Sperren“ mit Filtern, Verhängen (Start/Ende) und Aufheben mit Pflichtgrund.

## Tests
- `@nexus/restrictions`: 8 (Validierung, Start in der Zukunft, Servertrennung, Meldung, Ablauf, Ablauf ohne Worker, mehrere Sperren, Aufheben, Liste).
- Durchsetzung: Tickets (27), Funk (16), Bewerbung im Bot (140 Bot-Tests); API-E2E (190) inkl. Rechte, Servertrennung, Ablauf; Browser (`restrictions.spec.ts`): verhängen, sehen, aufheben.

## Grenzen
- ~~Fraktionssperre ist nur erfassbar, wirkt aber nirgends~~ – **seit Phase 64 wirksam**: blockiert die Aufnahme in die Fraktion (Personalakte anlegen/wiederherstellen, Team zuweisen, Annahme einer Bewerbung mit Personalakte).
- Kein Bot-Befehl zum Verhängen (nur Dashboard/API). Keine Benachrichtigung an den Gesperrten oder das Team bei Erstellung/Ablauf (nur Audit-Log) – Spezifikation 53 bleibt offen.
- Benutzer werden per Discord-ID eingegeben (keine Suche nach Namen).
- Nicht gegen echten Discord-Bot geprüft; getestet sind Dienste, Bot-Logik mit Test-Eingaben, API und Dashboard.
