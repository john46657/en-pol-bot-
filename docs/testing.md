# Tests

```bash
pnpm test        # Unit-Tests von shared, Bot-Tests (Fake-API), API-Integrationstests (eigenes eingebettetes PostgreSQL), Komponenten-Tests im Web
pnpm lint && pnpm typecheck && pnpm build
```
Die API-Tests (`apps/api/test`) starten die komplette Nest-App gegen ein Wegwerf-PostgreSQL, wenden die echten Migrationen an und decken ab: Anmeldung, Rechte (inkl. VERBOT am Benutzer > ERLAUBNIS aus der Rolle), Roblox-ID, Personen/Fahrzeuge (Rollback von Transaktionen), Leitstelle/Berichte/Beschwerden/Ermittlungen/Fahndungen/Beweismittel/Personal/Bewerbungen/Akademie, keine Lecks in der Suche, Rechte in der Kommunikation, Sperren bei Auswertungen, WebSocket-Rechte, Exporte, Prüfung von Medien, Unveränderlichkeit des Audits und die Trennung je Discord-Server (`server-scope.test.ts`). Mit `TEST_DATABASE_URL` lässt sich eine eigene Datenbank nutzen (z. B. wenn das eingebettete PostgreSQL als root nicht startet); sie sollte vor jedem Lauf leer sein.

## Browser-E2E (Playwright)
```bash
pnpm e2e
```
Startet ein Wegwerf-PostgreSQL (:54340), die API (:3100) und Vite (:5174), legt einen Admin an und steuert das installierte **Google Chrome** (`channel: 'chrome'`, kein Browser-Download). Szenarien in `e2e/core.spec.ts`: An-/Abmeldung, Leitstellen-Ablauf, abgelehnte Rechte (Oberfläche + API), Beschwerde-Ablauf, öffentliche Bewerbung → Prüfung, Studio-Feld + Design, MDT-Suche/Schnellaktion, Team-Dashboard, Discord-Verknüpfung.
Nicht abgedeckt: Lasttests, andere Browser, Mobil-Ansichten.
