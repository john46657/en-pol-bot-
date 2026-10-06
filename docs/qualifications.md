# Qualifikationen (Bewerbung für SEK, Flugstaffel, Ausbilder …)

Ablauf wie bei Appy – aber im eigenen Bot und mit Daten im System:

1. Ein Admin postet mit **`/qualipanel`** (Discord-Recht „Server verwalten“) das Panel in einen Channel: Titel, Einleitung, je Einheit Name + Beschreibung und ein Auswahlmenü **„Triff eine Auswahl“**.
2. Wer eine Einheit auswählt, bekommt eine **Direktnachricht**: „Bist du sicher …?“ mit **Bewerbung starten** / **Abbrechen**; im Channel erscheint (nur für die Person) „Bewerbung gestartet“ mit dem Button **Zur Bewerbung**.
3. Nach dem Start stellt der Bot die Fragen **einzeln per DM** („1/6. …“); man antwortet einfach mit einer Nachricht (max. 1000 Zeichen). **3 Stunden** Zeit, Abbrechen jederzeit.
4. Nach der letzten Antwort wird die Bewerbung gespeichert (Nummer `Q-…`) und in den **Qualifications channel** gepostet – mit allen Fragen/Antworten und den Buttons **Annehmen** / **Ablehnen**.
5. Entscheiden kann jeder mit dem Recht `qualifications.decide` (Button in Discord – Konto muss verknüpft sein – oder im Web unter **Organisation → Qualifications**). Die Person bekommt das Ergebnis per DM; bei Annahme vergibt der Bot die eingestellte **Discord-Rolle** (auf allen Servern, auf denen es sie gibt). Für die Einheit `sek` kommen verknüpfte Benutzer zusätzlich ins SEK-Roster und bekommen die System-Rolle `SEK`.

Regeln: eine offene Bewerbung pro Person und Einheit; eine laufende Bewerbung im Chat zur selben Zeit; über die eigene Bewerbung darf niemand entscheiden. Bewerben geht auch **ohne** verknüpftes Konto.

**Einrichten (Web → Qualifications → Setup, Recht `qualifications.manage`):** Titel und Einleitung des Panels; je Einheit Name, Beschreibung, Discord-Rollen-ID (optional) und bis zu 15 Fragen (eine pro Zeile). Startwerte: Flugstaffel, SEK, Ausbilder mit je 6 Fragen. Nach Änderungen das Panel mit `/qualipanel` neu posten.

**Discord-Einstellungen (Web → Administration → Settings):** *Qualifications channel ID* = Team-Channel für eingehende Bewerbungen (nur für das Team sichtbar machen – die Antworten stehen im Klartext darin). Die Bot-Rolle muss über den zu vergebenden Rollen stehen und „Rollen verwalten“ haben. Der Bot braucht keine „privileged intents“; Mitglieder müssen DMs von Servermitgliedern erlauben.

**Rechte:** `qualifications.view` (Bewerbungen ansehen), `qualifications.decide` (entscheiden), `qualifications.manage` (einrichten). Startrollen: *SEK Leitung* und *Training Staff* (view + decide), *Police Administration* (alle; bei neuen Installationen).

Hinweis: Laufende Bewerbungen liegen im Speicher des Bots – startet der Bot neu, muss eine angefangene Bewerbung neu begonnen werden (eingereichte sind sicher gespeichert).

API: `GET|PUT /qualifications/config`, `GET /qualifications/applications?unit=&status=`, `POST /qualifications/applications/:id/decision`; Bot-Dienst: `GET /bot/qualifications`, `GET /bot/qualifications/open`, `POST /bot/qualifications/applications`.
