import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { API_URL, api } from '../../api';
import { Dialog } from '../../components/Dialog';
import { errorText } from '../../components/QueryState';
import { useToast } from '../../toast';
import { assetUrl } from '../assetUrl';
import { Field, UrlText } from './controls';
import { getIn, useEditor } from './state';

interface Asset {
  id: string;
  url: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
}
interface Library {
  assets: Asset[];
  usedBytes: number;
  maxBytes: number;
  maxFiles: number;
}
const MB = 1024 * 1024;
const fmt = (b: number) =>
  b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`;

/** Lädt eine Bilddatei hoch (Körper = Datei; Format-Prüfung und Neu-Kodierung macht der Server). */
export async function uploadImage(guildId: string, file: File): Promise<Asset> {
  if (file.size > 5 * MB) throw new Error('Die Datei ist zu groß (höchstens 5 MB).');
  const res = await fetch(`${API_URL}/api/v1/guilds/${guildId}/design/assets`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Requested-With': 'nexus',
      'X-Filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as Asset & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `Upload fehlgeschlagen (HTTP ${res.status})`);
  return data;
}

/**
 * Bildfeld: Adresse eingeben, Datei hochladen oder aus der Bibliothek des Servers wählen. Hochgeladene Bilder werden
 * serverseitig geprüft und optimiert (WebP, höchstens 2560 px, ohne Metadaten).
 */
export function ImageField({
  label,
  value,
  onCommit,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  hint?: string;
}) {
  const { guildId } = useEditor();
  const toast = useToast();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const lib = useQuery({
    queryKey: ['design-assets', guildId],
    queryFn: () => api<Library>(`/guilds/${guildId}/design/assets`),
    enabled: open,
  });
  const upload = useMutation({
    mutationFn: (f: File) => uploadImage(guildId, f),
    onSuccess: (a) => {
      onCommit(a.url);
      toast.success('Bild hochgeladen');
      void qc.invalidateQueries({ queryKey: ['design-assets', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/guilds/${guildId}/design/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['design-assets', guildId] }),
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <div className="img-field">
      <UrlText
        label={label}
        value={value}
        disabled={disabled}
        onCommit={onCommit}
        {...(hint ? { hint } : {})}
      />
      <div className="dz-seg">
        <button
          type="button"
          className="btn"
          disabled={disabled || upload.isPending}
          onClick={() => file.current?.click()}
        >
          {upload.isPending ? 'Lade hoch …' : '⬆ Bild hochladen'}
        </button>
        <button type="button" className="btn" disabled={disabled} onClick={() => setOpen(true)}>
          🖼️ Aus Bibliothek wählen
        </button>
        {value && (
          <img className="img-thumb" src={assetUrl(value)} alt="Vorschau des gewählten Bildes" />
        )}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          aria-label={`${label} – Datei wählen`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            if (file.current) file.current.value = '';
          }}
        />
      </div>
      <Dialog open={open} title="Bilder-Bibliothek" onClose={() => setOpen(false)}>
        <p className="muted">
          Bilder dieses Servers. PNG, JPEG, GIF, WebP bis 5 MB; sie werden beim Hochladen optimiert.
        </p>
        {lib.isLoading && <p className="muted">Lade …</p>}
        {lib.error && <p className="error">{errorText(lib.error)}</p>}
        {lib.data && (
          <>
            <p className="muted">
              {lib.data.assets.length} / {lib.data.maxFiles} Bilder · {fmt(lib.data.usedBytes)} von{' '}
              {fmt(lib.data.maxBytes)}
            </p>
            <ul className="img-grid">
              {lib.data.assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="img-pick"
                    aria-label={`${a.originalName} verwenden`}
                    onClick={() => {
                      onCommit(a.url);
                      setOpen(false);
                    }}
                  >
                    <img src={assetUrl(a.url)} alt="" loading="lazy" />
                  </button>
                  <small className="muted">
                    {a.originalName}
                    <br />
                    {a.width}×{a.height} · {fmt(a.bytes)}
                  </small>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`${a.originalName} löschen`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(a.id)}
                  >
                    Löschen
                  </button>
                </li>
              ))}
              {lib.data.assets.length === 0 && (
                <li className="muted">Noch keine Bilder hochgeladen.</li>
              )}
            </ul>
            <p className="muted">
              Wird ein Bild gelöscht, das noch verwendet wird, erscheint dort kein Bild mehr.
            </p>
          </>
        )}
        <div className="dz-seg">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Schließen
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/** Bildfeld für einen Konfigurationspfad (mit „↩ Zurücksetzen“). */
export function ImagePath({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { draft, set, disabled } = useEditor();
  return (
    <Field path={path} label="">
      <ImageField
        label={label}
        value={String(getIn(draft, path) ?? '')}
        disabled={disabled}
        onCommit={(v) => set(path, v)}
        {...(hint ? { hint } : {})}
      />
    </Field>
  );
}
