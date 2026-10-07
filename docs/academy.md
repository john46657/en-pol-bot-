# Academy

Courses, enrollment (notifies the officer), grading. Pass/fail is computed server-side from the course pass score; passing adds the course title to the officer's qualifications. Graders cannot grade themselves. Not implemented: exams/questions, certificates, instructor assignment UI.

## Ankündigung in Discord
Beim Anlegen eines Kurses (*Neuer Kurs*) kann er direkt **in Discord angekündigt** werden: Kanal wählen, **Rollen pingen** (bis 10), optional **Termin** und **Ort**. Bestehende Kurse lassen sich über **📣 Ankündigen** auf der Karte (erneut) ankündigen.
- Die Nachricht zeigt Titel, Beschreibung, Termin (mit Countdown), Ort, Bestehensgrenze und Ausbilder sowie einen Link ins Dashboard.
- „Kanal und Rollen als Standard merken“ speichert die Auswahl (Recht `academy.manage`); ohne Auswahl gilt dieser Standard, sonst der Ankündigungs-Kanal aus den Einstellungen.
