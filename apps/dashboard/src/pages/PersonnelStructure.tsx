import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DiscordRole, type NumberFormat, type RankRow, type TeamRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';
import { UserName } from '../components/UserName';
import { UserPicker } from '../components/UserPicker';

/** Dienstgrade, Teams und Dienstnummern-Format. */
export function PersonnelStructure() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/personnel-structure`;
  const ranks = useQuery({
    queryKey: ['ranks', guildId],
    queryFn: () => api<RankRow[]>(`${base}/ranks`),
  });
  const teams = useQuery({
    queryKey: ['teams', guildId],
    queryFn: () => api<TeamRow[]>(`${base}/teams`),
  });
  const format = useQuery({
    queryKey: ['number-format', guildId],
    queryFn: () => api<NumberFormat>(`${base}/number-format`),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`),
  });
  const done = (msg: string) => {
    toast.success(msg);
    for (const k of ['ranks', 'teams', 'number-format'])
      void qc.invalidateQueries({ queryKey: [k, guildId] });
  };
  const call = useMutation({
    mutationFn: (v: {
      method: 'POST' | 'PUT' | 'DELETE';
      path: string;
      body?: unknown;
      msg: string;
    }) => api(`${base}${v.path}`, { method: v.method, body: v.body }).then(() => v.msg),
    onSuccess: done,
    onError: (e) => toast.error(errorText(e)),
  });
  const roleOptions = (roles.data ?? []).filter((r) => r.blockedReason !== 'everyone');
  const roleName = (id: string | null) => roleOptions.find((r) => r.id === id)?.name;

  const emptyRank = { name: '', shortName: '', order: 1, isEntry: false, discordRoleId: '', icon: '', color: '' };
  const [rank, setRank] = useState(emptyRank);
  const [editId, setEditId] = useState<string | null>(null);
  /** Vollständiger Datensatz eines Dienstgrads für PUT – nichts darf beim Umschalten verloren gehen. */
  const rankBody = (r: RankRow, patch: Partial<{ isEntry: boolean; active: boolean }> = {}) => ({
    name: r.name,
    shortName: r.shortName ?? undefined,
    order: r.order,
    isEntry: r.isEntry,
    discordRoleId: r.discordRoleId,
    icon: r.icon ?? undefined,
    color: r.color ?? undefined,
    active: r.active,
    ...patch,
  });
  const [team, setTeam] = useState({ name: '', discordRoleId: '', leaderUserId: '' });
  const [fmt, setFmt] = useState<NumberFormat | null>(null);
  const f = fmt ?? format.data;

  return (
    <>
      <h1>Dienstgrade & Teams</h1>

      <h2>Dienstnummern</h2>
      <QueryState query={format}>
        {() =>
          f && (
            <div className="card comp">
              <div className="two">
                <label className="fld">
                  <span>Präfix (z. B. EN-)</span>
                  <input
                    value={f.prefix}
                    maxLength={10}
                    onChange={(e) => setFmt({ ...f, prefix: e.target.value })}
                  />
                </label>
                <label className="fld">
                  <span>Stellen</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={f.digits}
                    onChange={(e) => setFmt({ ...f, digits: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="fld">
                <span>Nächste Nummer</span>
                <input
                  type="number"
                  min={1}
                  value={f.next}
                  onChange={(e) => setFmt({ ...f, next: Number(e.target.value) })}
                />
              </label>
              <label className="fld">
                <span>Automatische Vergabe</span>
                <select
                  value={f.assign}
                  aria-label="Automatische Vergabe"
                  onChange={(e) => setFmt({ ...f, assign: e.target.value as NumberFormat['assign'] })}
                >
                  <option value="TRAINING">Nach der ersten bestandenen Ausbildung</option>
                  <option value="ACCEPT">Bei Annahme der Bewerbung</option>
                  <option value="OFF">Nie automatisch (nur manuell)</option>
                </select>
              </label>
              <p className="muted">
                Beispiel:{' '}
                <code>
                  {f.prefix}
                  {String(f.next).padStart(f.digits, '0')}
                </code>
              </p>
              <div>
                <button
                  className="btn primary"
                  disabled={call.isPending || !fmt}
                  onClick={() =>
                    call.mutate({
                      method: 'PUT',
                      path: '/number-format',
                      body: f,
                      msg: 'Format gespeichert.',
                    })
                  }
                >
                  Speichern
                </button>
              </div>
            </div>
          )
        }
      </QueryState>

      <h2>Dienstgrade</h2>
      <QueryState query={ranks}>
        {(rs) => (
          <ul className="list">
            {rs.map((r) => (
              <li key={r.id} className={`row ${r.active ? '' : 'off'}`}>
                <span className="grow">
                  <strong style={r.color ? { color: r.color } : undefined}>
                    {r.icon ? `${r.icon} ` : ''}
                    {r.name}
                  </strong>{' '}
                  <small className="muted">
                    Rang {r.order}
                    {r.isEntry ? ' · Einstieg' : ''}
                    {r.discordRoleId ? ` · @${roleName(r.discordRoleId) ?? '?'}` : ''} ·{' '}
                    {r._count?.records ?? 0} Akten{r.active ? '' : ' · deaktiviert'}
                  </small>
                </span>
                <button
                  className="btn"
                  disabled={call.isPending}
                  onClick={() =>
                    call.mutate({
                      method: 'PUT',
                      path: `/ranks/${r.id}`,
                      body: rankBody(r, { isEntry: !r.isEntry }),
                      msg: 'Gespeichert.',
                    })
                  }
                >
                  {r.isEntry ? 'Kein Einstieg mehr' : 'Als Einstieg'}
                </button>
                <button
                  className="btn"
                  disabled={call.isPending}
                  onClick={() =>
                    call.mutate({
                      method: 'PUT',
                      path: `/ranks/${r.id}`,
                      body: rankBody(r, { active: !r.active }),
                      msg: 'Gespeichert.',
                    })
                  }
                >
                  {r.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditId(r.id);
                    setRank({ name: r.name, shortName: r.shortName ?? '', order: r.order, isEntry: r.isEntry, discordRoleId: r.discordRoleId ?? '', icon: r.icon ?? '', color: r.color ?? '' });
                  }}
                >
                  Bearbeiten
                </button>
                <button
                  className="btn"
                  disabled={call.isPending}
                  onClick={() =>
                    window.confirm(`„${r.name}“ löschen?`) &&
                    call.mutate({ method: 'DELETE', path: `/ranks/${r.id}`, msg: 'Gelöscht.' })
                  }
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <form
        className="card comp"
        onSubmit={(e) => {
          e.preventDefault();
          const active = editId ? ranks.data?.find((x) => x.id === editId)?.active : true;
          call.mutate({
            method: editId ? 'PUT' : 'POST',
            path: editId ? `/ranks/${editId}` : '/ranks',
            body: { ...rank, discordRoleId: rank.discordRoleId || undefined, active: active ?? true },
            msg: editId ? 'Dienstgrad gespeichert.' : 'Dienstgrad angelegt.',
          });
          setRank(emptyRank);
          setEditId(null);
        }}
      >
        <div className="two">
          <label className="fld">
            <span>Name</span>
            <input
              value={rank.name}
              maxLength={60}
              onChange={(e) => setRank({ ...rank, name: e.target.value })}
            />
          </label>
          <label className="fld">
            <span>Rangfolge (höher = höherer Rang)</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={rank.order}
              onChange={(e) => setRank({ ...rank, order: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="two">
          <label className="fld">
            <span>Symbol (z. B. ⭐)</span>
            <input value={rank.icon} maxLength={8} onChange={(e) => setRank({ ...rank, icon: e.target.value })} />
          </label>
          <label className="fld">
            <span>Farbe</span>
            <input type="color" aria-label="Farbe des Dienstgrads" value={rank.color || '#5865f2'} onChange={(e) => setRank({ ...rank, color: e.target.value })} />
          </label>
        </div>
        <label className="fld">
          <span>Discord-Rolle (optional, wird bei Dienstgradwechsel vergeben/entzogen)</span>
          <select
            value={rank.discordRoleId}
            onChange={(e) => setRank({ ...rank, discordRoleId: e.target.value })}
          >
            <option value="">– keine –</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.manageable}>
                {r.manageable ? '🟢' : '🔴'} @{r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={rank.isEntry}
            onChange={(e) => setRank({ ...rank, isEntry: e.target.checked })}
          />{' '}
          Einstiegsdienstgrad (für neu Angenommene)
        </label>
        <div>
          <button className="btn primary" disabled={!rank.name.trim() || call.isPending}>
            {editId ? 'Dienstgrad speichern' : 'Dienstgrad anlegen'}
          </button>
          {editId && (
            <button type="button" className="btn" onClick={() => { setEditId(null); setRank(emptyRank); }}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <h2>Teams</h2>
      <QueryState query={teams}>
        {(ts) => (
          <ul className="list">
            {ts.map((t) => (
              <li key={t.id} className={`row ${t.active ? '' : 'off'}`}>
                <span className="grow">
                  <strong>{t.name}</strong>{' '}
                  <small className="muted">
                    {t._count?.records ?? 0} Mitglieder
                    {t.discordRoleId ? ` · @${roleName(t.discordRoleId) ?? '?'}` : ''}
                    {t.leaderUserId ? <> · Leitung <UserName id={t.leaderUserId} /></> : ''}
                    {t.active ? '' : ' · deaktiviert'}
                  </small>
                </span>
                <button
                  className="btn"
                  disabled={call.isPending}
                  onClick={() =>
                    call.mutate({
                      method: 'PUT',
                      path: `/teams/${t.id}`,
                      body: {
                        name: t.name,
                        description: t.description ?? undefined,
                        discordRoleId: t.discordRoleId,
                        leaderUserId: t.leaderUserId,
                        active: !t.active,
                      },
                      msg: 'Gespeichert.',
                    })
                  }
                >
                  {t.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button
                  className="btn"
                  disabled={call.isPending}
                  onClick={() =>
                    window.confirm(`„${t.name}“ löschen?`) &&
                    call.mutate({ method: 'DELETE', path: `/teams/${t.id}`, msg: 'Gelöscht.' })
                  }
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <form
        className="card comp"
        onSubmit={(e) => {
          e.preventDefault();
          call.mutate({
            method: 'POST',
            path: '/teams',
            body: {
              name: team.name,
              discordRoleId: team.discordRoleId || undefined,
              leaderUserId: team.leaderUserId || undefined,
            },
            msg: 'Team angelegt.',
          });
          setTeam({ name: '', discordRoleId: '', leaderUserId: '' });
        }}
      >
        <label className="fld">
          <span>Name</span>
          <input
            value={team.name}
            maxLength={60}
            onChange={(e) => setTeam({ ...team, name: e.target.value })}
          />
        </label>
        <label className="fld">
          <span>Discord-Teamrolle (optional)</span>
          <select
            value={team.discordRoleId}
            onChange={(e) => setTeam({ ...team, discordRoleId: e.target.value })}
          >
            <option value="">– keine –</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.manageable}>
                {r.manageable ? '🟢' : '🔴'} @{r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="fld">
          <span>Teamleitung (optional – gilt für „nur eigenes Team“)</span>
          <UserPicker label="Teamleitung" value={team.leaderUserId} onChange={(id) => setTeam((t) => ({ ...t, leaderUserId: id }))} />
        </div>
        <div>
          <button className="btn primary" disabled={!team.name.trim() || call.isPending}>
            Team anlegen
          </button>
        </div>
      </form>
    </>
  );
}
