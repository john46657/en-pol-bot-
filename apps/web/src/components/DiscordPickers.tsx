import { useState } from 'react';
import { X } from 'lucide-react';
import { useGuilds, useServer, type GuildInfo } from '../lib/guilds';
import { Input, Select } from './ui';

const hexColor = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : 'var(--color-muted, #888)');
const idOf = (t: string) => t.match(/\d{15,25}/)?.[0] ?? '';

/** Channels eines Servers in Discord-Reihenfolge (Kategorien mit ihren Channels). */
function channelOptions(g: GuildInfo, kind: 'text' | 'category') {
  if (kind === 'category') return g.channels.filter((c) => c.type === 'category').sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, label: `📁 ${c.name}` }));
  const cats = new Map(g.channels.filter((c) => c.type === 'category').map((c) => [c.id, c]));
  return g.channels.filter((c) => c.type === 'text')
    .sort((a, b) => (cats.get(a.parentId ?? '')?.position ?? -1) - (cats.get(b.parentId ?? '')?.position ?? -1) || a.position - b.position)
    .map((c) => ({ id: c.id, label: `# ${c.name}${c.parentId && cats.get(c.parentId) ? `  (${cats.get(c.parentId)!.name})` : ''}` }));
}

/** Gemeldete Server – ist oben links ein Server gewählt, nur dieser. */
function useGuildList() {
  const guilds = useGuilds();
  const [server] = useServer();
  const all = guilds.data ?? [];
  return server ? all.filter((g) => g.id === server) : all;
}

/** Channel auswählen (nach Server gruppiert). Ohne gemeldete Server: Eingabe der ID. */
export function ChannelPicker({ value, onChange, kind = 'text', ariaLabel, disabled }: { value: string | null | undefined; onChange: (id: string | null) => void; kind?: 'text' | 'category'; ariaLabel: string; disabled?: boolean }) {
  const list = useGuildList();
  if (!list.length) return <Input aria-label={ariaLabel} inputMode="numeric" disabled={disabled} value={value ?? ''} placeholder={kind === 'category' ? 'Discord category ID' : 'Discord channel ID'} onChange={(e) => onChange(idOf(e.target.value) || null)} />;
  const known = list.some((g) => g.channels.some((c) => c.id === value));
  return (
    <Select aria-label={ariaLabel} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— none —</option>
      {value && !known && <option value={value}>Unknown ({value})</option>}
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
              {!disabled && <button type="button" aria-label={`Remove role ${r?.name ?? id}`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>}
            </li>
          );
        })}</ul>
      )}
      {!disabled && value.length < max && (list.length ? (
        <Select aria-label={ariaLabel} value="" onChange={(e) => add(e.target.value)}>
          <option value="">Select some roles…</option>
          {list.map((g) => <optgroup key={g.id} label={g.name}>{[...g.roles].sort((a, b) => b.position - a.position).filter((r) => !value.includes(r.id)).map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}
        </Select>
      ) : (
        <Input aria-label={ariaLabel} value={typed} placeholder="Discord role ID + Enter" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(idOf(typed)); setTyped(''); } }} onBlur={() => { add(idOf(typed)); setTyped(''); }} />
      ))}
    </div>
  );
}
