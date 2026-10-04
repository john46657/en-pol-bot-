import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api';

interface Item {
  id: string;
  title: string;
  subtitle: string;
  path: string;
}
interface Group {
  kind: string;
  label: string;
  items: Item[];
}
interface Result {
  query: string;
  groups: Group[];
}
/** Ein Menüpunkt, der auch in der Suche gefunden werden soll (rein lokal, ohne Server). */
export interface PageHit {
  key: string;
  title: string;
  icon: string;
  path: string;
}

/**
 * Globale Suche im Header: Tickets, Transcripts, Bewerbungen, Teammitglieder (vom Server, nach Recht) und Seiten des
 * Dashboards (lokal). Strg/Cmd+K fokussiert das Feld; ↑/↓ wählen, Enter öffnet, Esc schließt.
 */
export function HeaderSearch({ guildId, pages }: { guildId: string; pages: PageHit[] }) {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250); // nicht bei jedem Tastendruck fragen
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const enabled = dq.length >= 2;
  const res = useQuery({
    queryKey: ['search', guildId, dq],
    queryFn: () => api<Result>(`/guilds/${guildId}/design/search?q=${encodeURIComponent(dq)}`),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
  const pageHits = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n.length < 2 ? [] : pages.filter((p) => p.title.toLowerCase().includes(n)).slice(0, 5);
  }, [q, pages]);

  const groups: Group[] = useMemo(
    () => [
      ...(pageHits.length
        ? [
            {
              kind: 'pages',
              label: 'Seiten',
              items: pageHits.map((p) => ({
                id: p.key,
                title: `${p.icon} ${p.title}`,
                subtitle: 'Seite',
                path: p.path,
              })),
            },
          ]
        : []),
      ...(res.data?.query === dq ? res.data.groups : []),
    ],
    [pageHits, res.data, dq],
  );
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setActive(0), [dq, flat.length]);
  const go = (it: Item) => {
    setOpen(false);
    setQ('');
    setDq('');
    nav(`/guilds/${guildId}${it.path}`);
  };
  const disabled = res.error instanceof ApiError && res.error.status === 403;

  return (
    <div className="hs" ref={box}>
      <input
        ref={input}
        className="hs-input"
        type="search"
        role="combobox"
        aria-label="Suche"
        aria-expanded={open && q.trim().length >= 2}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={60}
        placeholder="🔍 Suchen … (Strg+K)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(0, flat.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && flat[active]) {
            e.preventDefault();
            go(flat[active]!);
          }
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="hs-panel" id={listId} role="listbox" aria-label="Suchergebnisse">
          {res.isFetching && groups.length === 0 && <p className="muted hs-note">Suche …</p>}
          {disabled && (
            <p className="muted hs-note">Die Suche ist für diesen Server deaktiviert.</p>
          )}
          {res.error && !disabled && (
            <p className="error hs-note">Die Suche ist gerade nicht erreichbar.</p>
          )}
          {!res.isFetching && !res.error && groups.length === 0 && enabled && (
            <p className="muted hs-note">Keine Treffer für „{dq}“.</p>
          )}
          {groups.map((g) => (
            <div key={g.kind} role="group" aria-label={g.label}>
              <div className="hs-group">{g.label}</div>
              {g.items.map((it) => {
                const idx = flat.indexOf(it);
                return (
                  <button
                    key={`${g.kind}-${it.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === active}
                    className={`hs-item ${idx === active ? 'on' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(it)}
                  >
                    <span>{it.title}</span>
                    <small className="muted">{it.subtitle}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
