# Sprach-Support (Warteraum wie bei GalaxyBot)

*Betrieb → Sprach-Support* (Recht `ticket.view`; einrichten: `ticket.settings`).

## Ablauf
1. Jemand betritt den **Warteraum** (Sprachkanal) eines Raums.
2. Der Bot postet im **Benachrichtigungs-Kanal** „➕ Ein neuer Support-Fall“ – mit Erwähnung der **Team-Rolle**, Case-ID (`#S-…`), Zeit und Nutzer – und den Buttons:
   - **✅ Übernehmen**: Der Bot legt einen privaten Sprachkanal an (Prefix + Name, in der Kategorie des Warteraums; sichtbar nur für die Person und die Team-Rolle) – oder nimmt einen freien **eigenen Kanal** – und verschiebt die Person dorthin. Bist du selbst in einem Sprachkanal, wirst du mitverschoben. Mit **Support-Notizen** entsteht an der Meldung ein Thread `Notizen #S-…`.
   - **❌ Ablehnen**: optionaler Grund, die Person bekommt eine DM.
   - **💬 Nachricht**: Text geht per DM an die Person (und wird im Notizen-Thread vermerkt).
3. Nach der Übernahme: **💬 Nachricht** und **🔒 Schließen**. Ist der Support-Kanal leer, schließt sich der Fall automatisch; vom Bot angelegte Kanäle werden gelöscht. Mit **Bewertung** bekommt die Person 1–5 Sterne per DM.
4. Verlässt die Person den Warteraum vor der Übernahme, wird die Meldung als „Warteraum verlassen“ markiert.

Nur wer die **Team-Rolle** des Raums hat (oder Server-Admin ist), kann Fälle übernehmen, ablehnen, schreiben oder schließen.

## Raum-Einstellungen
Name, aktiv, Warteraum, Benachrichtigungs-Kanal, Team-Rolle (Pflicht) · Support-Kanal-Prefix · Support-Notizen · eigene Kanäle verwenden (Liste von Sprachkanälen) · **Zeiten** (Tage + von/bis, deutsche Zeit; „bis“ vor „von“ = über Mitternacht; ohne Zeiten immer geöffnet – außerhalb bekommt die Person die Zeiten per DM, das Team wird nicht gepingt) · Bewertungen · **Wartemusik** (Einstellung und „Primär setzen“ schon vorhanden, die Wiedergabe kommt in einem späteren Update).

Im Tab **Fälle** stehen alle Fälle mit Status, Bearbeiter, Nachrichten und Bewertung.

## Bot-Rechte
„Kanäle verwalten“, „Mitglieder verschieben“, „Öffentliche Threads erstellen“ (für Notizen) und Zugriff auf Warteraum und Benachrichtigungs-Kanal. Keine privilegierten Intents nötig.
