import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../../api';
import { Dialog } from '../../components/Dialog';
import { errorText } from '../../components/QueryState';
import { useToast } from '../../toast';

export interface ThemeRow {
  id: string;
  name: string;
  description: string;
  version: number;
  builtin: boolean;
  updatedAt: string;
}
interface ImportPreview {
  name: string;
  description: string;
  author: string | null;
  version: number;
  sanitized: string[];
}

/** Themes: erstellen, duplizieren, aktivieren, löschen, exportieren, importieren, Versionen wiederherstellen, alles zurücksetzen. */
export function ThemesTab({
  guildId,
  themes,
  activeId,
  dirty,
  onChanged,
}: {
  guildId: string;
  themes: ThemeRow[];
  activeId: string | null;
  dirty: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const base = `/guilds/${guildId}/design`;
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'new' }
    | { kind: 'activate' | 'delete'; theme: ThemeRow }
    | { kind: 'reset' }
    | { kind: 'import'; data: unknown; preview: ImportPreview }
  >(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const file = useRef<HTMLInputElement>(null);
  const done = (msg: string) => {
    toast.success(msg);
    setDialog(null);
    void qc.invalidateQueries({ queryKey: ['design', guildId] });
    void qc.invalidateQueries({ queryKey: ['design-effective', guildId] });
    void qc.invalidateQueries({ queryKey: ['design-history', guildId] });
    void qc.invalidateQueries({ queryKey: ['design-theme', guildId] });
    onChanged();
  };
  const fail = (e: unknown) => toast.error(errorText(e));
  const create = useMutation({
    mutationFn: () =>
      api(`${base}/themes`, {
        method: 'POST',
        body: { name: form.name, description: form.description },
      }),
    onSuccess: () => done('Theme erstellt'),
    onError: fail,
  });
  const dup = useMutation({
    mutationFn: (id: string) => api(`${base}/themes/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => done('Theme dupliziert'),
    onError: fail,
  });
  const activate = useMutation({
    mutationFn: (id: string) => api(`${base}/themes/${id}/activate`, { method: 'POST' }),
    onSuccess: () => done('Theme aktiviert'),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/themes/${id}`, { method: 'DELETE' }),
    onSuccess: () => done('Theme gelöscht'),
    onError: fail,
  });
  const reset = useMutation({
    mutationFn: () => api(`${base}/reset`, { method: 'POST', body: { confirm: true } }),
    onSuccess: () => done('Gesamtes Design zurückgesetzt'),
    onError: fail,
  });
  const doImport = useMutation({
    mutationFn: (data: unknown) => api(`${base}/import`, { method: 'POST', body: { data } }),
    onSuccess: () => done('Theme importiert'),
    onError: fail,
  });

  const exportTheme = async (t: ThemeRow) => {
    try {
      const data = await api<unknown>(`${base}/themes/${t.id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.name.replace(/[^\w-]+/g, '_')}.nexus-theme.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fail(e);
    }
  };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (f.size > 200_000) throw new Error('Die Datei ist zu groß (max. 200 kB).');
      const data = JSON.parse(await f.text()) as unknown;
      const preview = await api<ImportPreview>(`${base}/import/preview`, {
        method: 'POST',
        body: { data },
      });
      setDialog({ kind: 'import', data, preview });
    } catch (e) {
      toast.error(e instanceof SyntaxError ? 'Das ist keine gültige Theme-Datei.' : errorText(e));
    }
    if (file.current) file.current.value = '';
  };
  const active = themes.find((t) => t.id === activeId);
  return (
    <>
      <p className="muted">
        Aktives Theme: <b>{active?.name ?? '–'}</b>. Es ist immer nur eines aktiv; das vorherige
        bleibt erhalten.
      </p>
      <div className="dz-seg">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setForm({ name: '', description: '' });
            setDialog({ kind: 'new' });
          }}
        >
          + Neues Theme
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Theme importieren
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </div>
      <ul className="list">
        {themes.map((t) => (
          <li key={t.id} className={`card ${t.id === activeId ? 'active' : ''}`}>
            <div className="row-head">
              <strong>
                {t.name}
                {t.id === activeId && ' ✓ aktiv'}
                {t.builtin && ' · Vorlage'}
              </strong>
              <small className="muted">v{t.version}</small>
            </div>
            {t.description && <p className="muted">{t.description}</p>}
            <div className="dz-seg">
              {t.id !== activeId && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setDialog({ kind: 'activate', theme: t })}
                >
                  Aktivieren
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => dup.mutate(t.id)}
                disabled={dup.isPending}
              >
                Duplizieren
              </button>
              <button type="button" className="btn" onClick={() => void exportTheme(t)}>
                Exportieren
              </button>
              {!t.builtin && t.id !== activeId && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDialog({ kind: 'delete', theme: t })}
                >
                  Löschen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {active && (
        <Versions
          guildId={guildId}
          theme={active}
          onRestored={() => done('Version wiederhergestellt')}
        />
      )}
      <History guildId={guildId} />
      <h3>Alles zurücksetzen</h3>
      <p className="muted">
        Entfernt alle serverweiten Überschreibungen und aktiviert wieder das Theme „Standard“. Deine
        eigenen Themes bleiben bestehen.
      </p>
      <button type="button" className="btn" onClick={() => setDialog({ kind: 'reset' })}>
        Gesamtes Design zurücksetzen …
      </button>

      <Dialog open={dialog?.kind === 'new'} title="Neues Theme" onClose={() => setDialog(null)}>
        <label className="fld">
          <span>Theme-Name</span>
          <input
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="My Server Theme"
          />
        </label>
        <label className="fld">
          <span>Beschreibung</span>
          <input
            value={form.description}
            maxLength={200}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <div className="dz-seg">
          <button type="button" className="btn" onClick={() => setDialog(null)}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={form.name.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            Erstellen
          </button>
        </div>
      </Dialog>
      <Dialog
        open={dialog?.kind === 'activate'}
        title="Theme aktivieren?"
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === 'activate' && (
          <>
            <p>
              „{dialog.theme.name}“ wird für alle Benutzer dieses Servers aktiv. Das bisherige Theme
              bleibt gespeichert.
            </p>
            {dirty && (
              <p className="dz-warn">
                ⚠️ Ungespeicherte Änderungen am aktuellen Theme gehen dabei verloren.
              </p>
            )}
            <div className="dz-seg">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={activate.isPending}
                onClick={() => activate.mutate(dialog.theme.id)}
              >
                Aktivieren
              </button>
            </div>
          </>
        )}
      </Dialog>
      <Dialog
        open={dialog?.kind === 'delete'}
        title="Theme löschen?"
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === 'delete' && (
          <>
            <p>
              „{dialog.theme.name}“ wird mit allen Versionen gelöscht. Das lässt sich nicht
              rückgängig machen.
            </p>
            <div className="dz-seg">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(dialog.theme.id)}
              >
                Löschen
              </button>
            </div>
          </>
        )}
      </Dialog>
      <Dialog
        open={dialog?.kind === 'reset'}
        title="Gesamtes Design zurücksetzen?"
        onClose={() => setDialog(null)}
      >
        <p>
          Alle serverweiten Überschreibungen werden entfernt, und „Standard“ wird aktiviert. Eigene
          Themes bleiben erhalten.
        </p>
        <div className="dz-seg">
          <button type="button" className="btn" onClick={() => setDialog(null)}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={reset.isPending}
            onClick={() => reset.mutate()}
          >
            Zurücksetzen
          </button>
        </div>
      </Dialog>
      <Dialog
        open={dialog?.kind === 'import'}
        title="Theme importieren"
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === 'import' && (
          <>
            <dl>
              <dt>Name</dt>
              <dd>{dialog.preview.name}</dd>
              <dt>Autor</dt>
              <dd>{dialog.preview.author ?? 'unbekannt'}</dd>
              <dt>Version</dt>
              <dd>{dialog.preview.version}</dd>
              {dialog.preview.description && (
                <>
                  <dt>Beschreibung</dt>
                  <dd>{dialog.preview.description}</dd>
                </>
              )}
            </dl>
            {dialog.preview.sanitized.length > 0 && (
              <p className="dz-warn">
                ⚠️ {dialog.preview.sanitized.length} ungültige Werte werden beim Import durch
                Standardwerte ersetzt: {dialog.preview.sanitized.slice(0, 5).join(', ')}
              </p>
            )}
            <div className="dz-seg">
              <button type="button" className="btn" onClick={() => setDialog(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={doImport.isPending}
                onClick={() => doImport.mutate(dialog.data)}
              >
                Importieren
              </button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

function History({ guildId }: { guildId: string }) {
  const q = useQuery({
    queryKey: ['design-history', guildId],
    queryFn: () =>
      api<{ id: string; at: string; actorId: string | null; icon: string; text: string }[]>(
        `/guilds/${guildId}/design/history`,
      ),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <h3>Änderungsprotokoll</h3>
      <p className="muted">Wer hat wann was am Design geändert (die letzten 50 Einträge).</p>
      <ul className="plain" aria-label="Änderungsprotokoll">
        {q.data.map((e) => (
          <li key={e.id} className="row">
            <span aria-hidden>{e.icon}</span>
            <span className="grow">
              {e.text}
              <br />
              <small className="muted">
                {new Date(e.at).toLocaleString('de-DE')}
                {e.actorId ? ` · Benutzer ${e.actorId}` : ' · automatisch'}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Versions({
  guildId,
  theme,
  onRestored,
}: {
  guildId: string;
  theme: ThemeRow;
  onRestored: () => void;
}) {
  const toast = useToast();
  const q = useQuery({
    queryKey: ['design-versions', guildId, theme.id, theme.version],
    queryFn: () =>
      api<
        { version: number; changeSummary: string; createdBy: string | null; createdAt: string }[]
      >(`/guilds/${guildId}/design/themes/${theme.id}/versions`),
  });
  const restore = useMutation({
    mutationFn: (v: number) =>
      api(`/guilds/${guildId}/design/themes/${theme.id}/restore/${v}`, { method: 'POST' }),
    onSuccess: onRestored,
    onError: (e) => toast.error(errorText(e)),
  });
  if (!q.data?.length) return null;
  return (
    <>
      <h3>Versionsverlauf von „{theme.name}“</h3>
      <ul className="plain">
        {q.data.map((v, i) => (
          <li key={v.version} className="row">
            <span className="grow">
              <b>v{v.version}</b> · {v.changeSummary}
              <br />
              <small className="muted">
                {new Date(v.createdAt).toLocaleString('de-DE')}
                {v.createdBy ? ` · ${v.createdBy}` : ''}
              </small>
            </span>
            {i > 0 && !theme.builtin && (
              <button
                type="button"
                className="btn"
                disabled={restore.isPending}
                onClick={() => restore.mutate(v.version)}
              >
                Wiederherstellen
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
