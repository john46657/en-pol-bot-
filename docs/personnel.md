# Personnel

Restricted (`personnel.*`). Reading a personnel file is audited (`personnel.read`). Promotions create a `PersonnelRecord` and notify the officer; nobody can change their own rank or record discipline against themselves. Employment status, callsign, team and qualifications are editable with `personnel.edit`. Duty sessions: `/team` (explicit status only — online presence is never treated as duty). Duty hours: `GET /team/me/hours?days=7` (own, `team.view`) and `GET /team/hours?days=7` (all officers, `team.manage`); sessions are clipped to the period, minutes per status.

## Personal- & Verwaltungssystem (Dashboard)

Alles Organisatorische wird im Dashboard eingestellt – nichts davon ist im Code fest hinterlegt.

| Bereich | Seite | Rechte |
|---|---|---|
| Personal-Übersicht (Karten/Tabelle, Suche nach Discord/Roblox/Rang/Abteilung/Status/Dienstnummer, Filter aktiv/inaktiv/abwesend) | `/personnel` | `personnel.view` |
| Personalakte (Übersicht, Rang, Beförderungen, Ausbildungen, Prüfungen, Auszeichnungen, Verwarnungen, Abwesenheiten, Versetzungen, Dienstnummern, Notizen, Historie) | `/personnel/:id` | `personnel.view`, geschützte Bereiche `personnel.view_sensitive`, Verwarnungen `warning.view` |
| 🎖️ Beförderungen: Anträge, Genehmigungsstufen, Durchführung, Ränge mit Voraussetzungen, Workflow & Benachrichtigungen | `/promotions` | `promotion.*`, `transfer.*` |
| 🎓 Ausbildungen & Prüfungen (Fortschritt, Fragetypen, Zeitlimit, Versuche, Wartezeit, automatische/manuelle Bewertung, Zertifikate `/certificates/:nr`) | `/trainings` | `training.*`, `exam.*` |
| 📢 Interne Meldungen (Zielgruppe, Priorität, Zeitraum, Lesebestätigung „47 von 52 gelesen“, optional Discord) und 🗳️ Abstimmungen | `/announcements` | `announcements.*`, `polls.*` |
| 🪪 Dienstnummern (Nummernkreise, Status, manuelle Vergabe, Änderung, Freigabe, Sperre, Historie, Automatik) | `/service-numbers` | `dienstnummer.*` |
| Personal-Einstellungen (Status, Abteilungen, Abwesenheitsarten, Schweregrade, Kategorien, Auszeichnungen, sichtbare/geschützte Felder, Zertifikat) | `/admin/personnel` | `promotion.manage_settings` |

### Beförderungen
Antrag (Mitarbeiter, aktueller/gewünschter Rang, Begründung, Leistungen, interne Notiz, Anhänge) → **In Prüfung** → Genehmigungsstufen (je Stufe Dashboard-Rollen; Anzahl nötiger Genehmigungen; Zielrang kann festlegen, welche Ränge genehmigen dürfen) → **Genehmigt** → **Durchführen**: Rang und „seit“ setzen, alte/neue Discord-Rolle tauschen (abschaltbar), optional Dashboard-Rollen, Beförderungshistorie, Audit-Log, Ankündigung im eingestellten Kanal (Text mit Platzhaltern), Benachrichtigung (Dashboard/Discord/DM je Ereignis und Rollen einstellbar). Status: 🟡 Offen, 🔵 In Prüfung, 🟢 Genehmigt, 🔴 Abgelehnt, ⚫ Zurückgestellt (Namen/Emojis änderbar).

Voraussetzungen je Rang werden automatisch geprüft (`5/5 erfüllt → 🟢 BEFÖRDERUNG MÖGLICH`): Mindestzeit im Rang, Dienststunden, Einsätze, bestimmte Ausbildung, bestandene Prüfung, Discord-Rolle, Empfehlung(en), frei definierte Punkte (manuell abhaken mit `promotion.manage_requirements`).

### Dienstnummern
Vergabe ist atomar: Reservierung und Zuweisung laufen in einer Transaktion mit eindeutigen Indizes je Nummernkreis/Nummer – zwei gleichzeitige Vergaben erhalten nie dieselbe Nummer (der Verlierer bekommt automatisch die nächste freie). Ist kein Platz frei, bleibt die Einstellung als „⚠️ Dienstnummer ausstehend“ stehen und kann manuell abgeschlossen werden.

Bewerbung angenommen (Polizei oder Qualifikation, je Zuordnung) → Benutzer/Personalakte → Startrang/Abteilung → Dienstnummer (Zeitpunkt: direkt / nach Abschluss / manuelle Bestätigung; Recht `applications.auto_assign_dienstnummer` beim Entscheider) → Rang-/Abteilungsrollen → Nickname (Format z. B. `[{dienstnummer}] {name}`) → DM (Text mit `{user} {dienstnummer} {rang} {abteilung} {bewerbung} {datum}`) → Audit-Log.

### Datenschutz
Verwarnungen, interne Notizen, Abwesenheitsgründe und die Historie sind geschützt; nach Discord gehen nur neutrale Texte (z. B. „X wurde befördert“), nie Verwarnungsinhalte.
