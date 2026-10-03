# Ergänzende Spezifikation: Rollen- und Nutzerflüsse (Abschnitte 61–85)

Eingegangen am 2026-10-04 während Phase 8. Dies ist der Abgleich mit dem Ist-Stand; die Abschnitte selbst gelten als Anforderung.

## Abgleich Rollen-/Berechtigungssystem (61.1–61.13, 76–82) – Phase 6 muss erweitert werden ("Phase 6b")
| Anforderung | Ist-Stand (Phase 6) | Lücke |
| --- | --- | --- |
| Discord-Rolle ≠ Berechtigung; Zuordnung nur im Dashboard | Rolle → Permission-Keys (Tabelle `permissions`), Dashboard-Seite vorhanden | ✔ Grundprinzip, aber ohne Profile |
| **Berechtigungsprofile/-gruppen** (Rolle → Profil → Rechte, eigene Profile, 79) | nicht vorhanden | neu: `PermissionProfile` + Zuordnung Rolle ↔ Profil(e) |
| **Mehrere Rollen = Vereinigung; optionale explizite Sperre (77)** | Vereinigung ja, **Sperre nein** | neu: Deny-Einträge (Deny schlägt Allow) |
| **Ebenen GLOBAL/SERVER/MODUL/TEAM/DATENSATZ/BENUTZER (78)** | nur Server + Modul | neu: Scope-Feld an Zuordnungen; TEAM/DATENSATZ-Auswertung kommt mit Teams/Personalakten (Phasen 11/14) |
| **Standardvorlagen für 12 Beispielrollen, nicht fest im Code (61.1)** | keine | neu: Vorlagen (Daten, nicht Code), per Dashboard anwend-/änderbar |
| **Effektive Berechtigungen mit Herkunft (81)** („Quelle: @Rolle → Profil → Recht“) | nur Liste ohne Herkunft | neu: Erklär-API + Dashboard |
| **Benutzer-/Rollenübersicht (80)** | nicht vorhanden | neu: Dashboard-Seite |
| **Verständliche Berechtigungsfehler (82)** („Du benötigst: …“, keine Interna) | Meldung ohne Angabe, Bot: allgemein | anpassen: Beschriftung des benötigten Rechts, keine Schlüssel |
| Dashboard-Login: Mitglied prüfen, Rollen laden, kein Zugriff bei Austritt/ohne Recht (75) | Guard prüft Rollen via Bot; Austritt → 403 | prüfen/ergänzen (Austritt explizit, Dashboard-Recht) |
| Rechte-Namensschema | Katalog nutzt `modul.aktion` (z. B. `applications.accept`) | Spezifikation nennt `APPLICATION_ACCEPT` – wird als Anzeigename/Alias geführt, Schlüssel bleiben `modul.aktion` |

Neue Berechtigungs-Module, die erst mit ihren Phasen entstehen: `system`, `server-config`, `role-mapping`, `personnel`, `team`, `absence`, `exam`, `qualification`, `report`, `audit`, `backup`, `own.*` (Eigenzugriff).

## Nutzerflüsse → Phase
| Abschnitt | Fluss | Phase |
| --- | --- | --- |
| 62, 65 | Bewerbung: PENDING → ACCEPTED/REJECTED/WITHDRAWN, Bewerber nimmt zurück | 9, 10 |
| 63, 64 | Annahme-Pipeline (Personalakte, Dienstnummer, Einstiegsrang/-rolle, Team, Probezeit, Infos, Audit – jeder Schritt einzeln schaltbar); Ablehnung ohne Akte/Nummer/Rolle, mit Grund | 10 + 11 |
| 66 | Personalakte (Bereiche mit eigenen Rechten) | 11 |
| 67 | Ausbildung bis „bestanden“ inkl. Zertifikat/Rolle | 21, 22 |
| 68 | Beförderung (Vorschlag → Prüfung → Rolle/Karriereverlauf) | 23 |
| 69 | Teamwechsel | 11/14 (Teams) |
| 70 | Abwesenheit | 26 |
| 71 | Schicht inkl. Hintergrundjob für überlange Schichten, protokollierte Korrekturen | 12, 31 |
| 72 | Fahndung mit Ablauf (EXPIRED) | 19 |
| 73 | Ticket, Schließungsgrund Pflicht, Wiedereröffnung nur mit Recht | 25 |
| 74 | Teamverwaltung (nur eigenes Team) | 11/14 + TEAM-Scope |
| 83, 84 | Automatische Rollenänderung mit Protokoll (vorher/nachher/Auslöser/Automation/Zeit); bei Discord-Fehler „teilweise fehlgeschlagen“, nie fälschlich Erfolg melden | übergreifend (Rollen-Service ab Phase 10) |
| 85 | Auditierbarkeit: WER/WAS/WARUM/WANN/DATENSATZ/BERECHTIGUNG/AUTOMATION/ERGEBNIS | Phase 29, Audit-Felder ab sofort ergänzen |

## Festlegungen / offene Punkte
- **Leitstelle:** „bleibt ausdrücklich außerhalb dieses Systems“. Der Plan enthält die Leitstelle (Phasen 14–17) und der Katalog die Schlüssel `dispatch.*`. Annahme: Leitstelle wird **nicht** in die Rollenvorlagen/Profile aufgenommen und separat behandelt – **zu bestätigen**, ob Phasen 14–17 weiterhin gebaut werden sollen und wie die Leitstelle abgesichert wird.
- Rechte-Schlüsselschema `modul.aktion` bleibt; die großgeschriebenen Namen der Spezifikation dienen als Alias/Anzeigename.
