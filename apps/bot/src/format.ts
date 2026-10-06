/** Discord-unabhängige Nachrichtenmodelle + Formatierung (einfach testbar). */
export interface EmbedData { title: string; description?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: string }
export interface ButtonSpec { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger'; emoji?: string }
export interface ModalField { id: string; label: string; paragraph?: boolean; required?: boolean; maxLength?: number; placeholder?: string }
export interface ModalSpec { id: string; title: string; fields: ModalField[] }
export interface Reply { content?: string; embeds?: EmbedData[]; ephemeral?: boolean; buttons?: ButtonSpec[]; modal?: ModalSpec }

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
    case 'danger.changed': {
      const d = DANGER[String(p.level)] ?? DANGER.GREEN!;
      return { title: `${d.emoji} Gefahrenstatus: ${d.label}`, description: p.reason ? clip(plain(p.reason), 1000) : undefined, color: d.color, fields: [{ name: 'Vorher', value: (DANGER[String(p.previous)]?.label) ?? '—', inline: true }, { name: 'Gesetzt von', value: clip(plain(p.setBy ?? 'System'), 200), inline: true }] };
    }
    case 'application.submitted':
      return { title: `📋 Neue Bewerbung ${p.number}`, color: COLORS.info, description: 'Prüfung und Entscheidung im System (Bereich *Applications*).', fields: [
        { name: 'Roblox-Name', value: clip(plain(p.robloxUsername), 200), inline: true }, { name: 'Quelle', value: p.source === 'DISCORD' ? 'Discord' : 'Web', inline: true },
        ...(p.discordId ? [{ name: 'Discord', value: `<@${String(p.discordId)}>`, inline: true }] : [])] };
    case 'sek.report':
      return { title: `🎯 SEK-Einsatzbericht ${p.number}`, color: COLORS.neutral, description: clip(plain(p.description), 3500), fields: [
        { name: 'Einsatzart', value: clip(plain(p.missionType), 200), inline: true }, { name: 'Datum', value: new Date(String(p.occurredAt)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }), inline: true }, { name: 'Beamter', value: clip(plain(p.author), 200), inline: true }] };
    case 'sek.application':
      return { title: `🎯 Neue SEK-Bewerbung ${p.number}`, color: COLORS.neutral, description: 'Entscheidung im System (Bereich *SEK*).', fields: [
        { name: 'Bewerber', value: clip(`${p.callsign ? `${plain(p.callsign)} · ` : ''}${plain(p.applicant)}${p.discordId ? ` (<@${String(p.discordId)}>)` : ''}`, 300), inline: true },
        { name: 'Dienstzeit', value: clip(plain(p.serviceTime), 200), inline: true },
        { name: 'Motivation', value: clip(plain(p.motivation), 1024) },
        ...(p.experience ? [{ name: 'Erfahrung', value: clip(plain(p.experience), 1024) }] : [])] };
    default:
      return null;
  }
}

/** Direktnachricht nach der Entscheidung über eine SEK-Bewerbung. */
export function sekDecisionText(p: { status?: unknown; number?: unknown }): string {
  return p.status === 'ACCEPTED'
    ? `🎯 Deine SEK-Bewerbung **${p.number}** wurde **angenommen** – willkommen im SEK!`
    : `Deine SEK-Bewerbung **${p.number}** wurde diesmal leider **nicht angenommen**.`;
}

/** Texte der Entscheidungs-Direktnachricht an Bewerber (ohne internen Grund). */
export function applicationDecisionText(p: { status?: unknown; number?: unknown }): string {
  return p.status === 'ACCEPTED'
    ? `🎉 Deine Bewerbung **${p.number}** bei EN Polizei wurde **angenommen**! Ein Teammitglied meldet sich bei dir für die nächsten Schritte.`
    : `Deine Bewerbung **${p.number}** bei EN Polizei wurde diesmal leider **nicht angenommen**. Du kannst dich gerne später erneut bewerben.`;
}

// ---- Gefahrenstatus ----
export const DANGER: Record<string, { label: string; emoji: string; color: number }> = {
  GREEN: { label: 'Grün – Normaler Dienst', emoji: '🟢', color: 0x2ecc71 },
  YELLOW: { label: 'Gelb – Erhöhte Vorsicht', emoji: '🟡', color: 0xf1c40f },
  RED: { label: 'Rot – Akute Gefahrenlage', emoji: '🔴', color: 0xe74c3c },
};
export interface DangerState { level: string; reason?: string | null; setByName?: string | null; at?: string | null }
export function dangerEmbed(s: DangerState): EmbedData {
  const d = DANGER[s.level] ?? DANGER.GREEN!;
  return { title: `${d.emoji} Aktueller Gefahrenstatus: ${d.label}`, color: d.color, description: s.reason ? clip(plain(s.reason), 1000) : undefined,
    fields: [...(s.setByName ? [{ name: 'Gesetzt von', value: clip(plain(s.setByName), 200), inline: true }] : []), ...(s.at ? [{ name: 'Seit', value: `<t:${Math.floor(new Date(s.at).getTime() / 1000)}:R>`, inline: true }] : [])],
    footer: 'Buttons: Status ändern (nur mit Berechtigung)' };
}
export const DANGER_BUTTONS: ButtonSpec[] = [
  { id: 'danger:set:GREEN', label: 'Grün', emoji: '🟢', style: 'success' }, { id: 'danger:set:YELLOW', label: 'Gelb', emoji: '🟡', style: 'primary' }, { id: 'danger:set:RED', label: 'Rot', emoji: '🔴', style: 'danger' },
];

// ---- Teamliste ----
export interface TeamMember { name: string; rank: string | null; callsign: string | null; team: string | null; dutyStatus: string; unit: string | null }
const DUTY_EMOJI: Record<string, string> = { ON_DUTY: '🟢', BREAK: '🟡', TRAINING: '🔵', ADMINISTRATIVE: '🔵', OFF_DUTY: '⚪' };
export function teamlistEmbed(members: TeamMember[], rankOrder: string[]): EmbedData {
  const rankOf = (m: TeamMember) => m.rank ?? 'Ohne Rang';
  const known = rankOrder.filter((r) => members.some((m) => rankOf(m) === r));
  const rest = [...new Set(members.map(rankOf))].filter((r) => !rankOrder.includes(r)).sort((a, b) => a.localeCompare(b));
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  for (const rank of [...known, ...rest]) {
    const people = members.filter((m) => rankOf(m) === rank).sort((a, b) => (a.callsign ?? '~').localeCompare(b.callsign ?? '~'));
    const lines = people.map((m) => `${DUTY_EMOJI[m.dutyStatus] ?? '⚪'} ${m.callsign ? `**${plain(m.callsign)}** ` : ''}${plain(m.name)}${m.unit ? ` · ${plain(m.unit)}` : ''}`);
    // Feldwerte sind auf 1024 Zeichen begrenzt → bei Bedarf auf mehrere Felder aufteilen
    let chunk = ''; let part = 0;
    for (const l of lines) { if ((chunk + '\n' + l).length > 1000) { fields.push({ name: part ? `${rank} (Forts.)` : `${rank} (${people.length})`, value: chunk }); chunk = ''; part++; } chunk += (chunk ? '\n' : '') + l; }
    if (chunk) fields.push({ name: part ? `${rank} (Forts.)` : `${rank} (${people.length})`, value: chunk });
  }
  const onDuty = members.filter((m) => m.dutyStatus === 'ON_DUTY').length;
  return { title: '📋 Teamliste – EN Polizei', color: COLORS.neutral, fields: fields.slice(0, 25), description: members.length ? undefined : 'Noch keine Personalakten angelegt.', footer: `${members.length} Mitglieder · ${onDuty} im Dienst · wird automatisch aktualisiert` };
}
