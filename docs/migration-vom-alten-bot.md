# Vom alten Python-Bot zum neuen System

Der frühere Bot (Emden RP Bot) liegt **unverändert** in [`archiv-alter-python-bot/`](../archiv-alter-python-bot). Hier steht, was davon im neuen System schon abgedeckt ist und was (noch) fehlt.

| Alt (Datei) | Was es tat | Im neuen System | Stand |
|---|---|---|---|
| `bewerbungen.py` | `/bewerbung` Formular, Antworten in Channel | **Bewerbungen**: öffentliches Web-Formular `/apply`, konfigurierbar in Studio, Prüfung/Entscheidung in *Applications* (Workflow SUBMITTED → … → ACCEPTED/REJECTED) | ✅ im Web · ❌ kein `/bewerbung` in Discord |
| `dienst.py` | `/dienst start/ende`, Stunden | **Dienststatus**: Team-Dashboard, Discord `/dienst an\|pause\|aus`; Dienststunden in *Analytics* | ✅ · ❌ `/dienst stunden` |
| `dienstberichte.py` | `/dienstbericht` Formular | **Berichte** (versioniert, Prüf-Workflow), Discord `/bericht` | ✅ |
| `fahndung.py` | Fahndung erstellen/beenden/Liste | **Fahndungen** (Person/Fahrzeug, Ablauf, Aufheben mit Begründung), Discord `/fahndung` + `/fahndungen`, Alarm-Channel | ✅ · Aufheben nur im Web |
| `ausbildung.py` | Ausbilder, Modul-Checkliste, Abschluss | **Academy**: Kurse, Einschreibung, Benotung → Qualifikation | ✅ teilweise (keine Modul-Checkliste pro Rekrut) |
| `teamliste.py` | automatisch aktualisierte Teamliste in Discord | **Team-Dashboard** (Web) + `/team` | ✅ · ❌ selbst aktualisierende Discord-Nachricht |
| `roblox.py` | Discord ↔ Roblox verknüpfen/suchen | Roblox-ID am Benutzer (manuell, Admin) + Discord-Verknüpfung per Einmal-Code | ✅ · ❌ Roblox-Namenssuche über die Roblox-API |
| `funk.py` | Funk-Whitelist | Systemkanäle (`/funk`) – **keine** Whitelist | ❌ |
| `gefahrenstatus.py` | Button-Panel für das Gefahrenlevel | – | ❌ |
| `gsg9.py` | eigenes Roster + Einsatzberichte | Teams/Personalakte + Berichte (kein eigenes GSG9-Modul) | ❌ teilweise |
| `tickets.py` | Support-Ticket-Channels (Button) | **Achtung:** „Tickets“ im neuen System sind *Strafzettel*. Support-Tickets gibt es nicht. | ❌ |
| `app.py`, `*.html`, `api_server.py`, `dashboard_config.py` | Web-Dashboard für die Leitung | komplettes neues Web (Dashboard, MDT, Team, Admin, Studio) | ✅ ersetzt |
| `config.py`, `settings.py`, `checks.py`, `database.py`, `discord_oauth.py` | Rollen-Checks, Einstellungen, Datenbank, Discord-Login | Rollen/Berechtigungen, Admin-Settings, PostgreSQL, eigener Login (kein Discord-OAuth) | ✅ ersetzt · ❌ Discord-Login |

## Mögliche nächste Schritte (nach Bedarf)
Discord-`/bewerbung`, selbst aktualisierende Teamliste, Gefahrenstatus, Funk-Whitelist, GSG9-Modul, Support-Tickets, Discord-OAuth-Login. Sag, welche du brauchst – die Struktur dafür steht (siehe [extending.md](extending.md) und [discord-bot.md](discord-bot.md)).
