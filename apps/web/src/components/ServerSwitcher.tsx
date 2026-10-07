import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, LayoutGrid, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useGuilds, useServer } from '../lib/guilds';

const Icon = ({ icon, name }: { icon: string | null; name: string }) => (icon
  ? <img src={icon} alt="" className="h-6 w-6 shrink-0 rounded-full" />
  : <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{name.slice(0, 2).toUpperCase()}</span>);

/** Server-Auswahl wie bei Dyno – oben links beim Namen. „Alle Server“ zeigt alles und bearbeitet die gemeinsamen Einstellungen. */
export function ServerSwitcher({ orgName, onPicked }: { orgName: string; onPicked?: () => void }) {
  const guilds = useGuilds();
  const [server, setServer] = useServer();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const list = guilds.data ?? [];
  const sel = list.find((g) => g.id === server);
  // nur ein (oder kein) Server: einfach der Name wie bisher
  if (list.length < 2) return <div className="flex min-w-0 items-center gap-2"><Shield size={18} className="text-primary" aria-hidden /><span className="min-w-0 truncate">{orgName}</span></div>;
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Server: ${sel?.name ?? 'All servers'}`} onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel-2">
        {sel ? <Icon icon={sel.icon} name={sel.name} /> : <Shield size={18} className="shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 flex-1"><span className="block truncate">{sel?.name ?? orgName}</span><span className="block text-[11px] font-normal text-muted">{sel ? 'Server' : 'All servers'}</span></span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Choose server" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-panel p-1 shadow-xl">
          {[{ id: '', name: 'All servers', icon: null as string | null }, ...list].map((g) => (
            <li key={g.id || 'all'} role="none">
              <button type="button" role="option" aria-selected={g.id === server} onClick={() => { setServer(g.id); setOpen(false); onPicked?.(); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal hover:bg-panel-2">
                {g.id ? <Icon icon={g.icon} name={g.name} /> : <span className="grid h-6 w-6 place-items-center"><Globe size={16} className="text-muted" aria-hidden /></span>}
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {g.id === server && <Check size={14} className="text-primary" aria-hidden />}
              </button>
            </li>
          ))}
          <li role="none" className="mt-1 border-t border-line pt-1">
            <button type="button" onClick={() => { setOpen(false); onPicked?.(); nav('/servers'); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-primary hover:bg-panel-2">
              <span className="grid h-6 w-6 place-items-center"><LayoutGrid size={16} aria-hidden /></span>Alle Server als Übersicht
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
