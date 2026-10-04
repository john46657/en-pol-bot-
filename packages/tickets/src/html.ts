import type { TranscriptMessage } from './service.js';

/**
 * HTML-Transcript (eigenständige Datei, Discord-Dunkeldesign). **Alle** Inhalte stammen von Nutzern und werden
 * maskiert; Links in Nachrichten werden nur für http(s) erzeugt; Bilder nur aus Anhängen mit Bild-Dateiendung.
 */
export const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u: string): string | null => (/^https?:\/\//i.test(u) ? u : null);
const IMG = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function linkify(text: string): string {
  return esc(text)
    .replace(/https?:\/\/[^\s<]+/g, (m) => {
      const url = safeUrl(m.replace(/&amp;/g, '&'));
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${m}</a>` : m;
    })
    .replace(/\n/g, '<br>');
}

export interface TranscriptMeta {
  guildName: string;
  guildIconUrl?: string | null;
  ticketName: string;
  ticketId: string;
  number: string;
  category: string;
  creatorTag: string;
  creatorId: string;
  createdAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
  claimedBy: string | null;
  reason: string | null;
  /** Namen für Discord-IDs (Ersteller, Schließer, Bearbeiter) */
  names?: Record<string, string>;
  systemEvents?: { at: string; text: string }[];
}

const time = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const dt = (d: Date | null) => (d ? d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'medium' }) : '–');

export function renderTranscriptHtml(meta: TranscriptMeta, messages: readonly TranscriptMessage[]): string {
  const name = (id: string | null) => (id ? esc(meta.names?.[id] ?? id) : '–');
  const byId = new Map(messages.map((m) => [m.id, m]));
  type Row = { at: string; html: string };
  const rows: Row[] = messages.map((m) => {
    const reply = m.replyTo ? byId.get(m.replyTo) : undefined;
    const atts = m.attachments
      .map((a) => {
        const u = safeUrl(a.url);
        if (!u) return `<div class="att">📎 ${esc(a.name)}</div>`;
        return IMG.test(a.name) || a.contentType?.startsWith('image/') ? `<div class="att"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="${esc(a.name)}" loading="lazy"></a></div>` : `<div class="att">📎 <a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(a.name)}</a></div>`;
      })
      .join('');
    return {
      at: m.at,
      html: `<div class="msg${m.bot ? ' bot' : ''}" id="m-${esc(m.id)}">${reply ? `<div class="reply">↩ ${esc(reply.author)}: ${esc(reply.content.slice(0, 80))}</div>` : ''}<span class="time">[${esc(time(m.at))}]</span> <span class="author">${esc(m.author)}</span>${m.bot ? ' <span class="tag">BOT</span>' : ''}<div class="content">${linkify(m.content) || (m.embeds ? `<i>${m.embeds} Embed(s)</i>` : '')}</div>${atts}</div>`,
    };
  });
  for (const e of meta.systemEvents ?? []) rows.push({ at: e.at, html: `<div class="msg system"><span class="time">[${esc(time(e.at))}]</span> <span class="sys">⚙️ ${esc(e.text)}</span></div>` });
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const icon = meta.guildIconUrl && safeUrl(meta.guildIconUrl) ? `<img class="icon" src="${esc(meta.guildIconUrl)}" alt="">` : '';
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">
<title>Transcript ${esc(meta.number)} – ${esc(meta.guildName)}</title>
<style>
body{margin:0;background:#313338;color:#dbdee1;font:15px/1.45 "gg sans","Segoe UI",system-ui,sans-serif}
header{background:#2b2d31;padding:20px 28px;border-bottom:1px solid #1e1f22;display:flex;gap:16px;align-items:center}
.icon{width:56px;height:56px;border-radius:50%}h1{margin:0;font-size:20px;color:#fff}.sub{color:#949ba4;font-size:13px}
.info{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 24px;padding:16px 28px;background:#2b2d31;margin-bottom:8px}
.info b{display:block;color:#949ba4;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
main{padding:12px 28px 40px;max-width:980px}.msg{padding:6px 0;border-bottom:1px solid #3a3c42;word-wrap:break-word}
.time{color:#949ba4;font-size:12px}.author{color:#fff;font-weight:600}.tag{background:#5865f2;color:#fff;border-radius:3px;font-size:10px;padding:1px 4px}
.content{margin:2px 0 0 0;white-space:normal}.reply{color:#949ba4;font-size:12px;border-left:2px solid #4e5058;padding-left:8px;margin-bottom:2px}
.att img{max-width:420px;max-height:320px;border-radius:6px;margin-top:6px}.att{margin-top:4px}a{color:#00a8fc}
.system{color:#949ba4;font-style:italic}.empty{color:#949ba4;padding:30px 0}footer{padding:16px 28px;color:#949ba4;font-size:12px}
</style></head><body>
<header>${icon}<div><h1>${esc(meta.guildName)} · ${esc(meta.ticketName)}</h1><div class="sub">Ticket-Transcript · ${esc(meta.number)} · ${messages.length} Nachrichten</div></div></header>
<section class="info">
<div><b>Ticket-ID</b>${esc(meta.ticketId)}</div><div><b>Kategorie</b>${esc(meta.category)}</div>
<div><b>Ersteller</b>${esc(meta.creatorTag)} (${esc(meta.creatorId)})</div><div><b>Erstellt</b>${esc(dt(meta.createdAt))}</div>
<div><b>Geschlossen</b>${esc(dt(meta.closedAt))}</div><div><b>Geschlossen von</b>${name(meta.closedBy)}</div>
<div><b>Bearbeiter</b>${name(meta.claimedBy)}</div><div><b>Grund</b>${esc(meta.reason ?? '–')}</div>
</section>
<main>${rows.length ? rows.map((r) => r.html).join('\n') : '<div class="empty">Keine Nachrichten.</div>'}</main>
<footer>Erstellt von NEXUS am ${esc(dt(new Date()))}</footer>
</body></html>`;
}
