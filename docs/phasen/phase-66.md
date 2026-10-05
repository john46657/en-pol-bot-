# Phase 66 – Namen statt Discord-IDs im Dashboard

Bekannte Grenze aus vielen Phasen („Dashboard zeigt Discord-IDs statt Namen“).

## Umgesetzt
- **API** `GET /guilds/:id/discord/names?ids=…` (jeder mit Dashboard-Zugang, höchstens 100 IDs): Anzeigename = Spitzname auf dem Server → Discord-Anzeigename → Benutzername; dazu `@Benutzername`, Avatar, RP-Name aus der Personalakte und ob die Person noch auf dem Server ist. Ausgetretene werden über ihr Discord-Konto aufgelöst. 10 Minuten Zwischenspeicher je API-Prozess, höchstens 5 Discord-Abfragen gleichzeitig; Fehler bei Discord ergeben „unbekannt“ (dann bleibt die ID sichtbar) und werden beim nächsten Mal erneut versucht.
- **Dashboard-Komponente `UserName`:** sammelt alle IDs einer Seite zu einer Anfrage, zeigt RP-Name bzw. Discord-Namen, im Tooltip `@Benutzername · ID`, bei Ausgetretenen „(ausgetreten)“; bis zur Antwort die ID.
- **Eingesetzt in:** Moderation, Sperren, Tickets (Ersteller, Bearbeiter), Einreichungen und Detail (Bearbeiter, weitere Bearbeiter, Notizen, Verlauf), Bewertungen, Strafen, Beförderungen (Antragsteller, Kandidaten), Ausbildung (Teilnehmer, Ausbilder), Schichten (Bestenliste, Liste), Dienst & Streifen, Einsätze (Leiter), Fuhrpark (Fahrer), Funk, Abmeldungen, SEK (Mitglieder, Einsatzteams, Bestenliste), Personalakte (Verlauf, Einträge), Teamleitung, Logs, Design-Verlauf, fehlgeschlagene Benachrichtigungen.
- **Tests:** `apps/api/test/names.test.ts` (Reihenfolge der Namen, RP-Name, Ausgetretene, Zwischenspeicher, Fehler, Höchstzahl), Browser `e2e/names.spec.ts` (Spitzname, Ausgetretene, Tooltip mit ID, Logs).

## 66b – Personenauswahl statt ID-Eingabe
- **API** `GET /guilds/:id/discord/people?query=` (Dashboard-Zugang): Discord-Mitglieder nach Name/Spitzname und Personalakten nach RP-Name, zusammengeführt (höchstens 15); eine eingefügte Discord-ID wird direkt aufgelöst.
- **Komponente `UserPicker`:** Name tippen (ab 2 Zeichen) → Treffer wählen; die Auswahl zeigt Name und Avatar mit „✕“ zum Ändern; eine eingefügte ID wird sofort übernommen. Gespeichert wird weiterhin die ID.
- **Eingesetzt in:** Moderation (Person und Filter; die bisherige Extra-Suche entfällt), Sperren, Qualifikationen (vergeben/prüfen), SEK (Mitglied, Einsatzteam-Mitglied, Leiter), Dienst & Streifen (Zuteilen), Schichten, Logs-Filter, Einreichungen (Zuweisen, weiterer Bearbeiter, Weiterleiten), Teamleitung, Ausbildung (Teilnehmer, Ausbilder). Funk, Personal und Dashboard-Rollen hatten bereits eine Suche.
- **Tests:** `names.test.ts` (Suche), Browser `names.spec.ts` (Suche nach RP-Name, Auswahl, Entfernen, „Niemand gefunden“), angepasste `moderation.spec.ts`/`restrictions.spec.ts`.

## Grenzen
- Namen können bis zu 10 Minuten veraltet sein.
- Die Suche nach Discord-Namen nutzt Discords Mitgliedersuche (Präfix-Suche); RP-Namen werden auch mitten im Wort gefunden.
