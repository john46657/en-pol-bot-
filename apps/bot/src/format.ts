/** Discord-unabhängige Nachrichtenmodelle + Formatierung (einfach testbar). */
export interface EmbedData { title: string; description?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: string }
export interface Reply { content?: string; embeds?: EmbedData[]; ephemeral?: boolean }

export const COLORS = { info: 0x3b82f6, success: 0x22c55e, warning: 0xf59e0b, danger: 0xef4444, neutral: 0x64748b } as const;
const PRIORITY_COLOR: Record<string, number> = { LOW: COLORS.neutral, MEDIUM: COLORS.info, HIGH: COLORS.warning, URGENT: COLORS.danger, CRITICAL: COLORS.danger };

/** Discord-Limits: Titel 256, Beschreibung 4096, Feldwert 1024. */
export const clip = (s: unknown, max: number) => { const t = String(s ?? '—'); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
export const label = (s: unknown) => String(s ?? '—').replace(/_/g, ' ');
/** Markdown aus Nutzerdaten entschärfen (Backticks, Pings, Formatierung). */
export const plain = (s: unknown) => String(s ?? '—').replace(/[*_`~|>\\]/g, '\\$&').replace(/@(everyone|here)/g, '@\u200b$1');

export const errorReply = (text: string): Reply => ({ content: `❌ ${text}`, ephemeral: true });
export const okReply = (text: string): Reply => ({ content: `✅ ${text}`, ephemeral: true });

export interface Row { id?: string; [k: string]: unknown }

export function personEmbed(p: Row, extra: { tickets?: number; wanted?: boolean } = {}): EmbedData {
  return {
    title: clip(`👤 ${p.robloxUsername}`, 256), color: extra.wanted ? COLORS.warning : COLORS.info,
    fields: [
      { name: 'Roblox-ID', value: clip(p.robloxUserId ?? 'unbekannt', 1024), inline: true },
      { name: 'Status', value: label(p.status), inline: true },
      ...(extra.tickets !== undefined ? [{ name: 'Tickets', value: String(extra.tickets), inline: true }] : []),
      ...((p.aliases as string[] | undefined)?.length ? [{ name: 'Aliase', value: clip((p.aliases as string[]).map(plain).join(', '), 1024) }] : []),
      ...(p.notes ? [{ name: 'Notizen', value: clip(plain(p.notes), 1024) }] : []),
    ],
    footer: extra.wanted ? '⚠️ Mit Fahndungseintrag verknüpft (ggf. erledigt) — Status im System prüfen' : undefined,
  };
}

export const vehicleEmbed = (v: Row): EmbedData => ({
  title: clip(`🚗 ${v.plate}`, 256), color: COLORS.info,
  fields: [
    { name: 'Modell', value: clip(plain(v.model), 1024), inline: true }, { name: 'Farbe', value: clip(plain(v.color), 1024), inline: true },
    { name: 'Halter', value: clip(plain((v.owner as Row | null)?.robloxUsername), 1024), inline: true }, { name: 'Status', value: label(v.status), inline: true },
  ],
});

export const incidentLine = (i: Row) => `**${i.number}** · ${plain(i.title)} — ${label(i.priority)} / ${label(i.status)}${i.location ? ` · ${plain(i.location)}` : ''}`;

export function listEmbed(title: string, lines: string[], empty: string): EmbedData {
  return { title: clip(title, 256), description: clip(lines.length ? lines.join('\n') : empty, 4000), color: COLORS.info };
}

// ---- Outbox-Benachrichtigungen ----
export function renderOutbox(type: string, p: Record<string, unknown>): EmbedData | null {
  switch (type) {
    case 'incident.created':
      return { title: `🚨 Neuer Einsatz: ${clip(plain(p.title), 200)}`, color: PRIORITY_COLOR[String(p.priority)] ?? COLORS.info, fields: [{ name: 'Nummer', value: String(p.number), inline: true }, { name: 'Priorität', value: label(p.priority), inline: true }, { name: 'Ort', value: clip(plain(p.location ?? 'unbekannt'), 1024), inline: true }] };
    case 'incident.assigned':
      return { title: `📻 ${plain(p.callsign)} → ${p.number}`, description: clip(plain(p.title), 4000), color: PRIORITY_COLOR[String(p.priority)] ?? COLORS.info, fields: [{ name: 'Ort', value: clip(plain(p.location ?? 'unbekannt'), 1024), inline: true }] };
    case 'wanted.created':
      return { title: `🔴 Neue Fahndung (${p.kind === 'vehicle' ? 'Fahrzeug' : 'Person'})`, description: `**${clip(plain(p.subject), 200)}**\n${clip(plain(p.reason), 3000)}`, color: PRIORITY_COLOR[String(p.priority)] ?? COLORS.danger, fields: [{ name: 'Priorität', value: label(p.priority), inline: true }] };
    case 'announcement':
      return { title: '📢 Ankündigung', description: clip(plain(p.body), 4000), color: COLORS.warning, footer: `von ${clip(p.author, 100)}` };
    default:
      return null;
  }
}
