import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useHrConfig, type Overview } from '../../lib/hr';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows } from '../../components/ui';

interface Warning { id: string; personnelId: string; name: string; rank: string | null; summary: string; details: string | null; data: { severityLabel?: string; emoji?: string; color?: string; category?: string | null } | null; createdAt: string; expiresAt: string | null; by: string; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; active: number }
type State = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ALL';
const STATES: [State, string][] = [['ACTIVE', 'Aktiv'], ['EXPIRED', 'Abgelaufen'], ['REVOKED', 'Zurückgenommen'], ['ALL', 'Alle']];
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

/** Personal → Verwarnungen: alle Verwarnungen mit Zähler je Person (x/Grenze), neu verwarnen und zurücknehmen. Meldung in Discord macht das System. */
export function Warnings() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [state, setState] = useState<State>('ACTIVE');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['hr-warnings', state, q], queryFn: () => api<{ limit: number; items: Warning[] }>('/hr/warnings', { query: { state, q: q.trim() || undefined } }) });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/hr/records/${id}`, { method: 'PATCH', body: { status: 'REVOKED' } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['hr-warnings'] }) });
  const limit = list.data?.limit ?? 3;
  return (
    <>
      <PageHeader title="⚠️ Verwarnungen" subtitle={`Zähler je Person: aktive Verwarnungen / Grenze (${limit}). Neue Verwarnungen erscheinen – falls eingestellt – im Verwarnungs-Kanal in Discord; auch per /verwarnen.`}
        actions={can('warning.create') ? <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-1" />Verwarnen</Button> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="Filter">{STATES.map(([k, l]) => <button key={k} type="button" aria-pressed={state === k} onClick={() => setState(k)} className={`px-3 py-1.5 ${state === k ? 'bg-primary text-white' : 'hover:bg-panel-2'}`}>{l}</button>)}</div>
        <div className="w-full sm:w-72"><Input aria-label="Suche" placeholder="🔍 Name oder Grund…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {revoke.error && <p role="alert" className="mb-2 text-sm text-danger">{errText(revoke.error)}</p>}
      <Card className="overflow-x-auto">
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.items.length ? <EmptyState text="Keine Verwarnungen." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Wer</th><th className="p-2">Grund</th><th className="p-2">Schweregrad</th><th className="p-2">Stand</th><th className="p-2">Datum</th><th className="p-2">Läuft ab</th><th className="p-2">Von</th><th className="p-2" /></tr></thead>
            <tbody>{list.data.items.map((w) => (
              <tr key={w.id} className={`border-b border-line/60 ${w.state !== 'ACTIVE' ? 'opacity-60' : ''}`}>
                <td className="p-2"><Link to={`/personnel/${w.personnelId}`} className="font-medium hover:underline">{w.name}</Link>{w.rank && <span className="block text-xs text-muted">{w.rank}</span>}</td>
                <td className="p-2">{w.summary}{w.details && <span className="block text-xs text-muted">{w.details}</span>}{w.data?.category && <span className="block text-xs text-muted">{w.data.category}</span>}</td>
                <td className="p-2"><span style={{ color: w.data?.color }}>{w.data?.emoji} {w.data?.severityLabel ?? 'Verwarnung'}</span></td>
                <td className="p-2"><Badge tone={w.active >= limit ? 'danger' : w.active >= limit - 1 ? 'warning' : 'neutral'}>{w.active}/{limit}</Badge>{w.state !== 'ACTIVE' && <span className="ml-1 text-xs text-muted">{w.state === 'REVOKED' ? 'zurückgenommen' : 'abgelaufen'}</span>}</td>
                <td className="p-2 text-xs">{day(w.createdAt)}</td><td className="p-2 text-xs">{w.expiresAt ? day(w.expiresAt) : 'nie'}</td><td className="p-2 text-xs">{w.by}</td>
                <td className="p-2 text-right">{w.state === 'ACTIVE' && can('warning.manage') && <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(w.id)}>Zurücknehmen</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {creating && <WarnForm onClose={() => setCreating(false)} onDone={() => { setCreating(false); void qc.invalidateQueries({ queryKey: ['hr-warnings'] }); }} />}
    </>
  );
}

function WarnForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const cfg = useHrConfig().data;
  const people = useQuery({ queryKey: ['hr-people', '', {}], queryFn: () => api<Overview>('/hr/people') });
  const [v, setV] = useState({ personnelId: '', summary: '', severity: '', category: '' });
  const save = useMutation({ mutationFn: () => api(`/hr/people/${v.personnelId}/records`, { body: { type: 'WARNING', summary: v.summary.trim(), ...(v.severity ? { severity: v.severity } : {}), ...(v.category ? { category: v.category } : {}) } }), onSuccess: onDone });
  return (
    <Modal open title="Verwarnen" onClose={onClose}>
      <form className="grid gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1">Wer<Select aria-label="Person" required value={v.personnelId} onChange={(e) => setV({ ...v, personnelId: e.target.value })}><option value="">– Person wählen –</option>{(people.data?.rows ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` (${p.rank})` : ''}{p.counts.warnings ? ` · ${p.counts.warnings} aktiv` : ''}</option>)}</Select></label>
        <label className="grid gap-1">Grund<Input aria-label="Grund" required minLength={2} maxLength={300} placeholder="z. B. Shift Abuse" value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Schweregrad<Select aria-label="Schweregrad" value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value })}>{(cfg?.warningSeverities ?? []).map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}{s.defaultDays ? ` (${s.defaultDays} Tage)` : ''}</option>)}</Select></label>
          <label className="grid gap-1">Kategorie<Select aria-label="Kategorie" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}><option value="">—</option>{(cfg?.warningCategories ?? []).map((c) => <option key={c}>{c}</option>)}</Select></label>
        </div>
        {save.error && <p role="alert" className="text-danger">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!v.personnelId || v.summary.trim().length < 2 || save.isPending}>Verwarnen</Button></div>
      </form>
    </Modal>
  );
}
