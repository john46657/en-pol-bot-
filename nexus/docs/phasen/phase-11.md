# Phase 11 – Personalakten

**Stand:** abgeschlossen (2026-10-04) – Datenmodell, Domänenpaket `@nexus/personnel`, API, Bot-Befehl, Dashboard, Anbindung an die Annahme, Tests gegen echte Datenbank, HTTP- und Browser-Test. **Nicht gegen echtes Discord getestet** (Fake-Discord bzw. Attrappen).

## Modell
| Tabelle | Zweck |
| --- | --- |
| `personnel_records` | die eine Akte je Mitglied und Server (RP-Name, Dienstnummer, Dienstgrad, Team, Eintritt, Probezeit, Status aktiv/archiviert, Herkunfts-Bewerbung) |
| `ranks` | Dienstgrade mit Rangfolge, optionaler Discord-Rolle und „Einstieg“-Markierung (genau einer je Server) |
| `teams` | Teams mit optionaler Teamrolle und Teamleitung |
| `personnel_entries` | Einträge der Akte; `kind` ist **erweiterbar** – Phase 11: `AWARD`, `DISCIPLINE`, `NOTE`; später `TRAINING`, `QUALIFICATION`, `PROMOTION`, `ABSENCE`, `SHIFT`, `OPERATION` durch die jeweiligen Module |
| `personnel_events` | Verlauf der Akte (wer, was, vorher/nachher) |

**Abnahme „alle späteren Systeme greifen auf dieselbe Akte zu“:** `@nexus/personnel` stellt `getRecordByUser`, `addEntry`, `setRank`, `setTeam`, `setServiceNumber` u. a. bereit; Module schreiben ihre Daten als `PersonnelEntry` mit eigener `kind` an dieselbe Akte (getestet mit einem `TRAINING`-Eintrag).

## Funktionen
- **Akte** anlegen (mit Mitgliederprüfung und Suche, ohne ID-Eingabe), Stammdaten ändern, archivieren/wiederherstellen (mit Grund), jede Änderung im Verlauf **und** im Audit-Log (Akteur, Berechtigung, Automation).
- **Dienstgrad/Team** setzen: verbundene Discord-Rollen werden über das Rollenänderungs-Protokoll getauscht (alt → neu); schlägt Discord fehl, bleibt die Änderung in der Akte, der Fehler wird gemeldet.
- **Dienstnummer:** Format (Präfix, Stellen, nächste Nummer) je Server; automatische Vergabe atomar und ohne Duplikate (auch parallel), manuelle Vergabe mit Eindeutigkeitsprüfung.
- **Auszeichnungen, Disziplin, Notizen:** hinzufügen, **widerrufen statt löschen** (Grund, bleibt sichtbar).
- **Dienstgrade/Teams/Format verwalten** im Dashboard (Berechtigung `personnel.structure.manage`); Löschen verwendeter Dienstgrade/Teams wird verweigert (deaktivieren statt löschen).
- **Bot:** `/akte [mitglied]` mit derselben Rechteprüfung wie das Dashboard.

## Berechtigungen je Bereich (Abschnitt 66) und Team-Bereich
Neue Rechte: `personnel.rank.edit`, `.team.edit`, `.number.edit`, `.award.manage`, `.discipline.view/manage`, `.note.view/create`, `.history.view`, `.structure.manage` (zusätzlich zu `view/create/edit/archive`). Vorlagen entsprechend erweitert.

| Bereich | Recht | Sichtbarkeit |
| --- | --- | --- |
| Stammdaten, Dienstgrad, Team, Dienstnummer, Auszeichnungen | `personnel.view` (oder `own.profile.view` für die eigene Akte) | |
| Disziplin | `personnel.discipline.view` | getrennt |
| Notizen | `personnel.note.view` | getrennt |
| Verlauf | `personnel.history.view` | getrennt |

**Team-Bereich wirkt jetzt wirklich:** Eine Teamleitung (Vorlage mit TEAM-Geltungsbereich) sieht/bearbeitet nur Akten des **eigenen Teams** (Team der eigenen Akte oder Team, dessen Leitung sie ist); Listen werden entsprechend gefiltert; Team-Versetzungen verlangen das Recht für das bisherige **und** das neue Team. Ein Beamter sieht nur die eigene Akte (ohne Disziplin/Notizen). Eine Sperre überstimmt, Besitzer/Administratoren dürfen alles. Technisch: `@RequireAnyScope` im Guard („irgendwo vorhanden“), die konkrete Akte prüft der Service (`canOn`).

## Annahme-Pipeline (Abschnitt 63) – jetzt vollständig
Die Schritte **Personalakte, Dienstnummer, Einstiegsdienstgrad, Team, Probezeit** sind keine „nicht verfügbar“-Platzhalter mehr:
- **Personalakte:** prüft vorhandene Akte (weiterverwendet; archivierte wird wiederhergestellt), sonst neu mit RP-Name aus der konfigurierten Frage (Fallback: Anzeigename), Herkunfts-Bewerbung gespeichert.
- **Dienstnummer:** nächste freie nach Format (vorhandene bleibt).
- **Einstiegsdienstgrad:** gewählter oder als „Einstieg“ markierter; fehlt er, meldet der Schritt **ehrlich einen Fehler** (Akte und Nummer bleiben); verbundene Rolle wird vergeben.
- **Team:** konfiguriertes Team samt Teamrolle; **Probezeit:** Ende nach konfigurierten Tagen (0 = übersprungen).
- Test-Bewerbungen ändern keine Personalakten; **Ablehnungen erzeugen weder Akte noch Dienstnummer** (die Nummer wird nicht verbraucht).
- Einstellungen je Bewerbung im Builder: Einstiegsdienstgrad, Team, Probezeit, Frage für den RP-Namen; jeder Schritt einzeln abschaltbar; abhängige Schritte ohne Akte melden verständlich „es gibt noch keine Personalakte“.

## Dashboard
**Personal** (Suche, Filter Status/Team/Dienstgrad, „Neue Akte“ mit Mitgliedersuche), **Akte** (Stammdaten, Dienstgrad, Team, Dienstnummer, Auszeichnungen/Disziplin/Notizen mit Hinzufügen/Widerrufen, Archivieren, Verlauf – nur Bereiche, die der Benutzer sehen darf), **Dienstgrade & Teams** (inkl. Nummernformat). Hinweis auf Module, die später folgen (Ausbildung, Qualifikationen, Beförderungen, Abwesenheiten, Dienststunden, Einsätze).

## Tests
- `packages/personnel` (**28**, echte Datenbank): Akte (Eindeutigkeit, Validierung, Verlauf, Audit, Serverisolation), Dienstnummern (Format, Überspringen, **parallel ohne Duplikate**, Konflikte, getrennte Nummernkreise), Dienstgrad/Team inkl. Rollenwechsel und Rollenfehler, Einstiegsdienstgrad/Löschschutz, Einträge und Bereichstrennung inkl. fremder Eintragsart, Liste/Suche/Blättern/Team-Einschränkung, Zugriff (Teamleitung vs. Personal, Leitung ohne eigene Akte, Eigenzugriff, Sperre, Besitzer), **Annahme-Pipeline** (alles, Einstieg fehlt, Rollenfehler, bestehende/archivierte Akte, abschaltbar, Test/Ablehnung).
- `apps/bot` (92): `/akte` (5 Fälle: Personal, Teamleitung eigenes/fremdes Team, Beamter, Datenschutz „keine Auskunft ob Akte existiert“, Besitzer), Personal-Schritte im Bot aktiv.
- `packages/permissions` (37): Vorlagen × Personal-Rechte.
- HTTP (API + DB + Fake-Discord): Struktur (403 ohne Recht), Akten anlegen (Duplikat 409, Nicht-Mitglied abgelehnt), Dienstgrad mit Rolle im Fake-Discord, Dienstnummer (Duplikat 409), Einträge (unbekannte Art 400), **Teamleitung sieht nur das eigene Team**, bearbeiten/archivieren nicht vergeben → verständliche Meldung, Eigenzugriff `/me`, Verlauf. Browser: Liste, Akte, Team ändern, Eintrag widerrufen.

## Fund beim Bauen
Beim ersten HTTP-Lauf waren **Modul-Eintrag und Vorlagen-Erweiterung nicht aktiv** – mehrere Textersetzungen waren durch Umformatierung wirkungslos geblieben (ohne Fehlermeldung). Behoben; Tests sichern beides jetzt ab.

## Grenzen
- **Nicht gegen echtes Discord getestet.**
- Ausbildungen, Qualifikationen, Beförderungen, Abwesenheiten, Dienststunden/Shifts und Einsätze erscheinen erst mit ihren Modulen (der Mechanismus ist vorhanden).
- Teams haben genau eine Zuordnung je Akte (kein Mehrfach-Team); Versetzungs-Anträge mit Genehmigung folgen mit dem Teamwechsel-Ablauf.
- Dienstgradwechsel per Beförderung (Voraussetzungen, Genehmigung) folgt in Phase 23; hier nur direktes Setzen mit Berechtigung.
- Dienstnummern-Format kann nur vorwärts gesetzt werden (kein automatisches Neuvergeben bei Archivierung).
- Notizen/Disziplin lassen sich nicht bearbeiten, nur ergänzen und widerrufen (bewusst nachvollziehbar).
