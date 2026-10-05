import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, API_URL, STATUS_TEXT, statusStyle, statusText, type SubmissionRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';

export function Submissions() {
  const { guildId = '' } = useParams();
  const toast = useToast();
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
  /** Export der (gefilterten) Bewerbungen als CSV, JSON oder PDF – serverseitig mit Recht „Einreichungen exportieren“ geprüft. */
  async function download(format: 'csv' | 'json' | 'pdf') {
    try {
      const params = new URLSearchParams({ format, ...(status ? { status } : {}) });
      const res = await fetch(`${API_URL}/api/v1/guilds/${guildId}/submissions/export?${params}`, { credentials: 'include', headers: { 'X-Requested-With': 'nexus' } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Dafür fehlt dir die Berechtigung (Einreichungen exportieren).' : `Export fehlgeschlagen (HTTP ${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `bewerbungen.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorText(e));
    }
  }
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
          {['SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD', 'ACCEPTED', 'DENIED', 'WITHDRAWN'].map((s) => (
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
        <button type="button" className="btn" onClick={() => void download('csv')}>⬇ CSV</button>
        <button type="button" className="btn" onClick={() => void download('json')}>⬇ JSON</button>
        <button type="button" className="btn" onClick={() => void download('pdf')}>⬇ PDF</button>
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
                      <strong>{s.submissionNumber ? `#${s.submissionNumber} · ` : ''}{s.displayNameSnapshot}</strong>
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
                      {' · Bearbeiter: '}
                      {s.assigneeUserId ? <UserName id={s.assigneeUserId} /> : 'noch nicht zugewiesen'}
                    </small>
                  </span>
                  <span className={`pill s-${s.status}`} style={statusStyle(s.status, s.application.config)}>{statusText(s.status, s.application.config)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
