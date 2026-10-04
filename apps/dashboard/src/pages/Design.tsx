import { normalizeConfig, type DesignConfig } from '@nexus/design/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { api, type GuildOverview } from '../api';
import { QueryState, errorText } from '../components/QueryState';
import { Preview, DEVICES, type Device } from '../design/editor/Preview';
import { ThemesTab, type ThemeRow } from '../design/editor/ThemesTab';
import { EditorCtx, defaultAt, setIn } from '../design/editor/state';
import {
  AnimationTab,
  BackgroundTab,
  CardsButtonsTab,
  ColorsTab,
  General,
  LayoutTab,
  ModesTab,
  NavigationTab,
  ResponsiveTab,
  TypographyTab,
} from '../design/editor/tabs';
import { useTheme } from '../theme';
import { useToast } from '../toast';

interface Overview {
  activeThemeId: string | null;
  autosave: boolean;
  themes: ThemeRow[];
}
interface ThemeFull {
  id: string;
  name: string;
  version: number;
  builtin: boolean;
  config: DesignConfig;
}

const TABS = [
  ['general', '🎨 Allgemein', General],
  ['background', '🖼️ Hintergrund', BackgroundTab],
  ['colors', '🎨 Farben', ColorsTab],
  ['typography', '🔤 Typografie', TypographyTab],
  ['navigation', '🧭 Navigation', NavigationTab],
  ['cards', '📦 Karten & Buttons', CardsButtonsTab],
  ['layout', '📐 Layout', LayoutTab],
  ['animation', '✨ Animationen', AnimationTab],
  ['responsive', '📱 Responsive', ResponsiveTab],
  ['modes', '🌓 Modi', ModesTab],
] as const;

/** Design & Erscheinungsbild: bearbeitet das aktive Theme mit Live-Vorschau; Speichern, Verwerfen, Autosave, Themes. */
export function Design() {
  const { guildId = '' } = useParams();
  const overview = useQuery({
    queryKey: ['design', guildId],
    queryFn: () => api<Overview>(`/guilds/${guildId}/design`),
  });
  return (
    <QueryState query={overview}>{(o) => <Editor guildId={guildId} overview={o} />}</QueryState>
  );
}

function Editor({ guildId, overview }: { guildId: string; overview: Overview }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { theme: uiMode } = useTheme();
  const [tab, setTab] = useState<string>('general');
  const [device, setDevice] = useState<Device>('desktop');
  const [previewMode, setPreviewMode] = useState<'dark' | 'light' | null>(null);
  const activeId = overview.activeThemeId;
  const themeQ = useQuery({
    queryKey: ['design-theme', guildId, activeId],
    queryFn: () => api<ThemeFull>(`/guilds/${guildId}/design/themes/${activeId}`),
    enabled: !!activeId,
  });
  const guild = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => api<GuildOverview>(`/guilds/${guildId}`),
  });
  const theme = themeQ.data;
  // Der Entwurf gehört fest zu einer Theme-Version. So kann nie ein Entwurf des alten Themes im neu
  // geladenen Theme bearbeitet (und danach überschrieben) werden: ohne passenden Entwurf ist der Editor gesperrt.
  const themeKey = theme ? `${theme.id}:${theme.version}` : null;
  const [stored, setStored] = useState<{ key: string; config: DesignConfig } | null>(null);
  const draft = stored && stored.key === themeKey ? stored.config : null;
  const setDraft = useCallback(
    (u: DesignConfig | null | ((d: DesignConfig | null) => DesignConfig | null)) =>
      setStored((prev) => {
        const cur = prev && prev.key === themeKey ? prev.config : null;
        const next = typeof u === 'function' ? u(cur) : u;
        return next && themeKey ? { key: themeKey, config: next } : null;
      }),
    [themeKey],
  );
  useEffect(() => {
    if (theme && themeKey && stored?.key !== themeKey) {
      setStored({ key: themeKey, config: normalizeConfig(theme.config) });
    }
  }, [theme, themeKey, stored]);
  const dirty =
    !!theme && !!draft && JSON.stringify(draft) !== JSON.stringify(normalizeConfig(theme.config));

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['design', guildId] });
    void qc.invalidateQueries({ queryKey: ['design-theme', guildId] });
    void qc.invalidateQueries({ queryKey: ['design-effective', guildId] });
  }, [qc, guildId]);
  const save = useMutation({
    mutationFn: (config: DesignConfig) =>
      api(`/guilds/${guildId}/design/themes/${theme!.id}`, { method: 'PUT', body: { config } }),
    onSuccess: () => {
      refresh();
      toast.success('Design gespeichert');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const autosave = useMutation({
    mutationFn: (on: boolean) =>
      api(`/guilds/${guildId}/design/autosave`, { method: 'PUT', body: { autosave: on } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorText(e)),
  });
  const copy = useMutation({
    mutationFn: async () => {
      const t = await api<{ id: string }>(
        `/guilds/${guildId}/design/themes/${theme!.id}/duplicate`,
        { method: 'POST' },
      );
      await api(`/guilds/${guildId}/design/themes/${t.id}/activate`, { method: 'POST' });
    },
    onSuccess: () => {
      refresh();
      toast.success('Eigene Kopie angelegt und aktiviert');
    },
    onError: (e) => toast.error(errorText(e)),
  });

  // Autosave: nach kurzer Ruhe speichern (nur eigene Themes); die Versionshistorie bleibt erhalten.
  useEffect(() => {
    if (!overview.autosave || !dirty || !draft || theme?.builtin || save.isPending) return;
    const t = setTimeout(() => save.mutate(draft), 1500);
    return () => clearTimeout(t);
  }, [overview.autosave, dirty, draft, theme?.builtin]);

  // Warnung beim Verlassen: Browser-Schließen/Neuladen und Klicks auf Links im Dashboard
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]');
      if (
        a &&
        !a.getAttribute('href')?.startsWith('#') &&
        !window.confirm('Du hast ungespeicherte Änderungen. Seite trotzdem verlassen?')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const api_ = useMemo(
    () =>
      draft && {
        draft,
        disabled: !theme || theme.builtin,
        set: (path: string, v: unknown) =>
          setDraft((d) => (d ? normalizeConfig(setIn(d, path, v), d) : d)),
        reset: (path: string) =>
          setDraft((d) => (d ? normalizeConfig(setIn(d, path, defaultAt(path))) : d)),
      },
    [draft, theme],
  );

  const Body = TABS.find(([k]) => k === tab)?.[2];
  const mode =
    previewMode ?? (draft?.mode === 'light' ? 'light' : draft?.mode === 'dark' ? 'dark' : uiMode);
  return (
    <div className="page-wide">
      <h1>🎨 Design &amp; Erscheinungsbild</h1>
      <p className="muted">
        Änderungen siehst du sofort in der Vorschau. Erst „Speichern“ übernimmt sie für alle
        Benutzer des Servers.
      </p>
      {theme?.builtin && (
        <div className="alert" role="status">
          <span>„{theme.name}“ ist eine Vorlage und kann nicht verändert werden.</span>
          <button
            type="button"
            className="btn primary"
            disabled={copy.isPending}
            onClick={() => copy.mutate()}
          >
            Eigene Kopie zum Bearbeiten anlegen
          </button>
        </div>
      )}
      <div className="dz-tabs" role="tablist" aria-label="Design-Bereiche">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="btn"
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'themes'}
          className="btn"
          onClick={() => setTab('themes')}
        >
          💾 Themes
        </button>
      </div>
      <div className="dz">
        <div className="dz-panel card">
          {tab === 'themes' ? (
            <ThemesTab
              guildId={guildId}
              themes={overview.themes}
              activeId={activeId}
              dirty={dirty}
              onChanged={() => setDraft(null)}
            />
          ) : themeQ.isLoading || !api_ ? (
            <p className="muted">Lade …</p>
          ) : themeQ.error ? (
            <p className="error">{errorText(themeQ.error)}</p>
          ) : (
            <EditorCtx.Provider value={api_}>
              <fieldset
                disabled={api_.disabled}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                {Body && <Body />}
              </fieldset>
            </EditorCtx.Provider>
          )}
          <hr />
          <label className="check">
            <input
              type="checkbox"
              checked={overview.autosave}
              disabled={autosave.isPending}
              onChange={(e) => autosave.mutate(e.target.checked)}
            />{' '}
            Automatisch speichern
          </label>
          <small className="muted">
            Auch dann bleibt jede Änderung als eigene Version im Verlauf.
          </small>
        </div>
        <div>
          <div className="dz-seg" role="group" aria-label="Vorschau-Gerät">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`btn ${device === d.id ? 'primary' : ''}`}
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
              >
                {d.icon} {d.label}
              </button>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() => setPreviewMode(mode === 'dark' ? 'light' : 'dark')}
              title="Vorschau-Modus"
            >
              {mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </div>
          {draft ? (
            <Preview
              config={draft}
              mode={mode}
              device={device}
              serverName={guild.data?.name ?? 'Server'}
            />
          ) : (
            <p className="muted">Lade …</p>
          )}
        </div>
      </div>
      {dirty && draft && (
        <div className="dz-bar" role="alert">
          <strong>⚠️ Ungespeicherte Änderungen</strong>
          <span className="grow" />
          <button
            type="button"
            className="btn"
            onClick={() => setDraft(normalizeConfig(theme!.config))}
          >
            Änderungen verwerfen
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={save.isPending || theme?.builtin}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Speichere …' : 'Änderungen speichern'}
          </button>
        </div>
      )}
    </div>
  );
}
