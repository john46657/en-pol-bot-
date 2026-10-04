# Phase 46 – Fahndungen laufen automatisch ab (Spezifikation 39–41)

**Stand:** abgeschlossen (2026-10-04). Erste Phase nach Abgleich der Gesamtspezifikation „Polizei-Management-Dashboard“ (58 Punkte) mit dem Ist-Stand.

## Neu
- **Laufzeit:** Jede Fahndung hat `expiresAt`. Standard **20 Minuten**; beim Anlegen frei wählbar (`dauer` im Bot, `durationMinutes` in der API, Feld im Dashboard); **0 = läuft nicht ab**; Obergrenze 7 Tage.
- **Standarddauer je Server** einstellbar (`GET/PUT wanted/settings`, Speichern nur mit `system.manage`, im Audit-Log als `wanted.settings.updated`); Dashboard-Karte „Standarddauer“ auf der Fahndungsseite.
- **Status EXPIRED:** Nach Ablauf `EXPIRED`, `activeKey` frei (dieselbe Person kann neu gesucht werden), Historie „expired – Automatisch abgelaufen“ (ohne Benutzer), nicht mehr bearbeitbar/aufhebbar.
- **Nie als aktiv sichtbar:** Der Worker-Job `wanted-expiry` läuft jede Minute; zusätzlich beendet jede Suche, Prüfung, Anzeige, Neuanlage und Änderung eines Servers zuvor dessen abgelaufene Fahndungen. Auch zwischen zwei Worker-Läufen erscheint also keine abgelaufene Fahndung als aktiv.
- Bot: Karte zeigt „Läuft ab <relativ>“ bzw. „abgelaufen“; Listen streichen Beendete durch. Dashboard: Filter „Abgelaufen“, Ablaufzeit je Fahndung.

## Abgleich Statusnamen der Spezifikation
`ACTIVE`/`EXPIRED` wie gefordert. **`CANCELLED` heißt im System `REVOKED`** („aufgehoben“, mit Pflichtgrund, Benutzer, Zeit) – inhaltlich gleich, nur anders benannt.

## Tests
- `@nexus/wanted`: 11 (neu: Standard 20 min, eigene Dauer, 0, ungültige Werte, Server-Standarddauer + Audit, Ablauf inkl. Historie/Sperre gegen Bearbeiten, nie aktiv ohne Worker, Servertrennung).
- API-E2E: Rechte der Einstellung, Laufzeit, abgelaufene Fahndung nicht in „aktiv“.
- Browser (`wanted.spec.ts`): Fahndung anlegen → „läuft ab um“ → Ablauf erzwingen → verschwindet aus „Aktiv“, erscheint unter „Abgelaufen“ → Standarddauer ändern.

## Grenzen
- Bot-Befehl und Worker wurden nicht gegen einen echten Discord-Bot geprüft (kein Zugang); getestet sind Dienste, API und Dashboard.
- Es gibt keine Benachrichtigung beim Ablauf (nur Historie); die Spezifikation verlangt sie für „neue Fahndung“, nicht für Ablauf.
- Gesamtspezifikations-Lücken, noch offen: Sperren-System (26–28), Team-Zustände ACTIVE/PAUSE/OFF_DUTY/SUSPENDED/CLOSED (30–31), Ticket-Status IN_PROGRESS/WAITING (16), Benachrichtigungsarten (53), Zugriff bei Verlassen des Servers (54).
