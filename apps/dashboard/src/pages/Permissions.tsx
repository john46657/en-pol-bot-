import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

interface PermissionsOverview {
  catalog: { module: string; label: string; permissions: { key: string; label: string }[] }[];
  roles: { id: string; name: string; color: number; position: number; permissions: string[] }[];
  orphaned: { roleId: string; permissions: string[] }[];
}

/** Zuordnung Discord-Rolle → NEXUS-Berechtigungen. Die Prüfung läuft serverseitig; hier wird nur konfiguriert. */
export function Permissions() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['permissions', guildId],
    queryFn: () => api<PermissionsOverview>(`/guilds/${guildId}/permissions`),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { roleId: string; permissions: string[] }) =>
      api(`/guilds/${guildId}/permissions/${v.roleId}`, {
        method: 'PUT',
        body: { permissions: v.permissions },
      }),
    onSuccess: () => {
      toast.success('Berechtigungen gespeichert.');
      void qc.invalidateQueries({ queryKey: ['permissions', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Berechtigungen</h1>
      <p className="muted">
        Lege fest, welche Discord-Rolle welche Funktionen nutzen darf. Server-Besitzer,
        Administratoren und „Server verwalten“ dürfen immer alles.
      </p>
      <QueryState query={q}>
        {(data) => {
          const role = data.roles.find((r) => r.id === selected) ?? data.roles[0];
          return (
            <div className="split">
              <ul className="list">
                {data.roles.map((r) => (
                  <li key={r.id}>
                    <button
                      className={`row choice ${role?.id === r.id ? 'active' : ''}`}
                      onClick={() => setSelected(r.id)}
                    >
                      <span className="grow">@{r.name}</span>
                      <small className="muted">{r.permissions.length}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {role && (
                <RolePanel
                  key={role.id}
                  role={role}
                  catalog={data.catalog}
                  saving={save.isPending}
                  onSave={(permissions) => save.mutate({ roleId: role.id, permissions })}
                />
              )}
              {data.orphaned.length > 0 && (
                <div className="alert error">
                  <div>
                    ⚠️ Zuordnungen zu Rollen, die es auf dem Server nicht mehr gibt:
                    {data.orphaned.map((o) => (
                      <div key={o.roleId}>
                        <code>{o.roleId}</code> ({o.permissions.length}){' '}
                        <button
                          className="btn"
                          onClick={() => save.mutate({ roleId: o.roleId, permissions: [] })}
                        >
                          Entfernen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

function RolePanel(p: {
  role: PermissionsOverview['roles'][number];
  catalog: PermissionsOverview['catalog'];
  saving: boolean;
  onSave: (p: string[]) => void;
}) {
  const [checked, setChecked] = useState(() => new Set(p.role.permissions));
  const dirty =
    checked.size !== p.role.permissions.length || p.role.permissions.some((x) => !checked.has(x));
  const toggle = (k: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <section className="card">
      <h3>@{p.role.name}</h3>
      {p.catalog.map((m) => {
        const manage = `${m.module}.manage`;
        return (
          <fieldset key={m.module} className="perm-group">
            <legend>{m.label}</legend>
            <ul className="plain">
              {m.permissions.map((perm) => {
                const implied = perm.key !== manage && checked.has(manage);
                return (
                  <li key={perm.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked.has(perm.key) || implied}
                        disabled={implied}
                        onChange={() => toggle(perm.key)}
                      />{' '}
                      {perm.label} <code>{perm.key}</code>
                      {implied && <small className="muted"> (durch „Alles“ enthalten)</small>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
      <button
        className="btn primary"
        disabled={!dirty || p.saving}
        onClick={() => p.onSave([...checked])}
      >
        {p.saving ? 'Speichere …' : 'Speichern'}
      </button>
    </section>
  );
}
