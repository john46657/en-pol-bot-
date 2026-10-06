# SEK (Spezialeinsatzkommando)

Eigenes Modul für die Spezialeinheit (früher im alten Bot: `gsg9.py`). Web: **Organisation → SEK** (`/sek`), Discord: `/sek`, `/sek-bericht`. Bewerbungen fürs SEK laufen über das Qualifikations-Panel ([qualifications.md](qualifications.md)).

| Bereich | Wer | Was |
|---|---|---|
| Mitglieder | `sek.view` lesen · `sek.manage` hinzufügen/entfernen | eigenes Roster, getrennt von der Teamliste |
| Einsatzberichte | `sek.view` lesen · `sek.report` **und** SEK-Mitglied schreiben | Datum, Einsatzart, Beschreibung; Nummer `SEK-…` |
| Bewerbungen | über das Discord-Panel `/qualipanel` (Einheit „SEK“) | Annahme nimmt verknüpfte Benutzer ins Roster auf und gibt ihnen die System-Rolle `SEK` |

**Startrollen:** `SEK` (`sek.view`, `sek.report`) und `SEK Leitung` (alle `sek.*` + Qualifikations-Bewerbungen ansehen/entscheiden). Sie werden beim nächsten Start automatisch angelegt; zuweisen unter *Administration → Users*. Bestehende Rollen bekommen die neuen Rechte nicht automatisch (Administratoren mit `*` haben sie).

**Discord:** In *Settings → Discord bot channels* optional
- *SEK channel ID*: neue Einsatzberichte werden dort gepostet (inkl. Text – nur einen SEK-internen Channel eintragen),
- *SEK role ID*: `/sek aktion:hinzufuegen|entfernen mitglied:@…` vergibt/entzieht diese Discord-Rolle (Bot-Rolle muss darüber stehen, Recht „Rollen verwalten“).

Alle Änderungen stehen im Audit-Log (Modul `sek`).

API: `GET /sek/me`, `GET|POST /sek/members`, `POST /sek/members/remove`, `GET|POST /sek/reports`.
