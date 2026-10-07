import { useState } from 'react';
import { X } from 'lucide-react';
import { useGuilds, useServer, type GuildInfo } from '../lib/guilds';
import { Input, Select } from './ui';

const hexColor = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : 'var(--color-muted, #888)');
const idOf = (t: string) => t.match(/\d{15,25}/)?.[0] ?? '';

/** Channels eines Servers in Discord-Reihenfolge (Kategorien mit ihren Channels). */
type ChannelKind = 'text' | 'category' | 'voice';
function channelOptions(g: GuildInfo, kind: ChannelKind) {
  if (kind === 'category') return g.channels.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, label: `📁 ${c.name}` }));
  const cats = new Map(g.channels.filter((c) => c.type === 'category').map((c) => [c.id, c]));
  return g.channels.filter((c) => c.type === kind)
    .sort((a, b) => (cats.get(a.parentId ?? '')?.position ?? -1) - (cats.get(b.parentId ?? '')?.position ?? -1) || a.position - b.position)
    .map((c) => ({ id: c.id, label: `${kind === 'voice' ? '🔊' : '#'} ${c.name}${c.parentId && cats.get(c.parentId) ? `  (${cats.get(c.parentId)!.name})` : ''}` }));
}

/** Gemeldete Server – ist oben links ein Server gewählt, nur dieser. */
function useGuildList() {
  const guilds = useGuilds();
  const [server] = useServer();
  const all = guilds.data ?? [];
  return server ? all.filter((g) => g.id === server) : all;
}

/** Channel auswählen (nach Server gruppiert). Ohne gemeldete Server: Eingabe der ID. */
export function ChannelPicker({ value, onChange, kind = 'text', ariaLabel, disabled }: { value: string | null | undefined; onChange: (id: string | null) => void; kind?: ChannelKind; ariaLabel: string; disabled?: boolean }) {
  const list = useGuildList();
  if (!list.length) return <Input aria-label={ariaLabel} inputMode="numeric" disabled={disabled} value={value ?? ''} placeholder={kind === 'category' ? 'Discord-Kategorie-ID' : kind === 'voice' ? 'Sprachkanal-ID' : 'Discord-Kanal-ID'} onChange={(e) => onChange(idOf(e.target.value) || null)} />;
  const known = list.some((g) => g.channels.some((c) => c.id === value));
  return (
    <Select aria-label={ariaLabel} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— keiner —</option>
      {value && !known && <option value={value}>Unbekannt ({value})</option>}
      {list.map((g) => <optgroup key={g.id} label={g.name}>{channelOptions(g, kind).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}
    </Select>
  );
}

/** Mehrere Rollen auswählen – wie bei Appy als Liste mit Entfernen-Knopf. Ohne gemeldete Server: IDs eintippen. */
export function RolePicker({ value, onChange, ariaLabel, disabled, max = 25 }: { value: string[]; onChange: (ids: string[]) => void; ariaLabel: string; disabled?: boolean; max?: number }) {
  const all = useGuilds().data ?? [];
  const list = useGuildList();
  const [typed, setTyped] = useState('');
  const role = (id: string) => { for (const g of all) { const r = g.roles.find((x) => x.id === id); if (r) return { ...r, guild: g.name }; } return null; };
  const add = (id: string) => { if (id && !value.includes(id) && value.length < max) onChange([...value, id]); };
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">{value.map((id) => {
          const r = role(id);
          return (
            <li key={id} className="inline-flex items-center gap-1.5 rounded border border-success/40 bg-success/10 px-2 py-0.5 text-xs">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: hexColor(r?.color ?? 0) }} />
              <span>@{r?.name ?? id}{all.length > 1 && r ? <span className="text-muted"> · {r.guild}</span> : null}</span>
              {!disabled && <button type="button" aria-label={`Rolle ${r?.name ?? id} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>}
            </li>
          );
        })}</ul>
      )}
      {!disabled && value.length < max && (list.length ? (
        <Select aria-label={ariaLabel} value="" onChange={(e) => add(e.target.value)}>
          <option value="">Rollen wählen…</option>
          {list.map((g) => <optgroup key={g.id} label={g.name}>{[...g.roles].sort((a, b) => b.position - a.position).filter((r) => !value.includes(r.id)).map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}
        </Select>
      ) : (
        <Input aria-label={ariaLabel} value={typed} placeholder="Discord-Rollen-ID + Enter" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(idOf(typed)); setTyped(''); } }} onBlur={() => { add(idOf(typed)); setTyped(''); }} />
      ))}
    </div>
  );
}

/** Mehrere Channels auswählen (Liste mit Entfernen-Knopf, nach Server gruppiert). Wert: Komma-getrennte IDs. */
export function ChannelsPicker({ value, onChange, ariaLabel, disabled, max = 10, kind = 'text' }: { value: string; onChange: (ids: string) => void; ariaLabel: string; disabled?: boolean; max?: number; kind?: ChannelKind }) {
  const all = useGuilds().data ?? [];
  const list = useGuildList();
  const ids = value.split(/[\s,;]+/).filter(Boolean);
  const [typed, setTyped] = useState('');
  const name = (id: string) => { for (const g of all) { const c = g.channels.find((x) => x.id === id); if (c) return { name: c.name, guild: g.name }; } return null; };
  const set = (next: string[]) => onChange([...new Set(next)].join(', '));
  return (
    <div className="grid gap-2">
      {ids.length > 0 && <ul className="flex flex-wrap gap-1.5">{ids.map((id) => { const c = name(id); return (
        <li key={id} className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">
          <span>{kind === 'voice' ? '🔊' : '#'} {c?.name ?? id}{all.length > 1 && c ? <span className="text-muted"> · {c.guild}</span> : null}</span>
          {!disabled && <button type="button" aria-label={`Kanal ${c?.name ?? id} entfernen`} className="text-muted hover:text-danger" onClick={() => set(ids.filter((x) => x !== id))}><X size={12} /></button>}
        </li>); })}</ul>}
      {!disabled && ids.length < max && (list.length ? (
        <Select aria-label={ariaLabel} value="" onChange={(e) => e.target.value && set([...ids, e.target.value])}>
          <option value="">{ids.length ? '+ weiteren Kanal wählen…' : 'Kanal wählen…'}</option>
          {list.map((g) => <optgroup key={g.id} label={g.name}>{channelOptions(g, kind).filter((c) => !ids.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}
        </Select>
      ) : (
        <Input aria-label={ariaLabel} value={typed} placeholder="Kanal-ID + Enter" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (idOf(typed)) set([...ids, idOf(typed)]); setTyped(''); } }} onBlur={() => { if (idOf(typed)) set([...ids, idOf(typed)]); setTyped(''); }} />
      ))}
    </div>
  );
}

/** Discord-Server auswählen (Server, auf denen der Bot ist). Wert: Komma-getrennte IDs. Ohne gemeldete Server: ID eintippen. */
export function ServersPicker({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (ids: string) => void; ariaLabel: string; disabled?: boolean }) {
  const all = useGuilds().data ?? [];
  const ids = value.split(/[\s,;]+/).filter(Boolean);
  const set = (next: string[]) => onChange([...new Set(next)].join(', '));
  if (!all.length) return <Input aria-label={ariaLabel} inputMode="numeric" disabled={disabled} value={value} placeholder="Server-ID" onChange={(e) => onChange(e.target.value)} />;
  return (
    <div className="grid gap-2">
      {ids.length > 0 && <ul className="flex flex-wrap gap-1.5">{ids.map((id) => { const g = all.find((x) => x.id === id); return (
        <li key={id} className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">
          {g?.icon && <img src={g.icon} alt="" className="h-3.5 w-3.5 rounded-full" />}<span>{g?.name ?? id}</span>
          {!disabled && <button type="button" aria-label={`Server ${g?.name ?? id} entfernen`} className="text-muted hover:text-danger" onClick={() => set(ids.filter((x) => x !== id))}><X size={12} /></button>}
        </li>); })}</ul>}
      {!disabled && all.some((g) => !ids.includes(g.id)) && (
        <Select aria-label={ariaLabel} value="" onChange={(e) => e.target.value && set([...ids, e.target.value])}>
          <option value="">{ids.length ? '+ weiteren Server wählen…' : 'Server wählen…'}</option>
          {all.filter((g) => !ids.includes(g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      )}
    </div>
  );
}

/** Rollenname ohne Deko (Emojis, „·“, „|“): „🏛️ · Polizeipräsident“ → „Polizeipräsident“, „EN | Leitung“ bleibt lesbar. */
export const cleanRoleName = (n: string) => n.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^·\s*/, '').trim() || n.trim();

/**
 * Liste von Werten (Teams, Dienstgrade, Büros): Auswahl aus den Discord-Rollen des Servers oder eigener Wert;
 * entfernen, optional sortieren (Reihenfolge = Rang).
 */
export function TagListEditor({ value, onChange, ariaLabel, disabled, ordered, placeholder, max = 50 }: { value: string[]; onChange: (v: string[]) => void; ariaLabel: string; disabled?: boolean; ordered?: boolean; placeholder?: string; max?: number }) {
  const list = useGuildList();
  const [typed, setTyped] = useState('');
  const add = (v: string) => { const t = v.trim().slice(0, 64); if (t && !value.some((x) => x.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]); };
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const n = [...value]; [n[i], n[j]] = [n[j]!, n[i]!]; onChange(n); };
  const roleNames = [...new Set(list.flatMap((g) => [...g.roles].sort((a, b) => b.position - a.position).map((r) => cleanRoleName(r.name))))].filter((n) => !value.some((x) => x.toLowerCase() === n.toLowerCase()));
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ol className="flex flex-wrap gap-1.5">{value.map((v, i) => (
          <li key={v} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">
            {ordered && <span className="text-muted">{i + 1}.</span>}<span>{v}</span>
            {!disabled && ordered && <>
              <button type="button" aria-label={`${v} nach oben`} className="text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label={`${v} nach unten`} className="text-muted hover:text-fg disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
            </>}
            {!disabled && <button type="button" aria-label={`${v} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== v))}><X size={12} /></button>}
          </li>
        ))}</ol>
      )}
      {!disabled && value.length < max && (
        <div className="grid gap-2 sm:grid-cols-2">
          {roleNames.length > 0 && <Select aria-label={ariaLabel} value="" onChange={(e) => add(e.target.value)}>
            <option value="">Aus Discord-Rolle übernehmen…</option>
            {roleNames.map((n) => <option key={n} value={n}>@{n}</option>)}
          </Select>}
          <Input aria-label={`${ariaLabel} – eigener Wert`} value={typed} placeholder={placeholder ?? 'Eigener Wert + Enter'} maxLength={64}
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(typed); setTyped(''); } }} onBlur={() => { add(typed); setTyped(''); }} />
        </div>
      )}
    </div>
  );
}
