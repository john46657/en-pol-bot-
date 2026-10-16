import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Card, Field, fmt, Input } from './ui';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');

/** Eigenes Passwort ändern – alle anderen Sitzungen werden dabei abgemeldet. */
export function PasswordCard() {
  // Nur sinnvoll, wenn die Anmeldung mit Passwort erlaubt ist (sonst meldet man sich nur über Discord an)
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ password: boolean }>('/auth/providers'), staleTime: 300_000 });
  const [v, setV] = useState({ current: '', next: '', repeat: '' });
  const [ok, setOk] = useState(false);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => api('/auth/password', { method: 'PUT', body: { current: v.current, next: v.next } }),
    onSuccess: () => { setV({ current: '', next: '', repeat: '' }); setOk(true); void qc.invalidateQueries({ queryKey: ['my-sessions'] }); },
  });
  const mismatch = v.repeat.length > 0 && v.next !== v.repeat;
  const short = v.next.length > 0 && v.next.length < 12;
  if (providers.data && !providers.data.password) return null;
  return (
    <Card title="Passwort ändern">
      <p className="mb-3 text-xs text-muted">Nur für die Anmeldung mit Benutzername und Passwort. Kennst du dein Passwort nicht (z. B. Konto über Discord angelegt), kann ein Administrator es unter Benutzer &amp; Rollen neu setzen.</p>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setOk(false); save.mutate(); }}>
        <Field label="Aktuelles Passwort">{(id) => <Input id={id} type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />}</Field>
        <Field label="Neues Passwort" error={short ? 'Mindestens 12 Zeichen' : undefined}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />}</Field>
        <Field label="Neues Passwort wiederholen" error={mismatch ? 'Stimmt nicht überein' : undefined}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={v.repeat} onChange={(e) => setV({ ...v, repeat: e.target.value })} />}</Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <Button type="submit" disabled={save.isPending || !v.current || v.next.length < 12 || v.next !== v.repeat}>Passwort ändern</Button>
          <span className="text-xs text-muted">Alle anderen Geräte werden danach abgemeldet.</span>
          {ok && <span role="status" className="text-sm text-success">Passwort geändert.</span>}
          {save.error && <span role="alert" className="text-sm text-danger">{msg(save.error)}</span>}
        </div>
      </form>
    </Card>
  );
}

interface S { id: string; createdAt: string; expiresAt: string; ip: string | null; userAgent: string | null; current: boolean }
/** Grobe Gerätebeschreibung aus dem User-Agent (nur zur Wiedererkennung). */
function device(ua: string | null) {
  if (!ua) return { label: 'Unbekanntes Gerät', mobile: false };
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unbekannt';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return { label: `${br} · ${os}`, mobile: /Mobile|Android|iPhone|iPad/.test(ua) };
}

/** Eigene angemeldete Geräte – einzeln oder alle anderen abmelden. */
export function SessionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: () => api<S[]>('/auth/sessions') });
  const revoke = useMutation({ mutationFn: (sessionId?: string) => api('/auth/sessions/revoke', { method: 'POST', body: sessionId ? { sessionId } : {} }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-sessions'] }) });
  const others = (q.data ?? []).filter((s) => !s.current).length;
  const [all, setAll] = useState(false);
  const rows = all ? q.data ?? [] : (q.data ?? []).slice(0, 6);
  return (
    <Card title="Angemeldete Geräte" actions={others > 0 && <Button size="sm" variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(undefined)}><LogOut size={14} />Alle anderen abmelden ({others})</Button>}>
      {q.isLoading ? <p className="text-sm text-muted">Wird geladen…</p> : (
        <ul className="divide-y divide-line/60">
          {rows.map((s) => { const d = device(s.userAgent); const Icon = d.mobile ? Smartphone : Monitor; return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Icon size={18} className="shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{d.label} {s.current && <Badge tone="success">Dieses Gerät</Badge>}</p><p className="text-xs text-muted">Angemeldet {fmt(s.createdAt)}{s.ip ? ` · IP ${s.ip}` : ''}</p></div>
              {!s.current && <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>Abmelden</Button>}
            </li>
          ); })}
        </ul>
      )}
      {!all && (q.data?.length ?? 0) > rows.length && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(true)}>Alle {q.data!.length} anzeigen</Button>}
      {revoke.error && <p role="alert" className="mt-2 text-sm text-danger">{msg(revoke.error)}</p>}
    </Card>
  );
}
