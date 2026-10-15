import { useState, type ReactNode } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import { isHttpUrl, type MbAction, type MbDocumentData, type MbEmbed, type MbField, type MbMessage } from '@enrp/shared';
import { Markdown, type MdCtx } from './markdown';

const BTN: Record<string, string> = { primary: 'bg-[#5865f2] hover:bg-[#4752c4]', secondary: 'bg-[#4e5058] hover:bg-[#6d6f78]', success: 'bg-[#248046] hover:bg-[#1a6334]', danger: 'bg-[#da373c] hover:bg-[#a12828]' };
const url = (u: string) => (u && isHttpUrl(u) ? u : undefined);

function Img({ src, className, alt = '' }: { src?: string; className: string; alt?: string }) {
  const [bad, setBad] = useState<string | null>(null);
  if (!src) return null;
  if (bad === src) return <span className={`inline-flex items-center justify-center gap-1 bg-black/20 text-[11px] text-[#949ba4] ${className}`} title="Bild konnte nicht geladen werden"><ImageOff size={14} aria-hidden />Bild nicht ladbar</span>;
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={className} onError={() => setBad(src)} />;
}
const emojiOf = (e: string) => {
  const c = /^<(a?):(\w+):(\d+)>$/.exec(e.trim());
  if (c) return <img alt={`:${c[2]}:`} className="h-[18px] w-[18px] object-contain" src={`https://cdn.discordapp.com/emojis/${c[3]}.${c[1] ? 'gif' : 'webp'}?size=48`} />;
  return e ? <span aria-hidden>{e}</span> : null;
};

/** Felder wie Discord: aufeinanderfolgende Inline-Felder nebeneinander (3 je Reihe, mit Thumbnail 2). */
function fieldRows(fields: MbField[], thumb: boolean) {
  const rows: MbField[][] = [];
  const per = thumb ? 2 : 3;
  for (const f of fields) {
    const last = rows.at(-1);
    if (f.inline && last && last.length < per && last.every((x) => x.inline)) last.push(f);
    else rows.push([f]);
  }
  return rows;
}

function EmbedView({ e, ctx, now }: { e: MbEmbed; ctx: MdCtx; now: Date }) {
  const color = /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#1e1f22';
  const thumb = url(e.thumbnailUrl);
  const ts = e.timestamp === 'send' ? now : e.timestamp === 'custom' && e.timestampAt && !Number.isNaN(Date.parse(e.timestampAt)) ? new Date(e.timestampAt) : null;
  return (
    <div className="mt-1 grid max-w-[520px] rounded border-l-4 bg-[#2b2d31]" style={{ borderLeftColor: color }}>
      <div className="flex gap-4 p-3 pr-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          {e.authorName && (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <Img src={url(e.authorIconUrl)} className="h-6 w-6 rounded-full object-cover" />
              {url(e.authorUrl) ? <a href={e.authorUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">{e.authorName}</a> : e.authorName}
            </p>
          )}
          {e.title && <p className="text-[15px] font-semibold text-white">{url(e.url) ? <a href={e.url} target="_blank" rel="noreferrer noopener" className="text-[#00a8fc] hover:underline"><Markdown text={e.title} ctx={{ ...ctx, inlineOnly: true }} /></a> : <Markdown text={e.title} ctx={{ ...ctx, inlineOnly: true }} />}</p>}
          {e.description && <div className="break-words text-[13.5px] leading-[1.35]"><Markdown text={e.description} ctx={ctx} /></div>}
          {e.fields.length > 0 && (
            <div className="space-y-2 pt-1">
              {fieldRows(e.fields, !!thumb).map((row, i) => (
                <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                  {row.map((f) => <div key={f.id} className="min-w-0"><p className="text-[13px] font-semibold text-white"><Markdown text={f.name || '​'} ctx={{ ...ctx, inlineOnly: true }} /></p><div className="break-words text-[13.5px] leading-[1.35]"><Markdown text={f.value || '​'} ctx={ctx} /></div></div>)}
                </div>
              ))}
            </div>
          )}
          {url(e.imageUrl) && <Img src={url(e.imageUrl)} className="mt-2 block max-h-[300px] max-w-full rounded object-contain" />}
          {(e.footerText || ts) && (
            <p className="flex items-center gap-2 pt-1 text-[12px] text-[#b5bac1]">
              {e.footerText && <Img src={url(e.footerIconUrl)} className="h-5 w-5 rounded-full object-cover" />}
              <span>{e.footerText}{e.footerText && ts ? ' • ' : ''}{ts ? ts.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </p>
          )}
        </div>
        {thumb && <Img src={thumb} className="h-20 w-20 shrink-0 rounded object-cover" />}
      </div>
    </div>
  );
}

function actionHint(a: MbAction, roleName: MdCtx['roleName']) {
  return a.type === 'reply' ? `Antwortet nur der klickenden Person: „${a.text.slice(0, 120)}${a.text.length > 120 ? '…' : ''}“` : `${{ toggle: 'Schaltet', add: 'Gibt', remove: 'Nimmt' }[a.mode]} die Rolle @${roleName?.(a.roleId)?.name ?? a.roleId}${a.mode === 'toggle' ? ' um' : ''}`;
}

function Components({ m, ctx, onSimulate, webhook }: { m: MbMessage; ctx: MdCtx; onSimulate: (text: string) => void; webhook: boolean }) {
  return (
    <div className="mt-2 space-y-2">
      {m.rows.map((r) => r.type === 'buttons' ? (
        <div key={r.id} className="flex max-w-[520px] flex-wrap gap-2">
          {r.buttons.map((b) => {
            const inert = b.kind === 'action' && webhook;
            const cls = b.kind === 'link' ? BTN.secondary : BTN[b.style];
            return (
              <button key={b.id} type="button" disabled={b.disabled}
                title={b.kind === 'link' ? `Öffnet ${b.url || '(keine URL)'}` : inert ? 'Über Webhooks nicht möglich' : actionHint(b.action, ctx.roleName)}
                onClick={() => (b.kind === 'link' ? (url(b.url) && window.open(b.url, '_blank', 'noopener')) : onSimulate(actionHint(b.action, ctx.roleName)))}
                className={`inline-flex h-8 min-w-[60px] items-center justify-center gap-1.5 rounded px-4 text-[13px] font-medium text-white transition ${cls} disabled:cursor-not-allowed disabled:opacity-50 ${inert ? 'outline-dashed outline-1 outline-[#f23f43]' : ''}`}>
                {emojiOf(b.emoji)}{b.label}{b.kind === 'link' && <ExternalLink size={13} aria-hidden />}
              </button>
            );
          })}
        </div>
      ) : (
        <SelectPreview key={r.id} placeholder={r.placeholder} disabled={r.disabled} options={r.options.map((o) => ({ id: o.id, label: o.label, description: o.description, emoji: o.emoji, hint: actionHint(o.action, ctx.roleName) }))} onPick={(hint) => onSimulate(hint)} />
      ))}
    </div>
  );
}

function SelectPreview({ placeholder, options, disabled, onPick }: { placeholder: string; disabled: boolean; options: { id: string; label: string; description: string; emoji: string; hint: string }[]; onPick: (hint: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative max-w-[400px]">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="flex h-10 w-full items-center justify-between rounded border border-[#1e1f22] bg-[#1e1f22] px-3 text-left text-[14px] text-[#949ba4] disabled:opacity-50">
        <span>{placeholder || 'Treffe eine Auswahl'}</span><span aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-[#1e1f22] bg-[#2b2d31] py-1 shadow-xl">
          {options.map((o) => (
            <li key={o.id}><button type="button" className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-white/5" onClick={() => { setOpen(false); onPick(o.hint); }}>
              {o.emoji && <span className="mt-0.5">{emojiOf(o.emoji)}</span>}
              <span className="min-w-0"><span className="block text-[14px] text-[#dbdee1]">{o.label || '(ohne Beschriftung)'}</span>{o.description && <span className="block text-[12px] text-[#949ba4]">{o.description}</span>}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface PreviewProps {
  data: MbDocumentData; ctx: MdCtx; selected?: number; onSelect?: (i: number) => void;
  /** Absender: Bot (Name/Avatar) oder Webhook-Profil */
  author: { name: string; avatar?: string | null; app: boolean };
  webhook?: boolean;
  status?: (i: number) => ReactNode;
}

/** Live-Vorschau aller Nachrichten der Gruppe im Discord-Stil (Simulation). */
export function MessagePreview({ data, ctx, selected, onSelect, author, webhook = false, status }: PreviewProps) {
  const [sim, setSim] = useState<string | null>(null);
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-lg bg-[#313338] py-3 text-[15px] leading-[1.375] text-[#dbdee1]" aria-label="Discord-Vorschau">
      {data.messages.map((m, i) => (
        <div key={m.id} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onClick={() => onSelect?.(i)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect?.(i)}
          aria-label={`Vorschau Nachricht ${i + 1}`}
          className={`relative flex gap-4 px-4 py-1 ${onSelect ? 'cursor-pointer hover:bg-black/10' : ''} ${selected === i ? 'bg-[#5865f2]/10 shadow-[inset_2px_0_0_#5865f2]' : ''}`}>
          {i === 0 ? (
            author.avatar ? <img src={author.avatar} alt="" referrerPolicy="no-referrer" className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover" /> : <div aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1e3a8a] text-xs font-bold text-white">EN</div>
          ) : <span aria-hidden className="w-10 shrink-0 pt-0.5 text-right text-[11px] text-[#949ba4]">{time}</span>}
          <div className="min-w-0 flex-1">
            {i === 0 ? (
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-white">{author.name}</span>
                {author.app && <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold leading-4 text-white">APP</span>}
                <span className="text-[12px] text-[#949ba4]">Heute um {time}</span>
                {status?.(i)}
              </p>
            ) : status ? <p>{status(i)}</p> : null}
            {m.content && <div className="break-words"><Markdown text={m.content} ctx={ctx} /></div>}
            {m.embeds.map((e) => <EmbedView key={e.id} e={e} ctx={ctx} now={now} />)}
            {m.rows.length > 0 && <Components m={m} ctx={ctx} webhook={webhook} onSimulate={setSim} />}
            {!m.content && !m.embeds.length && !m.rows.length && <p className="italic text-[#949ba4]">(leere Nachricht – wird so nicht gesendet)</p>}
          </div>
        </div>
      ))}
      {sim && (
        <div role="status" className="mx-4 mt-2 rounded border border-[#5865f2]/40 bg-[#5865f2]/10 p-2 text-[13px]">
          <p className="text-[11px] uppercase tracking-wide text-[#949ba4]">Simulierter Klick (in Discord führt der Bot das aus)</p>
          <p>{sim}</p>
          <button type="button" className="mt-1 text-[12px] text-[#00a8fc] hover:underline" onClick={() => setSim(null)}>Schließen</button>
        </div>
      )}
    </div>
  );
}
