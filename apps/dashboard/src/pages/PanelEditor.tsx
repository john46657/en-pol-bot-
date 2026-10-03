import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  api,
  type DiscordChannel,
  type DiscordRole,
  type PanelAction,
  type PanelButton,
  type PanelConfig,
  type PanelOption,
  type PanelRow,
} from '../api';
import { PanelPreview } from '../components/PanelPreview';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => ALPHABET[n % ALPHABET.length]).join(
    '',
  );
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined)) as T;

export function PanelEditor() {
  const { guildId = '', panelId = '' } = useParams();
  const base = `/guilds/${guildId}/message-panels/${panelId}`;
  const q = useQuery({ queryKey: ['panel', panelId], queryFn: () => api<PanelRow>(base) });
  return (
    <>
      <Link to={`/guilds/${guildId}/panels`} className="muted">
        ← Alle Panels
      </Link>
      <QueryState query={q}>
        {(panel) => <Editor key={panel.id} panel={panel} guildId={guildId} />}
      </QueryState>
    </>
  );
}

function Editor({ panel, guildId }: { panel: PanelRow; guildId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/message-panels/${panel.id}`;
  const [name, setName] = useState(panel.name);
  const [config, setConfig] = useState<PanelConfig>(panel.config);
  const [autoUpdate, setAutoUpdate] = useState(panel.autoUpdate);
  const [channelId, setChannelId] = useState(panel.channelId ?? '');
  const dirty = useMemo(
    () =>
      name !== panel.name ||
      autoUpdate !== panel.autoUpdate ||
      JSON.stringify(config) !== JSON.stringify(panel.config),
    [name, autoUpdate, config, panel],
  );
  const channels = useQuery({
    queryKey: ['channels-text', guildId],
    queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels?kind=text`),
  });
  const roles = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`),
  });
  const assignable = (roles.data ?? []).filter(
    (r) => r.manageable && !r.dangerous && r.blockedReason !== 'everyone',
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['panel', panel.id] }),
      qc.invalidateQueries({ queryKey: ['panels', guildId] }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      api<{ synced: string }>(base, { method: 'PUT', body: { name, config, autoUpdate } }),
    onSuccess: async (r) => {
      toast.success(
        r.synced === 'updated' || r.synced === 'resent'
          ? 'Gespeichert – Nachricht in Discord aktualisiert.'
          : r.synced === 'failed'
            ? 'Gespeichert, aber die Nachricht in Discord konnte nicht aktualisiert werden.'
            : 'Gespeichert.',
      );
      await refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const send = useMutation({
    mutationFn: async () => {
      if (dirty) await api(base, { method: 'PUT', body: { name, config, autoUpdate } });
      return api<{ mode: string }>(`${base}/send`, { method: 'POST', body: { channelId } });
    },
    onSuccess: async (r) => {
      toast.success(r.mode === 'edited' ? 'Panel in Discord aktualisiert.' : 'Panel gesendet.');
      await refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const set = (patch: Partial<PanelConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const setEmbed = (patch: Partial<PanelConfig['embed']>) =>
    setConfig((c) => ({ ...c, embed: clean({ ...c.embed, ...patch }) }));
  const embed = config.embed;

  return (
    <div className="editor">
      <div className="editor-form">
        <h1>Panel bearbeiten</h1>
        <Field label="Name (nur intern)">
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>

        <h2>Nachricht</h2>
        <Field label="Text über dem Embed">
          <textarea
            rows={2}
            maxLength={2000}
            value={config.content ?? ''}
            onChange={(e) => set(clean({ content: e.target.value }) as Partial<PanelConfig>)}
          />
        </Field>
        <Field label="Titel">
          <input
            value={embed.title ?? ''}
            maxLength={256}
            onChange={(e) => setEmbed({ title: e.target.value })}
          />
        </Field>
        <Field label="Beschreibung">
          <textarea
            rows={4}
            maxLength={4096}
            value={embed.description ?? ''}
            onChange={(e) => setEmbed({ description: e.target.value })}
          />
        </Field>
        <div className="two">
          <Field label="Farbe">
            <input
              type="color"
              value={embed.color ?? '#5865f2'}
              onChange={(e) => setEmbed({ color: e.target.value })}
            />
          </Field>
          <Field label="Footer">
            <input
              value={embed.footer ?? ''}
              maxLength={2048}
              onChange={(e) => setEmbed({ footer: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Thumbnail (https-Adresse)">
          <input
            value={embed.thumbnailUrl ?? ''}
            onChange={(e) => setEmbed({ thumbnailUrl: e.target.value })}
          />
        </Field>
        <Field label="Bild (https-Adresse)">
          <input
            value={embed.imageUrl ?? ''}
            onChange={(e) => setEmbed({ imageUrl: e.target.value })}
          />
        </Field>

        <h2>
          Buttons <small className="muted">({config.buttons.length}/20)</small>
        </h2>
        {config.buttons.map((b, i) => (
          <div key={b.id} className="card comp">
            <div className="two">
              <Field label="Beschriftung">
                <input
                  value={b.label}
                  maxLength={80}
                  onChange={(e) => updateButton(i, { label: e.target.value })}
                />
              </Field>
              <Field label="Emoji">
                <input
                  value={b.emoji ?? ''}
                  placeholder="🚓"
                  onChange={(e) => updateButton(i, { emoji: e.target.value || undefined })}
                />
              </Field>
            </div>
            <div className="two">
              <Field label="Stil">
                <select
                  value={b.style}
                  onChange={(e) => changeStyle(i, e.target.value as PanelButton['style'])}
                >
                  <option value="primary">Blau</option>
                  <option value="secondary">Grau</option>
                  <option value="success">Grün</option>
                  <option value="danger">Rot</option>
                  <option value="link">Link</option>
                </select>
              </Field>
              {b.style === 'link' ? (
                <Field label="Adresse (https)">
                  <input
                    value={b.url ?? ''}
                    onChange={(e) => updateButton(i, { url: e.target.value })}
                  />
                </Field>
              ) : (
                <ActionEditor
                  action={b.action}
                  roles={assignable}
                  onChange={(a) => updateButton(i, { action: a })}
                />
              )}
            </div>
            <button
              className="btn"
              onClick={() => set({ buttons: config.buttons.filter((_, j) => j !== i) })}
            >
              Entfernen
            </button>
          </div>
        ))}
        <button
          className="btn"
          disabled={config.buttons.length >= 20}
          onClick={() =>
            set({
              buttons: [
                ...config.buttons,
                {
                  id: newId(),
                  label: 'Button',
                  style: 'primary',
                  action: { type: 'message', content: 'Hallo!' },
                },
              ],
            })
          }
        >
          + Button
        </button>

        <h2>Auswahlmenü</h2>
        {!config.select ? (
          <button
            className="btn"
            onClick={() =>
              set({
                select: {
                  placeholder: 'Bitte wählen …',
                  options: [
                    {
                      id: newId(),
                      label: 'Option',
                      action: { type: 'message', content: 'Hallo!' },
                    },
                  ],
                },
              })
            }
          >
            + Auswahlmenü
          </button>
        ) : (
          <div className="card comp">
            <Field label="Platzhalter">
              <input
                value={config.select.placeholder ?? ''}
                maxLength={150}
                onChange={(e) =>
                  set({ select: { ...config.select!, placeholder: e.target.value } })
                }
              />
            </Field>
            {config.select.options.map((o, i) => (
              <div key={o.id} className="card comp">
                <div className="two">
                  <Field label="Beschriftung">
                    <input
                      value={o.label}
                      maxLength={100}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="Emoji">
                    <input
                      value={o.emoji ?? ''}
                      onChange={(e) => updateOption(i, { emoji: e.target.value || undefined })}
                    />
                  </Field>
                </div>
                <Field label="Beschreibung">
                  <input
                    value={o.description ?? ''}
                    maxLength={100}
                    onChange={(e) => updateOption(i, { description: e.target.value || undefined })}
                  />
                </Field>
                <ActionEditor
                  action={o.action}
                  roles={assignable}
                  onChange={(a) => a && updateOption(i, { action: a })}
                />
                <button
                  className="btn"
                  disabled={config.select!.options.length <= 1}
                  onClick={() =>
                    set({
                      select: {
                        ...config.select!,
                        options: config.select!.options.filter((_, j) => j !== i),
                      },
                    })
                  }
                >
                  Option entfernen
                </button>
              </div>
            ))}
            <button
              className="btn"
              disabled={config.select.options.length >= 25}
              onClick={() =>
                set({
                  select: {
                    ...config.select!,
                    options: [
                      ...config.select!.options,
                      {
                        id: newId(),
                        label: 'Option',
                        action: { type: 'message', content: 'Hallo!' },
                      },
                    ],
                  },
                })
              }
            >
              + Option
            </button>{' '}
            <button
              className="btn"
              onClick={() => {
                const { select: _s, ...rest } = config;
                setConfig(rest as PanelConfig);
              }}
            >
              Auswahlmenü entfernen
            </button>
          </div>
        )}

        <h2>Senden</h2>
        <Field label="Kanal">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">– Kanal wählen –</option>
            {channels.data?.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(e) => setAutoUpdate(e.target.checked)}
          />{' '}
          Gesendete Nachricht bei jeder Änderung automatisch aktualisieren
        </label>
        <div className="actions">
          <button className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Speichere …' : 'Speichern'}
          </button>
          <button
            className="btn primary"
            disabled={!channelId || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending
              ? 'Sende …'
              : panel.messageId && panel.channelId === channelId
                ? 'In Discord aktualisieren'
                : 'In Kanal senden'}
          </button>
          {dirty && <small className="muted">Ungespeicherte Änderungen</small>}
        </div>
      </div>
      <aside className="editor-preview">
        <h2>Vorschau</h2>
        <PanelPreview config={config} />
      </aside>
    </div>
  );

  function updateButton(i: number, patch: Partial<PanelButton>) {
    set({
      buttons: config.buttons.map((b, j) =>
        j === i ? (clean({ ...b, ...patch }) as PanelButton) : b,
      ),
    });
  }
  function changeStyle(i: number, style: PanelButton['style']) {
    const b = config.buttons[i]!;
    const { url: _u, action: _a, ...rest } = b;
    set({
      buttons: config.buttons.map((x, j) =>
        j === i
          ? style === 'link'
            ? { ...rest, style, url: 'https://' }
            : { ...rest, style, action: { type: 'message', content: 'Hallo!' } as PanelAction }
          : x,
      ),
    });
  }
  function updateOption(i: number, patch: Partial<PanelOption>) {
    set({
      select: {
        ...config.select!,
        options: config.select!.options.map((o, j) =>
          j === i ? (clean({ ...o, ...patch }) as PanelOption) : o,
        ),
      },
    });
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fld">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ActionEditor({
  action,
  roles,
  onChange,
}: {
  action: PanelAction | undefined;
  roles: DiscordRole[];
  onChange: (a: PanelAction) => void;
}) {
  const type = action?.type ?? 'message';
  return (
    <div className="fld">
      <span>Aktion beim Klick</span>
      <select
        value={type}
        onChange={(e) =>
          onChange(
            e.target.value === 'message'
              ? { type: 'message', content: 'Hallo!' }
              : { type: 'role-toggle', roleId: roles[0]?.id ?? '' },
          )
        }
      >
        <option value="message">Nachricht anzeigen (nur für den Klickenden)</option>
        <option value="role-toggle">Rolle vergeben / entziehen</option>
      </select>
      {action?.type === 'message' && (
        <textarea
          rows={2}
          maxLength={2000}
          value={action.content}
          onChange={(e) => onChange({ type: 'message', content: e.target.value })}
        />
      )}
      {action?.type === 'role-toggle' && (
        <select
          value={action.roleId}
          onChange={(e) => onChange({ type: 'role-toggle', roleId: e.target.value })}
        >
          <option value="">– Rolle wählen –</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              🟢 @{r.name}
            </option>
          ))}
        </select>
      )}
      {action?.type === 'role-toggle' && roles.length === 0 && (
        <small className="error">Keine Rolle verfügbar, die der Bot vergeben darf.</small>
      )}
    </div>
  );
}
