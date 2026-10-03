import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export function Login() {
  const { user, login } = useAuth();
  const loc = useLocation();
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
        <Field label="Username">{(id) => <Input id={id} name="username" autoComplete="username" required autoFocus />}</Field>
        <Field label="Password" error={err}>{(id) => <Input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
