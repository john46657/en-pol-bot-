# Qualifikationen (Bewerbung für SEK, Flugstaffel, Ausbilder …)

Ablauf wie bei Appy – aber im eigenen Bot und mit Daten im System. Die normale **Bewerbung bei EN Polizei** (`/bewerbung`, Panel `/bewerbungspanel`) läuft genauso per DM, nutzt aber das Bewerbungsformular aus *Studio* und landet unter *Applications*.

1. Ein Admin postet mit **`/qualipanel`** (Discord-Recht „Server verwalten“) das Panel in einen Channel: Titel, Einleitung, je Einheit Name + Beschreibung und ein Auswahlmenü **„Triff eine Auswahl“**.
2. Wer eine Einheit auswählt, bekommt eine **Direktnachricht**: „Bist du sicher …?“ mit **Bewerbung starten** / **Abbrechen**; im Channel erscheint (nur für die Person) „Bewerbung gestartet“ mit dem Button **Zur Bewerbung**.
3. Nach dem Start stellt der Bot die Fragen **einzeln per DM** („1/6. …“); man antwortet einfach mit einer Nachricht (max. 1000 Zeichen). **3 Stunden** Zeit. Abbrechen: einfach „abbrechen“ schreiben (unter den Fragen gibt es keinen Abbrechen-Button).
4. Nach der letzten Antwort wird die Bewerbung gespeichert (Nummer `Q-…`) und **wie bei Appy** gepostet – in den Channel der Einheit (z. B. `#flugstaffel-bewerbungen`, einstellbar je Einheit) oder sonst in den **Qualifications channel**:
   - jede Frage **fett und nummeriert**, darunter die Antwort (sehr lange Bewerbungen werden gekürzt – vollständig im Dashboard),
   - **Bewerber-Infos**: Discord-ID, Benutzername, Erwähnung, Dauer, Server beigetreten, eingereicht,
   - Buttons **Annehmen**, **Ablehnen**, **Annehmen mit Grund**, **Ablehnen mit Grund**, **Verlauf** (frühere Bewerbungen der Person), **Ticket mit Bewerber öffnen** (privater Channel mit Person, Team-Rolle und dir) und **Im Dashboard ansehen**.
5. Entscheiden kann jeder mit dem Recht `qualifications.decide` (Button in Discord – Konto muss verknüpft sein – oder im Web unter **Organisation → Qualifications**). Danach wird die Nachricht im Channel aktualisiert (Farbe, „Angenommen/Abgelehnt von …“, Grund) und die Entscheidungs-Buttons verschwinden. Die Person bekommt das Ergebnis per DM – **mit Grund**, falls einer angegeben wurde; bei Annahme vergibt der Bot die eingestellte **Discord-Rolle** (auf allen Servern, auf denen es sie gibt). Für die Einheit `sek` kommen verknüpfte Benutzer zusätzlich ins SEK-Roster und bekommen die System-Rolle `SEK`.

Die **Polizei-Bewerbung** erscheint genauso im **Applications channel** (mit Roblox-Name/-ID). Annehmen/Ablehnen per Button braucht `applications.decide` und entscheidet direkt (ohne die Web-Zwischenschritte Prüfung/Gespräch); der Grund geht per DM an die Person.

Regeln: eine offene Bewerbung pro Person und Einheit; eine laufende Bewerbung im Chat zur selben Zeit; über die eigene Bewerbung darf niemand entscheiden. Bewerben geht auch **ohne** verknüpftes Konto.

**Einrichten – alles an einem Ort (Web → Qualifications → Setup, Recht `qualifications.manage`):**
- *Bewerbung bei EN Polizei*: Titel/Text des Panels (`/bewerbungspanel`), **Ping-Rollen** (werden bei neuen Bewerbungen im Channel erwähnt) und die Fragen. Das ist dasselbe Formular wie auf der Web-Seite `/apply` (bearbeitet wird es nur hier unter Applications → Setup); der Roblox-Name wird immer zuerst gefragt.
- *Qualifikationen*: Titel und Einleitung des Panels; je Einheit Name, Beschreibung, Discord-Rollen-ID (bei Annahme), eigener Bewerbungs-Channel, **Ping-Rollen** (z. B. @Staffelkommandant) und die Fragen. Startwerte: Flugstaffel, SEK, Ausbilder mit je 6 Fragen.

**Seiten im Dashboard:** *Organisation → Applications* (Polizei-Bewerbung) und *Organisation → Qualifications* (SEK, Flugstaffel, Ausbilder …) sind gleich aufgebaut:
- Tab **Applications**: Bewerbungen als Karten mit allen Antworten und den Buttons **Accept**, **Reject**, **Accept with reason** und **Reject with reason**. Der Grund geht per DM an die Person.
- Tab **Setup**: alle Einstellungen.

**Einstellungen je Bewerbung (wie bei Appy)** – Channels und Rollen wählst du aus Listen mit Namen. Die Listen meldet der Bot automatisch für jeden Server, auf dem er ist.

**Mehrere Server:** Oben links bei „EN Polizei“ einen Server wählen → *Setup* gilt nur für diesen Server (eigene Fragen, Channels, Rollen, Einheiten). Ohne eigene Einstellungen nutzt ein Server die gemeinsamen (*All servers*); „Use shared settings again“ setzt ihn zurück. Die Liste zeigt dann nur Bewerbungen von diesem Server.
- *Requirements*:
  - **Enabled** öffnet oder schließt die Bewerbung; geschlossen nimmt sie keine Einsendungen an.
  - **Application name**: Name der Bewerbung.
  - **Application type**: Direct Message.
  - **Pending Submission Channel**: Hier landen neue Bewerbungen.
  - **Accepted / Denied Submission Channel**: Hierhin postet der Bot die Bewerbung nach der Entscheidung, mit Ergebnis und Grund.
- *Embed Customization*: eigene Texte für **Accepted**, **Denied**, **Confirmation** (erste DM) und **Completion** (nach dem Absenden). Variablen: `{applicationName}`, `{user}` (wer entschieden hat), `{applicant}`, `{number}`, `{reason}`, `{questionCount}`, `{timeLimit}`. Ein Grund wird automatisch angehängt, wenn der Text kein `{reason}` enthält.
- *Role Config*:
  - **Restricted Roles** und **Required Roles**, jeweils mit „Has all roles“ oder „Has any role“.
  - **Accepted Roles** / **Denied Roles** vergibt der Bot nach der Entscheidung.
  - **Ping Roles** werden bei neuen Bewerbungen erwähnt.
  - **Accepted / Denied Removal Roles** werden nach der Entscheidung entfernt.
  - **Pending Roles** gibt es beim Einreichen; sie werden nach der Entscheidung wieder entfernt.
  - **Remove roles on submit** werden beim Einreichen entfernt.
  - **Application Manager Roles**: Nur wer eine davon hat, darf im Discord entscheiden. Das Recht im System (`applications.decide` bzw. `qualifications.decide`) braucht man trotzdem.
- *Other*:
  - **Staff Threads**: ein Thread je Bewerbung. Der Bot braucht dafür das Recht „Öffentliche Threads erstellen“.
  - **Application cooldown**: Wartezeit bis zur nächsten Bewerbung.
  - **Time Limit**: Zeit zum Ausfüllen, 5 Minuten bis 7 Tage, Standard 3 Stunden.
- Noch nicht eingebaut: „Action On User Leave“. Dafür bräuchte der Bot den privilegierten *Server Members Intent*.

**Fragen-Editor (wie bei Appy)** – bis zu 50 Fragen je Bewerbung, jede als Karte:
- **Typ**: *Text* (Antwort per Nachricht), *Multiple choice* (Auswahlmenü in der DM, eine oder mehrere Optionen) oder *Role select* (wie Auswahl, jede Option mit einer Discord-Rolle – die gewählten Rollen bekommt die Person **bei Annahme** zusätzlich). Oder *Roblox User*: Die Person gibt ihren Roblox-Benutzernamen an – im Web mit Suche und Profilbild zum Auswählen, in Discord prüft der Bot den Namen sofort und zeigt das gefundene Konto (mit Bild) bzw. fragt bei unbekanntem Namen erneut. Der Server prüft beim Einreichen noch einmal bei Roblox und speichert `Name (ID …)`. Bei der Polizei-Bewerbung ersetzt eine solche Frage die eingebaute erste Frage nach dem Roblox-Namen (und setzt Roblox-Name + ID der Bewerbung). Ist Roblox gerade nicht erreichbar, wird der Name ungeprüft übernommen.
- **Duplizieren**, **Löschen**, **Verschieben** (ziehen oder ↑/↓).
- **Validation settings**: Pflicht/optional (optionale Fragen kann man überspringen – Text mit „-“, Auswahl mit „Überspringen“), Mindest- und Höchstlänge bei Text, Optionen und „Mehrfachauswahl“ bei Auswahl/Rollen.
- Bestehende Fragen behalten ihren Schlüssel, damit alte Antworten zugeordnet bleiben; alte Einrichtungen (Fragen als Textzeilen) werden automatisch zu Text-Fragen.

Fragen gelten sofort für neu gestartete Bewerbungen. Geänderte Panel-Texte/Einheiten: Panel mit `/bewerbungspanel` bzw. `/qualipanel` neu posten.

**Discord-Einstellungen (Web → Administration → Settings):** *Qualifications channel ID* = Team-Channel für eingehende Bewerbungen (nur für das Team sichtbar machen – die Antworten stehen im Klartext darin). Die Bot-Rolle muss über den zu vergebenden Rollen stehen und „Rollen verwalten“ haben. Der Bot braucht keine „privileged intents“; Mitglieder müssen DMs von Servermitgliedern erlauben.

**Rechte:** `qualifications.view` (Bewerbungen ansehen), `qualifications.decide` (entscheiden), `qualifications.manage` (einrichten). Startrollen: *SEK Leitung* und *Training Staff* (view + decide), *Police Administration* (alle; bei neuen Installationen).

Hinweis: Laufende Bewerbungen liegen im Speicher des Bots – startet der Bot neu, muss eine angefangene Bewerbung neu begonnen werden (eingereichte sind sicher gespeichert).

API: `GET|PUT /qualifications/config` (inkl. `police` und `policeForm`), `GET /qualifications/applications?unit=&status=`, `POST /qualifications/applications/:id/decision`; Bot-Dienst: `GET /bot/qualifications`, `GET /bot/qualifications/open`, `POST /bot/qualifications/applications`.
