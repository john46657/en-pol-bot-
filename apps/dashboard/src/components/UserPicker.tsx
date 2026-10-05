import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { UserName } from './UserName';

interface Person {
  id: string;
  name: string;
  username: string | null;
  rpName: string | null;
}

/**
 * Person auswählen statt Discord-ID tippen: Name, Spitzname oder RP-Name eingeben (ab 2 Zeichen) und aus den Treffern
 * wählen; eine eingefügte Discord-ID wird direkt übernommen. Gewählt ist immer eine ID (`value`/`onChange`).
 */
export function UserPicker({ value, onChange, label, placeholder = 'Name oder Discord-ID …', inline = false }: { value: string; onChange: (id: string) => void; label: string; placeholder?: string; inline?: boolean }) {
  const { guildId = '' } = useParams();
  const listId = useId();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const isId = /^\d{5,25}$/.test(text.trim());
  useEffect(() => {
    if (!isId) return;
    onChange(text.trim()); // eingefügte Discord-ID direkt übernehmen
    setText('');
  }, [isId, text, onChange]);
  const found = useQuery({
    queryKey: ['people', guildId, query],
    queryFn: () => api<Person[]>(`/guilds/${guildId}/discord/people?query=${encodeURIComponent(query)}`),
    enabled: query.length >= 2 && !/^\d{5,25}$/.test(query),
    retry: false,
  });
  const selected = /^\d{5,25}$/.test(value);
  const input = (
    <input
      className={inline ? 'inline-input' : undefined}
      aria-label={label}
      aria-controls={listId}
      placeholder={placeholder}
      value={text}
      maxLength={50}
      onChange={(e) => setText(e.target.value)}
    />
  );
  return (
    <span className={`user-picker${inline ? ' inline' : ''}`} style={{ display: inline ? 'inline-block' : 'block' }}>
      {selected && !text ? (
        <span className="user-picker-selected">
          <UserName id={value} avatar />
          <button type="button" className="user-picker-clear" aria-label={`${label}: Auswahl entfernen`} title="Andere Person wählen" onClick={() => onChange('')}>✕</button>
        </span>
      ) : (
        input
      )}
      {text && !isId && found.data && (
        <ul id={listId} className="user-picker-list" role="listbox" aria-label={`${label}: Treffer`}>
          {found.data.length === 0 && <li className="user-picker-empty">Niemand gefunden.</li>}
          {found.data.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="user-picker-option"
                onClick={() => {
                  onChange(p.id);
                  setText('');
                  setQuery('');
                }}
              >
                <span>{p.rpName ? `${p.rpName} · ${p.name}` : p.name}</span>
                {p.username && <small>@{p.username}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
