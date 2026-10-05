import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type MemberRow, type NexusRoleRow, type PermissionOverview } from '../api';
import { fromMatrix, PermissionMatrix, toMatrix, type MatrixState } from '../components/PermissionMatrix';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

/** „Rollen & Rechte“: eigene Dashboard-Rollen anlegen, bearbeiten, duplizieren, löschen, Mitglieder zuweisen. */
export function NexusRoles() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/nexus-roles`;
  const list = useQuery({ queryKey: ['nexus-roles', guildId], queryFn: () => api<NexusRoleRow[]>(base) });
  const overview = useQuery({ queryKey: ['permissions', guildId], queryFn: () => api<PermissionOverview>(`/guilds/${guildId}/permissions`) });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['nexus-roles', guildId] });
  const create = useMutation({
    mutationFn: () => api<{ id: string }>(base, { method: 'POST', body: { name: name.trim(), entries: [] } }),
    onSuccess: (r) => {
      setName('');
      setSelected(r.id);
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Rollen &amp; Rechte</h1>
      <p className="muted">
        Eigene Rollen des Dashboards: frei benennbar, mit Priorität und Rechten. Optional an eine Discord-Rolle gekoppelt
        (alle Träger erhalten sie automatisch) oder einzelnen Mitgliedern zugewiesen. Du kannst nur Rollen unterhalb deiner
        eigenen Priorität ändern und nur Rechte vergeben, die du selbst besitzt.
      </p>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input className="inline-input" placeholder="Name der neuen Rolle" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim() || create.isPending}>
          Rolle erstellen
        </button>
      </form>
      <QueryState query={list}>
        {(roles) =>
          roles.length === 0 ? (
            <p className="muted">Noch keine eigenen Rollen.</p>
          ) : (
            <ul className="list">
              {roles.map((r) => (
                <li key={r.id} className="row">
                  <span className="grow">
                    <button className="linklike" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                      <strong style={r.color ? { color: r.color } : undefined}>{r.name}</strong>
                    </button>
                    {!r.enabled && <small className="muted"> (deaktiviert)</small>}
                    <br />
                    <small className="muted">
                      Priorität {r.priority} · {r.entries.filter((e) => e.effect === 'ALLOW').length} Rechte ·{' '}
                      {r.entries.filter((e) => e.effect === 'DENY').length} Sperren · {r.members.length} Mitglieder
                      {r.discordRoleId ? ` · gekoppelt mit @${overview.data?.roles.find((x) => x.id === r.discordRoleId)?.name ?? r.discordRoleId}` : ''}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {selected && list.data?.find((r) => r.id === selected) && (
        <Editor
          key={selected}
          role={list.data.find((r) => r.id === selected)!}
          guildId={guildId}
          overview={overview.data}
          onChanged={() => void refresh()}
          onGone={() => {
            setSelected(null);
            void refresh();
          }}
          onOpen={(id) => {
            setSelected(id);
            void refresh();
          }}
        />
      )}
    </>
  );
}

function Editor({
  role,
  guildId,
  overview,
  onChanged,
  onGone,
  onOpen,
}: {
  role: NexusRoleRow;
  guildId: string;
  overview: PermissionOverview | undefined;
  onChanged: () => void;
  onGone: () => void;
  onOpen: (id: string) => void;
}) {
  const toast = useToast();
  const base = `/guilds/${guildId}/nexus-roles/${role.id}`;
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [color, setColor] = useState(role.color ?? '');
  const [priority, setPriority] = useState(String(role.priority));
  const [enabled, setEnabled] = useState(role.enabled);
  const [link, setLink] = useState(role.discordRoleId ?? '');
  const [matrix, setMatrix] = useState<MatrixState>(() => toMatrix(role.entries));
  const [filter, setFilter] = useState('');
  const err = (e: unknown) => toast.error(errorText(e));
  const save = useMutation({
    mutationFn: () =>
      api(base, {
        method: 'PUT',
        body: {
          name,
          description: description.trim() || null,
          color: color.trim() || null,
          priority: Number.parseInt(priority, 10) || 0,
          enabled,
          discordRoleId: link || null,
          entries: fromMatrix(matrix),
        },
      }),
    onSuccess: () => {
      toast.success('Rolle gespeichert.');
      onChanged();
    },
    onError: err,
  });
  const duplicate = useMutation({
    mutationFn: () => api<{ id: string }>(`${base}/duplicate`, { method: 'POST' }),
    onSuccess: (r) => {
      toast.success('Rolle dupliziert (deaktiviert, ohne Mitglieder).');
      onOpen(r.id);
    },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: () => api(base, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Rolle gelöscht.');
      onGone();
    },
    onError: err,
  });
  const catalog = (overview?.catalog ?? []).filter((m) => !filter || m.module === filter);
  return (
    <div className="card comp">
      <h2>Rolle bearbeiten</h2>
      <label className="fld">
        <span>Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="fld">
        <span>Beschreibung</span>
        <input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="fld">
        <span>Farbe (#RRGGBB, optional)</span>
        <input value={color} maxLength={7} placeholder="#3366cc" onChange={(e) => setColor(e.target.value)} />
      </label>
      <label className="fld">
        <span>Priorität (höher = ranghöher)</span>
        <input type="number" min={-1000} max={1000} value={priority} onChange={(e) => setPriority(e.target.value)} />
      </label>
      <label className="fld">
        <span>Mit Discord-Rolle verknüpfen (Träger erhalten diese Rolle automatisch)</span>
        <select value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">– keine –</option>
          {overview?.roles.map((r) => (
            <option key={r.id} value={r.id}>
              @{r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fld">
        <span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Aktiv (deaktivierte Rollen geben keine Rechte)
        </span>
      </label>
      <label className="fld">
        <span>Rechte nach Kategorie filtern</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {overview?.catalog.map((m) => (
            <option key={m.module} value={m.module}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <PermissionMatrix catalog={catalog} value={matrix} onChange={setMatrix} allowScope />
      <div className="actions">
        <button className="btn primary" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
          {save.isPending ? 'Speichere …' : 'Speichern'}
        </button>
        <button className="btn" onClick={() => duplicate.mutate()}>
          Duplizieren
        </button>
        <button className="btn" onClick={() => window.confirm(`„${role.name}“ löschen? Alle Mitglieder verlieren die Rolle.`) && remove.mutate()}>
          Löschen
        </button>
      </div>
      <Members role={role} guildId={guildId} onChanged={onChanged} />
    </div>
  );
}

function Members({ role, guildId, onChanged }: { role: NexusRoleRow; guildId: string; onChanged: () => void }) {
  const toast = useToast();
  const base = `/guilds/${guildId}/nexus-roles/${role.id}/members`;
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const found = useQuery({
    queryKey: ['members', guildId, query],
    enabled: query.length > 0,
    queryFn: () => api<MemberRow[]>(`/guilds/${guildId}/members?limit=25&query=${encodeURIComponent(query)}`),
  });
  const add = useMutation({
    mutationFn: () =>
      api(base, { method: 'POST', body: { userIds: Object.keys(picked).filter((k) => picked[k]), durationDays: days ? Number(days) : undefined } }),
    onSuccess: () => {
      toast.success('Mitglieder hinzugefügt.');
      setPicked({});
      onChanged();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`${base}/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Mitglied entfernt.');
      onChanged();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const count = Object.values(picked).filter(Boolean).length;
  return (
    <>
      <h3>Mitglieder</h3>
      {role.members.length === 0 ? (
        <p className="muted">Keine direkten Mitglieder{role.discordRoleId ? ' (Träger der verknüpften Discord-Rolle zählen automatisch)' : ''}.</p>
      ) : (
        <ul className="list">
          {role.members.map((m) => (
            <li key={m.id} className="row">
              <span className="grow">
                {m.name ?? m.userId}
                {m.expiresAt ? <small className="muted"> · bis {new Date(m.expiresAt).toLocaleString('de-DE')}</small> : null}
              </span>
              <button className="btn" onClick={() => remove.mutate(m.userId)}>
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
          setQuery(input.trim());
        }}
      >
        <input className="inline-input" placeholder="Mitglied suchen …" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn">Suchen</button>
      </form>
      {found.data && (
        <ul className="list">
          {found.data.map((m) => (
            <li key={m.id} className="row">
              <label className="grow">
                <input type="checkbox" checked={!!picked[m.id]} onChange={(e) => setPicked({ ...picked, [m.id]: e.target.checked })} /> {m.displayName}{' '}
                <small className="muted">{m.username}</small>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <input className="inline-input" type="number" min={1} max={365} placeholder="Tage (leer = unbefristet)" value={days} onChange={(e) => setDays(e.target.value)} />
        <button className="btn primary" disabled={count === 0 || add.isPending} onClick={() => add.mutate()}>
          {count > 0 ? `${count} hinzufügen` : 'Hinzufügen'}
        </button>
      </div>
    </>
  );
}
