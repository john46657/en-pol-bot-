# Phase 4 – Discord OAuth2 & Dashboard-Login

**Stand:** Code, Tests und HTTP-Praxistest abgeschlossen (2026-10-04). **Der echte Discord-Login (Browser → Discord → Callback) ist nicht getestet** – dafür fehlen `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` und eine eingetragene Redirect-URL.

## Ablauf
Dashboard → `GET /auth/discord` (zufälliges `state` im httpOnly-Cookie, 10 min) → Discord → `GET /auth/discord/callback` (state prüfen, Code tauschen, Benutzer in `users` speichern, Session als httpOnly-Cookie) → Dashboard → `/auth/me/guilds` (nur Server, die der User verwalten darf) → pro Request prüft der `PermissionGuard` serverseitig.

## Prüfung der vorhandenen Umsetzung – gefundene Mängel (behoben)
| Mangel | Behebung |
| --- | --- |
| Kein OAuth-`state` → Login-CSRF möglich | state-Cookie + zeitkonstanter Vergleich; falsch/fehlend → Abbruch ohne Code-Austausch |
| Session-JWT stand zusätzlich in der Redirect-URL (Verlauf, Logs, Referer) | Token nur noch im httpOnly-Cookie |
| Kein Logout | `POST /auth/logout` + Button im Dashboard |
| Fehler/Abbruch im Callback → rohe JSON-Fehlerseite | Redirect auf `/login?error=denied\|state\|failed` mit Meldung |
| **Besitzer/Admins kamen im Guard nicht durch:** die Serverauswahl zeigte Server mit „Server verwalten“ an, der Guard prüfte aber nur die NEXUS-Rollenzuordnung → auf einem frischen Server hätte niemand etwas konfigurieren können | Guard lässt Besitzer, Administratoren und „Server verwalten“ (aus Bot-Daten berechnet, fail closed) zu |
| Benutzer wurden beim Login nicht gespeichert | Upsert in `users` |

## Tests
`apps/api` (+10, gesamt 20): State-Erzeugung/-Prüfung, Verwaltungsrechte (Besitzer/Admin/ManageGuild/normal), Controller: state-Cookie, falscher/fehlender state, Abbruch, Fehler beim Austausch, erfolgreicher Login (Cookie, Token nicht in der URL, User gespeichert), Logout, `/auth/me` ohne Access-Token.

Praxistest per HTTP (Fake-Discord): Login-Redirect mit state-Cookie, Callback-Fehlerpfade, 401 ohne Session, Logout; Rechte: Besitzer ohne NEXUS-Rolle 200, Admin-Rolle 200, normales Mitglied 403, Nicht-Mitglied 403, Mitglied mit zugeordneter NEXUS-Rolle 200.

## Live-Abnahme (sobald Zugangsdaten vorliegen)
Im Developer Portal unter OAuth2 die Redirect-URL `AUTH_CALLBACK_URL` eintragen (Standard `http://localhost:3001/api/auth/callback` in `.env.example` – **die API-Route lautet `http://localhost:3000/api/v1/auth/discord/callback`**, ohne `AUTH_CALLBACK_URL` wird dieser Wert automatisch genutzt). Dann: anmelden → nur verwaltbare Server sichtbar → Abmelden.

## Bekannte Grenzen (→ Phase 32)
- Die Session ist ein signierter JWT (7 Tage) ohne serverseitigen Widerruf; er enthält den Discord-Access-Token. Ein Redis-Session-Store folgt in der Sicherheitsphase.
- Kein Rate-Limit auf den Auth-Routen, kein CSRF-Schutz für zustandsändernde Cookie-Requests im Produktionsmodus (`SameSite=None`) – Phase 32.
