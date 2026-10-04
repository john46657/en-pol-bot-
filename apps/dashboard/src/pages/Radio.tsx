import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DiscordChannel, type MemberHit, type RadioAccessRow, type RadioChannelRow, type RadioLevelKey } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const LEVEL: Record<RadioLevelKey, string> = { LISTEN: 'Mithören', SPEAK: 'Sprechen', FULL: 'Vollzugriff' };

/** Funk: Whitelist (suchen, hinzufügen, Stufe ändern, entfernen) und Funkkanäle. Durchgesetzt wird im Sprachkanal durch den Bot. */
export function Radio() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/radio`;
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const qs = new URLSearchParams({ limit: '100', ...(query ? { query } : {}), ...(level ? { level } : {}) }).toString();
  const list = useQuery({ queryKey: ['radio', guildId, qs], queryFn: () => api<{ items: RadioAccessRow[]; names: Record<string, string> }>(`${base}/whitelist?${qs}`) });
  const channels = useQuery({ queryKey: ['radio-channels', guildId], queryFn: () => api<RadioChannelRow[]>(`${base}/channels`) });
  const voice = useQuery({ queryKey: ['voice-channels', guildId], queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels?kind=voice`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['radio', guildId] });
    void qc.invalidateQueries({ queryKey: ['radio-channels', guildId] });
  };
  const call = useMutation({
    mutationFn: (v: { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; msg: string }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<MemberHit | null>(null);
  const [add, setAdd] = useState({ level: 'SPEAK', special: false, reason: '' });
  const hits = useQuery({ queryKey: ['radio-member-search', guildId, search], enabled: search.trim().length >= 2 && !picked, queryFn: () => api<MemberHit[]>(`${base}/member-search?query=${encodeURIComponent(search.trim())}`) });
  const [ch, setCh] = useState({ channelId: '', name: '', area: 'GENERAL', requiresDuty: false });

  return (
    <>
      <h1>Funk</h1>
      <p className="muted">Der Bot trennt Mitglieder ohne Berechtigung aus Funkkanälen und schaltet „Mithören“ stumm (Rechte „Mitglieder verschieben“ und „stummschalten“ nötig).</p>

      <h2>Whitelist</h2>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
        <input className="inline-input" placeholder="Name suchen …" value={input} onChange={(e) => setInput(e.target.value)} />
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Stufe">
          <option value="">Alle Stufen</option>
          {(Object.keys(LEVEL) as RadioLevelKey[]).map((k) => <option key={k} value={k}>{LEVEL[k]}</option>)}
        </select>
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? <p className="muted">Keine Einträge.</p> : (
            <ul className="list">
              {d.items.map((a) => (
                <li key={a.id} className="row">
                  <span className="grow">
                    <strong>{d.names[a.userId] ?? a.userId}</strong> <code>{a.userId}</code>
                    <br /><small className="muted">{a.reason ?? 'kein Grund angegeben'}</small>
                  </span>
                  <select value={a.level} aria-label="Stufe ändern" onChange={(e) => call.mutate({ method: 'POST', path: '/whitelist', body: { userId: a.userId, level: e.target.value, special: a.special }, msg: 'Stufe geändert.' })}>
                    {(Object.keys(LEVEL) as RadioLevelKey[]).map((k) => <option key={k} value={k}>{LEVEL[k]}</option>)}
                  </select>
                  <label><input type="checkbox" checked={a.special || a.level === 'FULL'} disabled={a.level === 'FULL'} onChange={(e) => call.mutate({ method: 'POST', path: '/whitelist', body: { userId: a.userId, level: a.level, special: e.target.checked }, msg: 'Spezialfunk geändert.' })} /> Spezialfunk</label>
                  <button className="btn danger" onClick={() => confirm('Von der Whitelist entfernen?') && call.mutate({ method: 'DELETE', path: `/whitelist/${a.userId}`, msg: 'Entfernt.' })}>Entfernen</button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      <div className="card comp">
        <h3>Mitglied hinzufügen</h3>
        {picked ? (
          <p><strong>{picked.displayName}</strong> <button className="btn" onClick={() => setPicked(null)}>ändern</button></p>
        ) : (
          <>
            <input className="inline-input" placeholder="Name suchen (mind. 2 Zeichen)" value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="list">
              {hits.data?.map((m) => <li key={m.id} className="row"><span className="grow">{m.displayName} <small className="muted">@{m.username}</small></span><button className="btn" onClick={() => setPicked(m)}>Wählen</button></li>)}
            </ul>
          </>
        )}
        <div className="two">
          <label className="fld"><span>Stufe</span>
            <select value={add.level} onChange={(e) => setAdd({ ...add, level: e.target.value })}>
              {(Object.keys(LEVEL) as RadioLevelKey[]).map((k) => <option key={k} value={k}>{LEVEL[k]}</option>)}
            </select>
          </label>
          <label className="fld"><span>Grund (optional)</span><input value={add.reason} maxLength={200} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></label>
        </div>
        <label><input type="checkbox" checked={add.special} onChange={(e) => setAdd({ ...add, special: e.target.checked })} /> Spezialfunk erlauben</label>
        <div className="actions">
          <button className="btn primary" disabled={!picked || call.isPending} onClick={() => call.mutate({ method: 'POST', path: '/whitelist', body: { userId: picked!.id, ...add }, msg: 'Hinzugefügt.' }, { onSuccess: () => { setPicked(null); setSearch(''); } })}>Hinzufügen</button>
        </div>
      </div>

      <h2>Funkkanäle</h2>
      <QueryState query={channels}>
        {(rows) => (
          <ul className="list">
            {rows.map((c) => (
              <li key={c.id} className="row">
                <span className="grow"><strong>{c.name}</strong> · {c.area === 'SPECIAL' ? 'Spezialfunk' : 'Allgemeinfunk'}{c.requiresDuty ? ' · nur im Dienst' : ''}{!c.active ? ' · deaktiviert' : ''}</span>
                <button className="btn" onClick={() => call.mutate({ method: 'PUT', path: '/channels', body: { ...c, active: !c.active }, msg: c.active ? 'Deaktiviert.' : 'Aktiviert.' })}>{c.active ? 'Deaktivieren' : 'Aktivieren'}</button>
                <button className="btn danger" onClick={() => confirm(`„${c.name}“ entfernen?`) && call.mutate({ method: 'DELETE', path: `/channels/${c.channelId}`, msg: 'Entfernt.' })}>Entfernen</button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="card comp">
        <div className="two">
          <label className="fld"><span>Sprachkanal</span>
            <select value={ch.channelId} onChange={(e) => setCh({ ...ch, channelId: e.target.value, name: ch.name || (voice.data?.find((v) => v.id === e.target.value)?.name ?? '') })}>
              <option value="">Wählen …</option>
              {voice.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>Anzeigename</span><input value={ch.name} maxLength={50} onChange={(e) => setCh({ ...ch, name: e.target.value })} /></label>
        </div>
        <div className="two">
          <label className="fld"><span>Bereich</span>
            <select value={ch.area} onChange={(e) => setCh({ ...ch, area: e.target.value })}><option value="GENERAL">Allgemeinfunk</option><option value="SPECIAL">Spezialfunk</option></select>
          </label>
          <label><input type="checkbox" checked={ch.requiresDuty} onChange={(e) => setCh({ ...ch, requiresDuty: e.target.checked })} /> Nur im Dienst (laufende Schicht)</label>
        </div>
        <button className="btn primary" disabled={!ch.channelId || !ch.name.trim()} onClick={() => call.mutate({ method: 'PUT', path: '/channels', body: ch, msg: 'Funkkanal gespeichert.' })}>Funkkanal einrichten</button>
      </div>
    </>
  );
}
