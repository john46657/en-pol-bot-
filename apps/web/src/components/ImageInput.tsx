import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, apiHeaders } from '../lib/api';
import { errText } from '../lib/tickets';
import { Button, Input } from './ui';

const MEDIA = /^media:([0-9a-f-]{36})$/;
const blobs = new Map<string, Promise<string | null>>();

/** Hochgeladenes Bild (`media:<id>`) als Blob-URL für die Vorschau; URLs bleiben unverändert. Zwischengespeichert je Datei. */
export function previewUrl(ref: string): Promise<string | null> {
  const id = MEDIA.exec(ref)?.[1];
  if (!id) return Promise.resolve(/^https:\/\//.test(ref) ? ref : null);
  if (!blobs.has(id)) blobs.set(id, fetch(`/api/v1/media/${id}`, { credentials: 'include', headers: apiHeaders() }).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null), () => null));
  return blobs.get(id)!;
}

/** Mehrere Bild-Referenzen → anzeigbare URLs (für die Discord-Vorschau). */
export function useImageUrls(refs: string[]): Record<string, string> {
  const [out, setOut] = useState<Record<string, string>>({});
  const key = refs.filter(Boolean).join('|');
  useEffect(() => {
    let gone = false;
    void Promise.all(key.split('|').filter(Boolean).map(async (r) => [r, await previewUrl(r)] as const)).then((pairs) => {
      if (!gone) setOut(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p[1])));
    });
    return () => { gone = true; };
  }, [key]);
  return out;
}

/**
 * Bildfeld wie bei Discohook: URL eintragen, „Datei hinzufügen“ (hochladen) oder „Datei einfügen“ (aus der Zwischenablage).
 * Hochgeladene Bilder werden als `media:<id>` gespeichert; der Bot hängt sie beim Senden an die Nachricht.
 */
export function ImageInput({ label, value, onChange, disabled, linkedType = 'EmbedAsset', linkedId = 'shared' }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; linkedType?: string; linkedId?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string>();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { let gone = false; void previewUrl(value).then((u) => { if (!gone) setPreview(u); }); return () => { gone = true; }; }, [value]);
  const upload = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append('file', f); fd.append('linkedType', linkedType); fd.append('linkedId', linkedId); return api<{ id: string }>('/media', { method: 'POST', formData: fd }); },
    onSuccess: (r) => { setErr(undefined); onChange(`media:${r.id}`); },
    onError: (e) => setErr(errText(e)),
  });
  const paste = async () => {
    setErr(undefined);
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => /^image\/(png|jpeg|gif|webp)$/.test(t));
        if (type) { const b = await it.getType(type); upload.mutate(new File([b], `einfuegen.${type.split('/')[1]}`, { type })); return; }
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (/^https:\/\/\S+$/.test(text)) { onChange(text); return; }
      setErr('In der Zwischenablage ist kein Bild und kein https://-Link.');
    } catch { setErr('Kein Zugriff auf die Zwischenablage – Bild mit „Datei hinzufügen“ hochladen oder mit Strg+V ins Feld einfügen.'); }
  };
  const uploaded = MEDIA.test(value);
  return (
    <div className="grid gap-1 text-sm">
      <span>{label}</span>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <Input aria-label={label} disabled={disabled || uploaded} placeholder="https://…" maxLength={500} value={uploaded ? 'Hochgeladene Datei' : value}
          onChange={(e) => onChange(e.target.value.trim())}
          onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); upload.mutate(f); } }} />
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" aria-label={`${label}: Datei hinzufügen`} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
        <Button size="sm" disabled={disabled || upload.isPending} onClick={() => file.current?.click()}>{upload.isPending ? 'Lädt hoch …' : 'Datei hinzufügen'}</Button>
        {value ? <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange('')}>Entfernen</Button> : <Button size="sm" variant="secondary" disabled={disabled || upload.isPending} onClick={() => void paste()}>Datei einfügen</Button>}
      </div>
      {value && !uploaded && !/^https:\/\/\S+$/.test(value) && <p className="text-xs text-danger">Die URL muss mit https:// beginnen.</p>}
      {preview && <img src={preview} alt={`${label}: Vorschau`} className="max-h-24 w-fit rounded border border-line object-contain" />}
      {err && <p role="alert" className="text-xs text-danger">{err}</p>}
    </div>
  );
}
