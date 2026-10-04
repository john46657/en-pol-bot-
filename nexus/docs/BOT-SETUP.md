# NEXUS Bot – Einrichtung

## 1. Discord Developer Portal
1. *New Application* → **Application ID** = `DISCORD_CLIENT_ID`, *OAuth2 → Client Secret* = `DISCORD_CLIENT_SECRET`.
2. *Bot* → **Token** = `DISCORD_TOKEN`; unter *Privileged Gateway Intents* **Server Members Intent** aktivieren (nötig für „Bewerber verlässt den Server“). *Message Content* wird nicht gebraucht.
3. *OAuth2 → Redirects*: `http://localhost:3000/api/v1/auth/discord/callback` hinzufügen (Dashboard-Login).
4. Bot einladen: Dashboard → Serverauswahl → „Bot einladen“ (oder `http://localhost:3000/api/v1/auth/discord/invite?guildId=<ID>`). Scopes `bot` + `applications.commands`; Rechte: Kanäle ansehen, Nachrichten senden, Links einbetten, Rollen verwalten.

## 2. Dienste
PostgreSQL und Redis (`docker compose up -d`, oder eigene Instanzen über `DATABASE_URL` / `REDIS_URL`).

## 3. Konfiguration & Start
```bash
cp .env.example .env          # DISCORD_*, AUTH_SECRET (openssl rand -hex 32), DATABASE_URL, REDIS_URL ausfüllen
pnpm install
pnpm --filter @nexus/database prisma:generate
pnpm --filter @nexus/database prisma:push      # Schema anlegen (einmalig / nach Schema-Änderungen)
pnpm --filter @nexus/bot dev                   # oder: pnpm build && pnpm --filter @nexus/bot start
```
`DISCORD_DEV_GUILD_ID=<Server-ID>` setzen, damit Slash-Commands sofort erscheinen (sonst global, bis zu 1 h).

Beim Start meldet der Bot „NEXUS Bot bereit“, gleicht alle Server mit der Datenbank ab und registriert die Commands. Fehlende Dienste/Intents/Tokens erzeugen eine konkrete Fehlermeldung.

## 4. Befehle
| Befehl | Zweck |
|---|---|
| `/panel bewerbung [kanal]` | Postet das Bewerbungs-Panel (Button „Bewerbung starten“) – nur mit „Server verwalten“ oder NEXUS-Verwaltungsrolle; Bewerbung muss veröffentlicht sein |
| `/nexus` | Status (veröffentlichte Bewerbungen, offene Einreichungen) + Dashboard-Link |

Ablauf: Button → Bewerbung per DM → Antworten als Nachrichten → Zusammenfassung → Einreichung → Review-Buttons im Review-Channel.
Bewerbungen werden im Dashboard angelegt und veröffentlicht (Verwaltungs-UI folgt).

## Funk (ab Phase 16)
Der Bot nutzt den Gateway-Intent *Guild Voice States* (nicht privilegiert) und braucht auf den Funk-Sprachkanälen bzw. serverweit die Rechte **Mitglieder verschieben** (trennen) und **Mitglieder stummschalten** (Stufe „Mithören“). Ohne diese Rechte meldet der Bot eine Warnung im Log und kann die Whitelist nicht durchsetzen.

## Tickets (ab Phase 25)
Der Bot braucht **Kanäle verwalten** (Ticket-Kanäle anlegen/löschen und Mitgliederrechte setzen) und im Developer-Portal den privilegierten **Message Content Intent**, damit das Transkript beim Schließen die Nachrichteninhalte enthält. Ohne diesen Intent bleibt das Transkript auf Autor, Zeit und Anhänge beschränkt; das Ticket wird dann als „Inhalte nicht lesbar“ markiert (nicht verschwiegen). Das Ticket-Protokoll geht in den Kanal „Ticket-Protokoll“ (Einstellungen → Rollen & Kanäle wählen).
