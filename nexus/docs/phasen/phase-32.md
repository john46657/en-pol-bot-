# Phase 32 – Sicherheit

**Stand:** abgeschlossen (2026-10-04) – Prüfung und Härtung der API, Dashboard-Anpassung, Tests. **Praxistest (echte API-Instanz, curl):** Header vorhanden; Cookie-POST ohne Herkunft → `403`, mit Dashboard-Origin + Header → `201`; nach 30 Aufrufen von `/auth/me` kommt `429` mit `Retry-After: 60` (dabei fiel auf, dass der Pfad im Middleware-Kontext anders ankommt – jetzt wird `originalUrl` verwendet). **Nicht getan:** Penetrationstest durch Dritte, Test mit echtem Discord-OAuth2 (kein Client-Secret/Token), Test der Header/Cookies im Browser, Last-/Missbrauchstests gegen eine laufende Instanz. Die Prüfpunkte unten sind durch Unit-/Integrationstests und Quellcode-Prüfungen belegt.

| Prüfpunkt | Ergebnis |
| --- | --- |
| **OAuth2** | State-Cookie (`SameSite=Lax`, httpOnly) gegen Login-CSRF und Code-Injection, Code-Austausch serverseitig (Phase 4). |
| **Sessions** | Signiertes JWT (Issuer, Ablauf 7 Tage) in **httpOnly**-Cookie, in Produktion `Secure`; Token nie im Dashboard-Code. Rechte werden bei jeder Anfrage frisch geprüft (Mitgliedschaft + Rollen). WebSocket: gleiche Session. |
| **CSRF** *(neu)* | In Produktion `SameSite=None` ⇒ zusätzlicher Schutz: zustandsändernde Cookie-Anfragen brauchen eine **erlaubte Herkunft** (`Origin`/`Referer` aus `DASHBOARD_URL`) **und** den Header `X-Requested-With: nexus`; Bearer-Anfragen ohne Cookie sind ausgenommen. Das Dashboard sendet den Header; CORS erlaubt ihn. Getestet gegen fremde, fast-gleiche (`dash.example.org.boese.example`) und `null`-Herkünfte. |
| **Rate Limits** *(neu)* | Fixed-Window-Zähler (Redis gemeinsam, sonst im Prozess; bei Redis-Ausfall Rückfall lokal): Auth-Routen 30/Min je IP, Export 10/10 Min je Benutzer, Schreibzugriffe 120/Min, alles 600/Min je Benutzer (sonst IP). `429` mit `Retry-After` und `RateLimit-*`. Hinter Reverse-Proxy `TRUST_PROXY` setzen. |
| **Security-Header** *(neu)* | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, strenge CSP, `Cache-Control: no-store` (außer `/docs`), HSTS in Produktion, kein `X-Powered-By`. Body-Limit 256 kB. |
| **Permissions** | Serverseitig in Guard bzw. Service. **Autorisierungs-Sweep-Test** (neu): geht alle Controller durch – jede Route hat ein Recht, Server-Admin/Dashboard-Zugriff oder ist `@Public`; ungeschützt sind nur die drei Selbstauskunfts-Routen (`me`, `me/guilds`, `me/guilds/:id/permissions`); öffentliche Routen ≤ 8. Neue Routen ohne Schutz lassen den Test scheitern. |
| **Input Validation** | Globale `ValidationPipe` (whitelist, forbidNonWhitelisted); Fach-Controller prüfen Eingaben im Service (Längen, Formate, Aufzählungen, IDs `^\d{5,25}$`). |
| **SQL Injection** | Prisma parametrisiert; die drei Roh-Abfragen sind Tagged Templates (parametrisiert); **Test** verbietet `$queryRawUnsafe`/`$executeRawUnsafe` im gesamten Quellcode. CSV-Exporte neutralisieren Formelinjektion. |
| **Discord Permission Checks** | Rollenvergabe über `applyRoleChanges` mit verständlichen Fehlern (403/404/429); Panels lehnen gefährliche Rollen ab und prüfen die Bot-Hierarchie zur Laufzeit; Funk/Tickets nutzen nur die dokumentierten Bot-Rechte. |
| **Rollen-Hierarchie** | Prüfung `checkBotRoleAccess`/`checkRoleManageable` (Phase 5/6); Beförderungen/Ausbildungen melden Hierarchiefehler im Rollenergebnis statt Erfolg vorzutäuschen. |
| **Audit Logs** | Append-only, alle wichtigen Aktionen (Phase 29); Export wird selbst protokolliert. |
| **Secrets** *(neu)* | Start-Prüfung `checkSecurityConfig`: in **Produktion fatal** bei zu kurzem/Platzhalter-`AUTH_SECRET`, fehlendem `JWT_ISSUER`/`DASHBOARD_URL`, nicht-https-Dashboard oder Platzhaltern; Warnungen bei fehlendem Discord-Token/Redis. Meldungen enthalten nie Geheimnisse. **Test** sucht den Quellcode nach Discord-Token-, JWT- und privaten-Schlüssel-Mustern (keine Treffer); `.env` ist ignoriert; `dangerouslySetInnerHTML`/`eval` im Dashboard sind verboten (Test). |

## Tests
`security.test.ts` (21): Header, CSRF (sichere/Bearer/ohne Cookie, fremde Herkünfte, Referer), Rate Limits (Fenster, Benutzer-Trennung, Auth/Export, Middleware-Antwort), Konfigurationsprüfung (7 Fehlerfälle, Entwicklung, keine Geheimnisse in Meldungen), Autorisierungs-Sweep, Quellcode-Hygiene (3).

## Bekannte Grenzen / offene Punkte
- Keine zusätzliche Sitzungs-Widerrufsliste: Abmelden löscht nur das Cookie; ein gestohlenes Token bleibt bis zum Ablauf (7 Tage) gültig. (Empfehlung: kürzere Laufzeit + Refresh oder serverseitige Sperrliste.)
- Rate Limits zählen je IP/Benutzer, keine Konto-Sperre nach Fehlversuchen (OAuth2 hat keine Passwörter).
- Der Bot hat keine eigene Rate-Limit-Schicht außer Discords; Slash-Commands sind durch Discord-Cooldowns/Rechte begrenzt.
- Abhängigkeits-Schwachstellen (`pnpm audit`) wurden in dieser Phase nicht ausgewertet – Teil von Phase 35.
