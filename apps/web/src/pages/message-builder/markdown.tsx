import { useState, type ReactNode } from 'react';

/**
 * Discord-Markdown für die Vorschau (Simulation, nur React-Elemente – nie HTML aus dem Text).
 * Unterstützt: **fett**, *kursiv* bzw. _kursiv_, __unterstrichen__, ~~durchgestrichen~~, ||Spoiler||, `Code`, ```Codeblöcke```,
 * > Zitate, >>> Zitatblöcke, # Überschriften, -# Kleintext, Listen, [Links](https://…), URLs, Erwähnungen, Server-Emojis, <t:…>-Zeitstempel.
 */
export interface MdCtx { roleName?: (id: string) => { name: string; color: number } | undefined; channelName?: (id: string) => string | undefined; /** Titel: keine Blöcke */ inlineOnly?: boolean }

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <span role="button" tabIndex={0} title="Spoiler" onClick={() => setOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setOpen(true)} className={open ? 'rounded bg-white/10 px-0.5' : 'cursor-pointer rounded bg-[#1e1f22] px-0.5 text-transparent [&_*]:invisible'}>{children}</span>;
}
const pad = (n: number) => String(n).padStart(2, '0');
function stamp(sec: number, style = 'f') {
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  switch (style) {
    case 't': return time;
    case 'T': return `${time}:${pad(d.getSeconds())}`;
    case 'd': return d.toLocaleDateString('de-DE');
    case 'D': return date;
    case 'F': return `${d.toLocaleDateString('de-DE', { weekday: 'long' })}, ${date} ${time}`;
    case 'R': {
      const diff = Math.round((d.getTime() - Date.now()) / 1000);
      const abs = Math.abs(diff);
      const [v, u] = abs < 60 ? [abs, 'Sekunden'] : abs < 3600 ? [Math.round(abs / 60), 'Minuten'] : abs < 86400 ? [Math.round(abs / 3600), 'Stunden'] : [Math.round(abs / 86400), 'Tagen'];
      return diff >= 0 ? `in ${v} ${u}` : `vor ${v} ${u}`;
    }
    default: return `${date} ${time}`;
  }
}
const mention = 'rounded bg-[#5865f2]/30 px-0.5 font-medium text-[#c9cdfb]';
const linkCls = 'text-[#00a8fc] hover:underline';

type Rule = [RegExp, (m: RegExpExecArray, c: MdCtx, k: string) => ReactNode];
const RULES: Rule[] = [
  [/^\\([*_~`|\\<>#[\]()@-])/, (m) => m[1]],
  [/^`([^`\n]+)`/, (m, _c, k) => <code key={k} className="rounded bg-[#1e1f22] px-1 py-px font-mono text-[0.85em]">{m[1]}</code>],
  [/^\*\*([\s\S]+?)\*\*(?!\*)/, (m, c, k) => <strong key={k} className="font-semibold">{inline(m[1]!, c, k)}</strong>],
  [/^__([\s\S]+?)__(?!_)/, (m, c, k) => <u key={k}>{inline(m[1]!, c, k)}</u>],
  [/^~~([\s\S]+?)~~/, (m, c, k) => <s key={k}>{inline(m[1]!, c, k)}</s>],
  [/^\|\|([\s\S]+?)\|\|/, (m, c, k) => <Spoiler key={k}>{inline(m[1]!, c, k)}</Spoiler>],
  [/^\*(?=\S)([\s\S]*?\S)\*(?!\*)/, (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em>],
  [/^_(?=\S)([\s\S]*?\S)_(?![_\w])/, (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em>],
  [/^\[([^\]\n]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/, (m, c, k) => <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener" className={linkCls}>{inline(m[1]!, c, k)}</a>],
  [/^<(https?:\/\/[^>\s]+)>/, (m, _c, k) => <a key={k} href={m[1]} target="_blank" rel="noreferrer noopener" className={linkCls}>{m[1]}</a>],
  [/^https?:\/\/[^\s<]+[^\s<.,:;"')\]]/, (m, _c, k) => <a key={k} href={m[0]} target="_blank" rel="noreferrer noopener" className={linkCls}>{m[0]}</a>],
  [/^<@!?(\d{15,25})>/, (m, _c, k) => <span key={k} className={mention}>@Benutzer {m[1]!.slice(-4)}</span>],
  [/^<@&(\d{15,25})>/, (m, c, k) => { const r = c.roleName?.(m[1]!); const col = r?.color ? `#${r.color.toString(16).padStart(6, '0')}` : undefined; return <span key={k} className={mention} style={col ? { color: col, background: `${col}26` } : undefined}>@{r?.name ?? 'unbekannte Rolle'}</span>; }],
  [/^<#(\d{15,25})>/, (m, c, k) => <span key={k} className={mention}>#{c.channelName?.(m[1]!) ?? 'unbekannter-kanal'}</span>],
  [/^@(everyone|here)\b/, (m, _c, k) => <span key={k} className={mention}>@{m[1]}</span>],
  [/^<(a?):(\w{2,32}):(\d{15,25})>/, (m, _c, k) => <img key={k} alt={`:${m[2]}:`} title={`:${m[2]}:`} className="inline h-[1.375em] w-[1.375em] align-bottom object-contain" src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'webp'}?size=48`} />],
  [/^<t:(-?\d{1,13})(?::([tTdDfFR]))?>/, (m, _c, k) => <span key={k} className="rounded bg-white/10 px-0.5">{stamp(Number(m[1]), m[2])}</span>],
];
const START = /[\\`*_~|[<h@]/;

/** Inline-Markdown einer Zeile/eines Abschnitts. */
export function inline(text: string, c: MdCtx, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0, n = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (START.test(ch)) {
      const rest = text.slice(i);
      let hit = false;
      for (const [re, render] of RULES) {
        const m = re.exec(rest);
        if (!m) continue;
        if (buf) { out.push(buf); buf = ''; }
        out.push(render(m, c, `${key}.${n++}`));
        i += m[0].length; hit = true; break;
      }
      if (hit) continue;
    }
    if (ch === '\n') { if (buf) { out.push(buf); buf = ''; } out.push(<br key={`${key}.br${n++}`} />); i++; continue; }
    buf += ch; i++;
  }
  if (buf) out.push(buf);
  return out;
}

/** Blöcke: Codeblöcke, Zitate, Überschriften, Kleintext, Listen. */
export function Markdown({ text, ctx = {} }: { text: string; ctx?: MdCtx }) {
  if (ctx.inlineOnly) return <>{inline(text, ctx)}</>;
  const parts: ReactNode[] = [];
  const fence = /```(?:([\w+-]{1,20})\n)?([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = fence.exec(text))) {
    if (m.index > last) parts.push(<Lines key={k++} text={text.slice(last, m.index)} ctx={ctx} />);
    parts.push(<pre key={k++} className="my-1 overflow-x-auto rounded border border-[#1e1f22] bg-[#2b2d31] p-2 font-mono text-[0.85em] leading-snug whitespace-pre-wrap">{m[2]!.replace(/^\n/, '')}</pre>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Lines key={k++} text={text.slice(last)} ctx={ctx} />);
  return <>{parts}</>;
}

function Lines({ text, ctx }: { text: string; ctx: MdCtx }) {
  const lines = text.replace(/^\n/, '').split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('>>> ')) { out.push(<Quote key={i}>{inline(lines.slice(i).join('\n').slice(4), ctx, `q${i}`)}</Quote>); break; }
    if (/^> /.test(line) || line === '>') {
      const q: string[] = [];
      while (i < lines.length && (/^> /.test(lines[i]!) || lines[i] === '>')) q.push(lines[i++]!.replace(/^> ?/, ''));
      i--;
      out.push(<Quote key={i}>{inline(q.join('\n'), ctx, `q${i}`)}</Quote>);
      continue;
    }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) { const size = ['text-[1.5em]', 'text-[1.25em]', 'text-[1em]'][h[1]!.length - 1]; out.push(<p key={i} className={`my-1 font-bold leading-tight text-white ${size}`}>{inline(h[2]!, ctx, `h${i}`)}</p>); continue; }
    const sub = /^-# (.+)$/.exec(line);
    if (sub) { out.push(<p key={i} className="text-[0.8em] text-[#949ba4]">{inline(sub[1]!, ctx, `s${i}`)}</p>); continue; }
    const li = /^(\s*)([-*]|\d{1,3}\.) (.+)$/.exec(line);
    if (li) { out.push(<div key={i} className="flex gap-2" style={{ paddingLeft: `${Math.min(li[1]!.length, 6) * 8 + 4}px` }}><span aria-hidden>{/\d/.test(li[2]!) ? li[2] : '•'}</span><span className="min-w-0">{inline(li[3]!, ctx, `l${i}`)}</span></div>); continue; }
    out.push(<div key={i} className="min-h-[1.375em]">{inline(line, ctx, `p${i}`)}</div>);
  }
  return <>{out}</>;
}
const Quote = ({ children }: { children: ReactNode }) => <div className="my-0.5 flex gap-2"><span aria-hidden className="w-1 shrink-0 rounded bg-[#4e5058]" /><div className="min-w-0">{children}</div></div>;
