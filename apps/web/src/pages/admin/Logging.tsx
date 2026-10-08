import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LOG_DEFAULT_OFF, type LoggingConfig } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useAutosaveDraft } from '../../lib/autosave';
import { ChannelPicker } from '../../components/DiscordPickers';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, ErrorState, Input, Modal, PageHeader, SkeletonRows } from '../../components/ui';

interface LogType { action: string; module: string; label: string; count: number; lastAt: string | null; defaultOff: boolean }
interface LogCategory { key: string; label: string; emoji: string; types: LogType[] }

/** Wie ein Typ gerade eingestellt ist: Kanal der Kategorie, eigener Kanal oder aus. */
const typeState = (cfg: LoggingConfig, cat: string, t: LogType): { kind: 'inherit' | 'own' | 'off'; channel: string | null } => {
  const v = cfg.types[t.action];
  if (v === 'off' || (!v && LOG_DEFAULT_OFF.has(t.action))) return { kind: 'off', channel: null };
  if (v && v !== 'on') return { kind: 'own', channel: v };
  return { kind: 'inherit', channel: cfg.categories[cat] ?? null };
};

/** Administration → Logging (wie Xenon): jede Aktion im System je Kategorie/Typ in einen Discord-Kanal melden; im Dashboard steht alles im Audit-Log. */
export function Logging() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['logging'], queryFn: () => api<LoggingConfig>('/logging') });
  const types = useQuery({ queryKey: ['logging-types'], queryFn: () => api<LogCategory[]>('/logging/types') });
  const [cfg, setCfg] = useState<LoggingConfig>();
  useEffect(() => { if (q.data && !cfg) setCfg(q.data); }, [q.data, cfg]);
  useAutosaveDraft(manage ? 'logging' : null, cfg, (c) => ({ method: 'PUT', path: '/logging', body: c, label: 'Logging' }));
  const save = useMutation({ mutationFn: (c: LoggingConfig) => api<LoggingConfig>('/logging', { method: 'PUT', body: c }), onSuccess: (r) => qc.setQueryData(['logging'], r) });
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | 'all' | 'mass'>(null);
  const [bulkCh, setBulkCh] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const test = useMutation({ mutationFn: (category: string) => api('/logging/test', { method: 'POST', body: { category } }), onSuccess: () => setMsg({ ok: true, text: 'Test-Meldung ist unterwegs – schau in den Kanal.' }), onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const cats = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (types.data ?? []).map((c) => ({ ...c, types: t ? c.types.filter((x) => `${x.label} ${x.action} ${c.label}`.toLowerCase().includes(t)) : c.types })).filter((c) => c.types.length);
  }, [types.data, term]);
  if (q.error || types.error) return <ErrorState error={q.error ?? types.error} onRetry={() => { void q.refetch(); void types.refetch(); }} />;
  if (!cfg || !types.data) return <SkeletonRows />;
  const set = (p: Partial<LoggingConfig>) => setCfg({ ...cfg, ...p });
  const setCat = (key: string, ch: string | null) => { const next = { ...cfg.categories }; if (ch) next[key] = ch; else delete next[key]; set({ categories: next }); };
  const setType = (action: string, v: string | null) => { const next = { ...cfg.types }; if (v) next[action] = v; else delete next[action]; set({ types: next }); };
  const toggle = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const allTypes = types.data.flatMap((c) => c.types.map((t) => ({ cat: c.key, t })));
  const active = allTypes.filter(({ cat, t }) => typeState(cfg, cat, t).channel).length;

  return (
    <>
      <PageHeader title="📒 Logging" subtitle="Alle Aktionen im System in Discord mitloggen – je Kategorie ein Kanal, einzelne Typen mit eigenem Kanal oder aus. Im Dashboard steht alles im Audit-Log." />
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
        <label className="flex items-center gap-2"><Toggle label="Logging an" checked={cfg.enabled} onChange={(v) => manage && set({ enabled: v })} /><b>{cfg.enabled ? 'Logging an' : 'Logging aus'}</b></label>
        <span className="text-muted">{active} von {allTypes.length} Typen werden gemeldet.</span>
        {can('audit.view') && <Link to="/admin/audit" className="ml-auto text-primary hover:underline">Im Dashboard ansehen (Audit-Logs) →</Link>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <div className="mb-3"><Input aria-label="Typen suchen" placeholder="🔍 Typ suchen, z. B. „Einsatz“, „Bewerbung“, „Rolle“…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      {manage && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => { setBulkCh(null); setBulk('all'); }}>Kanal für alle Kategorien setzen</Button>
          <Button variant="secondary" onClick={() => set({ categories: {}, types: Object.fromEntries(Object.entries(cfg.types).filter(([, v]) => v === 'off')) })}>Kanal überall entfernen</Button>
          <Button variant="secondary" disabled={!picked.size} onClick={() => { setBulkCh(null); setBulk('mass'); }}>Auswahl bearbeiten{picked.size ? ` (${picked.size})` : ''}</Button>
          {picked.size > 0 && <Button variant="ghost" onClick={() => setPicked(new Set())}>Auswahl aufheben</Button>}
        </div>
      )}
      <div className="grid gap-2">{cats.map((c) => {
        const isOpen = open.has(c.key) || !!term.trim();
        const on = c.types.filter((t) => typeState(cfg, c.key, t).channel).length;
        return (
          <section key={c.key} className="card min-w-0 border border-line">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen(toggle(open, c.key))}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="text-base font-semibold">{c.emoji} {c.label}</span>
                <Badge tone={on ? 'success' : 'neutral'}>{on}/{c.types.length}</Badge>
              </button>
              <div className="w-full sm:w-72"><ChannelPicker ariaLabel={`${c.label}: Kanal`} disabled={!manage} value={cfg.categories[c.key] ?? null} onChange={(v) => setCat(c.key, v)} /></div>
              {manage && cfg.categories[c.key] && <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate(c.key)}>Test</Button>}
            </div>
            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">{c.types.map((t) => {
                const st = typeState(cfg, c.key, t);
                return (
                  <li key={t.action} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                    {manage && <input type="checkbox" aria-label={`${t.label} auswählen`} checked={picked.has(t.action)} onChange={() => setPicked(toggle(picked, t.action))} />}
                    <span className="min-w-0 flex-1"><span className="font-medium">{t.label}</span> <code className="text-[11px] text-muted">{t.action}</code>{t.count > 0 && <span className="ml-1 text-[11px] text-muted">· {t.count}×</span>}</span>
                    <div className="flex overflow-hidden rounded border border-line text-xs" role="group" aria-label={`${t.label}: Einstellung`}>
                      {(['inherit', 'own', 'off'] as const).map((k) => (
                        <button key={k} type="button" disabled={!manage} aria-pressed={st.kind === k} onClick={() => setType(t.action, k === 'inherit' ? (t.defaultOff ? 'on' : null) : k === 'off' ? 'off' : (cfg.categories[c.key] ?? null))}
                          className={`px-2 py-1 ${st.kind === k ? 'bg-primary text-white' : 'hover:bg-panel-2'}`}>{k === 'inherit' ? 'Kategorie' : k === 'own' ? 'Eigener Kanal' : 'Aus'}</button>
                      ))}
                    </div>
                    {st.kind === 'own' && <div className="w-full sm:w-60"><ChannelPicker ariaLabel={`${t.label}: eigener Kanal`} disabled={!manage} value={st.channel} onChange={(v) => setType(t.action, v)} /></div>}
                    {st.kind === 'inherit' && !st.channel && <span className="text-[11px] text-muted">Kategorie hat keinen Kanal</span>}
                  </li>
                );
              })}</ul>
            )}
          </section>
        );
      })}</div>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {bulk && (
        <Modal open title={bulk === 'all' ? 'Kanal für alle Kategorien' : `${picked.size} Typen bearbeiten`} onClose={() => setBulk(null)}>
          <div className="grid gap-3">
            <ChannelPicker ariaLabel="Kanal" value={bulkCh} onChange={setBulkCh} />
            <div className="flex flex-wrap justify-end gap-2">
              {bulk === 'mass' && <Button variant="secondary" onClick={() => { set({ types: { ...cfg.types, ...Object.fromEntries([...picked].map((a) => [a, 'off'])) } }); setBulk(null); setPicked(new Set()); }}>Ausschalten</Button>}
              {bulk === 'mass' && <Button variant="secondary" onClick={() => { const next = { ...cfg.types }; for (const a of picked) delete next[a]; set({ types: next }); setBulk(null); setPicked(new Set()); }}>Kanal der Kategorie nutzen</Button>}
              <Button disabled={!bulkCh} onClick={() => { if (bulk === 'all') set({ categories: Object.fromEntries(types.data!.map((c) => [c.key, bulkCh!])) }); else { set({ types: { ...cfg.types, ...Object.fromEntries([...picked].map((a) => [a, bulkCh!])) } }); setPicked(new Set()); } setBulk(null); }}>Kanal setzen</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
