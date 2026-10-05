import { loginUrl } from '../api';

const ERRORS: Record<string, string> = {
  denied: 'Die Anmeldung wurde abgebrochen.',
  state:
    'Die Anmeldung konnte nicht bestätigt werden (abgelaufen oder ungültig). Bitte erneut versuchen.',
  failed: 'Die Anmeldung bei Discord ist fehlgeschlagen. Bitte erneut versuchen.',
};

/** Anmeldung ausschließlich über Discord (OAuth2) – es gibt kein Passwort und keine Registrierung. */
export function Login() {
  const reason = new URLSearchParams(window.location.search).get('error');
  return (
    <main className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-brand">
          <span className="brand-mark">N</span>
          NEXUS
        </div>
        <div className="auth-pitch">
          <h2>Dein Server. Deine Struktur. Alles an einem Ort.</h2>
          <p>
            Bewerbungen, Personal, Ausbildung, Einsätze und Tickets – zentral verwaltet und direkt
            mit Discord verbunden.
          </p>
        </div>
        <ul className="auth-points">
          <li>Rechte folgen deinen Discord-Rollen</li>
          <li>Bewerbungen laufen komplett über Discord</li>
          <li>Jede Aktion nachvollziehbar im Protokoll</li>
        </ul>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h1>Willkommen zurück</h1>
          <p className="muted">Melde dich mit Discord an, um deine Server zu verwalten.</p>
          {reason && (
            <p className="alert" role="alert">
              {ERRORS[reason] ?? ERRORS['failed']}
            </p>
          )}
          <a className="btn discord" href={loginUrl}>
            Mit Discord anmelden
          </a>
          <p className="auth-foot">
            Sichere Anmeldung über Discord. Dein Passwort wird weder abgefragt noch gespeichert.
          </p>
        </div>
      </section>
    </main>
  );
}
