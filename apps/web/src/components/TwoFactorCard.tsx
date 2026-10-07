import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Card, Field, Input, fmt } from './ui';

interface Status { enabled: boolean; enabledAt: string | null; recoveryLeft: number }

/** QR-Code als SVG (wird im Browser erzeugt – das Geheimnis verlässt die Seite nicht). */
function Qr({ text }: { text: string }) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); const cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 4} ${r + 4}h1v1h-1z`);
  return <svg role="img" aria-label="QR-Code für die Authenticator-App" viewBox={`0 0 ${n + 8} ${n + 8}`} className="h-44 w-44 rounded bg-white"><path d={cells.join('')} fill="#000" /></svg>;
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm font-semibold">Wiederherstellungscodes – jetzt sicher aufbewahren (werden nur einmal angezeigt)</p>
      <p className="text-xs text-muted">Jeder Code funktioniert genau einmal, falls das Handy weg ist.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>Kopieren</Button>
        <Button size="sm" onClick={onDone}>Ich habe sie gespeichert</Button>
      </div>
    </div>
  );
}

/** Zwei-Faktor-Anmeldung (Authenticator-App) für den Passwort-Login. */
export function TwoFactorCard() {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['2fa'], queryFn: () => api<Status>('/auth/2fa') });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string>();
  const done = () => { setCode(''); setErr(undefined); void qc.invalidateQueries({ queryKey: ['2fa'] }); void qc.invalidateQueries({ queryKey: ['me'] }); };
  const fail = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Fehler');
  const start = useMutation({ mutationFn: () => api<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { method: 'POST' }), onSuccess: (r) => { setSetup(r); setErr(undefined); }, onError: fail });
  const enable = useMutation({ mutationFn: () => api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { body: { code } }), onSuccess: (r) => { setSetup(undefined); setCodes(r.recoveryCodes); done(); }, onError: fail });
  const disable = useMutation({ mutationFn: () => api('/auth/2fa/disable', { body: { code } }), onSuccess: done, onError: fail });
  const regen = useMutation({ mutationFn: () => api<{ recoveryCodes: string[] }>('/auth/2fa/recovery', { body: { code } }), onSuccess: (r) => { setCodes(r.recoveryCodes); done(); }, onError: fail });
  const s = st.data;
  return (
    <Card title="🔐 Zwei-Faktor-Anmeldung" actions={s && <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? 'Aktiv' : 'Aus'}</Badge>}>
      <p className="mb-3 text-xs text-muted">Gilt für die Anmeldung mit Benutzername und Passwort. „Mit Discord anmelden“ nutzt die Zwei-Faktor-Sicherung deines Discord-Kontos.</p>
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(undefined)} />}
      {s && !s.enabled && !setup && <Button onClick={() => start.mutate()} disabled={start.isPending}>Einrichten</Button>}
      {s && !s.enabled && setup && (
        <div className="space-y-3">
          <p className="text-sm">1. QR-Code mit einer Authenticator-App scannen (Google/Microsoft Authenticator, Authy, 1Password …) – oder den Schlüssel eintippen.</p>
          <div className="flex flex-wrap items-center gap-4"><Qr text={setup.otpauthUrl} /><code className="break-all rounded bg-panel-2 p-2 text-xs">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code></div>
          <p className="text-sm">2. Den angezeigten 6-stelligen Code eingeben.</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); enable.mutate(); }}>
            <Field label="Code" error={err}>{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />}</Field>
            <Button type="submit" disabled={enable.isPending}>Aktivieren</Button>
            <Button type="button" variant="ghost" onClick={() => { setSetup(undefined); setErr(undefined); }}>Abbrechen</Button>
          </form>
        </div>
      )}
      {s?.enabled && (
        <div className="space-y-2">
          <p className="text-sm">Aktiv seit {fmt(s.enabledAt)} · {s.recoveryLeft} Wiederherstellungscodes übrig{s.recoveryLeft <= 2 && ' – bitte neue erzeugen'}</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()}>
            <Field label="Aktueller Code oder Wiederherstellungscode" error={err}>{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={20} />}</Field>
            <Button type="button" variant="secondary" disabled={!code || regen.isPending} onClick={() => regen.mutate()}>Neue Wiederherstellungscodes</Button>
            <Button type="button" variant="danger" disabled={!code || disable.isPending} onClick={() => disable.mutate()}>Abschalten</Button>
          </form>
        </div>
      )}
    </Card>
  );
}
