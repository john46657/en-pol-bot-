import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import { cloneWithNewIds, DISCORD_LIMITS, embedChars, emptyMbEmbed, mbButtonSchema, mbFieldSchema, mbId, mbRowSchema, mbSelectOptionSchema, type MbAction, type MbButton, type MbEmbed, type MbIssue, type MbMessage, type MbRow } from '@enrp/shared';
import { Badge, Button, Input, Select, Textarea } from '../../components/ui';
import { Toggle } from '../../components/ApplicationSettings';

/** Schalter mit sichtbarer Beschriftung. */
const Switch = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => <span className="inline-flex items-center gap-2 text-xs"><Toggle label={label} checked={checked} onChange={onChange} /><span aria-hidden>{label}</span></span>;

export interface ServerRole { id: string; name: string; color: number }
export interface ServerChannel { id: string; name: string; category: string | null; allowed: boolean; bot: { view: boolean; send: boolean; embed: boolean; mentionEveryone?: boolean } | null }
export interface EditorCtx { roles: ServerRole[]; channels: ServerChannel[]; canRoles: boolean; readOnly: boolean }

const len = (s: string) => [...s].length;
const move = <T,>(list: T[], i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= list.length) return list; const c = [...list]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; };
const dup = <T,>(list: T[], i: number) => [...list.slice(0, i + 1), cloneWithNewIds(list[i]!), ...list.slice(i + 1)];

/** Zeichenzähler (rot, wenn über dem Discord-Limit). */
export const Count = ({ v, max }: { v: string; max: number }) => <span className={`text-[11px] tabular-nums ${len(v) > max ? 'font-semibold text-danger' : 'text-muted'}`}>{len(v)}/{max}</span>;

/** Kleine Werkzeugleiste (auf/ab/duplizieren/entfernen) für Listen. */
function ListTools({ i, n, onMove, onDup, onDel, label, canDup = true }: { i: number; n: number; onMove: (d: -1 | 1) => void; onDup?: () => void; onDel: () => void; label: string; canDup?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Button size="sm" variant="ghost" aria-label={`${label} nach oben`} title="Nach oben" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></Button>
      <Button size="sm" variant="ghost" aria-label={`${label} nach unten`} title="Nach unten" disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></Button>
      {onDup && <Button size="sm" variant="ghost" aria-label={`${label} duplizieren`} title="Duplizieren" disabled={!canDup} onClick={onDup}><Copy size={14} /></Button>}
      <Button size="sm" variant="ghost" aria-label={`${label} entfernen`} title="Entfernen" onClick={onDel} className="hover:text-danger"><Trash2 size={14} /></Button>
    </span>
  );
}

const EMOJIS = ['🚓', '👮', '🚨', '📢', '📻', '✅', '❌', '⚠️', 'ℹ️', '📅', '🕒', '📍', '🔵', '🔴', '🟢', '⭐', '👋', '🛑', '📝', '🔒'];
const COLORS = ['#1e3a8a', '#3b82f6', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b', '#ffffff'];

/** Textfeld mit Markdown-Leiste (fett, kursiv, unterstrichen, durchgestrichen, Code, Codeblock, Spoiler, Link, Zitat, Emojis, Erwähnungen). */
export function MdTextarea({ value, onChange, max, label, rows = 4, ctx, mentions = true }: { value: string; onChange: (v: string) => void; max: number; label: string; rows?: number; ctx: EditorCtx; mentions?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [emoji, setEmoji] = useState(false);
  const apply = (fn: (sel: string) => [string, number?]) => {
    const t = ref.current;
    if (!t) return;
    const [a, b] = [t.selectionStart, t.selectionEnd];
    const [ins, caret] = fn(value.slice(a, b));
    onChange(value.slice(0, a) + ins + value.slice(b));
    requestAnimationFrame(() => { t.focus(); const p = a + (caret ?? ins.length); t.setSelectionRange(p, p); });
  };
  const wrap = (l: string, r = l, ph = 'Text') => apply((s) => [`${l}${s || ph}${r}`, s ? undefined : l.length + ph.length]);
  const line = (prefix: string) => apply((s) => [(s || 'Text').split('\n').map((x) => `${prefix}${x}`).join('\n')]);
  const tb = (title: string, content: ReactNode, onClick: () => void) => <button type="button" title={title} aria-label={title} onClick={onClick} disabled={ctx.readOnly} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-panel-2 hover:text-fg disabled:opacity-40">{content}</button>;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-line bg-panel-2/60 px-1 py-0.5">
        {tb('Fett', <b>B</b>, () => wrap('**'))}
        {tb('Kursiv', <i>I</i>, () => wrap('*'))}
        {tb('Unterstrichen', <u>U</u>, () => wrap('__'))}
        {tb('Durchgestrichen', <s>S</s>, () => wrap('~~'))}
        {tb('Inline-Code', <code>{'`'}</code>, () => wrap('`'))}
        {tb('Codeblock', <code>{'```'}</code>, () => wrap('```\n', '\n```', 'Code'))}
        {tb('Spoiler', '||', () => wrap('||'))}
        {tb('Link', '🔗', () => apply((s) => [`[${s || 'Linktext'}](https://)`, (s || 'Linktext').length + 3 + 8]))}
        {tb('Zitat', '❝', () => line('> '))}
        {tb('Überschrift', 'H', () => line('## '))}
        {tb('Liste', '•', () => line('- '))}
        {tb('Kleintext', '-#', () => line('-# '))}
        {tb('Zeitstempel (Discord zeigt ihn in der Zeitzone der Lesenden)', '🕒', () => apply(() => [`<t:${Math.floor(Date.now() / 1000)}:F>`]))}
        {tb('Emoji', '😀', () => setEmoji((v) => !v))}
        {mentions && ctx.roles.length > 0 && (
          <select aria-label="Rolle erwähnen" disabled={ctx.readOnly} className="max-w-[9rem] rounded border border-line bg-bg px-1 py-0.5 text-xs" value="" onChange={(e) => { const id = e.target.value; if (id) apply(() => [`<@&${id}>`]); }}>
            <option value="">@Rolle …</option>{ctx.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
          </select>
        )}
        {mentions && ctx.channels.length > 0 && (
          <select aria-label="Kanal erwähnen" disabled={ctx.readOnly} className="max-w-[9rem] rounded border border-line bg-bg px-1 py-0.5 text-xs" value="" onChange={(e) => { const id = e.target.value; if (id) apply(() => [`<#${id}>`]); }}>
            <option value="">#Kanal …</option>{ctx.channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        )}
        <span className="ml-auto pr-1"><Count v={value} max={max} /></span>
      </div>
      {emoji && <div className="flex flex-wrap gap-1 border border-b-0 border-line bg-panel-2/40 p-1">{EMOJIS.map((e) => <button key={e} type="button" aria-label={`Emoji ${e} einfügen`} className="rounded px-1 text-lg hover:bg-panel-2" onClick={() => apply(() => [e])}>{e}</button>)}</div>}
      <Textarea ref={ref} aria-label={label} rows={rows} readOnly={ctx.readOnly} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-t-none font-[inherit]" />
    </div>
  );
}

function TextIn({ label, value, onChange, max, placeholder, type = 'text', ctx, error }: { label: string; value: string; onChange: (v: string) => void; max?: number; placeholder?: string; type?: string; ctx: EditorCtx; error?: string }) {
  return (
    <label className="grid gap-1 text-xs text-muted">
      <span className="flex items-center justify-between gap-2"><span>{label}</span>{max !== undefined && <Count v={value} max={max} />}</span>
      <Input aria-label={label} type={type} readOnly={ctx.readOnly} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`py-1.5 ${error ? 'border-danger' : ''}`} aria-invalid={!!error} />
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </label>
  );
}

/** Fehlermeldung zu einem Pfad (z. B. ['embeds', 0, 'imageUrl']) aus der Prüfung. */
const issueAt = (issues: MbIssue[], path: (string | number)[]) => issues.find((i) => i.level === 'error' && i.path.length === path.length + 2 && path.every((p, k) => i.path[k + 2] === p))?.message;

function Section({ title, children, defaultOpen = true, actions, badge }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-line bg-panel-2/30">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}<span className="truncate">{title}</span>{badge}
        </button>
        {actions}
      </div>
      {open && <div className="grid gap-3 border-t border-line p-3">{children}</div>}
    </div>
  );
}

function EmbedEditor({ e, onChange, ctx, issues }: { e: MbEmbed; onChange: (e: MbEmbed) => void; ctx: EditorCtx; issues: (path: (string | number)[]) => string | undefined }) {
  const set = (p: Partial<MbEmbed>) => onChange({ ...e, ...p });
  const at = (k: string, ...rest: (string | number)[]) => issues([k, ...rest]);
  const hex = /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#000000';
  return (
    <div className="grid gap-3">
      <Section title="Autor" defaultOpen={!!e.authorName}>
        <TextIn label="Autorname" value={e.authorName} max={DISCORD_LIMITS.authorName} onChange={(v) => set({ authorName: v })} ctx={ctx} error={at('authorName')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextIn label="Autor-URL" type="url" placeholder="https://" value={e.authorUrl} onChange={(v) => set({ authorUrl: v })} ctx={ctx} error={at('authorUrl')} />
          <TextIn label="Autor-Icon (Bild-URL)" type="url" placeholder="https://…/icon.png" value={e.authorIconUrl} onChange={(v) => set({ authorIconUrl: v })} ctx={ctx} error={at('authorIconUrl')} />
        </div>
      </Section>
      <Section title="Inhalt">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <TextIn label="Titel" value={e.title} max={DISCORD_LIMITS.title} onChange={(v) => set({ title: v })} ctx={ctx} error={at('title')} />
          <div className="grid gap-1 text-xs text-muted">
            <span>Farbe</span>
            <span className="flex items-center gap-1.5">
              <input type="color" aria-label="Farbe wählen" disabled={ctx.readOnly} value={hex} onChange={(x) => set({ color: x.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
              <Input aria-label="Farbe (HEX)" readOnly={ctx.readOnly} value={e.color} placeholder="#1e3a8a" maxLength={7} onChange={(x) => set({ color: x.target.value.trim() })} className={`w-24 py-1.5 font-mono ${at('color') ? 'border-danger' : ''}`} />
              {e.color && !ctx.readOnly && <Button size="sm" variant="ghost" title="Ohne Farbe" aria-label="Farbe entfernen" onClick={() => set({ color: '' })}>✕</Button>}
            </span>
            <span className="flex flex-wrap gap-1">{COLORS.map((c) => <button key={c} type="button" disabled={ctx.readOnly} aria-label={`Farbe ${c}`} title={c} onClick={() => set({ color: c })} className="h-4 w-4 rounded-sm border border-line" style={{ background: c }} />)}</span>
          </div>
        </div>
        <TextIn label="Titel-URL (macht den Titel zum Link)" type="url" placeholder="https://" value={e.url} onChange={(v) => set({ url: v })} ctx={ctx} error={at('url')} />
        <div className="grid gap-1 text-xs text-muted"><span>Beschreibung</span><MdTextarea label="Beschreibung" value={e.description} max={DISCORD_LIMITS.description} rows={5} onChange={(v) => set({ description: v })} ctx={ctx} /></div>
      </Section>
      <Section title={`Felder (${e.fields.length}/${DISCORD_LIMITS.fields})`} defaultOpen={e.fields.length > 0}>
        {e.fields.map((f, i) => (
          <div key={f.id} className="grid gap-2 rounded border border-line p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Feld {i + 1}</span>
              {!ctx.readOnly && <ListTools label={`Feld ${i + 1}`} i={i} n={e.fields.length} onMove={(d) => set({ fields: move(e.fields, i, d) })} onDup={() => set({ fields: dup(e.fields, i) })} canDup={e.fields.length < DISCORD_LIMITS.fields} onDel={() => set({ fields: e.fields.filter((_, j) => j !== i) })} />}
            </div>
            <TextIn label="Name" value={f.name} max={DISCORD_LIMITS.fieldName} onChange={(v) => set({ fields: e.fields.map((x, j) => (j === i ? { ...x, name: v } : x)) })} ctx={ctx} error={at('fields', i, 'name')} />
            <div className="grid gap-1 text-xs text-muted"><span>Wert</span><MdTextarea label={`Feld ${i + 1} Wert`} value={f.value} max={DISCORD_LIMITS.fieldValue} rows={2} onChange={(v) => set({ fields: e.fields.map((x, j) => (j === i ? { ...x, value: v } : x)) })} ctx={ctx} /></div>
            {at('fields', i, 'value') && <span role="alert" className="text-[11px] text-danger">{at('fields', i, 'value')}</span>}
            <Switch label="Inline (neben anderen Feldern)" checked={f.inline} onChange={(v) => !ctx.readOnly && set({ fields: e.fields.map((x, j) => (j === i ? { ...x, inline: v } : x)) })} />
          </div>
        ))}
        {!ctx.readOnly && <Button size="sm" variant="secondary" disabled={e.fields.length >= DISCORD_LIMITS.fields} onClick={() => set({ fields: [...e.fields, mbFieldSchema.parse({ id: mbId() })] })}><Plus size={14} />Feld hinzufügen</Button>}
      </Section>
      <Section title="Bilder" defaultOpen={!!(e.imageUrl || e.thumbnailUrl)}>
        <TextIn label="Großes Bild (URL)" type="url" placeholder="https://…/bild.png" value={e.imageUrl} onChange={(v) => set({ imageUrl: v })} ctx={ctx} error={at('imageUrl')} />
        <TextIn label="Thumbnail (URL, oben rechts)" type="url" placeholder="https://…/logo.png" value={e.thumbnailUrl} onChange={(v) => set({ thumbnailUrl: v })} ctx={ctx} error={at('thumbnailUrl')} />
      </Section>
      <Section title="Fußzeile & Zeitstempel" defaultOpen={!!e.footerText || e.timestamp !== 'none'}>
        <TextIn label="Fußzeilentext" value={e.footerText} max={DISCORD_LIMITS.footerText} onChange={(v) => set({ footerText: v })} ctx={ctx} error={at('footerText')} />
        <TextIn label="Fußzeilen-Icon (Bild-URL)" type="url" placeholder="https://…/icon.png" value={e.footerIconUrl} onChange={(v) => set({ footerIconUrl: v })} ctx={ctx} error={at('footerIconUrl')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted">Zeitstempel
            <Select aria-label="Zeitstempel" disabled={ctx.readOnly} value={e.timestamp} onChange={(x) => set({ timestamp: x.target.value as MbEmbed['timestamp'] })} className="py-1.5">
              <option value="none">Keiner</option><option value="send">Zeitpunkt des Sendens</option><option value="custom">Eigenes Datum/Uhrzeit</option>
            </Select>
          </label>
          {e.timestamp === 'custom' && (
            <label className="grid gap-1 text-xs text-muted">Datum & Uhrzeit
              <Input aria-label="Datum und Uhrzeit" type="datetime-local" readOnly={ctx.readOnly} value={e.timestampAt ? toLocal(e.timestampAt) : ''} onChange={(x) => set({ timestampAt: x.target.value ? new Date(x.target.value).toISOString() : '' })} className={`py-1.5 ${at('timestampAt') ? 'border-danger' : ''}`} />
            </label>
          )}
        </div>
      </Section>
    </div>
  );
}
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function ActionEditor({ a, onChange, ctx, label, issue }: { a: MbAction; onChange: (a: MbAction) => void; ctx: EditorCtx; label: string; issue?: (k: string) => string | undefined }) {
  return (
    <div className="grid gap-2 rounded border border-dashed border-primary/40 bg-primary/5 p-2">
      <label className="grid gap-1 text-xs text-muted">Was passiert beim Klick? ({label})
        <Select aria-label={`Aktion ${label}`} disabled={ctx.readOnly} value={a.type} className="py-1.5" onChange={(e) => onChange(e.target.value === 'role' ? { type: 'role', roleId: '', mode: 'toggle' } : { type: 'reply', text: '' })}>
          <option value="reply">Antwort nur für die klickende Person</option>
          <option value="role" disabled={!ctx.canRoles}>Rolle geben/nehmen{ctx.canRoles ? '' : ' (Recht fehlt)'}</option>
        </Select>
      </label>
      {a.type === 'reply' ? (
        <label className="grid gap-1 text-xs text-muted"><span className="flex justify-between">Antworttext <Count v={a.text} max={2000} /></span>
          <Textarea aria-label={`Antworttext ${label}`} rows={2} readOnly={ctx.readOnly} value={a.text} onChange={(e) => onChange({ ...a, text: e.target.value })} className={issue?.('text') ? 'border-danger' : ''} />
          {issue?.('text') && <span role="alert" className="text-[11px] text-danger">{issue('text')}</span>}
        </label>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-muted">Rolle
            <Select aria-label={`Rolle ${label}`} disabled={ctx.readOnly} value={a.roleId} className={`py-1.5 ${issue?.('roleId') ? 'border-danger' : ''}`} onChange={(e) => onChange({ ...a, roleId: e.target.value })}>
              <option value="">— Rolle wählen —</option>{ctx.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted">Modus
            <Select aria-label={`Modus ${label}`} disabled={ctx.readOnly} value={a.mode} className="py-1.5" onChange={(e) => onChange({ ...a, mode: e.target.value as 'toggle' })}>
              <option value="toggle">Umschalten (geben/nehmen)</option><option value="add">Nur geben</option><option value="remove">Nur nehmen</option>
            </Select>
          </label>
          <p className="text-[11px] text-muted sm:col-span-2">Der Bot braucht „Rollen verwalten“, und seine Rolle muss über dieser Rolle stehen.</p>
        </div>
      )}
    </div>
  );
}

function ButtonEditor({ b, onChange, ctx, issue }: { b: MbButton; onChange: (b: MbButton) => void; ctx: EditorCtx; issue: (path: (string | number)[]) => string | undefined }) {
  const set = (p: Partial<MbButton>) => onChange({ ...b, ...p });
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-muted">Art
          <Select aria-label="Button-Art" disabled={ctx.readOnly} value={b.kind} className="py-1.5" onChange={(e) => set({ kind: e.target.value as MbButton['kind'] })}>
            <option value="link">Link-Button (öffnet URL)</option><option value="action">Aktions-Button (Bot)</option>
          </Select>
        </label>
        <TextIn label="Beschriftung" value={b.label} max={DISCORD_LIMITS.buttonLabel} onChange={(v) => set({ label: v })} ctx={ctx} error={issue(['label'])} />
        <TextIn label="Emoji (optional)" value={b.emoji} placeholder="🚓 oder <:name:id>" onChange={(v) => set({ emoji: v })} ctx={ctx} error={issue(['emoji'])} />
      </div>
      {b.kind === 'link' ? (
        <TextIn label="Link-URL" type="url" placeholder="https://" value={b.url} max={DISCORD_LIMITS.linkUrl} onChange={(v) => set({ url: v })} ctx={ctx} error={issue(['url'])} />
      ) : (
        <>
          <label className="grid gap-1 text-xs text-muted">Farbe
            <Select aria-label="Button-Farbe" disabled={ctx.readOnly} value={b.style} className="py-1.5" onChange={(e) => set({ style: e.target.value as MbButton['style'] })}>
              <option value="primary">Blau (Primär)</option><option value="secondary">Grau</option><option value="success">Grün</option><option value="danger">Rot</option>
            </Select>
          </label>
          <ActionEditor label={b.label || 'Button'} a={b.action} ctx={ctx} onChange={(action) => set({ action })} issue={(k) => issue(['action', k])} />
        </>
      )}
      <Switch label="Deaktiviert (ausgegraut)" checked={b.disabled} onChange={(v) => !ctx.readOnly && set({ disabled: v })} />
    </div>
  );
}

function RowsEditor({ rows, onChange, ctx, issues }: { rows: MbRow[]; onChange: (r: MbRow[]) => void; ctx: EditorCtx; issues: (path: (string | number)[]) => string | undefined }) {
  const setRow = (i: number, r: MbRow) => onChange(rows.map((x, j) => (j === i ? r : x)));
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">Link-Buttons öffnen nur eine Adresse. Aktions-Buttons und Auswahlmenüs funktionieren nur beim Versand über den Bot – jede Aktion braucht eine festgelegte Wirkung, sonst wird nicht gesendet.</p>
      {rows.map((r, i) => (
        <Section key={r.id} title={r.type === 'buttons' ? `Reihe ${i + 1}: Buttons (${r.buttons.length}/${DISCORD_LIMITS.buttonsPerRow})` : `Reihe ${i + 1}: Auswahlmenü (${r.options.length}/${DISCORD_LIMITS.selectOptions})`}
          actions={!ctx.readOnly && <ListTools label={`Reihe ${i + 1}`} i={i} n={rows.length} onMove={(d) => onChange(move(rows, i, d))} onDup={() => onChange(dup(rows, i))} canDup={rows.length < DISCORD_LIMITS.actionRows} onDel={() => onChange(rows.filter((_, j) => j !== i))} />}>
          {r.type === 'buttons' ? (
            <>
              {r.buttons.map((b, bi) => (
                <div key={b.id} className="grid gap-2 rounded border border-line p-2">
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-medium">Button {bi + 1} <Badge tone={b.kind === 'link' ? 'neutral' : 'primary'}>{b.kind === 'link' ? 'Link' : 'Bot-Aktion'}</Badge></span>
                    {!ctx.readOnly && <ListTools label={`Button ${bi + 1}`} i={bi} n={r.buttons.length} onMove={(d) => setRow(i, { ...r, buttons: move(r.buttons, bi, d) })} onDup={() => setRow(i, { ...r, buttons: dup(r.buttons, bi) })} canDup={r.buttons.length < DISCORD_LIMITS.buttonsPerRow} onDel={() => setRow(i, { ...r, buttons: r.buttons.filter((_, j) => j !== bi) })} />}
                  </div>
                  <ButtonEditor b={b} ctx={ctx} onChange={(nb) => setRow(i, { ...r, buttons: r.buttons.map((x, j) => (j === bi ? nb : x)) })} issue={(p) => issues(['rows', i, 'buttons', bi, ...p])} />
                </div>
              ))}
              {!ctx.readOnly && <Button size="sm" variant="secondary" disabled={r.buttons.length >= DISCORD_LIMITS.buttonsPerRow} onClick={() => setRow(i, { ...r, buttons: [...r.buttons, mbButtonSchema.parse({ id: mbId(), label: 'Button', url: 'https://' })] })}><Plus size={14} />Button hinzufügen</Button>}
            </>
          ) : (
            <>
              <TextIn label="Platzhalter" value={r.placeholder} max={DISCORD_LIMITS.selectPlaceholder} onChange={(v) => setRow(i, { ...r, placeholder: v })} ctx={ctx} error={issues(['rows', i, 'placeholder'])} />
              {r.options.map((o, oi) => (
                <div key={o.id} className="grid gap-2 rounded border border-line p-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">Option {oi + 1}</span>
                    {!ctx.readOnly && <ListTools label={`Option ${oi + 1}`} i={oi} n={r.options.length} onMove={(d) => setRow(i, { ...r, options: move(r.options, oi, d) })} onDup={() => setRow(i, { ...r, options: dup(r.options, oi) })} canDup={r.options.length < DISCORD_LIMITS.selectOptions} onDel={() => setRow(i, { ...r, options: r.options.filter((_, j) => j !== oi) })} />}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <TextIn label="Beschriftung" value={o.label} max={DISCORD_LIMITS.optionLabel} onChange={(v) => setRow(i, { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, label: v } : x)) })} ctx={ctx} error={issues(['rows', i, 'options', oi, 'label'])} />
                    <TextIn label="Beschreibung (optional)" value={o.description} max={DISCORD_LIMITS.optionDescription} onChange={(v) => setRow(i, { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, description: v } : x)) })} ctx={ctx} error={issues(['rows', i, 'options', oi, 'description'])} />
                    <TextIn label="Emoji (optional)" value={o.emoji} onChange={(v) => setRow(i, { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, emoji: v } : x)) })} ctx={ctx} error={issues(['rows', i, 'options', oi, 'emoji'])} />
                  </div>
                  <ActionEditor label={o.label || `Option ${oi + 1}`} a={o.action} ctx={ctx} onChange={(action) => setRow(i, { ...r, options: r.options.map((x, j) => (j === oi ? { ...x, action } : x)) })} issue={(k) => issues(['rows', i, 'options', oi, 'action', k])} />
                </div>
              ))}
              {!ctx.readOnly && <Button size="sm" variant="secondary" disabled={r.options.length >= DISCORD_LIMITS.selectOptions} onClick={() => setRow(i, { ...r, options: [...r.options, mbSelectOptionSchema.parse({ id: mbId(), label: `Option ${r.options.length + 1}` })] })}><Plus size={14} />Option hinzufügen</Button>}
              <Switch label="Deaktiviert (ausgegraut)" checked={r.disabled} onChange={(v) => !ctx.readOnly && setRow(i, { ...r, disabled: v })} />
            </>
          )}
        </Section>
      ))}
      {!ctx.readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={rows.length >= DISCORD_LIMITS.actionRows} onClick={() => onChange([...rows, mbRowSchema.parse({ id: mbId(), type: 'buttons', buttons: [{ id: mbId(), label: 'Website', url: 'https://' }] })])}><Plus size={14} />Button-Reihe</Button>
          <Button size="sm" variant="secondary" disabled={rows.length >= DISCORD_LIMITS.actionRows} onClick={() => onChange([...rows, mbRowSchema.parse({ id: mbId(), type: 'select', placeholder: 'Bitte auswählen', options: [{ id: mbId(), label: 'Option 1' }] })])}><Plus size={14} />Auswahlmenü</Button>
          <span className="self-center text-[11px] text-muted">{rows.length}/{DISCORD_LIMITS.actionRows} Reihen</span>
        </div>
      )}
    </div>
  );
}

/** Mittlerer Bereich: eine Nachricht bearbeiten (Text, Embeds, Komponenten, Erwähnungen). */
export function MessageEditor({ m, index, onChange, ctx, issues }: { m: MbMessage; index: number; onChange: (m: MbMessage) => void; ctx: EditorCtx; issues: MbIssue[] }) {
  const own = issues.filter((i) => i.path[1] === index);
  const at = (path: (string | number)[]) => issueAt(own, path);
  const total = m.embeds.reduce((n, e) => n + embedChars(e), 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="text-sm font-medium">Nachrichtentext</span>
        <MdTextarea label="Nachrichtentext" value={m.content} max={DISCORD_LIMITS.content} rows={5} onChange={(v) => onChange({ ...m, content: v })} ctx={ctx} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <Switch label="@Benutzer pingen" checked={m.mentions.users} onChange={(v) => !ctx.readOnly && onChange({ ...m, mentions: { ...m.mentions, users: v } })} />
          <Switch label="@Rollen pingen" checked={m.mentions.roles} onChange={(v) => !ctx.readOnly && onChange({ ...m, mentions: { ...m.mentions, roles: v } })} />
          <Switch label="@everyone/@here pingen" checked={m.mentions.everyone} onChange={(v) => !ctx.readOnly && onChange({ ...m, mentions: { ...m.mentions, everyone: v } })} />
        </div>
        <p className="text-[11px] text-muted">Erwähnungen ohne Haken erscheinen als Text, benachrichtigen aber niemanden.</p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Embeds ({m.embeds.length}/{DISCORD_LIMITS.embedsPerMessage})</span>
          <span className={`text-[11px] ${total > DISCORD_LIMITS.embedTotal ? 'font-semibold text-danger' : 'text-muted'}`}>Zeichen in allen Embeds: {total}/{DISCORD_LIMITS.embedTotal}</span>
        </div>
        {m.embeds.map((e, i) => (
          <Section key={e.id} title={`Embed ${i + 1}${e.title ? ` – ${e.title}` : ''}`} badge={<span aria-hidden className="ml-1 inline-block h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : 'transparent' }} />}
            actions={!ctx.readOnly && <ListTools label={`Embed ${i + 1}`} i={i} n={m.embeds.length} onMove={(d) => onChange({ ...m, embeds: move(m.embeds, i, d) })} onDup={() => onChange({ ...m, embeds: dup(m.embeds, i) })} canDup={m.embeds.length < DISCORD_LIMITS.embedsPerMessage} onDel={() => onChange({ ...m, embeds: m.embeds.filter((_, j) => j !== i) })} />}>
            <EmbedEditor e={e} ctx={ctx} onChange={(ne) => onChange({ ...m, embeds: m.embeds.map((x, j) => (j === i ? ne : x)) })} issues={(p) => at(['embeds', i, ...p])} />
            {at(['embeds', i]) && <p role="alert" className="text-xs text-danger">{at(['embeds', i])}</p>}
          </Section>
        ))}
        {!ctx.readOnly && <Button size="sm" variant="secondary" className="justify-self-start" disabled={m.embeds.length >= DISCORD_LIMITS.embedsPerMessage} onClick={() => onChange({ ...m, embeds: [...m.embeds, emptyMbEmbed()] })}><Plus size={14} />Embed hinzufügen</Button>}
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Buttons & Komponenten</span>
        <RowsEditor rows={m.rows} ctx={ctx} onChange={(rows) => onChange({ ...m, rows })} issues={at} />
      </div>

      {own.length > 0 && (
        <div className="grid gap-1 rounded-md border border-line p-2" aria-label="Prüfung dieser Nachricht">
          <p className="text-xs font-medium">Prüfung gegen die Discord-Limits</p>
          <ul className="grid gap-0.5 text-xs">{own.map((i, k) => <li key={k} className={i.level === 'error' ? 'text-danger' : 'text-warning'}>{i.level === 'error' ? '✖' : '⚠'} {i.where}: {i.message}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
