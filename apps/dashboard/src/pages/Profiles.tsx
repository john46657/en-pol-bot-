import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type PermissionOverview, type ProfileRow } from '../api';
import {
  fromMatrix,
  PermissionMatrix,
  toMatrix,
  type MatrixState,
} from '../components/PermissionMatrix';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

interface SaveValues {
  name: string;
  description: string;
  entries: unknown[];
  color: string | null;
  priority: number;
  enabled: boolean;
}

export function Profiles() {
  const { guildId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/permission-profiles`;
  const list = useQuery({
    queryKey: ['profiles', guildId],
    queryFn: () => api<ProfileRow[]>(base),
  });
  const overview = useQuery({
    queryKey: ['permissions', guildId],
    queryFn: () => api<PermissionOverview>(`/guilds/${guildId}/permissions`),
  });
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const done = (p: ProfileRow) => {
    void qc.invalidateQueries({ queryKey: ['profiles', guildId] });
    void qc.invalidateQueries({ queryKey: ['permissions', guildId] });
    nav(`/guilds/${guildId}/profiles/${p.id}`);
  };
  const create = useMutation({
    mutationFn: () =>
      api<ProfileRow>(base, { method: 'POST', body: { name: name.trim(), entries: [] } }),
    onSuccess: done,
    onError: (e) => toast.error(errorText(e)),
  });
  const fromTemplate = useMutation({
    mutationFn: () =>
      api<ProfileRow>(`${base}/from-template`, { method: 'POST', body: { templateKey: template } }),
    onSuccess: done,
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Profile</h1>
      <p className="muted">
        Ein Profil ist ein benannter Satz von Rechten und Sperren, den du einer oder mehreren
        Discord-Rollen zuweist.
      </p>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input
          className="inline-input"
          placeholder="Name des neuen Profils"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary" disabled={!name.trim() || create.isPending}>
          Leeres Profil
        </button>
      </form>
      <div className="actions">
        <select
          className="inline-input"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          aria-label="Vorlage"
        >
          <option value="">– Standardvorlage wählen –</option>
          {overview.data?.templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={!template || fromTemplate.isPending}
          onClick={() => fromTemplate.mutate()}
        >
          Aus Vorlage anlegen
        </button>
      </div>
      {template && (
        <p className="muted">
          {overview.data?.templates.find((t) => t.key === template)?.description}
        </p>
      )}
      <QueryState query={list}>
        {(profiles) =>
          profiles.length === 0 ? (
            <p className="muted">Noch keine Profile.</p>
          ) : (
            <ul className="list">
              {profiles.map((p) => (
                <li key={p.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/profiles/${p.id}`}>
                      <strong style={p.color ? { color: p.color } : undefined}>{p.name}</strong>
                    </Link>
                    {!p.enabled && <small className="muted"> (deaktiviert)</small>}
                    <br />
                    <small className="muted">
                      {p.entries.filter((e) => e.effect === 'ALLOW').length} Rechte ·{' '}
                      {p.entries.filter((e) => e.effect === 'DENY').length} Sperren · Rollen:{' '}
                      {p.roles.map((r) => `@${r.name}`).join(', ') || 'keine'}
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

export function ProfileEditor() {
  const { guildId = '', profileId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/permission-profiles`;
  const list = useQuery({
    queryKey: ['profiles', guildId],
    queryFn: () => api<ProfileRow[]>(base),
  });
  const overview = useQuery({
    queryKey: ['permissions', guildId],
    queryFn: () => api<PermissionOverview>(`/guilds/${guildId}/permissions`),
  });
  const save = useMutation({
    mutationFn: (v: SaveValues) =>
      api(`${base}/${profileId}`, {
        method: 'PUT',
        body: {
          name: v.name,
          description: v.description || undefined,
          entries: v.entries,
          color: v.color,
          priority: v.priority,
          enabled: v.enabled,
        },
      }),
    onSuccess: () => {
      toast.success('Profil gespeichert.');
      void qc.invalidateQueries({ queryKey: ['profiles', guildId] });
      void qc.invalidateQueries({ queryKey: ['permissions', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const duplicate = useMutation({
    mutationFn: () => api<ProfileRow>(`${base}/${profileId}/duplicate`, { method: 'POST' }),
    onSuccess: (p) => {
      toast.success('Profil dupliziert.');
      void qc.invalidateQueries({ queryKey: ['profiles', guildId] });
      nav(`/guilds/${guildId}/profiles/${p.id}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/${profileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Profil gelöscht.');
      void qc.invalidateQueries({ queryKey: ['profiles', guildId] });
      nav(`/guilds/${guildId}/profiles`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <Link to={`/guilds/${guildId}/profiles`} className="muted">
        ← Alle Profile
      </Link>
      <QueryState query={list}>
        {(profiles) => {
          const p = profiles.find((x) => x.id === profileId);
          if (!p) return <p className="error">Profil nicht gefunden.</p>;
          return (
            <Form
              key={p.id}
              p={p}
              catalog={overview.data?.catalog ?? []}
              saving={save.isPending}
              onSave={(v) => save.mutate(v)}
              onDuplicate={() => duplicate.mutate()}
              onDelete={() =>
                window.confirm(`„${p.name}“ löschen? Rollen verlieren dieses Profil.`) &&
                remove.mutate()
              }
            />
          );
        }}
      </QueryState>
    </>
  );
}

function Form({
  p,
  catalog,
  saving,
  onSave,
  onDuplicate,
  onDelete,
}: {
  p: ProfileRow;
  catalog: PermissionOverview['catalog'];
  saving: boolean;
  onSave: (v: SaveValues) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');
  const [color, setColor] = useState(p.color ?? '');
  const [priority, setPriority] = useState(String(p.priority));
  const [enabled, setEnabled] = useState(p.enabled);
  const [matrix, setMatrix] = useState<MatrixState>(() => toMatrix(p.entries));
  return (
    <div className="card comp">
      <h1>Profil bearbeiten</h1>
      <label className="fld">
        <span>Name</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="fld">
        <span>Beschreibung</span>
        <input
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Farbe (#RRGGBB, optional)</span>
        <input
          value={color}
          maxLength={7}
          placeholder="#3366cc"
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Priorität (höher = weiter oben)</span>
        <input
          type="number"
          min={-1000}
          max={1000}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{' '}
          Aktiv (deaktivierte Profile gelten nirgends)
        </span>
      </label>
      <p className="muted">
        Zugewiesen an: {p.roles.map((r) => `@${r.name}`).join(', ') || 'keine Rolle'}
        {p.templateKey ? ` · Vorlage: ${p.templateKey}` : ''}
      </p>
      <PermissionMatrix catalog={catalog} value={matrix} onChange={setMatrix} allowScope />
      <div className="actions">
        <button
          className="btn primary"
          disabled={saving || !name.trim()}
          onClick={() =>
            onSave({
              name,
              description,
              entries: fromMatrix(matrix),
              color: color.trim() || null,
              priority: Number.parseInt(priority, 10) || 0,
              enabled,
            })
          }
        >
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        <button className="btn" onClick={onDuplicate}>
          Duplizieren
        </button>
        <button className="btn" onClick={onDelete}>
          Profil löschen
        </button>
      </div>
    </div>
  );
}
