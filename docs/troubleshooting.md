# Fehlerbehebung

- **API beendet sich beim Start mit `SESSION_SECRET muss im Produktivbetrieb gesetzt sein`** → `SESSION_SECRET` auf einen eigenen, geheimen Wert setzen (mindestens 16 Zeichen, empfohlen: `openssl rand -hex 32`).
- **Anmeldung klappt, aber die Oberfläche bleibt auf der Anmeldeseite / überall 401** → der Browser muss die API unter derselben Herkunft erreichen (Vite-Proxy oder Caddy); `WEB_ORIGIN` muss genau zur Herkunft der Seite passen.
- **403 ORIGIN_REJECTED** → `WEB_ORIGIN` enthält die Herkunft der Seite nicht.
- **Entwicklung: `Cannot set properties of undefined` in Nest** → die API nicht mit `tsx` starten, sondern mit `pnpm --filter @enrp/api dev` (swc behält die Decorator-Metadaten).
- **Eingebettetes PostgreSQL scheitert unter macOS mit `libicu…dylib`** → im Paket `@embedded-postgres/darwin-arm64` `node scripts/hydrate-symlinks.js` ausführen.
- **Eingebettetes PostgreSQL startet nicht (z. B. als root in Containern)** → eine eigene Datenbank angeben: `TEST_DATABASE_URL=postgresql://…` für die API-Tests.
- Weitere Hinweise zum Hosting: [hosting-bot-hosting.md](hosting-bot-hosting.md), zum Bot: [discord-bot.md](discord-bot.md).
