/**
 * Prüft die Konfiguration auf sicherheitsrelevante Fehler. In **Produktion** sind Fehler fatal (der Start bricht ab),
 * in der Entwicklung werden sie als Warnungen gemeldet. Geheimnisse selbst erscheinen nie in den Meldungen.
 */
export interface ConfigIssue {
  level: 'error' | 'warn';
  message: string;
}

const PLACEHOLDER = /^(change.?me|secret|password|test|dev|example|xxx+|your[-_ ].*|<.*>)$/i;

export function checkSecurityConfig(env: Record<string, string | undefined>): ConfigIssue[] {
  const prod = env['NODE_ENV'] === 'production';
  const issues: ConfigIssue[] = [];
  const add = (cond: boolean, message: string, prodOnlyError = true) => cond && issues.push({ level: prod && prodOnlyError ? 'error' : 'warn', message });
  const secret = env['AUTH_SECRET'] ?? '';
  add(secret.length === 0, 'AUTH_SECRET fehlt – Sitzungen können nicht sicher signiert werden.', false);
  add(secret.length > 0 && secret.length < 32, 'AUTH_SECRET ist zu kurz (mindestens 32 Zeichen, z. B. `openssl rand -hex 32`).');
  add(secret.length > 0 && PLACEHOLDER.test(secret), 'AUTH_SECRET sieht nach einem Platzhalter aus.');
  add(!env['JWT_ISSUER'], 'JWT_ISSUER fehlt.');
  add(!env['DISCORD_TOKEN'], 'DISCORD_TOKEN fehlt – Mitgliedschaft und Rollen können nicht geprüft werden.', false);
  const origins = (env['DASHBOARD_URL'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  add(origins.length === 0, 'DASHBOARD_URL fehlt – erlaubte Herkunft (CORS/CSRF) ist unbestimmt.');
  add(prod && origins.some((o) => !o.startsWith('https://')), 'DASHBOARD_URL muss in Produktion https:// verwenden (Cookies sind `Secure`).');
  add(prod && origins.some((o) => o === '*' || o.includes('*')), 'DASHBOARD_URL darf keine Platzhalter enthalten.');
  add(prod && !env['REDIS_URL'], 'REDIS_URL fehlt – Rate Limits gelten nur je Instanz, Live-Funktionen sind aus.', false);
  return issues;
}
