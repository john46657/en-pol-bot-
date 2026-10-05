import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type ApplicationRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { TeamChanceStats } from '../components/TeamChanceStats';
import { useToast } from '../toast';

const STATUS: Record<string, string> = {
  DRAFT: 'Entwurf',
  PUBLISHED: 'Veröffentlicht',
  ARCHIVED: 'Archiviert',
  PAUSED: 'Pausiert',
};

export function Applications() {
  const { guildId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const base = `/guilds/${guildId}/applications`;
  const q = useQuery({
    queryKey: ['applications', guildId],
    queryFn: () => api<{ items: ApplicationRow[] }>(base),
  });
  const create = useMutation({
    mutationFn: () => api<ApplicationRow>(base, { method: 'POST', body: { name: name.trim() } }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['applications', guildId] });
      nav(`/guilds/${guildId}/applications/${a.id}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Bewerbungen</h1>
      <TeamChanceStats guildId={guildId} />
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input
          className="inline-input"
          placeholder="Name der neuen Bewerbung"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary" disabled={!name.trim() || create.isPending}>
          Erstellen
        </button>
      </form>
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <p className="muted">Noch keine Bewerbungen.</p>
          ) : (
            <ul className="list">
              {d.items.map((a) => (
                <li key={a.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/applications/${a.id}`}>
                      <strong>{a.name}</strong>
                    </Link>
                    <br />
                    <small className="muted">
                      {STATUS[a.status] ?? a.status} · {a._count?.submissions ?? 0} Einreichungen
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
