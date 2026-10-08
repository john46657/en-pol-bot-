# Anmeldung

- `POST /api/v1/auth/login` prüft das Passwort (scrypt, N=2^15, Salt je Benutzer, Vergleich in konstanter Zeit; Dummy-Hash für unbekannte Benutzer), legt eine Sitzung auf dem Server an und setzt `enrp_session` (httpOnly, SameSite=Strict, im Produktivbetrieb Secure). Gespeichert wird nur der SHA-256 des Tokens.
- `POST /auth/logout` beendet die Sitzung. `GET /auth/me` liefert Profil und wirksame Rechte.
- Sitzungen laufen nach `SESSION_TTL_HOURS` ab (Standard 12). Wird ein Benutzer deaktiviert, enden alle seine Sitzungen.
- Sperre: 5 fehlgeschlagene Anmeldungen → 15 Minuten. Die Anmelde-Route ist begrenzt (`LOGIN_RATE_LIMIT`, Standard 10 pro Minute und IP).
- Jeder Versuch steht in `LoginHistory`; Fehlversuche erzeugen `SecurityEvent LOGIN_FAILURE`. An- und Abmeldung werden auditiert.
- Eine E-Mail-Adresse ist nicht nötig; `email` ist optional.
- Anmeldung über Discord und Zwei-Faktor-Anmeldung: siehe [dashboard.md](dashboard.md) und [security.md](security.md).
