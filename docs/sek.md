# SEK (Spezialeinsatzkommando)

Eigenes Modul für die Spezialeinheit (früher im alten Bot: `gsg9.py`). Web: **Organisation → SEK** (`/sek`), Discord: `/sek`, `/sek-bericht`, `/sek-bewerbung`.

| Bereich | Wer | Was |
|---|---|---|
| Mitglieder | `sek.view` lesen · `sek.manage` hinzufügen/entfernen | eigenes Roster, getrennt von der Teamliste |
| Einsatzberichte | `sek.view` lesen · `sek.report` **und** SEK-Mitglied schreiben | Datum, Einsatzart, Beschreibung; Nummer `SEK-…` |
| Bewerbungen | jeder Polizeibenutzer (`team.view`) bewirbt sich · `sek.manage` entscheidet | eine offene Bewerbung pro Person; Annahme nimmt ins Roster auf; niemand entscheidet über die eigene |

**Startrollen:** `SEK` (`sek.view`, `sek.report`) und `SEK Leitung` (alle `sek.*`). Sie werden beim nächsten Start automatisch angelegt; zuweisen unter *Administration → Users*. Bestehende Rollen bekommen die neuen Rechte nicht automatisch (Administratoren mit `*` haben sie).

**Discord:** In *Settings → Discord bot channels* optional
- *SEK channel ID*: neue Einsatzberichte und Bewerbungen werden dort gepostet (inkl. Text – nur einen SEK-internen Channel eintragen),
- *SEK role ID*: `/sek aktion:hinzufuegen|entfernen mitglied:@…` vergibt/entzieht diese Discord-Rolle (Bot-Rolle muss darüber stehen, Recht „Rollen verwalten“).

Entscheidungen über Bewerbungen gehen als Direktnachricht an Bewerber mit verknüpftem Discord-Konto. Alle Änderungen stehen im Audit-Log (Modul `sek`).

API: `GET /sek/me`, `GET|POST /sek/members`, `POST /sek/members/remove`, `GET|POST /sek/reports`, `GET|POST /sek/applications`, `POST /sek/applications/:id/decision`.
