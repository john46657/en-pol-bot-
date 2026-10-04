import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useToast } from '../toast';
import { errorText } from '../components/QueryState';
import {
  api,
  ApiError,
  BLOCK_REASON,
  type BotPermissions,
  type DiscordChannel,
  type DiscordRole,
  type SelectionSlot,
} from '../api';

/** Rollen und Kanäle kommen live aus Discord – es werden nie IDs getippt. */
export function Settings() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}`;
  const slots = useQuery({
    queryKey: ['selections', guildId],
    queryFn: () => api<SelectionSlot[]>(`${base}/selections`),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<DiscordRole[]>(`${base}/discord/roles`),
  });
  const channels = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => api<DiscordChannel[]>(`${base}/discord/channels`),
  });
  const bot = useQuery({
    queryKey: ['bot-perms', guildId],
    queryFn: () => api<BotPermissions>(`${base}/discord/bot-permissions`),
  });
  const save = useMutation({
    mutationFn: (v: { slot: string; value: string | null }) =>
      api(`${base}/selections/${v.slot}`, { method: 'PUT', body: { value: v.value } }),
    onSuccess: () => {
      toast.success('Gespeichert.');
      return qc.invalidateQueries({ queryKey: ['selections', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const error = [slots, roles, channels, bot].map((q) => q.error).find(Boolean) ?? save.error;
  return (
    <>
      <h1>Rollen & Kanäle wählen</h1>
      {error && <p className="error">{errorText(error)}</p>}
      {(slots.isLoading || roles.isLoading || channels.isLoading) && (
        <p className="muted">Lade aus Discord …</p>
      )}

      {bot.data && (
        <ul className="list">
          {bot.data.checks.map((c) => (
            <li key={c.key} className={`row ${c.ok ? '' : 'bad'}`}>
              <span aria-hidden>{c.ok ? '🟢' : '🔴'}</span>
              <span className="grow">
                Bot-Recht „{c.label}“ {c.ok ? 'vorhanden' : 'fehlt'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <OfficeStatus guildId={guildId} />

      <div className="list">
        {slots.data?.map((slot) => (
          <Field
            key={slot.key}
            slot={slot}
            roles={roles.data ?? []}
            channels={channels.data ?? []}
            saving={save.isPending && save.variables?.slot === slot.key}
            onChange={(value) => save.mutate({ slot: slot.key, value })}
          />
        ))}
      </div>
    </>
  );
}

/** Zustand des Büro-Warteraums (nur Anzeige – der Bot verschiebt oder trennt dort niemanden). */
function OfficeStatus({ guildId }: { guildId: string }) {
  const q = useQuery({ queryKey: ['office', guildId], queryFn: () => api<{ state: string; name: string | null; message: string }>(`/guilds/${guildId}/office`) });
  if (!q.data) return null;
  return (
    <p className={`badge ${q.data.state === 'ok' ? 'ok' : 'no'}`}>
      {q.data.state === 'ok' ? '🟢' : '🔴'} Büro-Warteraum{q.data.name ? ` „${q.data.name}“` : ''}: {q.data.message}
    </p>
  );
}

function Field(p: {
  slot: SelectionSlot;
  roles: DiscordRole[];
  channels: DiscordChannel[];
  saving: boolean;
  onChange: (v: string | null) => void;
}) {
  const { slot } = p;
  const selectedRole = slot.kind === 'role' ? p.roles.find((r) => r.id === slot.value) : undefined;
  const missing =
    slot.value && slot.kind === 'role'
      ? !selectedRole
      : slot.value
        ? !p.channels.some((c) => c.id === slot.value)
        : false;
  const id = `slot-${slot.key}`;
  return (
    <div className="field">
      <label htmlFor={id}>
        <b>{slot.label}</b>
      </label>
      <span className="hint">{slot.description}</span>
      <select
        id={id}
        value={slot.value ?? ''}
        disabled={p.saving}
        onChange={(e) => p.onChange(e.target.value || null)}
      >
        <option value="">– nicht gesetzt –</option>
        {slot.kind === 'role'
          ? p.roles
              .filter((r) => r.blockedReason !== 'everyone')
              .map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  disabled={!!slot.requiresManageable && !r.manageable}
                >
                  {r.manageable ? '🟢' : '🔴'} @{r.name}
                  {r.blockedReason ? ` (${BLOCK_REASON[r.blockedReason]})` : ''}
                </option>
              ))
          : p.channels
              .filter((c) => c.kind === slot.kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {{ text: '#', voice: '🔊 ', category: '📁 ' }[slot.kind as 'text']}
                  {c.name}
                </option>
              ))}
      </select>
      {selectedRole && (
        <span className={`badge ${selectedRole.manageable ? 'ok' : 'no'}`}>
          {selectedRole.manageable
            ? '🟢 Bot kann Rolle verwalten'
            : `🔴 Bot kann Rolle nicht verwalten – ${BLOCK_REASON[selectedRole.blockedReason ?? ''] ?? ''}`}
        </span>
      )}
      {missing && (
        <span className="badge no">
          ⚠️ Die gespeicherte Auswahl existiert in Discord nicht mehr.
        </span>
      )}
    </div>
  );
}
