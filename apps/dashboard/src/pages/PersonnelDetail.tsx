import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  api,
  type PersonnelEntryRow,
  type PersonnelView,
  type RankRow,
  type TeamRow,
} from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const KIND = { AWARD: 'Auszeichnung', DISCIPLINE: 'Disziplin', NOTE: 'Notiz' } as const;
const EVENT: Record<string, string> = {
  created: 'Akte angelegt',
  edited: 'Stammdaten geändert',
  'rank.changed': 'Dienstgrad geändert',
  'team.changed': 'Team geändert',
  'number.assigned': 'Dienstnummer vergeben',
  'probation.set': 'Probezeit gesetzt',
  archived: 'Archiviert',
  restored: 'Wiederhergestellt',
  'entry.added': 'Eintrag hinzugefügt',
  'entry.revoked': 'Eintrag widerrufen',
};
const day = (s: string) => new Date(s).toLocaleDateString('de-DE');

export function PersonnelDetail() {
  const { guildId = '', recordId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/personnel/${recordId}`;
  const q = useQuery({
    queryKey: ['personnel-record', recordId],
    queryFn: () => api<PersonnelView>(base),
  });
  const ranks = useQuery({
    queryKey: ['ranks', guildId],
    queryFn: () => api<RankRow[]>(`/guilds/${guildId}/personnel-structure/ranks`),
  });
  const teams = useQuery({
    queryKey: ['teams', guildId],
    queryFn: () => api<TeamRow[]>(`/guilds/${guildId}/personnel-structure/teams`),
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['personnel-record', recordId] }),
      qc.invalidateQueries({ queryKey: ['personnel', guildId] }),
    ]);
  const run = useMutation({
    mutationFn: (v: { path: string; body?: unknown; method?: 'POST' | 'PATCH' }) =>
      api<{ roleChange?: { status: string; message: string } | null }>(`${base}${v.path}`, {
        method: v.method ?? 'POST',
        body: v.body ?? {},
      }),
    onSuccess: (r) => {
      if (r?.roleChange && r.roleChange.status !== 'success')
        toast.error(`Gespeichert, aber: ${r.roleChange.message}`);
      else toast.success('Gespeichert.');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/guilds/${guildId}/personnel/entries/${id}/revoke`, {
        method: 'POST',
        body: { reason: window.prompt('Grund für den Widerruf (optional)') ?? undefined },
      }),
    onSuccess: () => {
      toast.success('Eintrag widerrufen.');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <Link to={`/guilds/${guildId}/personnel`} className="muted">
        ← Alle Akten
      </Link>
      <QueryState query={q}>
        {(v) => (
          <Body
            v={v}
            ranks={ranks.data ?? []}
            teams={teams.data ?? []}
            busy={run.isPending}
            act={(path, body, method) => run.mutate({ path, body, ...(method ? { method } : {}) })}
            revoke={(id) => revoke.mutate(id)}
          />
        )}
      </QueryState>
    </>
  );
}

function Body({
  v,
  ranks,
  teams,
  busy,
  act,
  revoke,
}: {
  v: PersonnelView;
  ranks: RankRow[];
  teams: TeamRow[];
  busy: boolean;
  act: (path: string, body?: unknown, method?: 'POST' | 'PATCH') => void;
  revoke: (id: string) => void;
}) {
  const r = v.record;
  const [name, setName] = useState(r.rpName);
  const [number, setNumber] = useState('');
  const has = (s: string) => v.sections.includes(s);
  return (
    <>
      <h1>
        {r.rpName} {r.status === 'ARCHIVED' && <span className="pill">archiviert</span>}
      </h1>
      <p className="muted">
        Discord-ID {r.userId} · Eintritt {day(r.joinedAt)}
        {r.probationEndsAt ? ` · Probezeit bis ${day(r.probationEndsAt)}` : ''}
        {r.archivedReason ? ` · Grund: ${r.archivedReason}` : ''}
      </p>

      <h2>Stammdaten</h2>
      <div className="card comp">
        <label className="fld">
          <span>RP-Name</span>
          <input
            value={name}
            maxLength={80}
            disabled={!v.can.edit}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {v.can.edit && (
          <div>
            <button
              className="btn"
              disabled={busy || name.trim() === r.rpName}
              onClick={() => act('', { rpName: name }, 'PATCH')}
            >
              Speichern
            </button>
          </div>
        )}
      </div>

      <div className="two">
        <div className="card comp">
          <h3>Dienstgrad</h3>
          <select
            value={r.rank?.id ?? ''}
            disabled={!v.can.rank || busy}
            onChange={(e) => act('/rank', { rankId: e.target.value || null })}
            aria-label="Dienstgrad"
          >
            <option value="">– keiner –</option>
            {ranks
              .filter((x) => x.active || x.id === r.rank?.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </div>
        <div className="card comp">
          <h3>Team</h3>
          <select
            value={r.team?.id ?? ''}
            disabled={!v.can.team || busy}
            onChange={(e) => act('/team', { teamId: e.target.value || null })}
            aria-label="Team"
          >
            <option value="">– keins –</option>
            {teams
              .filter((x) => x.active || x.id === r.team?.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="card comp">
        <h3>Dienstnummer: {r.serviceNumber ?? '–'}</h3>
        {v.can.number && (
          <div className="actions">
            <button
              className="btn"
              disabled={busy}
              onClick={() => act('/number', { number: 'auto' })}
            >
              Nächste freie vergeben
            </button>
            <input
              className="inline-input"
              placeholder="oder manuell, z. B. EN-042"
              value={number}
              maxLength={20}
              onChange={(e) => setNumber(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy || !number.trim()}
              onClick={() => {
                act('/number', { number: number.trim() });
                setNumber('');
              }}
            >
              Setzen
            </button>
          </div>
        )}
      </div>

      {(['AWARD', 'DISCIPLINE', 'NOTE'] as const)
        .filter((k) => has({ AWARD: 'awards', DISCIPLINE: 'discipline', NOTE: 'notes' }[k]))
        .map((kind) => (
          <EntrySection
            key={kind}
            kind={kind}
            entries={v.entries.filter((e) => e.kind === kind)}
            canAdd={{ AWARD: v.can.award, DISCIPLINE: v.can.discipline, NOTE: v.can.note }[kind]}
            busy={busy}
            add={(title, body) => act('/entries', { kind, title, body })}
            revoke={revoke}
          />
        ))}

      {v.entries.some((e) => e.kind === 'OPERATION' || e.kind === 'PENALTY') && (
        <>
          <h2>Einsätze & Strafen</h2>
          <ul className="plain">
            {v.entries.filter((e) => e.kind === 'OPERATION' || e.kind === 'PENALTY').slice(0, 30).map((e) => (
              <li key={e.id} className="card">
                <strong>{e.title}</strong> <small className="muted">{day(e.occurredAt)}{e.revokedAt ? ' · aufgehoben' : ''}</small>
                {e.body && <div style={{ whiteSpace: 'pre-line' }}>{e.body}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        {v.can.archive &&
          (r.status === 'ACTIVE' ? (
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Grund der Archivierung (optional)');
                if (reason !== null) act('/archive', { reason });
              }}
            >
              Akte archivieren
            </button>
          ) : (
            <button className="btn" disabled={busy} onClick={() => act('/restore')}>
              Akte wiederherstellen
            </button>
          ))}
      </div>

      <p className="muted">
        Ausbildungen, Qualifikationen, Beförderungen, Abwesenheiten, Dienststunden und Einsätze
        erscheinen hier, sobald die jeweiligen Module vorhanden sind.
      </p>

      {has('history') && (
        <>
          <h2>Verlauf</h2>
          <ul className="plain">
            {v.events.map((e) => (
              <li key={e.id}>
                {EVENT[e.type] ?? e.type}{' '}
                <small className="muted">
                  {e.actorId ? `von ${e.actorId} · ` : 'automatisch · '}
                  {new Date(e.createdAt).toLocaleString('de-DE')}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function EntrySection({
  kind,
  entries,
  canAdd,
  busy,
  add,
  revoke,
}: {
  kind: keyof typeof KIND;
  entries: PersonnelEntryRow[];
  canAdd: boolean;
  busy: boolean;
  add: (t: string, b: string) => void;
  revoke: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <>
      <h2>{{ AWARD: 'Auszeichnungen', DISCIPLINE: 'Disziplin', NOTE: 'Notizen' }[kind]}</h2>
      {entries.length === 0 ? (
        <p className="muted">Keine Einträge.</p>
      ) : (
        <ul className="plain">
          {entries.map((e) => (
            <li key={e.id} className={`card ${e.revokedAt ? 'off' : ''}`}>
              <strong>{e.title}</strong>{' '}
              <small className="muted">
                {day(e.occurredAt)}
                {e.createdBy ? ` · ${e.createdBy}` : ''}
                {e.revokedAt ? ` · widerrufen${e.revokeReason ? `: ${e.revokeReason}` : ''}` : ''}
              </small>
              {e.body && <div>{e.body}</div>}
              {canAdd && !e.revokedAt && (
                <button className="btn" onClick={() => revoke(e.id)}>
                  Widerrufen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form
          className="card comp"
          onSubmit={(ev) => {
            ev.preventDefault();
            add(title, body);
            setTitle('');
            setBody('');
          }}
        >
          <input
            className="inline-input"
            placeholder={`${KIND[kind]}: Titel`}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={2}
            placeholder="Text (optional)"
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <button className="btn" disabled={busy || !title.trim()}>
              Hinzufügen
            </button>
          </div>
        </form>
      )}
    </>
  );
}
