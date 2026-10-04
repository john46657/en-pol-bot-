# Phase 16 – Funk & Funk-Whitelist

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/radio`, Datenmodell, API, Bot (`/funk`, Durchsetzung im Sprachkanal), Dashboard „Funk“, Tests gegen echte Datenbank. **Nicht gegen echtes Discord getestet** (Durchsetzung nur mit Mitglieds-Attrappen); Dashboard nicht im Browser getestet. *Phase 15 (Leitstelle) entfällt laut Entscheidung; „Leitstellen-Funk“ ist deshalb nicht Teil der Stufen.*

## Stufen und Zugriff (reine Funktion `decideAccess`, 9 Tabellenfälle getestet)
| Stufe | Allgemeinfunk | Spezialfunk |
| --- | --- | --- |
| Mithören | hören | nur mit Spezial-Freigabe (hören) |
| Sprechen | sprechen | nur mit Spezial-Freigabe (sprechen) |
| Vollzugriff | sprechen | sprechen (Freigabe automatisch) |

Zusätzlich je Kanal: **„nur im Dienst“** (Dienststatus prüfen, optional) – gilt eine laufende, **nicht pausierte** Schicht; Kanal deaktivierbar. Nicht auf der Whitelist = kein Zugriff.

## Funktionen
- **Whitelist:** hinzufügen, Stufe/Spezial ändern, entfernen, **suchen** (Name über Discord-Mitgliedersuche), anzeigen, filtern, blättern. Je Mitglied ein Eintrag; Änderungen mit Grund im **Verlauf** (bleibt nach dem Entfernen) und im **Audit-Log**.
- **Funkkanäle** einrichten (Sprachkanal, Anzeigename, Bereich, Dienstpflicht).
- **Durchsetzung (Bot):** beim Betreten/Wechseln eines Funkkanals sofort, außerdem Kontrolle alle 60 s (Schichtende, geänderte Whitelist). Ohne Zugriff: Trennen + Hinweis per DM; „Mithören“: Stummschalten (nur vom Bot gesetzte Stummschaltungen werden wieder aufgehoben). Andere Sprachkanäle bleiben unberührt.
- **Bot:** `/funk hinzufügen|entfernen|suchen|liste|anzeigen`; jedes Mitglied sieht den eigenen Zugriff, fremden nur mit `radio.view`.

## Rechte
`radio.view`, `radio.whitelist.manage` (Polizeileitung), `radio.channel.manage` (Serverleitung). In API und Bot geprüft. Neuer Gateway-Intent *Guild Voice States*, Bot-Rechte „Mitglieder verschieben/stummschalten“ (siehe BOT-SETUP.md).

## Tests
`radio.test.ts` (14): Zugriffsmatrix, Whitelist-Lebenszyklus mit Verlauf/Audit, Validierung, Suche/Filter/Blättern, Kanalprüfung inkl. Dienstpflicht/Pause. Bot `funk.int.test.ts` (4): Befehle mit/ohne Recht, Durchsetzung (trennen, stumm, wieder frei, Spezialfunk, Fremdkanäle).

## Grenzen
- Durchsetzung reaktiv (Trennen nach dem Beitritt, Reaktionszeit ≤ 60 s bei Änderungen), keine Discord-Kanalrechte pro Mitglied; echte Wirkung hängt von den Bot-Rechten ab und ist ungetestet gegen Discord.
- „Stumm wegen Mithören“ geht nach einem Bot-Neustart nicht automatisch zurück, wenn jemand den Kanal verlässt (manuell oder beim nächsten Beitritt).
- Dashboard zeigt Namen nur bei Namenssuche; sonst Discord-IDs.
