"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTranscript = renderTranscript;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Minimales, sicheres Markdown (fett, kursiv, Code, Zeilenumbrüche) – Eingabe ist vorher escaped. */
const md = (s) => esc(s)
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@$1</span>').replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#$1</span>')
    .replace(/\n/g, '<br>');
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function renderTranscript(d) {
    const fmt = (x) => (x ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: d.timezone }).format(x) : '—');
    const info = [
        ['Ticket', `#${d.number} · ${d.name}`], ['Kategorie', d.category], ['Status', d.status], ['Priorität', d.priority],
        ['Ersteller', `${d.creator.name} (${d.creator.id})`], ['Bearbeiter', d.claimers.map((c) => c.name).join(', ') || '—'],
        ['Beteiligte', d.participants.join(', ') || '—'], ['Erstellt', fmt(d.createdAt)], ['Geschlossen', fmt(d.closedAt)],
        ['Geschlossen von', d.closedBy ?? '—'], ['Grund', d.closeReason ?? '—'],
    ];
    const entries = d.entries.map((e) => {
        if (e.kind === 'event')
            return `<div class="event"><span>${esc(e.text)}</span><time>${esc(fmt(e.at))}</time></div>`;
        const initials = esc(e.author.slice(0, 2).toUpperCase());
        const avatar = e.avatar ? `<img class="avatar" src="${esc(e.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="avatar ph">${initials}</div>`;
        const att = e.attachments.map((a) => (a.dataUri && a.contentType?.startsWith('image/'))
            ? `<a class="img" href="${a.dataUri}" download="${esc(a.name)}"><img src="${a.dataUri}" alt="${esc(a.name)}"></a>`
            : `<div class="file">📎 ${a.href ? `<a href="${esc(a.href)}">${esc(a.name)}</a>` : esc(a.name)} <small>${size(a.size)}</small></div>`).join('');
        const emb = e.embeds.filter((x) => x.title || x.description).map((x) => `<div class="embed">${x.title ? `<b>${md(x.title)}</b>` : ''}${x.description ? `<div>${md(x.description)}</div>` : ''}</div>`).join('');
        return `<div class="msg">${avatar}<div class="body"><div class="head"><b class="${e.staff ? 'staff' : e.bot ? 'bot' : ''}">${esc(e.author)}</b>${e.bot ? '<span class="tag">BOT</span>' : e.staff ? '<span class="tag team">TEAM</span>' : ''}<time>${esc(fmt(e.at))}</time></div>${e.content ? `<div class="text">${md(e.content)}</div>` : ''}${emb}${att}</div></div>`;
    }).join('\n');
    return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Transcript #${esc(d.number)} – ${esc(d.name)}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#1e1f22;color:#dbdee1;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:#2b2d31;border-bottom:1px solid #3f4147;padding:24px}header h1{margin:0 0 4px;font-size:20px;color:#fff}header p{margin:0;color:#949ba4;font-size:13px}
.info{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 24px;margin-top:16px}.info div{font-size:13px}.info span{display:block;color:#949ba4;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.answers{margin:16px 24px 0;background:#2b2d31;border-left:4px solid #5865f2;border-radius:6px;padding:12px 16px}.answers h2{margin:0 0 8px;font-size:14px}.answers dt{color:#949ba4;font-size:12px;margin-top:6px}.answers dd{margin:0}
main{padding:8px 24px 40px}.msg{display:flex;gap:14px;padding:8px 0}.avatar{width:40px;height:40px;border-radius:50%;flex:none;object-fit:cover;background:#5865f2}.avatar.ph{display:grid;place-items:center;color:#fff;font-weight:600;font-size:13px}
.body{min-width:0;flex:1}.head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.head b{color:#f2f3f5}.head b.staff{color:#57f287}.head b.bot{color:#c9cdfb}.head time{color:#949ba4;font-size:12px}
.tag{background:#5865f2;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600}.tag.team{background:#248046}.text{white-space:normal;overflow-wrap:anywhere}
code,pre{background:#2b2d31;border-radius:4px;padding:1px 4px;font-family:ui-monospace,Consolas,monospace;font-size:13px}pre{padding:8px;white-space:pre-wrap}
.mention{background:#3c4270;color:#c9cdfb;border-radius:3px;padding:0 2px}.embed{border-left:4px solid #5865f2;background:#2b2d31;border-radius:4px;padding:8px 12px;margin-top:6px;max-width:560px}
.img img{max-width:min(420px,100%);max-height:320px;border-radius:6px;margin-top:6px;display:block}.file{margin-top:6px;background:#2b2d31;border:1px solid #3f4147;border-radius:6px;padding:8px 12px;display:inline-block}.file a{color:#00a8fc}
.event{display:flex;justify-content:space-between;gap:12px;color:#949ba4;font-size:13px;border-top:1px dashed #3f4147;padding:6px 0;margin:4px 0 4px 54px}
footer{color:#6d6f78;font-size:12px;text-align:center;padding:16px}
@media print{body{background:#fff;color:#000}header,.answers,.embed,.file,code,pre{background:#f3f3f3}.head b,.head b.staff{color:#000}}
</style></head><body>
<header><h1>Ticket #${esc(d.number)} – ${esc(d.name)}</h1><p>Transcript erstellt am ${esc(fmt(d.generatedAt))}</p>
<div class="info">${info.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div></header>
${d.answers.length ? `<section class="answers"><h2>📝 Angaben beim Öffnen</h2><dl>${d.answers.map((a) => `<dt>${esc(a.label)}</dt><dd>${md(a.value)}</dd>`).join('')}</dl></section>` : ''}
<main>${entries || '<p>Keine Nachrichten.</p>'}</main>
<footer>EN Polizei · Ticket-System · ${d.entries.filter((e) => e.kind === 'message').length} Nachrichten</footer>
</body></html>`;
}
//# sourceMappingURL=transcript.js.map