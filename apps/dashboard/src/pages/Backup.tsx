import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, API_URL } from '../api';
import { errorText } from '../components/QueryState';
import { useToast } from '../toast';

interface RestoreResult {
  restored: Record<string, number>;
  skipped: { model: string; key: string; reason: string }[];
}
const save = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

/** Sicherung der Server-Konfiguration: herunterladen, einspielen, Bereiche zurücksetzen. */
export function Backup() {
  const { guildId = '' } = useParams();
  const toast = useToast();
  const base = `/guilds/${guildId}/backup`;
  const info = useQuery({ queryKey: ['backup-info', guildId], queryFn: () => api<{ tables: string[]; resetScopes: Record<string, string> }>(`${base}/info`), retry: false });
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [confirm, setConfirm] = useState('');

  async function download() {
    try {
      const res = await fetch(`${API_URL}/api/v1${base}`, { credentials: 'include', headers: { 'X-Requested-With': 'nexus' } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Dafür fehlt dir die Berechtigung (Backup erstellen).' : `Sicherung fehlgeschlagen (HTTP ${res.status}).`);
      save(`nexus-backup-${guildId}-${new Date().toISOString().slice(0, 10)}.json`, await res.text());
      toast.success('Sicherung heruntergeladen.');
    } catch (e) {
      toast.error(errorText(e));
    }
  }
  const restore = useMutation({
    mutationFn: async (file: File) => {
      let body: unknown;
      try {
        body = JSON.parse(await file.text());
      } catch {
        throw new Error('Die Datei ist kein gültiges JSON.');
      }
      return api<RestoreResult>(`${base}/restore`, { method: 'POST', body });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success('Sicherung eingespielt.');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const reset = useMutation({
    mutationFn: () => api<{ done: Record<string, boolean>; backup: unknown }>(`${base}/reset`, { method: 'POST', body: { scopes, confirm } }),
    onSuccess: (r) => {
      save(`nexus-backup-vor-zuruecksetzen-${guildId}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.backup, null, 2));
      toast.success('Zurückgesetzt. Eine Sicherung des vorherigen Stands wurde heruntergeladen.');
      setScopes([]);
      setConfirm('');
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <>
      <h1>Sicherung</h1>
      <p className="muted">Sichert die <strong>Konfiguration</strong> dieses Servers als Datei: Einstellungen, Rechte und Rollen, Bewerbungsarten mit Fragen und Panels, Ticket-Kategorien, Dienstgrade/Teams und weitere Strukturen, Design. Nutzdaten (Bewerbungen, Tickets, Akten, Schichten …) sind nicht enthalten.</p>
      <section className="card comp">
        <h2>Sicherung erstellen</h2>
        <button className="btn primary" onClick={() => void download()}>⬇ Sicherung herunterladen</button>
      </section>
      <section className="card comp">
        <h2>Sicherung einspielen</h2>
        <p className="muted">Nur Sicherungen dieses Servers. Einträge der Sicherung werden wiederhergestellt bzw. auf ihren gesicherten Stand gebracht; seitdem neu angelegte Einträge bleiben erhalten.</p>
        <input type="file" accept="application/json,.json" aria-label="Sicherungsdatei" disabled={restore.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f && window.confirm(`Sicherung „${f.name}“ einspielen?`)) restore.mutate(f); e.target.value = ''; }} />
        {result && (
          <div aria-label="Ergebnis der Wiederherstellung">
            <p><strong>Wiederhergestellt:</strong> {Object.entries(result.restored).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nichts'}</p>
            {result.skipped.length > 0 && (
              <details open>
                <summary>{result.skipped.length} übersprungen</summary>
                <ul className="plain">{result.skipped.slice(0, 50).map((s, i) => <li key={i}><code>{s.model}</code> {s.key}: {s.reason}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </section>
      <section className="card comp">
        <h2>Einstellungen zurücksetzen</h2>
        <p className="muted">Nur für Server-Verwalter. Vorher wird automatisch eine Sicherung erstellt und heruntergeladen.</p>
        {Object.entries(info.data?.resetScopes ?? {}).map(([k, label]) => (
          <label key={k} className="fld"><span><input type="checkbox" checked={scopes.includes(k)} onChange={(e) => setScopes(e.target.checked ? [...scopes, k] : scopes.filter((s) => s !== k))} /> {label}</span></label>
        ))}
        <label className="fld"><span>Zur Bestätigung „ZURÜCKSETZEN“ eingeben</span><input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button className="btn danger" disabled={scopes.length === 0 || confirm !== 'ZURÜCKSETZEN' || reset.isPending} onClick={() => reset.mutate()}>Zurücksetzen</button>
      </section>
    </>
  );
}
