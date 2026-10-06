# Vom alten Python-Bot zum neuen System

Der frühere Bot (Emden RP Bot) wurde entfernt (liegt in der Git-Historie). Hier steht, was davon im neuen System schon abgedeckt ist und was (noch) fehlt.

| Alt (Datei) | Was es tat | Im neuen System | Stand |
|---|---|---|---|
| `bewerbungen.py` | `/bewerbung` Formular, Antworten in Channel | **Bewerbungen**: öffentliches Web-Formular `/apply`, konfigurierbar in Studio, Prüfung/Entscheidung in *Applications* (Workflow SUBMITTED → … → ACCEPTED/REJECTED) | ✅ Web + Discord `/bewerbung` / `/bewerbungspanel` (Fragen einzeln per DM, Entscheidung per DM) |
| `dienst.py` | `/dienst start/ende`, Stunden | **Dienststatus**: Team-Dashboard, Discord `/dienst an\|pause\|aus`; Dienststunden in *Analytics* und per `/dienststunden` (eigene bzw. mit `alle` das ganze Team) | ✅ |
| `dienstberichte.py` | `/dienstbericht` Formular | **Berichte** (versioniert, Prüf-Workflow), Discord `/bericht` | ✅ |
| `fahndung.py` | Fahndung erstellen/beenden/Liste | **Fahndungen** (Person/Fahrzeug, Ablauf, Aufheben mit Begründung), Discord `/fahndung` + `/fahndungen`, Alarm-Channel | ✅ · Aufheben nur im Web |
| `ausbildung.py` | Ausbilder, Modul-Checkliste, Abschluss | **Academy**: Kurse, Einschreibung, Benotung → Qualifikation | ✅ teilweise (keine Modul-Checkliste pro Rekrut) |
| `teamliste.py` | automatisch aktualisierte Teamliste in Discord | **Team-Dashboard** (Web) + `/team` | ✅ inkl. selbst aktualisierender Teamliste (`/teamliste`) |
| `roblox.py` | Discord ↔ Roblox verknüpfen/suchen | Roblox-ID am Benutzer (manuell, Admin) + Discord-Verknüpfung per Einmal-Code | ✅ inkl. Roblox-Namenssuche `/roblox` |
| `funk.py` | Funk-Whitelist | **Funk-Freigabe** im System + `/funkfreigabe` (optional mit Discord-Rolle) | ✅ |
| `gefahrenstatus.py` | Button-Panel für das Gefahrenlevel | **Gefahrenstatus** (Leitstelle im Web + Button-Panel `/gefahrenstatus`, Meldung im Danger-Channel) | ✅ |
| `gsg9.py` | eigenes Roster + Einsatzberichte | **SEK-Modul** (umbenannt von GSG9): Roster, Einsatzberichte – Web `/sek`, Discord `/sek`, `/sek-bericht` ([sek.md](sek.md)); Bewerbung über das Qualifikations-Panel `/qualipanel` ([qualifications.md](qualifications.md)) | ✅ |
| `tickets.py` | Support-Ticket-Channels (Button) | Support-Tickets in Discord: `/supportpanel` → privater Ticket-Channel (*Tickets* im System sind weiterhin Strafzettel) | ✅ |
| `app.py`, `*.html`, `api_server.py`, `dashboard_config.py` | Web-Dashboard für die Leitung | komplettes neues Web (Dashboard, MDT, Team, Admin, Studio) | ✅ ersetzt |
| `config.py`, `settings.py`, `checks.py`, `database.py`, `discord_oauth.py` | Rollen-Checks, Einstellungen, Datenbank, Discord-Login | Rollen/Berechtigungen, Admin-Settings, PostgreSQL, eigener Login (kein Discord-OAuth) | ✅ ersetzt · ❌ Discord-Login |

## Noch offen (nach Bedarf)
Modul-Checkliste pro Rekrut (Academy), Discord-OAuth-Login. Die Struktur dafür steht (siehe [extending.md](extending.md) und [discord-bot.md](discord-bot.md)).
