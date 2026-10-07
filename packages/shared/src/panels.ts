import { z } from 'zod';
import type { EmbedSpec, MessageSpec } from './tickets';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const emoji = z.string().trim().max(64);
const imageRef = z.union([z.string().trim().max(500).regex(/^(https:\/\/\S+|media:[0-9a-f-]{36})$/, 'Bild: https://-Link oder hochgeladene Datei'), z.literal('')]).default('');
const toInt = (hex: string) => parseInt(hex.slice(1), 16);

// ───────────── Staff-Liste (Discord-Teamliste nach Rollen) ─────────────

export const staffSectionSchema = z.object({
  roleId: sf,
  /** eigene Überschrift statt der Rollen-Erwähnung (leer = @Rolle) */
  label: z.string().max(100).default(''),
  /** Trennlinie nach diesem Abschnitt */
  divider: z.boolean().default(true),
});
export const staffListSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  title: z.string().max(256).default('EN | Staff-Team'),
  intro: z.string().max(1000).default(''),
  color: color.default('#2b2d31'),
  sections: z.array(staffSectionSchema).max(40).default([]),
  /** Text, wenn niemand die Rolle hat */
  emptyText: z.string().max(50).default('/'),
  dividerText: z.string().max(60).default('━━━━━━━━━━━━━━━━━━━━'),
  /** Mitglieder als Erwähnung (@Name, wie im Screenshot) oder als Anzeigename */
  mention: z.boolean().default(true),
  /** wer mehrere Rollen der Liste hat, steht nur unter der obersten */
  onlyHighest: z.boolean().default(false),
  bullet: z.string().max(8).default('•'),
  footer: z.string().max(200).default(''),
  timestamp: z.boolean().default(true),
  /** automatisch aktualisieren, sobald sich Rollen ändern */
  autoUpdate: z.boolean().default(true),
  image: imageRef,
});
export type StaffList = z.infer<typeof staffListSchema>;
export interface StaffMember { id: string; name: string; roleIds: string[] }

/** Staff-Liste als Discord-Nachricht (wird vom Bot und von der Vorschau im Dashboard gleich gerechnet). */
export function renderStaffList(l: StaffList, members: StaffMember[], roleName: (id: string) => string = (id) => `<@&${id}>`, now = new Date()): MessageSpec {
  const used = new Set<string>();
  const blocks: string[] = [];
  l.sections.forEach((s, i) => {
    let list = members.filter((m) => m.roleIds.includes(s.roleId));
    if (l.onlyHighest) { list = list.filter((m) => !used.has(m.id)); list.forEach((m) => used.add(m.id)); }
    list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const head = s.label ? `**${s.label}**` : roleName(s.roleId);
    const lines = list.length ? list.map((m) => `${l.bullet} ${l.mention ? `<@${m.id}>` : m.name}`) : [`${l.bullet} ${l.emptyText || '/'}`];
    blocks.push(`${head}\n${lines.join('\n')}${s.divider && i < l.sections.length - 1 ? `\n\n${l.dividerText}` : ''}`);
  });
  // in Embeds verteilen (Beschreibung max. 4096 Zeichen)
  const texts: string[] = [];
  let cur = l.intro ? `${l.intro}\n\n${l.dividerText}\n\n` : '';
  for (const b of blocks) {
    if ((cur + b).length > 3900 && cur) { texts.push(cur); cur = ''; }
    cur += `${b}\n\n`;
  }
  texts.push(cur || (l.sections.length ? '' : 'Noch keine Rollen eingetragen.'));
  const c = toInt(l.color);
  const embeds: EmbedSpec[] = texts.map((t, i) => ({ color: c, ...(i === 0 && l.title ? { title: l.title } : {}), description: t.trim() || '​' }));
  const last = embeds.at(-1)!;
  if (l.image) last.image = l.image;
  if (l.footer) last.footer = l.footer;
  if (l.timestamp) last.timestamp = now.toISOString();
  return { embeds: embeds.slice(0, 10) };
}

// ───────────── Formular-Panels (Button → Formular → Nachricht) ─────────────

export const panelFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/, 'Kürzel: a–z, 0–9, _'),
  label: z.string().trim().min(1).max(45),
  placeholder: z.string().max(100).default(''),
  long: z.boolean().default(false),
  required: z.boolean().default(true),
  maxLength: z.number().int().min(1).max(4000).default(200),
});
export const formPanelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  active: z.boolean().default(true),
  /** Panel-Nachricht mit Button */
  channelId: sf.nullable().default(null),
  panelTitle: z.string().max(256).default('Funk- und Roblox-Daten'),
  panelText: z.string().max(4000).default('Klicke unten auf den Button und trage deine Daten ein.'),
  panelColor: color.default('#22c55e'),
  panelImage: imageRef,
  buttonLabel: z.string().trim().min(1).max(80).default('Daten eintragen'),
  buttonEmoji: emoji.default('📝'),
  buttonStyle: z.enum(['primary', 'secondary', 'success', 'danger']).default('success'),
  /** Formular */
  modalTitle: z.string().trim().min(1).max(45).default('Deine Daten'),
  fields: z.array(panelFieldSchema).min(1).max(5).default([{ id: 'zello', label: 'Zello Funk', placeholder: 'Zello-Name', long: false, required: true, maxLength: 100 }, { id: 'roblox', label: 'Roblox User', placeholder: 'Roblox-Name', long: false, required: true, maxLength: 100 }]),
  /** Ergebnis-Nachricht */
  targetChannelId: sf.nullable().default(null),
  template: z.string().min(1).max(2000).default('Zello Funk: {zello}\n\nRoblox User: {roblox}'),
  /** als Embed statt Text */
  asEmbed: z.boolean().default(false),
  embedTitle: z.string().max(256).default(''),
  embedColor: color.default('#3b82f6'),
  /** Nachricht mit Namen und Profilbild der Person posten (Webhook – der Bot braucht „Webhooks verwalten“) */
  asUser: z.boolean().default(true),
  reactions: z.array(emoji.min(1)).max(10).default(['✅']),
  pingRoleIds: z.array(sf).max(10).default([]),
  /** jede Person nur einmal (erneutes Absenden ersetzt die alte Nachricht) */
  onePerUser: z.boolean().default(true),
  confirmText: z.string().max(500).default('✅ Danke! Deine Angaben wurden gepostet.'),
  /** Rollen, die man nach dem Absenden bekommt */
  grantRoleIds: z.array(sf).max(10).default([]),
});
export type FormPanel = z.infer<typeof formPanelSchema>;
export const FORM_PANEL_VARIABLES = ['{user}', '{user.name}', '{datum}', '{zeit}'] as const;

/** Platzhalter füllen: Formularfelder ({kürzel}) und {user}, {user.name}, {datum}, {zeit}. */
export function renderPanelTemplate(tpl: string, values: Record<string, string>, user: { id: string; name: string }, now = new Date()) {
  const vars: Record<string, string> = {
    ...values, user: `<@${user.id}>`, 'user.name': user.name,
    datum: now.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }), zeit: now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }),
  };
  return tpl.replace(/\{([\w.]{1,40})\}/g, (m, k: string) => (k in vars ? vars[k]! : m)).replace(/@(everyone|here)/g, '@​$1');
}

export function formPanelMessage(p: FormPanel): MessageSpec {
  return {
    embeds: [{ title: p.panelTitle || undefined, description: p.panelText || undefined, color: toInt(p.panelColor), ...(p.panelImage ? { image: p.panelImage } : {}) }],
    buttons: [{ id: `fpanel:${p.id}`, label: p.buttonLabel, ...(p.buttonEmoji ? { emoji: p.buttonEmoji } : {}), style: p.buttonStyle }],
  };
}

export function formPanelResult(p: FormPanel, values: Record<string, string>, user: { id: string; name: string; avatar?: string }, now = new Date()): MessageSpec {
  const text = renderPanelTemplate(p.template, values, user, now).slice(0, p.asEmbed ? 4000 : 2000);
  const ping = p.pingRoleIds.map((r) => `<@&${r}>`).join(' ');
  return {
    ...(p.asEmbed
      ? { ...(ping ? { content: ping } : {}), embeds: [{ ...(p.embedTitle ? { title: renderPanelTemplate(p.embedTitle, values, user, now).slice(0, 256) } : {}), description: text, color: toInt(p.embedColor), ...(p.asUser ? {} : { author: user.name, ...(user.avatar ? { authorIcon: user.avatar } : {}) }) }] }
      : { content: `${ping ? `${ping}\n` : ''}${text}`.slice(0, 2000) }),
    mentionRoles: p.pingRoleIds,
    reactions: p.reactions,
  };
}
