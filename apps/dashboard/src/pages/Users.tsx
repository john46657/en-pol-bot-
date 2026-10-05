import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, type MemberAccess, type MemberRow, type PermissionOverview } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

export function Users() {
  const { guildId = '' } = useParams();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const q = useQuery({
    queryKey: ['members', guildId, query],
    queryFn: () =>
      api<MemberRow[]>(
        `/guilds/${guildId}/members?limit=50${query ? `&query=${encodeURIComponent(query)}` : ''}`,
      ),
  });
  return (
    <>
      <h1>Benutzer</h1>
      <p className="muted">
        Mitglieder des Servers mit ihren Rollen und der Zahl ihrer effektiven Berechtigungen.
      </p>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
      >
        <input
          className="inline-input"
          placeholder="Name suchen …"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn">Suchen</button>
      </form>
      <QueryState query={q}>
        {(members) =>
          members.length === 0 ? (
            <p className="muted">Keine Mitglieder gefunden.</p>
          ) : (
            <ul className="list">
              {members.map((m) => (
                <li key={m.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/users/${m.id}`}>
                      <strong>{m.displayName}</strong>
                    </Link>{' '}
                    <small className="muted">{m.username}</small>
                    <br />
                    <small className="muted">
                      Rollen: {m.roles.map((r) => `@${r.name}`).join(', ') || 'keine'}
                    </small>
                  </span>
                  <span className="muted">
                    Berechtigungen: <strong>{m.permissionCount}</strong>
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

const ICON = { allowed: '✓', limited: '◐', denied: '✗', none: '–' } as const;
const SCOPE = { SERVER: 'überall', TEAM: 'nur eigenes Team', RECORD: 'ein Datensatz' } as const;

export function UserDetail() {
  const { guildId = '', userId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/members/${userId}`;
  const q = useQuery({
    queryKey: ['member-access', guildId, userId],
    queryFn: () => api<MemberAccess>(`${base}/access`),
  });
  const overview = useQuery({
    queryKey: ['permissions', guildId],
    queryFn: () => api<PermissionOverview>(`/guilds/${guildId}/permissions`),
  });
  const [key, setKey] = useState('');
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['member-access', guildId, userId] });
  const add = useMutation({
    mutationFn: () =>
      api(`${base}/overrides`, { method: 'POST', body: {
          key,
          effect,
          note: note || undefined,
          durationDays: days ? Number(days) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Ausnahme gespeichert.');
      setKey('');
      setNote('');
      setDays('');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/overrides/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Ausnahme entfernt.');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <Link to={`/guilds/${guildId}/users`} className="muted">
        ← Alle Benutzer
      </Link>
      <QueryState query={q}>
        {(a) => {
          const groups = [...new Set(a.permissions.map((p) => p.module))].map((m) => ({
            module: m,
            label: a.permissions.find((p) => p.module === m)!.moduleLabel,
            items: a.permissions.filter((p) => p.module === m),
          }));
          return (
            <>
              <h1>
                {a.user.displayName} <small className="muted">{a.user.username}</small>
              </h1>
              <p>Rollen: {a.roles.map((r) => `@${r.name}`).join(', ') || 'keine'}</p>
              {a.guildAdmin && (
                <p className="alert ok-note">
                  Server-Besitzer/Administrator: darf unabhängig von Zuordnungen alles (außer
                  ausdrücklich gesperrte Rechte werden hier nur angezeigt).
                </p>
              )}
              <div className="stats">
                <div className="stat">
                  <b>{a.counts.allowed}</b>
                  <span>erlaubt</span>
                </div>
                <div className="stat">
                  <b>{a.counts.limited}</b>
                  <span>eingeschränkt</span>
                </div>
                <div className="stat">
                  <b>{a.counts.denied}</b>
                  <span>gesperrt</span>
                </div>
              </div>

              <h2>Effektive Berechtigungen</h2>
              <p className="muted">
                Klicke auf ein Recht, um zu sehen, warum es gilt oder gesperrt ist.
              </p>
              {groups.map((g) => (
                <fieldset key={g.module} className="perm-group">
                  <legend>{g.label}</legend>
                  <ul className="plain">
                    {g.items.map((p) => (
                      <li key={p.key}>
                        <button
                          className="why"
                          onClick={() => setOpen(open === p.key ? null : p.key)}
                          aria-expanded={open === p.key}
                        >
                          <span className={`state ${p.state}`} aria-label={p.state}>
                            {ICON[p.state]}
                          </span>{' '}
                          {p.label} {p.alias && <code>{p.alias}</code>}
                        </button>
                        {open === p.key && (
                          <div className="why-box">
                            {p.viaDiscordAdmin && (
                              <div>✓ Server-Besitzer/Administrator in Discord</div>
                            )}
                            {p.entries.length === 0 && !p.viaDiscordAdmin && (
                              <div className="muted">Keine Zuordnung vorhanden.</div>
                            )}
                            {p.entries.map((e, i) => (
                              <div key={i} className={e.effect === 'DENY' ? 'error' : ''}>
                                {e.effect === 'DENY' ? '✗ Gesperrt' : '✓ Erlaubt'}
                                {e.viaManage ? ' (über „Alles im Bereich“)' : ''} · {SCOPE[e.scope]}
                                {e.scopeRef ? ` (${e.scopeRef})` : ''}
                                <br />
                                <small className="muted">
                                  Quelle:{' '}
                                  {e.source.kind === 'user'
                                    ? `Ausnahme für diesen Benutzer${e.source.note ? ` („${e.source.note}“)` : ''}`
                                    : e.source.kind === 'profile'
                                      ? `@${e.source.roleName} → Profil „${e.source.profileName}“`
                                      : `@${e.source.roleName} → direkt zugewiesen`}
                                </small>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ))}

              <h2>Ausnahmen für diesen Benutzer</h2>
              {a.overrides.length === 0 ? (
                <p className="muted">Keine.</p>
              ) : (
                <ul className="list">
                  {a.overrides.map((o) => (
                    <li key={o.id} className="row">
                      <span className="grow">
                        {o.effect === 'DENY' ? '✗ Sperre' : '✓ Erlaubnis'}: <code>{o.key}</code> ·{' '}
                        {SCOPE[o.scope]}
                        {o.note ? ` · ${o.note}` : ''}
                        {o.expiresAt
                          ? ` · gilt bis ${new Date(o.expiresAt).toLocaleString('de-DE')}`
                          : ''}
                      </span>
                      <button className="btn" onClick={() => remove.mutate(o.id)}>
                        Entfernen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (key) add.mutate();
                }}
              >
                <select
                  className="inline-input"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  aria-label="Recht"
                >
                  <option value="">– Recht wählen –</option>
                  {overview.data?.catalog.map((m) => (
                    <optgroup key={m.module} label={m.label}>
                      {m.permissions.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  value={effect}
                  onChange={(e) => setEffect(e.target.value as 'ALLOW' | 'DENY')}
                  aria-label="Wirkung"
                >
                  <option value="ALLOW">Erlauben</option>
                  <option value="DENY">Sperren</option>
                </select>
                <input
                  className="inline-input"
                  placeholder="Notiz (optional)"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <input
                  className="inline-input"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="Tage (leer = unbefristet)"
                  aria-label="Gültig für Tage"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
                <button className="btn primary" disabled={!key || add.isPending}>
                  Hinzufügen
                </button>
              </form>

              <h2>Letzte Aktionen</h2>
              {a.recentActions.length === 0 ? (
                <p className="muted">Keine protokollierten Aktionen.</p>
              ) : (
                <ul className="plain">
                  {a.recentActions.map((r) => (
                    <li key={r.id}>
                      <code>{r.action}</code>{' '}
                      {r.result && <small className="muted">({r.result})</small>}{' '}
                      <small className="muted">
                        {new Date(r.createdAt).toLocaleString('de-DE')}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">Folgt mit den jeweiligen Modulen: {a.pending.join(', ')}.</p>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
