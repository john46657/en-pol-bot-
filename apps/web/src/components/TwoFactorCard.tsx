import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Card, Input } from './ui';

interface Status { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number }

/** QR-Code als SVG (für die Authenticator-App). */
function Qr({ text }: { text: string }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [text]);
  return <div aria-label="QR-Code für die Authenticator-App" role="img" className="h-48 w-48 rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([`EN Polizei – Wiederherstellungscodes (je Code nur einmal gültig)\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'en-polizei-wiederherstellungscodes.txt'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm"><b>Speichere diese Codes jetzt sicher ab.</b> Sie werden nur dieses eine Mal angezeigt. Jeder Code funktioniert einmal, falls du dein Handy nicht hast.</p>
      <ul className="grid grid-cols-2 gap-1 rounded border border-line bg-bg p-3 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>Kopieren</Button>
        <Button variant="secondary" onClick={download}>Als Datei speichern</Button>
        <Button onClick={onDone}>Ich habe die Codes gespeichert</Button>
      </div>
    </div>
  );
}

/** Zwei-Faktor-Anmeldung (Authenticator-App) für den Passwort-Login – Einrichten, Codes erneuern, Ausschalten. */
export function TwoFactorCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['2fa'], queryFn: () => api<Status>('/auth/2fa') });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [mode, setMode] = useState<'disable' | 'recovery'>();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(undefined);
    try { await fn(); setCode(''); } catch (e) { setErr(e instanceof ApiError && e.status === 429 ? 'Zu viele Versuche – bitte kurz warten.' : e instanceof ApiError && e.status === 400 ? 'Der Code stimmt nicht. Prüfe die Uhrzeit am Handy und versuche es erneut.' : 'Das hat nicht geklappt. Bitte erneut versuchen.'); }
    finally { setBusy(false); }
  };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['2fa'] }); void qc.invalidateQueries({ queryKey: ['me'] }); };
  const s = status.data;

  return (
    <Card title="🔐 Zwei-Faktor-Anmeldung" actions={s && <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? 'Aktiv' : 'Aus'}</Badge>}>
      <p className="mb-3 text-xs text-muted">Gilt für die Anmeldung mit Benutzername und Passwort. Nach dem Passwort fragt die Anmeldung zusätzlich nach einem 6-stelligen Code aus einer Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator, Authy, 1Password). Die Anmeldung mit Discord ist davon nicht betroffen – dort gilt die 2FA deines Discord-Kontos.</p>
      {codes ? <RecoveryCodes codes={codes} onDone={() => { setCodes(undefined); refresh(); }} />
        : !s ? <p className="text-sm text-muted">Lädt…</p>
        : !s.enabled ? (
          setup ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api<{ recoveryCodes: string[] }>('/auth/2fa/enable', { body: { code } }); setSetup(undefined); setCodes(r.recoveryCodes); }); }}>
              <ol className="list-decimal space-y-1 pl-5 text-sm"><li>Authenticator-App öffnen und neues Konto hinzufügen.</li><li>QR-Code scannen – oder den Schlüssel von Hand eingeben.</li><li>Den angezeigten 6-stelligen Code hier eintragen.</li></ol>
              <div className="flex flex-wrap items-start gap-4">
                <Qr text={setup.otpauthUrl} />
                <div className="space-y-1 text-sm"><p className="text-muted">Schlüssel zum Abtippen:</p><code className="block break-all rounded bg-bg p-2 font-mono">{setup.secret.match(/.{1,4}/g)!.join(' ')}</code></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label="Code aus der App" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="w-32 font-mono" required />
                <Button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}>Aktivieren</Button>
                <Button type="button" variant="ghost" onClick={() => { setSetup(undefined); setErr(undefined); }}>Abbrechen</Button>
              </div>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            </form>
          ) : <Button onClick={() => void run(async () => setSetup(await api('/auth/2fa/setup', { method: 'POST' })))} disabled={busy}>Zwei-Faktor einrichten</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Aktiv seit {new Date(s.enabledAt!).toLocaleDateString()}. Noch <b>{s.recoveryCodesLeft}</b> Wiederherstellungscodes übrig{s.recoveryCodesLeft <= 3 && <span className="text-warning"> – erneuere sie bald</span>}.</p>
            {!mode ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setMode('recovery')}>Neue Wiederherstellungscodes</Button>
                <Button variant="danger" onClick={() => setMode('disable')}>Ausschalten</Button>
              </div>
            ) : (
              <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
                if (mode === 'disable') { await api('/auth/2fa/disable', { body: { code } }); setMode(undefined); refresh(); }
                else { const r = await api<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', { body: { code } }); setMode(undefined); setCodes(r.recoveryCodes); }
              }); }}>
                <Input aria-label="Aktueller Code oder Wiederherstellungscode" autoComplete="one-time-code" placeholder="Code aus der App" maxLength={32} value={code} onChange={(e) => setCode(e.target.value)} className="w-48 font-mono" required />
                <Button type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} disabled={busy}>{mode === 'disable' ? 'Zwei-Faktor ausschalten' : 'Codes erneuern'}</Button>
                <Button type="button" variant="ghost" onClick={() => { setMode(undefined); setErr(undefined); }}>Abbrechen</Button>
                {err && <p role="alert" className="w-full text-sm text-danger">{err}</p>}
              </form>
            )}
          </div>
        )}
      {!setup && !codes && !mode && err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
