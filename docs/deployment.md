# 🚀 EN Polizei dauerhaft hosten (VPS + Domain, ohne localhost)

Ergebnis: `https://nexus.deine-domain.de` läuft 24/7, startet nach Neustarts selbst, hat automatisches HTTPS und tägliche Datenbank-Backups.

> **Ehrlich vorab:** Das Docker-Setup wurde auf dem Entwicklungsrechner **nicht ausgeführt** (dort ist kein Docker installiert). Getestet wurde das identische Produktions-Artefakt (`pnpm deploy`, `NODE_ENV=production`, Migration, Seed, Start, Login mit `Secure`-Cookie) sowie die Syntax von Compose und Skripten. Rechne beim ersten Deployment mit ein, ein bis zwei Dinge nachjustieren zu müssen – schick mir dann die Ausgabe von `docker compose logs`.

## Was du brauchst
| Was | Empfehlung |
|---|---|
| VPS | Ubuntu 24.04 (oder 22.04), mind. **2 vCPU / 2 GB RAM / 20 GB**; z. B. Hetzner CX22, Contabo, netcup (ca. 4–6 €/Monat) |
| Domain | irgendeine, bei der du DNS-Einträge setzen kannst (auch Subdomain, z. B. `nexus.meinedomain.de`) |
| Zugang | SSH-Zugang zum Server (idealerweise mit SSH-Key statt Passwort) |

Alternative ohne VPS: Panel-Hosting (z. B. bot-hosting.net) mit einem fertigen ZIP-Paket – siehe [hosting-bot-hosting.md](hosting-bot-hosting.md). Es funktioniert, hat aber Grenzen (RAM, kein HTTPS); für den echten Betrieb ist der VPS die bessere Wahl.

## 1. DNS
Beim Domain-Anbieter einen **A-Record** anlegen: `nexus` → *IP-Adresse deines VPS* (bei IPv6 zusätzlich ein AAAA-Record). Warte, bis `ping nexus.deine-domain.de` die Server-IP zeigt. Ohne korrekten DNS-Eintrag bekommt Caddy kein HTTPS-Zertifikat.

## 2. Code auf den Server bringen
**Variante A – privates GitHub-Repo (empfohlen, Updates sind danach ein Befehl):**
```bash
# auf deinem Mac, im Ordner enrp-nexus (einmalig; Repo vorher auf github.com als PRIVATE anlegen)
git remote add origin git@github.com:DEIN-NAME/enrp-nexus.git
git push -u origin main
# auf dem Server (per SSH; für ein privates Repo vorher einen Deploy-Key bzw. Token einrichten)
git clone git@github.com:DEIN-NAME/enrp-nexus.git && cd enrp-nexus
```
**Variante B – ohne GitHub (Upload per rsync vom Mac):**
```bash
rsync -az --exclude node_modules --exclude dist --exclude .pgdata --exclude .env ./ root@SERVER-IP:~/enrp-nexus/
ssh root@SERVER-IP
cd ~/enrp-nexus
```

## 3. Einrichten (ein Befehl)
```bash
sudo ./deploy/setup-server.sh nexus.deine-domain.de
```
Das Skript installiert Docker, öffnet nur die Ports 22/80/443 (ufw), erzeugt `.env` mit zufälligen Geheimnissen, baut und startet alles, legt den **ersten Admin** an und zeigt dessen Passwort **einmalig** an (Passwort sofort speichern!). **Es werden keine Demo-Daten angelegt.**

Danach `https://nexus.deine-domain.de` öffnen → als `admin` anmelden.

## 4. Erste Schritte in der App
1. *Admin → Users*: eigenen Account anlegen (Rolle System Administrator), mit diesem arbeiten; das Standard-`admin`-Konto danach deaktivieren oder starkes Passwort lassen.
2. *Admin → Roles & Permissions*: Rollen an deine Fraktionsstruktur anpassen.
3. *Admin → Legal Codes*: Strafkatalog eintragen. *Admin → Settings*: Organisationsname, Zeitzone. *Studio*: Custom Fields, Akzentfarbe, Bewerbungsformular.
4. Benutzer und Personalakten anlegen; Roblox-User-IDs bei Bedarf manuell hinterlegen.
5. Bewerbungsseite für Interessenten: `https://nexus.deine-domain.de/apply`.

## 5. Betrieb
| Aufgabe | Befehl (im Projektordner auf dem Server) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f api` (oder `web`, `db`) |
| Update einspielen | `./deploy/update.sh` (Git-Pull, Neubau, Migrationen laufen automatisch) |
| Neustart | `docker compose restart api` |
| Stoppen / Starten | `docker compose down` / `docker compose up -d` |

Alle Dienste haben `restart: unless-stopped` – sie starten nach Server-Neustart und Abstürzen von selbst. Logs rotieren automatisch (10 MB × 5).

### Monitoring
Kostenlos z. B. mit UptimeRobot: HTTP-Monitor auf `https://nexus.deine-domain.de/health` (liefert `{"status":"ok"}`), Benachrichtigung per E-Mail/Discord.

### Backups
- **Datenbank:** täglich automatisch nach `./backups/` (14 Tage, 8 Wochen, 6 Monate). **Kopiere die Backups regelmäßig vom Server weg** (ein Backup auf demselben Server schützt nicht vor Serverausfall), z. B. per `rsync` auf deinen Mac oder die Backup-Funktion deines Hosters (Snapshots dazubuchen).
- **Hochgeladene Dateien:** `docker run --rm -v enrp-nexus_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .`
- **Wiederherstellen:** `./deploy/restore.sh backups/daily/enrp-DATUM.sql.gz` (fragt vorher nach Bestätigung). Probiere eine Wiederherstellung einmal aus, **bevor** du dich auf die Backups verlässt.

### Aufbewahrung
Die API räumt täglich alte Sessions, Login-Historie und gelesene Benachrichtigungen auf (einstellbar unter *Admin → Settings*). **Audit-Logs werden nie gelöscht.**

## 6. Sicherheits-Checkliste für den Server
- [ ] SSH nur mit Key (`PasswordAuthentication no` in `/etc/ssh/sshd_config`), kein Root-Login mit Passwort
- [ ] `apt update && apt upgrade` regelmäßig (oder `unattended-upgrades`)
- [ ] `.env` nie ins Git (steht in `.gitignore`), Rechte `600`
- [ ] Beim Hoster Snapshots/Backups aktivieren
- [ ] Optional: `fail2ban` gegen SSH-Brute-Force
- [ ] Nach dem ersten Login: Admin-Passwort ändern/speichern, Demo-Zugänge gibt es in Produktion nicht

## 7. Fehlersuche
| Problem | Ursache / Lösung |
|---|---|
| Browser zeigt Zertifikatsfehler / Seite nicht erreichbar | DNS-Eintrag noch nicht aktiv, oder Port 80/443 beim Hoster-Firewall gesperrt. `docker compose logs web` zeigt Caddys Zertifikatsversuche. |
| „Server not reachable“ im UI | API nicht gesund: `docker compose logs api`; häufig fehlt/falsch ist `.env` (`SESSION_SECRET`, `DOMAIN`). |
| 403 `ORIGIN_REJECTED` | `DOMAIN` in `.env` stimmt nicht mit der aufgerufenen Adresse überein → anpassen, `docker compose up -d`. |
| Login klappt, danach sofort wieder abgemeldet | Seite über `http://` statt `https://` aufgerufen (Session-Cookie ist `Secure`). |
| Update schlägt fehl | `docker compose logs api` – Migrationsfehler stehen dort; Backup wiederherstellen und mir die Meldung schicken. |
| Vergessenes Admin-Passwort | Anderen Admin nutzen; sonst Passwort per DB-Skript zurücksetzen (sag Bescheid, ich schreibe es dir). |

## Technische Hinweise
- Discord-Bot optional: `docker compose --profile bot up -d --build` (siehe discord-bot.md).
- `docker-compose.yml`: `db` (PostgreSQL 17), `api` (Migrationen beim Start, läuft als Nicht-Root), `web` (Caddy: statische Dateien, Reverse Proxy, Auto-HTTPS, Sicherheits-Header), `backup`.
- `/readiness` und Swagger (`/api/docs`) sind von außen **nicht** erreichbar; `/health` schon (für Monitoring).
- Umgebungsvariablen: siehe `.env.example`. Nie `prisma db push` oder `migrate reset` in Produktion verwenden.
