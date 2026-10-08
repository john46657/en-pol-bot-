import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGuilds, useServer } from '../lib/guilds';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';

interface Ban { id: string; discordId: string | null; robloxUserId: string | null; name: string; scopes: string[]; reason: string; expiresAt: string | null; createdByName: string | null; createdAt: string; liftedAt: string | null }
interface QualiConfig { units: { key: string; name: string }[]; police?: { name?: string } }

const DURATIONS = [{ v: '', l: 'Dauerhaft' }, { v: '7', l: '7 Tage' }, { v: '14', l: '14 Tage' }, { v: '30', l: '30 Tage' }, { v: '90', l: '90 Tage' }, { v: 'date', l: 'Bis Datum …' }];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/** ⛔ Bewerbungssperren: wer sich wofür nicht bewerben darf (Polizei-Bewerbung, einzelne Qualifikationen oder alles). */
export function ApplicationBans() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [server] = useServer();
  const guilds = useGuilds();
  const serverName = guilds.data?.find((g) => g.id === server)?.name;
  const q = useQuery({ queryKey: ['application-bans', all, server], queryFn: () => api<Ban[]>('/application-bans', { query: { all: all ? 'true' : undefined } }) });
  const quali = useQuery({ queryKey: ['quali-config', server], queryFn: () => api<QualiConfig>('/qualifications/config', { query: { guildId: server || undefined } }), enabled: can('qualifications.view'), retry: false, staleTime: 60_000 });
  const scopes = [{ key: '*', label: 'Alle Bewerbungen' }, { key: 'police', label: quali.data?.police?.name ? `Bewerbung – ${quali.data.police.name}` : 'Polizei-Bewerbung' }, ...(quali.data?.units ?? []).map((u) => ({ key: u.key, label: u.name }))];
  const label = (k: string) => scopes.find((s) => s.key === k)?.label ?? k;

  const [form, setForm] = useState({ discordId: '', roblox: '', name: '', reason: '', duration: '', until: '' });
  const [sel, setSel] = useState<string[]>(['*']);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [lift, setLift] = useState<Ban | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['application-bans'] });
  const expiresAt = form.duration === 'date' ? (form.until ? new Date(`${form.until}T23:59:59`).toISOString() : null) : form.duration ? new Date(Date.now() + Number(form.duration) * 86_400_000).toISOString() : null;
  const create = useMutation({
    mutationFn: () => api<Ban>('/application-bans', { body: { discordId: form.discordId.trim() || null, roblox: form.roblox.trim() || null, name: form.name.trim() || null, scopes: sel, reason: form.reason.trim(), expiresAt } }),
    onSuccess: (b) => { setMsg({ ok: true, text: `${b.name} ist gesperrt.` }); setForm({ discordId: '', roblox: '', name: '', reason: '', duration: '', until: '' }); setSel(['*']); refresh(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const doLift = useMutation({ mutationFn: (id: string) => api(`/application-bans/${id}/lift`, { method: 'POST' }), onSuccess: () => { setLift(null); refresh(); } });
  const toggle = (k: string) => setSel((s) => (k === '*' ? ['*'] : s.includes(k) ? s.filter((x) => x !== k) : [...s.filter((x) => x !== '*'), k]));
  const manage = can('applications.decide');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const active = (b: Ban) => !b.liftedAt && (!b.expiresAt || Date.parse(b.expiresAt) > Date.now());

  return (
    <>
      <PageHeader title="⛔ Bewerbungssperren" subtitle={`${serverName ? `Sperrliste für ${serverName} – jeder Server hat seine eigene (oben links umschalten).` : 'Kein Server gewählt: Sperren hier gelten auf allen Servern. Für eine Server-eigene Liste oben links einen Server wählen.'} Gesperrte können die gewählten Bewerbungen nicht starten – weder über das Discord-Panel noch über /bewerbung.`} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {manage && <Card title="Neue Sperre">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Discord-ID" hint="Rechtsklick auf die Person → „ID kopieren“ (Entwicklermodus)">{(id) => <Input id={id} inputMode="numeric" value={form.discordId} onChange={set('discordId')} placeholder="z. B. 123456789012345678" />}</Field>
            <Field label="Roblox-Name oder -ID" hint="Sperrt auch die Bewerbung über die Webseite">{(id) => <Input id={id} value={form.roblox} onChange={set('roblox')} placeholder="z. B. Max_Mustermann" />}</Field>
            <Field label="Anzeigename (optional)">{(id) => <Input id={id} maxLength={80} value={form.name} onChange={set('name')} />}</Field>
            <fieldset><legend className="mb-1 text-sm font-medium">Gesperrt für *</legend>
              <div className="grid gap-1 sm:grid-cols-2">{scopes.map((s) => <label key={s.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(s.key)} onChange={() => toggle(s.key)} />{s.label}</label>)}</div>
            </fieldset>
            <Field label="Grund *" hint="Die Person sieht den Grund, wenn sie sich bewerben will.">{(id) => <Textarea id={id} rows={2} maxLength={500} required value={form.reason} onChange={set('reason')} />}</Field>
            <Field label="Dauer">{(id) => <Select id={id} value={form.duration} onChange={set('duration')}>{DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</Select>}</Field>
            {form.duration === 'date' && <Field label="Gesperrt bis einschließlich">{(id) => <Input id={id} type="date" value={form.until} onChange={set('until')} />}</Field>}
            <Button type="submit" variant="danger" disabled={create.isPending || form.reason.trim().length < 3 || !sel.length || (!form.discordId.trim() && !form.roblox.trim()) || (form.duration === 'date' && !form.until)}>⛔ Sperren</Button>
            {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
          </form>
        </Card>}
        <Card title={all ? 'Alle Sperren' : `Aktive Sperren (${q.data?.length ?? 0})`} actions={<label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />auch abgelaufene/aufgehobene</label>}>
          {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState text="Keine Sperren." /> : (
            <ul className="divide-y divide-line">{q.data.map((b) => (
              <li key={b.id} className={`space-y-1 py-2 text-sm ${active(b) ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{b.name}</b>
                  {b.scopes.map((s) => <Badge key={s} tone={s === '*' ? 'danger' : 'warning'}>{label(s)}</Badge>)}
                  {!active(b) && <Badge tone="neutral">{b.liftedAt ? 'aufgehoben' : 'abgelaufen'}</Badge>}
                  {manage && active(b) && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLift(b)}>Aufheben</Button>}
                </div>
                <p>{b.reason}</p>
                <p className="text-xs text-muted">{[b.discordId && `Discord ${b.discordId}`, b.robloxUserId && `Roblox-ID ${b.robloxUserId}`].filter(Boolean).join(' · ')} · {b.expiresAt ? `bis ${day(b.expiresAt)}` : 'dauerhaft'} · seit {day(b.createdAt)}{b.createdByName ? ` von ${b.createdByName}` : ''}</p>
              </li>))}</ul>
          )}
        </Card>
      </div>
      <ConfirmDialog open={!!lift} title="Sperre aufheben?" confirmLabel="Aufheben" cancelLabel="Abbrechen" busy={doLift.isPending} message={lift ? `${lift.name} darf sich danach wieder bewerben.` : ''} onConfirm={() => lift && doLift.mutate(lift.id)} onClose={() => setLift(null)} />
    </>
  );
}
