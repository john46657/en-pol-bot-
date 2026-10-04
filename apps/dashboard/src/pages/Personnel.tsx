import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type MemberHit, type PersonnelRow, type RankRow, type TeamRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const STATE = { ACTIVE: '🟢 Aktiv', PAUSE: '🟡 Pause', OFF_DUTY: '🔴 Außer Dienst', SUSPENDED: '⚫ Suspendiert', CLOSED: '⚪ Geschlossen' } as const;

export function Personnel() {
  const { guildId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [teamId, setTeamId] = useState('');
  const [rankId, setRankId] = useState('');
  const qs = new URLSearchParams({
    limit: '100',
    ...(status ? { status } : {}),
    ...(query ? { query } : {}),
    ...(teamId ? { teamId } : {}),
    ...(rankId ? { rankId } : {}),
  }).toString();
  const list = useQuery({
    queryKey: ['personnel', guildId, qs],
    queryFn: () => api<{ items: PersonnelRow[] }>(`/guilds/${guildId}/personnel?${qs}`),
  });
  const ranks = useQuery({
    queryKey: ['ranks', guildId],
    queryFn: () => api<RankRow[]>(`/guilds/${guildId}/personnel-structure/ranks`),
  });
  const teams = useQuery({
    queryKey: ['teams', guildId],
    queryFn: () => api<TeamRow[]>(`/guilds/${guildId}/personnel-structure/teams`),
  });

  const [search, setSearch] = useState('');
  const [rpName, setRpName] = useState('');
  const [picked, setPicked] = useState<MemberHit | null>(null);
  const hits = useQuery({
    queryKey: ['member-search', guildId, search],
    enabled: search.trim().length >= 2 && !picked,
    queryFn: () =>
      api<MemberHit[]>(
        `/guilds/${guildId}/personnel/member-search?query=${encodeURIComponent(search.trim())}`,
      ),
  });
  const create = useMutation({
    mutationFn: () =>
      api<PersonnelRow>(`/guilds/${guildId}/personnel`, {
        method: 'POST',
        body: { userId: picked!.id, rpName },
      }),
    onSuccess: (r) => {
      toast.success('Akte angelegt.');
      void qc.invalidateQueries({ queryKey: ['personnel', guildId] });
      nav(`/guilds/${guildId}/personnel/${r.id}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Personal</h1>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
      >
        <input
          className="inline-input"
          placeholder="Name, Dienstnummer oder Discord-ID …"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="ACTIVE">Aktiv</option>
          <option value="ARCHIVED">Archiviert</option>
          <option value="">Alle</option>
        </select>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
          <option value="">Alle Teams</option>
          {teams.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={rankId} onChange={(e) => setRankId(e.target.value)} aria-label="Dienstgrad">
          <option value="">Alle Dienstgrade</option>
          {ranks.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={list}>
        {(d) =>
          d.items.length === 0 ? (
            <p className="muted">Keine Akten gefunden.</p>
          ) : (
            <ul className="list">
              {d.items.map((p) => (
                <li key={p.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/personnel/${p.id}`}>
                      <strong>{p.rpName}</strong>
                    </Link>{' '}
                    {p.serviceNumber && <code>{p.serviceNumber}</code>}
                    <br />
                    <small className="muted">
                      {p.rank?.name ?? 'kein Dienstgrad'} · {p.team?.name ?? 'kein Team'}
                      {' · '}{STATE[p.status === 'ARCHIVED' ? 'CLOSED' : p.teamState]}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      <h2>Neue Akte</h2>
      <div className="card comp">
        {picked ? (
          <p>
            Mitglied: <strong>{picked.displayName}</strong>{' '}
            <small className="muted">{picked.username}</small>{' '}
            <button
              className="btn"
              onClick={() => {
                setPicked(null);
                setSearch('');
              }}
            >
              Ändern
            </button>
          </p>
        ) : (
          <>
            <input
              className="inline-input"
              placeholder="Mitglied suchen (mind. 2 Zeichen) …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {hits.error && <p className="error">{errorText(hits.error)}</p>}
            <ul className="plain">
              {hits.data?.map((m) => (
                <li key={m.id}>
                  <button
                    className="why"
                    disabled={m.hasRecord}
                    onClick={() => {
                      setPicked(m);
                      setRpName(m.displayName);
                    }}
                  >
                    {m.displayName}{' '}
                    <small className="muted">
                      {m.username}
                      {m.hasRecord ? ' – hat bereits eine Akte' : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <label className="fld">
          <span>RP-Name</span>
          <input value={rpName} maxLength={80} onChange={(e) => setRpName(e.target.value)} />
        </label>
        <div>
          <button
            className="btn primary"
            disabled={!picked || rpName.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            Akte anlegen
          </button>
        </div>
      </div>
    </>
  );
}
