# Berechtigungen

Reihenfolge der Auflösung (einmal umgesetzt in `packages/shared/src/permissions.ts`, genutzt von Guards und Services):

1. ausdrückliches **VERBOT** am Benutzer 2. ausdrückliche **ERLAUBNIS** am Benutzer 3. **VERBOT** über Rolle/Gruppe 4. **ERLAUBNIS** über Rolle/Gruppe 5. Standard: **VERBOT**

Rechte unterstützen Platzhalter (`module.*`, `*`). Rollen erreichen Benutzer direkt oder über Gruppen. Controller deklarieren `@RequirePermission(...)`; Regeln auf Ebene einzelner Einträge stehen in den Services (z. B. Sichtbarkeit von Berichten, interne Notizen bei Beschwerden, Zugriff auf Medien folgt dem verknüpften Eintrag). Abgelehnte Zugriffe erzeugen `SecurityEvent PERMISSION_DENIED`.

Regel für verborgene Einträge: Einträge, die jemand nicht sehen darf, antworten mit `404`; Suche und Auswertungen berühren nur Arten, die der Benutzer sehen darf.

Seit der Dashboard-Erweiterung haben Rollen eine **Priorität** (Rangfolge), können **deaktiviert** sein und zu einem Discord-Server gehören (`guildId`, nur gültig, wenn dieser Server gewählt ist – Header `X-Guild-Id`). Rollen und Benutzer verwalten darf man nur **unter dem eigenen Rang**, und vergeben kann man nur Rechte, die man selbst hat. Bereichsrechte `dashboard.<bereich>.view` blenden ganze Bereiche aus. Details: [dashboard.md](dashboard.md).
