# Phase 56 – Rechte-Sicherheitsregeln, temporäre Rechte, Profil-Metadaten

## Umgesetzt
- **Rechte verwalten ohne Server-Verwalter:** Die Endpunkte für Rechte, Profile, Mitglieder und Audit prüfen jetzt `permissions.view`, `permissions.edit` bzw. `audit.view` statt Discord-Verwalter.
- **Sicherheitsregeln (`RightsService`):**
  1. Rollen nur bearbeiten, die in der Rangfolge unter der eigenen höchsten Rolle stehen (Besitzer ausgenommen).
  2. Nur Rechte vergeben, die man selbst besitzt (Server-Verwalter besitzen alle).
  3. Eigene Ausnahmen und Benutzer mit gleichem/höherem Rang nicht ändern.
  4. Der Serverbesitzer ist über das Dashboard nie einschränkbar.
  Verweigerte Versuche landen als `permissions.change.denied` im Audit-Log.
- **Temporäre Rechte:** Benutzer-Ausnahmen mit `expiresAt` oder `durationDays` (1–365). Abgelaufene Rechte werden bei der Auflösung nicht mehr berücksichtigt (Filter in `permissionRepository`), Zeile bleibt zur Nachvollziehbarkeit erhalten.
- **Profile:** Farbe (#RRGGBB), Priorität (Sortierung), Aktiv-Schalter (deaktivierte Profile gelten nirgends), Duplizieren (`POST permission-profiles/:id/duplicate`).
- Migration `20261005040000_permission_expiry_profile_meta`.

## Tests
`apps/api/test/rights.test.ts` (7 Fälle: Rangfolge, Eigenbesitz, Verwalter, Besitzer, Profile, Ausnahmen).

## Grenzen
- Dashboard: Ablauf (Tage), Farbe, Priorität, Aktiv-Schalter und Duplizieren sind angebunden (Typprüfung und Build grün), aber nicht im Browser geklickt.
- Rang- und Besitzerprüfung gegen Discord ist nur mit Mocks getestet, nie gegen einen echten Server.
- Abgelaufene Zeilen werden nicht automatisch gelöscht.
