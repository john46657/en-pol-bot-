import type { ReactNode } from 'react';
import type { MessageSpec } from '@enrp/shared';
import { hex } from '../lib/tickets';

const BTN: Record<string, string> = { primary: 'bg-[#5865f2] text-white', secondary: 'bg-[#4e5058] text-white', success: 'bg-[#248046] text-white', danger: 'bg-[#da373c] text-white' };

/** Sehr einfaches Discord-Markdown für die Vorschau (fett, kursiv, Code, Zeilen) – nur Text, kein HTML. */
function md(text: string): ReactNode[] {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean).map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={j} className="rounded bg-black/30 px-1 text-[0.85em]">{p.slice(1, -1)}</code>;
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={j}>{p.slice(1, -1)}</em>;
      return <span key={j}>{p}</span>;
    });
    return <span key={i}>{i > 0 && <br />}{parts}</span>;
  });
}
const img = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : undefined);

/** Vorschau einer Discord-Nachricht (Embed, Buttons, Menü) wie im Discord-Client. */
export function DiscordPreview({ message, botName = 'EN Polizei' }: { message: MessageSpec; botName?: string }) {
  return (
    <div className="rounded-lg bg-[#313338] p-3 text-[14px] leading-snug text-[#dbdee1]" aria-label="Discord-Vorschau">
      <div className="flex gap-3">
        <div aria-hidden className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-[#5865f2]" />
        <div className="min-w-0 flex-1">
          <p className="mb-1"><span className="font-semibold text-white">{botName}</span> <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold text-white">APP</span></p>
          {message.content && <p className="mb-1 whitespace-pre-wrap break-words">{md(message.content)}</p>}
          {(message.embeds ?? []).map((e, i) => (
            <div key={i} className="mb-1 max-w-[520px] overflow-hidden rounded border-l-4 bg-[#2b2d31]" style={{ borderColor: e.color !== undefined ? hex(e.color) : '#1e1f22' }}>
              <div className="flex gap-3 p-3">
                <div className="min-w-0 flex-1">
                  {e.author && <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-white">{img(e.authorIcon) && <img src={img(e.authorIcon)} alt="" className="h-5 w-5 rounded-full" />}{e.author}</p>}
                  {e.title && <p className="mb-1 font-semibold text-white">{e.title}</p>}
                  {e.description && <div className="whitespace-pre-wrap break-words text-[13px]">{md(e.description)}</div>}
                  {!!e.fields?.length && <div className="mt-2 grid gap-2 sm:grid-cols-3">{e.fields.map((f, j) => <div key={j} className={f.inline ? '' : 'sm:col-span-3'}><p className="text-xs font-semibold text-white">{f.name}</p><p className="whitespace-pre-wrap text-[13px]">{md(f.value)}</p></div>)}</div>}
                </div>
                {img(e.thumbnail) && <img src={img(e.thumbnail)} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />}
              </div>
              {img(e.image) && <img src={img(e.image)} alt="" className="block max-h-72 w-full object-cover px-3 pb-3" />}
              {e.footer && <p className="flex items-center gap-2 px-3 pb-3 text-[11px] text-[#b5bac1]">{img(e.footerIcon) && <img src={img(e.footerIcon)} alt="" className="h-4 w-4 rounded-full" />}{e.footer}</p>}
            </div>
          ))}
          {message.select && (
            <div className="mt-1 flex max-w-[520px] items-center justify-between rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-[#b5bac1]">
              <span>{message.select.placeholder}</span><span aria-hidden>▾</span>
            </div>
          )}
          {message.select?.options && message.select.options.length > 0 && (
            <ul className="mt-1 max-w-[520px] rounded bg-[#2b2d31] py-1 text-[13px]" aria-label="Auswahloptionen">
              {message.select.options.map((o) => <li key={o.value} className="px-3 py-1"><span>{o.emoji ? `${o.emoji} ` : ''}{o.label}</span>{o.description && <span className="block text-[11px] text-[#b5bac1]">{o.description}</span>}</li>)}
            </ul>
          )}
          {!!message.buttons?.length && (
            <div className="mt-1 flex max-w-[520px] flex-wrap gap-2">
              {message.buttons.map((b) => <span key={b.id} className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-[13px] font-medium ${BTN[b.style] ?? BTN.secondary} ${b.disabled ? 'opacity-50' : ''}`}>{b.emoji && <span aria-hidden>{b.emoji}</span>}{b.label}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
