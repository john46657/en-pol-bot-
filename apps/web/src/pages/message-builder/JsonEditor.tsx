import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, ClipboardCopy, Download, FileUp, LocateFixed } from 'lucide-react';
import { mbParseJsonText, mbToDiscordJsonText, type JsonError, type MbDocumentData, type MbJsonIssue } from '@enrp/shared';
import { Button } from '../../components/ui';

/** Zustand des JSON-Editors für die Außenwelt (z. B. Senden sperren, solange das JSON ungültig ist). */
export interface JsonState { valid: boolean; error: (MbJsonIssue & Partial<JsonError>) | null }

/** Datei herunterladen (Export). */
export function downloadJson(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Datei wählen und als Text lesen (Import). */
export function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = () => { const f = input.files?.[0]; if (!f) return resolve(null); if (f.size > 1_000_000) { resolve(null); return; } void f.text().then(resolve, () => resolve(null)); };
    input.click();
  });
}

/**
 * JSON-Editor (für Fortgeschrittene): zeigt die Nachrichten im Discord-Format, prüft beim Tippen (Fehler mit Zeile/Spalte bzw.
 * Pfad), formatiert, importiert/exportiert Dateien und übernimmt gültige Änderungen sofort in den grafischen Editor und die
 * Vorschau. Ungültiges JSON wird nie übernommen – der letzte gültige Stand bleibt bestehen.
 */
export function JsonEditor({ data, onChange, readOnly, onState, fileName = 'nachricht.json' }: {
  data: MbDocumentData; onChange: (d: MbDocumentData) => void; readOnly: boolean; onState?: (s: JsonState) => void; fileName?: string;
}) {
  // „Zeitpunkt des Sendens“ wird mit diesem festen Zeitpunkt exportiert und beim Zurücklesen wieder erkannt
  const sendNow = useRef(new Date());
  const [text, setText] = useState(() => mbToDiscordJsonText(data, sendNow.current));
  const [error, setError] = useState<JsonState['error']>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lastOwn = useRef<MbDocumentData | null>(null);

  // Änderung von außen (anderer Editor, Konfliktauflösung, Laden) → Text neu erzeugen; eigene Übernahmen nicht
  useEffect(() => {
    if (lastOwn.current === data) return;
    setText(mbToDiscordJsonText(data, sendNow.current));
    setError(null); setNotes([]);
  }, [data]);
  useEffect(() => { onState?.({ valid: !error, error }); }, [error]);

  const apply = (t: string) => {
    const r = mbParseJsonText(t, { previous: data, sendNow: sendNow.current });
    if (!r.ok) { setError(r.error); return; }
    setError(null); setNotes(r.notes);
    lastOwn.current = r.data;
    onChange(r.data);
  };
  const edit = (t: string) => { setText(t); apply(t); };
  const format = () => {
    const r = mbParseJsonText(text, { previous: data, sendNow: sendNow.current });
    if (r.ok) edit(mbToDiscordJsonText(r.data, sendNow.current));
    else setError(r.error);
  };
  const jump = () => {
    const t = ref.current;
    if (!t || error?.offset === undefined) return;
    t.focus(); t.setSelectionRange(error.offset, Math.min(text.length, error.offset + 1));
    const line = (error.line ?? 1) - 1;
    t.scrollTop = Math.max(0, line * 18 - t.clientHeight / 2);
  };
  const lines = useMemo(() => text.split('\n').length, [text]);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {!readOnly && <Button size="sm" variant="secondary" onClick={format} title="Einrücken und ordnen"><AlignLeft size={14} />Formatieren</Button>}
        {!readOnly && <Button size="sm" variant="secondary" onClick={() => void pickJsonFile().then((t) => { if (t !== null) edit(t); })}><FileUp size={14} />Importieren</Button>}
        <Button size="sm" variant="secondary" disabled={!!error} onClick={() => downloadJson(fileName, text)}><Download size={14} />Exportieren</Button>
        <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}><ClipboardCopy size={14} />{copied ? 'Kopiert' : 'Kopieren'}</Button>
        <span className={`ml-auto text-xs ${error ? 'text-danger' : 'text-success'}`} role="status" aria-live="polite">{error ? 'Ungültig – nicht übernommen' : 'Gültig – synchronisiert'}</span>
      </div>
      <div className="flex max-h-[34rem] min-h-[18rem] overflow-hidden rounded-md border border-line bg-bg font-mono text-xs leading-[18px]">
        <div ref={gutter} aria-hidden className="select-none overflow-hidden border-r border-line bg-panel-2/40 px-2 py-2 text-right text-muted">
          {Array.from({ length: lines }, (_, i) => <div key={i} className={error?.line === i + 1 ? 'font-bold text-danger' : ''}>{i + 1}</div>)}
        </div>
        <textarea ref={ref} aria-label="Nachrichten-JSON" spellCheck={false} readOnly={readOnly} value={text} wrap="off"
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Tab' || readOnly) return;
            e.preventDefault();
            const t = e.currentTarget, a = t.selectionStart;
            const v = `${text.slice(0, a)}  ${text.slice(t.selectionEnd)}`;
            edit(v);
            requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
          }}
          className="min-w-0 flex-1 resize-none bg-transparent px-2 py-2 leading-[18px] outline-none" />
      </div>
      {error && (
        <div role="alert" className="flex flex-wrap items-start gap-2 rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          <span className="min-w-0 flex-1">
            {error.line !== undefined ? <b>Zeile {error.line}, Spalte {error.column}: </b> : error.path ? <b className="font-mono">{error.path}: </b> : null}
            {error.message}
          </span>
          {error.offset !== undefined && <Button size="sm" variant="ghost" onClick={jump}><LocateFixed size={14} />Zur Fehlerstelle</Button>}
        </div>
      )}
      {!error && notes.length > 0 && <ul className="grid gap-0.5 text-xs text-warning">{notes.map((n, i) => <li key={i}>⚠ {n}</li>)}</ul>}
      <p className="text-[11px] text-muted">
        Format: Discord-Nachrichten wie in der API (<code>content</code>, <code>embeds</code>, <code>components</code>, <code>allowed_mentions</code>) in <code>{'{ "messages": [ … ] }'}</code>; eine einzelne Nachricht oder eine Liste wird auch angenommen.
        Interaktive Buttons/Menüs behalten ihre Aktion, solange die <code>custom_id</code> gleich bleibt – neue brauchen im grafischen Editor eine Aktion.
      </p>
    </div>
  );
}
