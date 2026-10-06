# Qualifikationen (Bewerbung für SEK, Flugstaffel, Ausbilder …)

Ablauf wie bei Appy – aber im eigenen Bot und mit Daten im System. Die normale **Bewerbung bei EN Polizei** (`/bewerbung`, Panel `/bewerbungspanel`) läuft genauso per DM, nutzt aber das Bewerbungsformular aus *Studio* und landet unter *Applications*.

1. Ein Admin postet mit **`/qualipanel`** (Discord-Recht „Server verwalten“) das Panel in einen Channel: Titel, Einleitung, je Einheit Name + Beschreibung und ein Auswahlmenü **„Triff eine Auswahl“**.
2. Wer eine Einheit auswählt, bekommt eine **Direktnachricht**: „Bist du sicher …?“ mit **Bewerbung starten** / **Abbrechen**; im Channel erscheint (nur für die Person) „Bewerbung gestartet“ mit dem Button **Zur Bewerbung**.
3. Nach dem Start stellt der Bot die Fragen **einzeln per DM** („1/6. …“); man antwortet einfach mit einer Nachricht (max. 1000 Zeichen). **3 Stunden** Zeit, Abbrechen jederzeit.
4. Nach der letzten Antwort wird die Bewerbung gespeichert (Nummer `Q-…`) und **wie bei Appy** gepostet – in den Channel der Einheit (z. B. `#flugstaffel-bewerbungen`, einstellbar je Einheit) oder sonst in den **Qualifications channel**:
   - jede Frage **fett und nummeriert**, darunter die Antwort (sehr lange Bewerbungen werden gekürzt – vollständig im Dashboard),
   - **Bewerber-Infos**: Discord-ID, Benutzername, Erwähnung, Dauer, Server beigetreten, eingereicht,
   - Buttons **Annehmen**, **Ablehnen**, **Annehmen mit Grund**, **Ablehnen mit Grund**, **Verlauf** (frühere Bewerbungen der Person), **Ticket mit Bewerber öffnen** (privater Channel mit Person, Team-Rolle und dir) und **Im Dashboard ansehen**.
5. Entscheiden kann jeder mit dem Recht `qualifications.decide` (Button in Discord – Konto muss verknüpft sein – oder im Web unter **Organisation → Qualifications**). Danach wird die Nachricht im Channel aktualisiert (Farbe, „Angenommen/Abgelehnt von …“, Grund) und die Entscheidungs-Buttons verschwinden. Die Person bekommt das Ergebnis per DM – **mit Grund**, falls einer angegeben wurde; bei Annahme vergibt der Bot die eingestellte **Discord-Rolle** (auf allen Servern, auf denen es sie gibt). Für die Einheit `sek` kommen verknüpfte Benutzer zusätzlich ins SEK-Roster und bekommen die System-Rolle `SEK`.

Die **Polizei-Bewerbung** erscheint genauso im **Applications channel** (mit Roblox-Name/-ID). Annehmen/Ablehnen per Button braucht `applications.decide` und entscheidet direkt (ohne die Web-Zwischenschritte Prüfung/Gespräch); der Grund geht per DM an die Person.

Regeln: eine offene Bewerbung pro Person und Einheit; eine laufende Bewerbung im Chat zur selben Zeit; über die eigene Bewerbung darf niemand entscheiden. Bewerben geht auch **ohne** verknüpftes Konto.

**Einrichten – alles an einem Ort (Web → Qualifications → Setup, Recht `qualifications.manage`):**
- *Bewerbung bei EN Polizei*: Titel/Text des Panels (`/bewerbungspanel`) und die Fragen – eine pro Zeile, optionale mit „(optional)“ am Ende (max. 50). Das ist dasselbe Formular wie unter Studio → Application form und auf der Web-Seite `/apply`; der Roblox-Name wird immer zuerst gefragt. Unveränderte Fragen behalten ihre Zuordnung zu alten Antworten.
- *Qualifikationen*: Titel und Einleitung des Panels; je Einheit Name, Beschreibung, Discord-Rollen-ID (optional), eigener Bewerbungs-Channel (optional) und bis zu 50 Fragen (eine pro Zeile). Startwerte: Flugstaffel, SEK, Ausbilder mit je 6 Fragen.

Fragen gelten sofort für neu gestartete Bewerbungen. Geänderte Panel-Texte/Einheiten: Panel mit `/bewerbungspanel` bzw. `/qualipanel` neu posten.

**Discord-Einstellungen (Web → Administration → Settings):** *Qualifications channel ID* = Team-Channel für eingehende Bewerbungen (nur für das Team sichtbar machen – die Antworten stehen im Klartext darin). Die Bot-Rolle muss über den zu vergebenden Rollen stehen und „Rollen verwalten“ haben. Der Bot braucht keine „privileged intents“; Mitglieder müssen DMs von Servermitgliedern erlauben.

**Rechte:** `qualifications.view` (Bewerbungen ansehen), `qualifications.decide` (entscheiden), `qualifications.manage` (einrichten). Startrollen: *SEK Leitung* und *Training Staff* (view + decide), *Police Administration* (alle; bei neuen Installationen).

Hinweis: Laufende Bewerbungen liegen im Speicher des Bots – startet der Bot neu, muss eine angefangene Bewerbung neu begonnen werden (eingereichte sind sicher gespeichert).

API: `GET|PUT /qualifications/config` (inkl. `police` und `policeForm`), `GET /qualifications/applications?unit=&status=`, `POST /qualifications/applications/:id/decision`; Bot-Dienst: `GET /bot/qualifications`, `GET /bot/qualifications/open`, `POST /bot/qualifications/applications`.
