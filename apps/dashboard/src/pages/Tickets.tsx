import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { API_URL, api, type DiscordChannel, type DiscordRole, type TicketCategoryRow, type TicketRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { TicketSettings } from '../components/TicketSettings';
import { useToast } from '../toast';

const ST = { OPEN: '🟢 offen', IN_PROGRESS: '🔵 in Bearbeitung', WAITING: '🟡 wartet auf Rückmeldung', CLOSED: '🔒 geschlossen' } as const;
const PRIO = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' } as const;
const num = (n: number) => `#${String(n).padStart(4, '0')}`;
type FormRow = { id: string; label: string; style: 'short' | 'paragraph'; type?: string | undefined; options?: string[] | undefined; required: boolean };
const FIELD_TYPE = { text: 'Kurzer Text', paragraph: 'Langer Text', number: 'Zahl', date: 'Datum', yesno: 'Ja/Nein', choice: 'Auswahl', multichoice: 'Mehrfachauswahl', user: 'Discord-Benutzer' } as const;
const emptyCat = { id: '', name: '', description: '', emoji: '', discordCategoryId: '', staffRoleIds: [] as string[], defaultPriority: 'NORMAL', maxOpenPerUser: 1, active: true, color: null as number | null, maxOpenTotal: 20, requiredRoleIds: [] as string[], nameTemplate: '' as string | null, formFields: [] as FormRow[] | null, transcriptEnabled: null as boolean | null };

/** Tickets: offene Tickets bearbeiten, Archiv mit Transkript, Kategorien. */
export function Tickets() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/tickets`;
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const qs = new URLSearchParams({ limit: '100', [tab === 'open' ? 'open' : 'closed']: 'true', ...(query ? { query } : {}) }).toString();
  const list = useQuery({ queryKey: ['tickets', guildId, qs], queryFn: () => api<{ items: TicketRow[] }>(`${base}?${qs}`), refetchInterval: tab === 'open' ? 15_000 : false });
  const cats = useQuery({ queryKey: ['ticket-cats', guildId], queryFn: () => api<TicketCategoryRow[]>(`${base}/categories`) });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const channels = useQuery({ queryKey: ['channels-cat', guildId], queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels`) });
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api<unknown>(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      void qc.invalidateQueries({ queryKey: ['tickets', guildId] });
      void qc.invalidateQueries({ queryKey: ['ticket-cats', guildId] });
      void qc.invalidateQueries({ queryKey: ['ticket-loads', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [open, setOpen] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['ticket', guildId, open], enabled: !!open, queryFn: () => api<{ ticket: TicketRow; transcriptText: string | null }>(`${base}/${open}`) });
  const [why, setWhy] = useState<Record<string, string>>({});
  const [c, setC] = useState(emptyCat);
  return (
    <>
      <h1>Tickets</h1>
      <div className="actions">
        <button className={`btn${tab === 'open' ? ' primary' : ''}`} onClick={() => setTab('open')}>Offene</button>
        <button className={`btn${tab === 'closed' ? ' primary' : ''}`} onClick={() => setTab('closed')}>🗄️ Archiv</button>
        <form className="actions" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
          <input className="inline-input" placeholder="Betreff oder #Nummer …" value={input} onChange={(e) => setInput(e.target.value)} /><button className="btn">Suchen</button>
        </form>
      </div>
      <datalist id="close-reasons">{['Problem gelöst', 'Anfrage erledigt', 'Bewerbung bearbeitet', 'Kein weiterer Kontakt', 'Doppelt', 'Sonstiger Grund'].map((r) => <option key={r} value={r} />)}</datalist>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? <p className="muted">Keine Tickets.</p> : (
            <ul className="list">
              {d.items.map((t) => (
                <li key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{num(t.number)} · {t.category.emoji} {t.subject}</strong> · {ST[t.status]} · {PRIO[t.priority]}
                    <br /><small className="muted">{t.category.name} · von <code>{t.userId}</code>{t.claimedBy && <> · Bearbeiter <code>{t.claimedBy}</code></>}{t.closeReason ? ` · Grund: ${t.closeReason}` : ''}</small>
                    {t.status !== 'CLOSED' && (
                      <div>
                        {t.claimedBy ? <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/${t.id}/release`, msg: 'Freigegeben.' })}>Freigeben</button> : <button className="btn primary" onClick={() => call.mutate({ method: 'POST', path: `/${t.id}/claim`, msg: 'Übernommen.' })}>Übernehmen</button>}
                        <select value={t.priority} aria-label="Priorität" onChange={(e) => call.mutate({ method: 'POST', path: `/${t.id}/priority`, body: { priority: e.target.value }, msg: 'Priorität geändert.' })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        {t.status === 'WAITING' ? <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/${t.id}/waiting`, body: { waiting: false }, msg: 'Weiter in Bearbeitung.' })}>Weiter bearbeiten</button> : <button className="btn" onClick={() => call.mutate({ method: 'POST', path: `/${t.id}/waiting`, body: { waiting: true }, msg: 'Wartet auf Rückmeldung.' })}>Wartet auf Rückmeldung</button>}
                        <input className="inline-input" list="close-reasons" placeholder="Schließungsgrund (Pflicht)" aria-label="Schließungsgrund" value={why[t.id] ?? ''} onChange={(e) => setWhy({ ...why, [t.id]: e.target.value })} />
                        <button className="btn danger" disabled={(why[t.id] ?? '').trim().length < 3} onClick={() => confirm(`Ticket ${num(t.number)} schließen? Der Kanal wird nach dem Sichern des Transkripts gelöscht.`) && call.mutate({ method: 'POST', path: `/${t.id}/close`, body: { reason: why[t.id] }, msg: 'Ticket geschlossen.' })}>Schließen</button>
                      </div>
                    )}
                    {t.status === 'CLOSED' && <div><button className="btn" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Transkript ausblenden' : 'Transkript anzeigen'}</button> <a className="btn" href={`${API_URL}/api/v1${base}/${t.id}/transcript.html`}>📄 HTML-Transcript</a></div>}
                    {open === t.id && (
                      <QueryState query={detail}>
                        {(x) => <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{x.transcriptText}</pre>}
                      </QueryState>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <h2>Kategorien</h2>
      <QueryState query={cats}>
        {(rows) => (
          <ul className="list">
            {rows.map((k) => (
              <li key={k.id} className="row">
                <span className="grow"><strong>{k.emoji} {k.name}</strong> {!k.active && <em>(deaktiviert)</em>}<br /><small className="muted">max. {k.maxOpenPerUser} offen je Mitglied · Priorität {PRIO[k.defaultPriority as keyof typeof PRIO] ?? k.defaultPriority} · {k.staffRoleIds.length} Bearbeiter-Rolle(n)</small></span>
                <button className="btn" onClick={() => setC({ ...emptyCat, ...k, description: k.description ?? '', emoji: k.emoji ?? '', discordCategoryId: k.discordCategoryId ?? '' })}>Bearbeiten</button>
                <button className="btn danger" onClick={() => confirm(`„${k.name}“ löschen?`) && call.mutate({ method: 'DELETE', path: `/categories/${k.id}`, msg: 'Gelöscht.' })}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <h3>{c.id ? 'Kategorie bearbeiten' : 'Kategorie erstellen'}</h3>
        <div className="two">
          <label className="fld"><span>Name</span><input value={c.name} maxLength={50} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
          <label className="fld"><span>Emoji</span><input value={c.emoji} maxLength={8} onChange={(e) => setC({ ...c, emoji: e.target.value })} /></label>
        </div>
        <label className="fld"><span>Beschreibung</span><input value={c.description} maxLength={300} onChange={(e) => setC({ ...c, description: e.target.value })} /></label>
        <div className="two">
          <label className="fld"><span>Discord-Kategorie für Ticket-Kanäle</span>
            <select value={c.discordCategoryId} onChange={(e) => setC({ ...c, discordCategoryId: e.target.value })}><option value="">Keine</option>{channels.data?.filter((x) => x.kind === 'category').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="fld"><span>Max. offene Tickets je Mitglied</span><input type="number" min={1} max={10} value={c.maxOpenPerUser} onChange={(e) => setC({ ...c, maxOpenPerUser: Number(e.target.value) })} /></label>
        </div>
        <label className="fld"><span>Bearbeiter-Rollen</span>
          <select multiple size={5} value={c.staffRoleIds} onChange={(e) => setC({ ...c, staffRoleIds: [...e.target.selectedOptions].map((o) => o.value) })}>{roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label>
        <div className="two">
          <label className="fld"><span>Kapazität (offene Tickets gesamt – Basis der Auslastung)</span><input type="number" min={1} max={1000} value={c.maxOpenTotal} onChange={(e) => setC({ ...c, maxOpenTotal: Number(e.target.value) })} /></label>
          <label className="fld"><span>Farbe</span><input type="color" value={`#${(c.color ?? 0x5865f2).toString(16).padStart(6, '0')}`} onChange={(e) => setC({ ...c, color: parseInt(e.target.value.slice(1), 16) })} /></label>
        </div>
        <label className="fld"><span>Benötigte Rollen zum Eröffnen (leer = alle)</span>
          <select multiple size={4} value={c.requiredRoleIds} onChange={(e) => setC({ ...c, requiredRoleIds: [...e.target.selectedOptions].map((o) => o.value) })}>{roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label>
        <div className="two">
          <label className="fld"><span>Kanalname-Vorlage (leer = Standard des Servers)</span><input value={c.nameTemplate ?? ''} placeholder="support-{user}" onChange={(e) => setC({ ...c, nameTemplate: e.target.value })} /></label>
          <label className="fld"><span>Transcript</span>
            <select value={c.transcriptEnabled === null ? '' : String(c.transcriptEnabled)} onChange={(e) => setC({ ...c, transcriptEnabled: e.target.value === '' ? null : e.target.value === 'true' })}><option value="">Einstellung des Servers</option><option value="true">Immer</option><option value="false">Nie</option></select>
          </label>
        </div>
        <fieldset className="fld"><legend>Formular beim Eröffnen (optional, max. 5 Felder)</legend>
          {(c.formFields ?? []).map((f, i) => (
            <div key={i} className="actions">
              <input value={f.label} maxLength={45} placeholder="Frage" onChange={(e) => setC({ ...c, formFields: (c.formFields ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <select aria-label="Fragetyp" value={f.type ?? (f.style === 'paragraph' ? 'paragraph' : 'text')} onChange={(e) => setC({ ...c, formFields: (c.formFields ?? []).map((x, j) => (j === i ? { ...x, type: e.target.value, style: e.target.value === 'paragraph' ? 'paragraph' : 'short' } : x)) })}>{Object.entries(FIELD_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {(f.type === 'choice' || f.type === 'multichoice') && <input aria-label="Antwortoptionen" placeholder="Optionen, getrennt durch Komma" value={(f.options ?? []).join(', ')} onChange={(e) => setC({ ...c, formFields: (c.formFields ?? []).map((x, j) => (j === i ? { ...x, options: e.target.value.split(',').map((o) => o.trim()) } : x)) })} />}
              <label><input type="checkbox" checked={f.required} onChange={(e) => setC({ ...c, formFields: (c.formFields ?? []).map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} /> Pflicht</label>
              <button className="btn" onClick={() => setC({ ...c, formFields: (c.formFields ?? []).filter((_, j) => j !== i) })}>Entfernen</button>
            </div>
          ))}
          {(c.formFields ?? []).length < 5 && <button className="btn" onClick={() => setC({ ...c, formFields: [...(c.formFields ?? []), { id: `f${(c.formFields ?? []).length}`, label: '', style: 'short', required: true }] })}>+ Feld</button>}
        </fieldset>
        <div className="actions">
          <select value={c.defaultPriority} onChange={(e) => setC({ ...c, defaultPriority: e.target.value })} aria-label="Standard-Priorität">{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> aktiv</label>
          <button className="btn primary" disabled={!c.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: '/categories', body: { ...c, nameTemplate: c.nameTemplate || null, formFields: (c.formFields ?? []).filter((f) => f.label.trim()), id: c.id || undefined, discordCategoryId: c.discordCategoryId || undefined, description: c.description || undefined, emoji: c.emoji || undefined }, msg: 'Gespeichert.' }, { onSuccess: () => setC(emptyCat) })}>Speichern</button>
          {c.id && <button className="btn" onClick={() => setC(emptyCat)}>Neu</button>}
        </div>
      </div>
      <TicketSettings guildId={guildId} categories={cats.data ?? []} />
    </>
  );
}
