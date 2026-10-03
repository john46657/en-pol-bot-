import { loginUrl } from '../api';

const ERRORS: Record<string, string> = {
  denied: 'Die Anmeldung wurde abgebrochen.',
  state:
    'Die Anmeldung konnte nicht bestätigt werden (abgelaufen oder ungültig). Bitte erneut versuchen.',
  failed: 'Die Anmeldung bei Discord ist fehlgeschlagen. Bitte erneut versuchen.',
};

export function Login() {
  const reason = new URLSearchParams(window.location.search).get('error');
  return (
    <main className="center">
      <h1>NEXUS</h1>
      <p className="muted">Melde dich mit Discord an, um deine Server zu verwalten.</p>
      {reason && <p className="error">{ERRORS[reason] ?? ERRORS['failed']}</p>}
      <a className="btn primary" href={loginUrl}>
        Mit Discord anmelden
      </a>
    </main>
  );
}
