# MDT (Weboberfläche)

Wichtige Routen: `/mdt /dashboard /cad/* /dispatch /incidents /team /persons /vehicles /reports /complaints /investigations /wanted /personnel /applications /academy /analytics /admin/*`. Menüeinträge und Routen-Schutz richten sich nach den wirksamen Rechten; die API setzt dieselben Regeln durch.

Die **MDT-Seite** (`/mdt`) ist das zentrale Portal: Suche mit Bereich (alles / Person / Fahrzeug), Schnellaktionen je nach Recht (Einsatz, Bericht, Beschwerde, Ermittlung, Fahndung, Beweismittel anlegen) sowie Übersichten zu Fahndungen, Einsätzen und Berichten. Das **Team-Dashboard** (`/team`) listet Beamte mit Rang, Rufname, Einheit, Dienststatus, aktuellem Einsatz und letzter Statusänderung; mit `team.manage` lässt sich der Dienststatus anderer setzen, mit `dispatch.assign` lassen sich Beamte zwischen Einheiten verschieben.

Globale Suche: **Strg/Cmd+K** (Name, Roblox-ID, Kennzeichen, I-/R-/C-/CASE-/E-Nummern), auf dem Server nach Rechten gefiltert.

**Roblox-Suche** (MDT-Suche und Strg/Cmd+K, braucht `persons.view`): Roblox-**Benutzername**, **Roblox-ID** eingeben oder einen **Profil-Link** einfügen. Eine Karte zeigt das Roblox-Konto (Avatar, Anzeigename, @Name, ID, Kontoalter, auf Roblox gesperrt) mit **Personenakte öffnen** (falls vorhanden, per ID oder Name gefunden) bzw. **Personenakte anlegen** (mit Name + ID vorausgefüllt, braucht `persons.create`) und einem Link zum Roblox-Profil. Die API (`GET /api/v1/persons/roblox?q=`) fragt die öffentliche Roblox-API (ohne Token) und merkt sich Antworten 10 Minuten; ist Roblox nicht erreichbar, erscheint die Karte einfach nicht.

Dasselbe funktioniert in jedem **Personen**-Feld: Roblox-Name oder -ID eingeben; gibt es noch keine Akte, wird das Roblox-Konto mit **Personenakte anlegen** angeboten. *Neue Person* braucht nur den Roblox-Namen **oder** die ID – das andere wird bei Roblox nachgeschlagen (nur exakte Treffer, nie geraten).

Allgemeine Bausteine: `ResourcePage` (Seitenweise vom Server, Suche, Statusfilter, Anlegen-Dialog), `RecordPage` (Details, Zeitleiste, Aktionen je nach Recht mit Pflicht-Begründung), `DataTable`, `FormModal`, `PersonPicker`, `StatusBadge`/`PriorityBadge` (Text, nicht nur Farbe), Lade-Platzhalter sowie Leer- und Fehlerzustände (mit Request-ID).
Studio (eigene Felder, Akzentfarbe, Workflows) steht in `studio.md`. Lange Tabellen werden virtualisiert dargestellt (bis 500 Zeilen je Seite).
