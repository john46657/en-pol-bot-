import { loginUrl } from '../api';

export function Login() {
  return (
    <main className="center">
      <h1>NEXUS</h1>
      <p className="muted">Melde dich mit Discord an, um deine Server zu verwalten.</p>
      <a className="btn primary" href={loginUrl}>
        Mit Discord anmelden
      </a>
    </main>
  );
}
