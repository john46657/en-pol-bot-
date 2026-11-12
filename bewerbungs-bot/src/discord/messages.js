import { aiCheck, AI_LEVEL_LABEL } from '../ai-check.js';
import { clip, formatDuration, plain, possessive } from '../forms.js';
import { STATUS } from '../service.js';

/** Nachrichten als reines Discord-JSON (Embeds + Komponenten) – ohne Discord-Verbindung testbar. */
export const COLORS = { info: 0x5865f2, success: 0x57f287, danger: 0xed4245, warning: 0xfee75c, neutral: 0x99aab5, review: 0xeb459e };
const STYLE = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };

export function parseEmoji(e) {
  if (!e) return undefined;
  const m = /^<(a?):(\w{2,32}):(\d{15,25})>$/.exec(e);
  return m ? { id: m[3], name: m[2], animated: !!m[1] } : { name: e };
}
export const button = (id, label, style = 'secondary', emoji, url) => ({ type: 2, style: STYLE[style], label: clip(label, 80), ...(url ? { url } : { custom_id: id }), ...(emoji ? { emoji: parseEmoji(emoji) } : {}) });
export const row = (...components) => ({ type: 1, components });
export const colorOf = (hex) => (/^#[0-9a-f]{6}$/i.test(hex ?? '') ? parseInt(hex.slice(1), 16) : COLORS.info);
const unix = (iso) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };

/** Panel: eine Bewerbungsart → Button „Jetzt bewerben“; mehrere → Auswahlmenü. */
export function panelPayload(panel, types) {
  const list = panel.types.map((k) => types.find((t) => t.key === k)).filter(Boolean);
  const sections = list.length > 1 ? list.filter((t) => t.description).map((t) => `**__${plain(t.name)}:__**\n${t.description}`) : [];
  const embed = { title: clip(panel.title, 256), color: colorOf(panel.color), description: clip([panel.description, ...sections].filter(Boolean).join('\n\n'), 4000) || undefined };
  if (list.length === 1) {
    const t = list[0];
    return { embeds: [embed], components: [row(button(`app:pick:${t.key}`, 'Jetzt bewerben', 'primary', t.emoji || '📋'))] };
  }
  return {
    embeds: [embed],
    components: [row({ type: 3, custom_id: 'app:pick', placeholder: 'Wofür möchtest du dich bewerben?', min_values: 1, max_values: 1,
      options: list.slice(0, 25).map((t) => ({ label: clip(`${t.name}${t.enabled ? '' : ' (geschlossen)'}`, 100), value: t.key, ...(t.description ? { description: clip(t.description.replace(/[*_`~|>]/g, ''), 100) } : {}), ...(t.emoji ? { emoji: parseEmoji(t.emoji) } : {}) })) })],
  };
}

const AI_ICON = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴' };
/** Gesamtbudget der Embeds (Discord: 6000 Zeichen) – Platz lassen für das Feld „Entscheidung“. */
const BUDGET = 4800;

/**
 * Bewerbung im Team-Kanal: Fragen + Antworten (lange Bewerbungen auf mehrere Embeds verteilt bzw. gekürzt),
 * Bewerber-Infos mit KI-Check, Status/Entscheidung und Buttons.
 */
export function applicationPayload(app, type, { guildName, dashboardUrl } = {}) {
  const decided = !['OPEN', 'REVIEW', 'INTERVIEW'].includes(app.status);
  const ai = aiCheck(app.answers.map((x) => ({ answer: x.answer === '—' ? '' : x.answer })), app.durationSec);
  const joined = unix(app.joinedAt), submitted = unix(app.createdAt);
  const info = ['**Bewerber-Infos**', `Benutzer: <@${app.userId}>`, `Discord-ID: \`${app.userId}\``, `Benutzername: \`${plain(app.userName)}\``,
    ...(app.roblox ? [`Roblox: \`${plain(app.roblox.name)}\`${app.roblox.id ? ` (\`${app.roblox.id}\`)` : ''}`] : []),
    `Quelle: ${app.source === 'WEB' ? 'Formular im Browser' : 'Direktnachricht'}`,
    ...(typeof app.durationSec === 'number' ? [`Dauer: \`${formatDuration(app.durationSec)}\``] : []),
    `KI-Check: ${AI_ICON[ai.level]} ${AI_LEVEL_LABEL[ai.level]} (\`${ai.score} %\`)`, ...(ai.level === 'LOW' ? [] : ai.reasons.slice(0, 2).map((r) => `› ${clip(plain(r), 160)}`)),
    ...(joined ? [`Server beigetreten: <t:${joined}:R>`] : []), ...(submitted ? [`Eingereicht: <t:${submitted}:R>`] : []),
    ...(guildName ? [`Server: \`${plain(guildName)}\``] : []),
    ...(dashboardUrl ? [`[Im Dashboard öffnen](${dashboardUrl})`] : []),
  ].join('\n');
  const section = (q, i, max) => {
    const a = plain(q.answer) || '—';
    return `**${i + 1}. ${clip(plain(q.question), 200)}**\n${max !== undefined && a.length > max ? `${a.slice(0, max)}… *(gekürzt)*` : a}`;
  };
  const title = clip(`📋 ${possessive(plain(app.userName))} Bewerbung „${plain(type.name ?? app.typeName)}“ · ${app.number}`, 256);
  const room = BUDGET - info.length - (title.length + 20) * 3;
  const size = (xs) => xs.reduce((n, x) => n + x.length + 2, 0);
  let sections = app.answers.map((q, i) => section(q, i));
  if (size(sections) > room) {
    const questions = app.answers.reduce((n, q, i) => n + section({ question: q.question, answer: '' }, i).length + 15, 0);
    const per = Math.max(40, Math.floor((room - questions) / Math.max(1, app.answers.length)));
    sections = app.answers.map((q, i) => section(q, i, per));
  }
  if (size(sections) > room) {
    const kept = [];
    for (const x of sections) { if (size(kept) + x.length + 2 > room - 120) break; kept.push(x); }
    kept.push(`*… und ${sections.length - kept.length} weitere Antworten – vollständig im Dashboard.*`);
    sections = kept;
  }
  const color = app.status === 'ACCEPTED' ? COLORS.success : app.status === 'REJECTED' ? COLORS.danger : app.status === 'WITHDRAWN' ? COLORS.neutral : app.status === 'OPEN' ? COLORS.info : COLORS.review;
  const embeds = [];
  let cur = '';
  for (const piece of [...sections, info]) {
    if (cur && cur.length + piece.length + 2 > 4000) { embeds.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) embeds.push(cur);
  const out = embeds.slice(0, 10).map((d, i) => ({ color, ...(i === 0 ? { title } : {}), description: d }));
  const last = out[out.length - 1];
  const fields = [];
  if (!decided && app.status !== 'OPEN') fields.push({ name: 'Status', value: STATUS[app.status], inline: true });
  if (decided) {
    const by = app.decidedBy?.id ? `<@${app.decidedBy.id}>` : plain(app.decidedBy?.name ?? 'Automatisch');
    const icon = app.status === 'ACCEPTED' ? '✅' : app.status === 'REJECTED' ? '❌' : '↩️';
    fields.push({ name: 'Entscheidung', value: clip(`${icon} ${STATUS[app.status]} von ${by}${app.decidedAt ? ` · <t:${unix(app.decidedAt)}:R>` : ''}${app.reason ? `\n**Grund:** ${plain(app.reason)}` : ''}`, 1024) });
  }
  if (fields.length) last.fields = fields;
  last.footer = { text: `${app.number} · ${type.name ?? app.typeName}` };
  const team = [button(`app:history:${app.userId}`, 'Verlauf', 'primary'), button(`app:ticket:${app.id}`, 'Ticket mit Bewerber öffnen', 'secondary', '🎫')];
  const decide = [
    button(`app:decide:${app.id}:A`, 'Annehmen', 'success'), button(`app:decide:${app.id}:R`, 'Ablehnen', 'danger'),
    button(`app:reason:${app.id}:A`, 'Annehmen mit Grund', 'success'), button(`app:reason:${app.id}:R`, 'Ablehnen mit Grund', 'danger'),
  ];
  return { embeds: out, components: decided ? [row(...team)] : [row(...decide), row(...team)] };
}

/** Archiv-Kanal (angenommen/abgelehnt): dieselbe Nachricht ohne Entscheidungs-Buttons. */
export function archivePayload(app, type, opts) {
  const p = applicationPayload(app, type, opts);
  return { ...p, components: [row(button(`app:history:${app.userId}`, 'Verlauf', 'primary'), button(`app:ticket:${app.id}`, 'Ticket mit Bewerber öffnen', 'secondary', '🎫'))] };
}

export function decisionDmPayload(app, text, guildName) {
  const accepted = app.status === 'ACCEPTED';
  return { embeds: [{ title: clip(`${accepted ? '🎉' : '📨'} ${app.typeName} · ${app.number}`, 256), color: accepted ? COLORS.success : COLORS.danger, description: clip(text, 4000), ...(guildName ? { footer: { text: clip(guildName, 200) } } : {}) }] };
}

export function historyPayload(userId, apps) {
  const lines = apps.slice(0, 20).map((a) => `• **${a.number}** · ${plain(a.typeName)} · ${STATUS[a.status]} · <t:${unix(a.createdAt)}:d>${a.reason ? `\n  ↳ ${clip(plain(a.reason), 150)}` : ''}`);
  return { embeds: [{ title: '🗂️ Bewerbungs-Verlauf', color: COLORS.info, description: clip(`<@${userId}>\n\n${lines.join('\n') || 'Keine Bewerbungen.'}`, 4000) }] };
}

export const simple = (description, color = COLORS.info, title) => ({ embeds: [{ ...(title ? { title: clip(title, 256) } : {}), description: clip(description, 4000), color }] });
