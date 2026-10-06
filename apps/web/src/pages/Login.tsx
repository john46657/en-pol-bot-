import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router';
import { Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

/** Rückmeldungen nach „Mit Discord anmelden“ (`/login?discord=…`). */
const DISCORD_ERRORS: Record<string, string> = {
  not_member: 'Du bist nicht auf unserem Discord-Server. Tritt zuerst dem Server bei.',
  no_account: 'Für dieses Discord-Konto gibt es noch kein Konto. Bitte wende dich an die Leitung.',
  inactive: 'Dein Konto ist deaktiviert.',
  cannot_verify: 'Die Server-Mitgliedschaft konnte nicht geprüft werden. Bitte später erneut versuchen.',
  cancelled: 'Anmeldung bei Discord abgebrochen.',
  state: 'Die Anmeldung ist abgelaufen. Bitte noch einmal versuchen.',
  taken: 'Dieses Discord-Konto ist bereits mit einem anderen Benutzer verknüpft.',
  disabled: 'Die Anmeldung mit Discord ist nicht eingerichtet.',
  failed: 'Anmeldung mit Discord fehlgeschlagen. Bitte erneut versuchen.',
};

function DiscordIcon() {
  return <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.2.5a18 18 0 0 1 4.4 1.4 16.6 16.6 0 0 0-15.3 0A18 18 0 0 1 8.8 3.5L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.8 19.8 0 0 0 6 3l1.2-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4a12.8 12.8 0 0 1-2 1l1.2 2a19.8 19.8 0 0 0 6-3c.4-5.2-.7-9.6-3.4-13.6ZM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" /></svg>;
}

export function Login() {
  const { user, login } = useAuth();
  const loc = useLocation();
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ discord: boolean; password?: boolean }>('/auth/providers'), retry: false });
  const passwordForm = !providers.data || providers.data.password !== false; // nur Discord, sobald eingerichtet
  const discordError = new URLSearchParams(loc.search).get('discord');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(undefined);
    try { await login(String(f.get('username')), String(f.get('password'))); }
    catch (x) { setErr(x instanceof ApiError && x.status === 429 ? 'Too many attempts. Please wait a minute.' : 'Invalid username or password.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-panel p-6" aria-label="Sign in">
        <div className="flex items-center gap-2 text-lg font-semibold"><Shield className="text-primary" aria-hidden />EN Polizei</div>
        <p className="text-sm text-muted">Police CAD / MDT — authorised personnel only.</p>
        {discordError && <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{DISCORD_ERRORS[discordError] ?? DISCORD_ERRORS.failed}</p>}
        {providers.data?.discord && (
          <>
            <a href="/api/v1/auth/discord" className="flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-4 py-2.5 font-medium text-white hover:bg-[#4752c4]"><DiscordIcon />Mit Discord anmelden</a>
            {passwordForm && <div className="flex items-center gap-2 text-xs text-muted"><span className="h-px flex-1 bg-line" />oder mit Benutzername (Notfall-Zugang)<span className="h-px flex-1 bg-line" /></div>}
          </>
        )}
        {passwordForm && (
          <>
            <Field label="Username">{(id) => <Input id={id} name="username" autoComplete="username" required autoFocus={!providers.data?.discord} />}</Field>
            <Field label="Password" error={err}>{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </>
        )}
      </form>
    </div>
  );
}
