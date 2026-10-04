import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, STATUS_TEXT, type SubmissionRow } from '../api';
import { QueryState } from '../components/QueryState';

export function Submissions() {
  const { guildId = '' } = useParams();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const qs = new URLSearchParams({
    limit: '50',
    ...(status ? { status } : {}),
    ...(term ? { search: term } : {}),
  }).toString();
  const q = useQuery({
    queryKey: ['submissions', guildId, status, term],
    queryFn: () => api<{ items: SubmissionRow[] }>(`/guilds/${guildId}/submissions?${qs}`),
  });
  return (
    <>
      <h1>Einreichungen</h1>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Alle offenen & abgeschlossenen</option>
          {['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DENIED', 'WITHDRAWN'].map((s) => (
            <option key={s} value={s}>
              {STATUS_TEXT[s]}
            </option>
          ))}
        </select>
        <input
          className="inline-input"
          placeholder="Bewerber suchen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={q}>
        {(d) =>
          d.items.length === 0 ? (
            <p className="muted">Keine Einreichungen.</p>
          ) : (
            <ul className="list">
              {d.items.map((s) => (
                <li key={s.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/submissions/${s.id}`}>
                      <strong>{s.displayNameSnapshot}</strong>
                    </Link>{' '}
                    <small className="muted">
                      {s.application.name}
                      {s.isTest ? ' · TEST' : ''}
                    </small>
                    <br />
                    <small className="muted">
                      {s.submittedAt
                        ? `Eingereicht ${new Date(s.submittedAt).toLocaleString('de-DE')}`
                        : `Gestartet ${new Date(s.createdAt).toLocaleString('de-DE')}`}
                    </small>
                  </span>
                  <span className={`pill s-${s.status}`}>{STATUS_TEXT[s.status] ?? s.status}</span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
