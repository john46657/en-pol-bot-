# Testanleitung

```bash
pnpm install
pnpm dev:all        # DB + Migrationen + Seed + Demodaten + API + Web mit einem Befehl (Strg+C beendet alles)
```
**http://localhost:5173** öffnen. API-Doku: http://localhost:3000/api/docs. Die Demodaten entstehen über die echte API (dadurch gibt es Audit, Zeitleiste und Benachrichtigungen) und nur, wenn sie noch fehlen. Alles zurücksetzen: beenden, `apps/api/.pgdata` löschen, neu starten. Nur für die Entwicklung – nie gegen die Produktion ausführen (`scripts/demo-data.mjs` verweigert `NODE_ENV=production`).

## Konten
| Benutzer | Passwort | Rollen | Gut zum Testen von |
|---|---|---|---|
| `admin` | `Admin-Demo-123456` | System Administrator | allem: Administration, Studio, Leitstelle, Audit |
| `dispatcher` | `Demo-Pass-123456` | Police Member + Dispatch | Einsatzübersicht, Einsätze |
| `officer1` | `Demo-Pass-123456` | Police Member | MDT, Berichte, Beschwerden |
| `officer2` | `Demo-Pass-123456` | + Senior Officer | Fahndungen, Beweismittel-Übergabe |
| `supervisor` | `Demo-Pass-123456` | + Supervisor | Team-Dashboard, Berichtsprüfung, Fahndungen aufheben |
| `detective` | `Demo-Pass-123456` | + Investigator | Ermittlungen, Beweismittel, Beschwerde-Ermittlung |
| `hrmanager` | `Demo-Pass-123456` | + Police Administration | Personal, Bewerbungen, Auswertungen |
| `trainer` | `Demo-Pass-123456` | + Training Staff | Akademie |

## Zum Ausprobieren
1. **MDT** (`/mdt`) als `officer1`: nach `LC 1001`, `Alex_Racer`, `7000001` suchen; *Bericht anlegen* nutzen. *Ermittlung/Fahndung anlegen* erscheinen nicht.
2. **Leitstelle** (`/dispatch`) als `dispatcher`: Einsatz anlegen, `ADAM-1`/`BRAVO-2` zuweisen, Status weiterschalten. In einem zweiten Browserfenster als `supervisor` anmelden – die Übersicht aktualisiert sich live.
3. **Team-Dashboard** (`/team`) als `supervisor`: sehen, wer im Dienst ist, mit Einheit und aktuellem Einsatz; Dienststatus oder Einheit von jemandem ändern. Als `officer1` gibt es diese Schalter nicht.
4. **Berichte**: `officer1` reicht ein → `supervisor` startet die Prüfung → annehmen/ablehnen (Ablehnen braucht eine Begründung; eigene Berichte kann man nicht prüfen).
5. **Beschwerden**: `officer1` legt eine an → `admin` sichtet/weist zu → `detective` ermittelt (interne Notizen sehen andere nicht).
6. **Rechte**: *Einstellungen → Rollen & Rechte* (ERLAUBEN/VERBIETEN durchschalten), *Einstellungen → Benutzer* (Ausnahmen je Benutzer: ein VERBOT schlägt eine ERLAUBNIS aus der Rolle). In einem privaten Fenster als dieser Benutzer anmelden, um die Wirkung zu sehen.
7. **Studio** (`/admin/studio`): ein Pflichtfeld für Personen anlegen, dann eine Person anlegen.
8. **Öffentliche Bewerbung**: `/apply` (ohne Anmeldung), danach unter *Bewerbungen* als `hrmanager` prüfen.
9. **Audit** (`/admin/audit`): Jede Aktion von oben steht dort; Einträge lassen sich weder ändern noch löschen.
10. **Mehrere Discord-Server**: oben links einen Server wählen, eine Personalakte oder einen Bericht anlegen, dann den Server wechseln – der Eintrag ist dort nicht zu sehen.

Automatisch: `pnpm test` (Unit + Integration), `pnpm e2e` (Browser).

## Discord-Bot testen
Siehe [discord-bot.md](discord-bot.md). Kurz: Bot im Developer Portal anlegen, dann
`DISCORD_TOKEN=… DISCORD_GUILD_ID=… pnpm dev:all`, im Web (Chat-Symbol oben rechts) „Mit Discord verknüpfen“, danach `/person`, `/dienst an`, `/einsatz` ausprobieren. Kanal-IDs unter *Einstellungen → Allgemein → Discord-Bot-Kanäle* setzen und im Web einen Einsatz anlegen → die Nachricht erscheint im Leitstellen-Kanal.
