# EN Polizei auf bot-hosting.net starten (API + Web + Discord-Bot)

Funktioniert direkt mit dem Branch **`main`** (das fertige Paket liegt dort im Ordner `hosting/`). Der Branch `hosting` geht weiterhin auch.

## 1. Code ins Panel holen
Im Panel-Tab **GitHub**: Repo `john46657/en-pol-bot-`, Branch **`main`** und **Pull** klicken. Danach müssen im Tab **Files** u. a. `start.js` und der Ordner `hosting/` liegen.

## 2. Startdatei / Startbefehl
Tab **Startup**, Startdatei **`start.js`** (Node.js-Server). Kann dein Server nur Python: `python3 bot.py`.
`start.js` installiert beim ersten Start die Pakete in `hosting/` (einige Minuten) und startet **API, Web-Oberfläche und Discord-Bot zusammen**. Die Warnung `install-scripts … esbuild` beim `npm install` des Panels ist harmlos.

## 3. Variablen (Tab **Env**)
| Variable | Wert |
|---|---|
| `DATABASE_URL` | `postgresql://BENUTZER:PASSWORT@HOST:PORT/DATENBANK` – PostgreSQL aus dem Datenbank-Bereich des Panels (**Pflicht**; Sonderzeichen im Passwort kodieren: `@`→`%40`, `#`→`%23`, `/`→`%2F`) |
| `ADMIN_PASSWORD` | langes Passwort für den ersten Benutzer `admin` |
| `DISCORD_TOKEN` | Bot-Token aus dem Discord Developer Portal |
| `COOKIE_SECURE` | `true` (die Domain hat HTTPS) |
| `WEB_ORIGIN` | deine Domain, z. B. `https://tnnyq4svmz.apps.bot-hosting.cloud` (ohne `/` am Ende) |
| `DISCORD_CLIENT_SECRET` | optional: **„Mit Discord anmelden“** – Discord Developer Portal → deine Anwendung → OAuth2 → *Client Secret* (Reset Secret). Dort unter *Redirects* eintragen: `https://<deine-domain>/api/v1/auth/discord/callback` |
| `DISCORD_GUILD_ID` | optional: Server-ID, dann erscheinen die Slash-Befehle sofort (sonst bis zu 1 Stunde) |

**Nicht setzen bzw. löschen:** `PORT` (das Panel setzt `SERVER_PORT` selbst, und der hat Vorrang), `API_URL` (im gemeinsamen Betrieb nutzt der Bot automatisch die lokale API), `NEXUS_ENTRY`.
`BOT_API_TOKEN` und `SESSION_SECRET` werden beim ersten Start automatisch erzeugt (Ordner `hosting/data/`, nicht löschen).

Keine Passwörter oder Tokens in Dateien oder im GitHub-Repo speichern – nur im Panel unter **Env**.

## 4. Starten und prüfen
Server **Restart**. Der erste Start dauert einige Minuten (`npm install`, ca. 400 MB Speicher, 250–400 MB RAM). Die Konsole muss zeigen:
```
[nexus] Datenbank-Migrationen …
[nexus] Starte API + Web auf 0.0.0.0:<Port> …
[nexus] Starte Discord-Bot …
[nexus] API ist erreichbar: http://127.0.0.1:<Port>/health → 200
```
Dann im Browser: `https://<deine-domain>/health` → muss `{"status":"ok"}` zeigen. Anmelden unter `https://<deine-domain>/` als `admin`.

## 5. Fehlersuche
| Symptom | Ursache / Lösung |
|---|---|
| Domain zeigt **502**, Bot ist online | Es läuft nur der Bot oder die API lauscht auf einem anderen Port. Konsole prüfen (siehe oben). `PORT` und `API_URL` löschen. Im Panel (Domains/Network) muss die Domain auf den **Server-Port** (`SERVER_PORT`) zeigen. |
| „API ist erreichbar“ steht in der Konsole, Domain aber 502 | Die Domain zeigt im Panel auf den falschen Port. |
| Konsole bleibt leer / „Console connection error“ | Panel-Konsole neu laden; Server neu starten. Disk `0 B` heißt: es sind keine Dateien da → Schritt 1 (Pull). |
| `DATABASE_URL fehlt` / `muss mit postgresql:// beginnen` | Variable setzen; es wird **PostgreSQL** gebraucht (kein MySQL). |
| `Invalid bot configuration` | `DISCORD_TOKEN` fehlt/ungültig. |
| Slash-Befehle erscheinen nicht | `DISCORD_GUILD_ID` setzen oder bis zu 1 Stunde warten; Bot mit Bereich `applications.commands` einladen. |
| Befehle antworten „System nicht erreichbar“ | API läuft nicht (siehe 502). |
| Bot antwortet „Serverfehler (Request-ID …)“ nach einem Update | Server neu starten – beim Start erscheint „Erzeuge Prisma-Client …“, danach passt die API wieder zur Datenbank. Hilft das nicht: Konsole nach der Request-ID durchsuchen. |
| Abbruch bei `npm install` | Zu wenig Speicher/RAM → im Panel „Adjust resources“ erhöhen. |

Weitere Details: `docs/hosting-bot-hosting.md`, `docs/discord-bot.md`.
