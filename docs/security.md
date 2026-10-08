# Sicherheit

- Passwörter: scrypt. Sitzungen: zufällige 256-Bit-Tokens, nur als Hash gespeichert, Cookies httpOnly + SameSite=Strict.
- CSRF: SameSite=Strict + Prüfung der Herkunft bei ändernden Anfragen. XSS: React-Escaping, strenge CSP am Proxy, Uploads werden als Anhang mit `nosniff` und Sandbox-CSP ausgeliefert.
- Eingaben: Zod für jeden Body, jede Query und jeden Parameter. SQL-Injection: Parameter über Prisma.
- Begrenzung: global 300/min, Anmeldung 10/min, öffentliche Bewerbungen 5/Stunde.
- Header: helmet; Caddy ergänzt HSTS/CSP/frame-ancestors.
- Uploads (`/media`): ≤ 10 MB, erlaubte MIME-Typen **plus Prüfung der Datei-Signatur**, SHA-256, zufälliger Speicherschlüssel, bereinigter Dateiname, Zugriff folgt dem Recht am verknüpften Eintrag.
- Exporte (CSV/JSON/PDF): mit Rechteprüfung, auditiert, Formel-Injection in CSV entschärft.
- WebSockets: Verbindungsaufbau über das Sitzungs-Cookie; jedes `subscribe` wird auf dem Server geprüft (auch die Sitzung erneut); unbekannte und verbotene Räume antworten gleich.
- Sicherheitsereignisse (`/admin/security-events`): fehlgeschlagene Anmeldungen, abgelehnte Zugriffe, ungültige Tokens. Geheimnisse werden nie geloggt oder auditiert (Schlüssel wie password/secret/token/hash werden geschwärzt).
- Zwei-Faktor-Anmeldung (TOTP, RFC 6238) bei Passwort-Anmeldung: Persönliche Einstellungen → „Zwei-Faktor-Anmeldung“. Das Geheimnis ist mit AES-256-GCM verschlüsselt (derselbe Schlüssel wie bei ER:LC-Keys), jeder Code gilt nur einmal (letzter Zeitschritt wird gespeichert), 10 Einmal-Wiederherstellungscodes als SHA-256-Hash, falsche Codes zählen zur Kontosperre. Der Passwort-Schritt liefert nur ein signiertes 5-Minuten-Ticket, keine Sitzung. Admins mit `users.manage` können die 2FA eines anderen Kontos zurücksetzen (auditiert als `auth.2fa.reset`). Die Discord-Anmeldung verlässt sich auf die 2FA von Discord.
- Bearbeitungssperren (`/locks/:type/:id`): Wer das Bearbeiten-Formular einer Person, eines Einsatzes (MDT + CAD), eines Berichts oder einer Personalakte öffnet, sperrt den Eintrag (90 s, Lebenszeichen alle 30 s, Freigabe beim Schließen/Abmelden). Andere sehen, wer bearbeitet; Speichern anderer wird mit 409 abgewiesen; eine bewusste Übernahme wird auditiert (`lock.takeover`) und der bisherige Bearbeiter benachrichtigt. Funktioniert zusätzlich zu den Versionsprüfungen (optimistisches Sperren).
- Nicht umgesetzt: Begrenzung von Sicherheitsereignissen, Virenscan.

## Prüfergebnisse (Okt. 2026) und Stand
| Befund | Stand |
|---|---|
| `users.manage` allein konnte beim Anlegen eines Benutzers jede Rolle vergeben (auch System Administrator) | **Behoben** – `roles.manage` nötig; Test in `test/security.test.ts` |
| Benutzer konnten eigene Rollen / Rechte-Ausnahmen ändern | **Behoben** – Abweisung mit 409 |
| Der letzte aktive System Administrator ließ sich deaktivieren oder herabstufen | **Behoben** – 409 |
| Jede Route hat eine ausdrückliche Berechtigungsentscheidung | **Erzwungen** durch einen Test, der alle Controller durchgeht (neue Routen ohne `@RequirePermission`/`@Public`/Freigabeliste lassen den Build scheitern) |
| Daten je Discord-Server getrennt | Zentral im Datenbankzugriff (`prisma/server-scope.ts`); Tests in `test/server-scope.test.ts` |

Bekannte Restrisiken (akzeptiert / noch offen):
- Die Kontosperre (5 Fehlversuche/15 min) lässt sich missbrauchen, um einen bekannten Benutzernamen zu sperren; die Begrenzung je IP schwächt das ab, verhindert es aber nicht.
- `POST /applications` antwortet bei einer offenen Bewerbung derselben Roblox-ID mit 409 (verrät gering, dass es sie gibt).
- `trust proxy` ist fest auf 1 Hop; hinter dem mitgelieferten Caddy betreiben (oder anpassen), damit Clients `X-Forwarded-For` nicht fälschen können.
- Hochgeladene Dateien werden nicht auf Viren geprüft. 2FA ist je Benutzer freiwillig (noch nicht je Rolle erzwingbar). Sitzungstokens sind nicht an IP/Gerät gebunden.
- Rollen mit `roles.manage` können sich selbst nichts direkt geben (eigene Änderungen gesperrt), anderen Konten aber alles; dieses Recht wie Admin behandeln.

## Standards im Produktivbetrieb
- Swagger-UI (`/api/docs`) gibt es nur in der Entwicklung (`ENABLE_SWAGGER=true` schaltet sie trotzdem ein).
- Die Aufbewahrung läuft im Produktivbetrieb täglich im API-Prozess (erster Lauf 1 Minute nach dem Start); jeder Lauf wird als `retention.run` ohne Benutzer auditiert.

## Discord-Bot
Dienst-Client mit Token; handelt nur als verknüpfter, aktiver Benutzer und nur auf einer ausdrücklichen Routen-Freigabeliste (`BOT_USER_ROUTES`, Schreiben beschränkt auf das Anlegen von Einträgen und die Leitstellen-Steuerung). Details und Grenzen: [discord-bot.md](discord-bot.md). Abgedeckt durch `test/discord.test.ts` (Token-Prüfung, nicht verknüpfte/deaktivierte Benutzer, Freigabeliste, Zuordnung im Audit, Warteschlange, Codes nur einmal gültig und mit Ablauf).

## Ein Prozess / Panel-Hosting
- `COOKIE_SECURE` (Standard: im Produktivbetrieb an). Ohne HTTPS setzt das Startskript es auf `false` und gibt eine deutliche Warnung aus; CSP `upgrade-insecure-requests` und HSTS sind dann aus, damit die Seite über http lädt. Zugangsdaten gehen in diesem Modus unverschlüsselt über die Leitung.
- Die CSRF-Prüfung der Herkunft akzeptiert eingestellte Herkünfte **oder** dieselbe Herkunft wie der angefragte Host (seitenfremde Anfragen tragen eine fremde Herkunft und bleiben gesperrt; getestet).
