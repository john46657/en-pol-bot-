import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type PermissionOverview } from '../api';
import {
  fromMatrix,
  PermissionMatrix,
  toMatrix,
  type MatrixState,
} from '../components/PermissionMatrix';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

/**
 * Zuordnung Discord-Rolle → Rechte: Profile (wiederverwendbare Rechtesätze) und direkte Erlaubnisse/Sperren.
 * Alles wird serverseitig durchgesetzt; hier wird nur konfiguriert.
 */
export function Permissions() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['permissions', guildId],
    queryFn: () => api<PermissionOverview>(`/guilds/${guildId}/permissions`),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { roleId: string; allow: string[]; deny: string[]; profileIds: string[] }) =>
      api(`/guilds/${guildId}/permissions/${v.roleId}`, {
        method: 'PUT',
        body: { allow: v.allow, deny: v.deny, profileIds: v.profileIds },
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
        Lege fest, was eine Discord-Rolle darf. Rechte können direkt oder über{' '}
        <strong>Profile</strong> zugewiesen werden; eine <strong>Sperre</strong> schlägt jede
        Erlaubnis. Server-Besitzer und Administratoren dürfen immer alles.
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
                      <small className="muted">
                        {r.allow.length + r.profileIds.length}
                        {r.deny.length ? ` · ${r.deny.length} gesperrt` : ''}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {role && (
                <RolePanel
                  key={role.id + JSON.stringify([role.allow, role.deny, role.profileIds])}
                  role={role}
                  data={data}
                  saving={save.isPending}
                  onSave={(v) => save.mutate({ roleId: role.id, ...v })}
                />
              )}
              {data.orphaned.length > 0 && (
                <div className="alert error">
                  <div>
                    ⚠️ Zuordnungen zu Rollen, die es auf dem Server nicht mehr gibt:
                    {data.orphaned.map((o) => (
                      <div key={o.roleId}>
                        {o.name} <code>{o.roleId}</code> ({o.permissions.length + o.deny.length}){' '}
                        <button
                          className="btn"
                          onClick={() =>
                            save.mutate({ roleId: o.roleId, allow: [], deny: [], profileIds: [] })
                          }
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

function RolePanel({
  role,
  data,
  saving,
  onSave,
}: {
  role: PermissionOverview['roles'][number];
  data: PermissionOverview;
  saving: boolean;
  onSave: (v: { allow: string[]; deny: string[]; profileIds: string[] }) => void;
}) {
  const [matrix, setMatrix] = useState<MatrixState>(() =>
    toMatrix([
      ...role.allow.map((key) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const })),
      ...role.deny.map((key) => ({ key, effect: 'DENY' as const, scope: 'SERVER' as const })),
    ]),
  );
  const [profileIds, setProfileIds] = useState(new Set(role.profileIds));
  const entries = fromMatrix(matrix);
  const allow = entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key);
  const deny = entries.filter((e) => e.effect === 'DENY').map((e) => e.key);
  const dirty =
    JSON.stringify([[...allow].sort(), [...deny].sort(), [...profileIds].sort()]) !==
    JSON.stringify([[...role.allow].sort(), [...role.deny].sort(), [...role.profileIds].sort()]);
  const toggle = (id: string) =>
    setProfileIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <section className="card">
      <h3>@{role.name}</h3>
      <h4>Profile</h4>
      {data.profiles.length === 0 ? (
        <p className="muted">
          Noch keine Profile – unter „Profile“ anlegen oder eine Vorlage anwenden.
        </p>
      ) : (
        <ul className="plain">
          {data.profiles.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={profileIds.has(p.id)}
                  onChange={() => toggle(p.id)}
                />{' '}
                {p.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <h4>Direkte Rechte</h4>
      <PermissionMatrix catalog={data.catalog} value={matrix} onChange={setMatrix} />
      <button
        className="btn primary"
        disabled={!dirty || saving}
        onClick={() => onSave({ allow, deny, profileIds: [...profileIds] })}
      >
        {saving ? 'Speichere …' : 'Speichern'}
      </button>
    </section>
  );
}
