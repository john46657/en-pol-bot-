/** Discord-unabhängige Nachrichtenmodelle + Formatierung (einfach testbar). */
export interface EmbedData { title: string; description?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: string; thumbnail?: string }
/** `url`: Link-Button (öffnet die Adresse, löst keine Interaktion aus). */
export interface ButtonSpec { id: string; label: string; style: 'primary' | 'secondary' | 'success' | 'danger'; emoji?: string; url?: string }
/** Auswahlmenü; `id` wie bei Buttons `prefix:arg`. `kind`: Text-Optionen (Standard), Discord-Benutzer oder -Rollen. */
export interface SelectSpec { id: string; placeholder: string; options: { label: string; value: string; description?: string; emoji?: string }[]; kind?: 'string' | 'user' | 'role'; min?: number; max?: number }
export interface ModalField { id: string; label: string; paragraph?: boolean; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string }
export interface ModalSpec { id: string; title: string; fields: ModalField[] }
/** `decided`: die Nachricht mit dem geklickten Button wird aktualisiert (Farbe, Feld „Entscheidung“, Entscheidungs-Buttons entfernt). */
export interface Reply {
  content?: string; embeds?: EmbedData[]; ephemeral?: boolean; buttons?: ButtonSpec[]; select?: SelectSpec; selects?: SelectSpec[]; modal?: ModalSpec; decided?: { text: string; color: number };
  /** Nachricht mit dem geklickten Button/Menü ersetzen (z. B. beantwortete Frage); ohne Buttons = Komponenten entfernen. */
  update?: { embeds?: EmbedData[]; buttons?: ButtonSpec[] };
}

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
      return {
        title: `🚨 Neue Fahndung (${p.kind === 'vehicle' ? 'Fahrzeug' : 'Person'})`, description: `**${clip(plain(p.subject), 200)}**\n${clip(plain(p.reason), 1500)}${p.description ? `\n\n${clip(plain(p.description), 2000)}` : ''}`,
        color: PRIORITY_COLOR[String(p.priority)] ?? COLORS.danger,
        fields: [{ name: 'Priorität', value: label(p.priority), inline: true }, { name: 'Gültig bis', value: p.expiresAt ? `<t:${Math.floor(Date.parse(String(p.expiresAt)) / 1000)}:f>` : 'unbefristet', inline: true }, ...(p.createdBy ? [{ name: 'Ausgestellt von', value: clip(plain(p.createdBy), 200), inline: true }] : [])],
      };
    case 'wanted.status': {
      const st: Record<string, [string, number]> = { CLEARED: ['✅ Fahndung aufgehoben', COLORS.success], CANCELLED: ['⚪ Fahndung abgebrochen', COLORS.info], ACTIVE: ['🚨 Fahndung wieder aktiv', COLORS.danger], EXPIRED: ['⌛ Fahndung abgelaufen', COLORS.info] };
      const [title, color] = st[String(p.status)] ?? [`Fahndung: ${label(p.status)}`, COLORS.info];
      return { title, description: `**${clip(plain(p.subject), 200)}** – ${clip(plain(p.reason), 1000)}${p.note ? `\n**Grund:** ${clip(plain(p.note), 1000)}` : ''}`, color, ...(p.by ? { footer: `von ${clip(plain(p.by), 100)}` } : {}) };
    }
    case 'teamchance.changed':
      return p.open
        ? { title: `📣 ${clip(plain(p.title ?? 'Team-Chance'), 200)} – jetzt offen!`, description: clip(plain(p.description ?? ''), 3500) || undefined, color: COLORS.success,
          fields: [...(p.closesAt ? [{ name: 'Bewerbungsschluss', value: `<t:${Math.floor(Date.parse(String(p.closesAt)) / 1000)}:f>`, inline: true }] : []), ...(Number(p.slots) > 0 ? [{ name: 'Plätze', value: String(p.slots), inline: true }] : [])] }
        : { title: `🔒 ${clip(plain(p.title ?? 'Team-Chance'), 200)} – geschlossen`, description: 'Vielen Dank für alle Bewerbungen!', color: COLORS.danger };
    case 'announcement':
      return { title: '📢 Ankündigung', description: clip(plain(p.body), 4000), color: COLORS.warning, footer: `von ${clip(p.author, 100)}` };
    case 'danger.changed': {
      const d = DANGER[String(p.level)] ?? DANGER.GREEN!;
      return { title: `${d.emoji} Gefahrenstatus: ${d.label}`, description: p.reason ? clip(plain(p.reason), 1000) : undefined, color: d.color, fields: [{ name: 'Vorher', value: (DANGER[String(p.previous)]?.label) ?? '—', inline: true }, { name: 'Gesetzt von', value: clip(plain(p.setBy ?? 'System'), 200), inline: true }] };
    }
    case 'duty.changed': {
      const st = String(p.status), prev = String(p.previous ?? 'OFF_DUTY');
      const who = `${p.callsign ? `${plain(p.callsign)} · ` : ''}${plain(p.name)}`;
      const mins = typeof p.previousMinutes === 'number' && prev !== 'OFF_DUTY' ? ` – ${fmtDuration(p.previousMinutes * 60)}` : '';
      return { title: clip(`${DUTY_DE[st]?.emoji ?? '•'} ${who} ist jetzt ${DUTY_DE[st]?.label ?? label(st)}`, 256), color: DUTY_DE[st]?.color ?? COLORS.neutral,
        description: clip([p.discordId ? `<@${String(p.discordId)}>` : null, p.shiftType ? `Schicht: **${plain(p.shiftType)}**` : null, `Vorher: ${DUTY_DE[prev]?.label ?? label(prev)}${mins}`, p.setBy ? `Gesetzt von: ${plain(p.setBy)}` : null].filter(Boolean).join('\n'), 1000) };
    }
    case 'leave.requested':
      return { title: clip(`📅 Abmeldung ${String(p.number)} – ${plain(p.name)}`, 256), color: COLORS.warning,
        description: clip(`${p.discordId ? `<@${String(p.discordId)}> ` : ''}möchte sich abmelden.\n\n**Grund:** ${plain(p.reason)}`, 4000),
        fields: [{ name: 'Von', value: berlinDate(p.startsAt), inline: true }, { name: 'Bis', value: berlinDate(p.endsAt), inline: true }, { name: 'Dauer', value: leaveDays(p), inline: true }] };
    case 'leave.log': {
      const ev = LEAVE_EVENTS[String(p.event)] ?? { text: String(p.event), color: COLORS.neutral };
      return { title: clip(`${ev.text}: ${plain(p.name)} (${String(p.number)})`, 256), color: ev.color,
        description: clip([p.discordId ? `<@${String(p.discordId)}>` : null, `**Zeitraum:** ${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)} (${leaveDays(p)})`, `**Grund:** ${plain(p.reason)}`, p.decidedByName ? `**Entschieden von:** ${plain(p.decidedByName)}` : null, p.decisionReason ? `**Begründung:** ${plain(p.decisionReason)}` : null].filter(Boolean).join('\n'), 4000) };
    }
    case 'sek.report':
      return { title: `🎯 SEK-Einsatzbericht ${p.number}`, color: COLORS.neutral, description: clip(plain(p.description), 3500), fields: [
        { name: 'Einsatzart', value: clip(plain(p.missionType), 200), inline: true }, { name: 'Datum', value: new Date(String(p.occurredAt)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }), inline: true }, { name: 'Beamter', value: clip(plain(p.author), 200), inline: true }] };
    default:
      return null;
  }
}

// ---- Eingegangene Bewerbungen im Team-Channel (wie Appy) ----
const unix = (iso: unknown) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
export const fmtDuration = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)} min ${sec % 60}s` : `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`);
/** Gesamtbudget der Embeds einer Nachricht (Discord: 6000 Zeichen) – Platz lassen für das spätere Feld „Entscheidung“. */
const BUDGET = 4800;

/** Fragen fett + nummeriert, Antwort darunter, am Ende die Bewerber-Infos. Lange Bewerbungen werden auf mehrere Embeds verteilt bzw. gekürzt. */
export function applicationEmbeds(p: Record<string, unknown>, kind: 'q' | 'p'): EmbedData[] {
  const qa = Array.isArray(p.answers) ? (p.answers as { question?: unknown; answer?: unknown }[]) : [];
  const id = String(p.discordId ?? '');
  const joined = unix(p.joinedAt), submitted = unix(p.createdAt);
  const stats = ['**Bewerber-Infos**',
    ...(id ? [`Discord-ID: \`${id}\``, `Benutzername: \`${plain(p.discordName ?? '—')}\``, `Benutzer: <@${id}>`] : ['Quelle: Web-Formular (kein Discord)']),
    ...(kind === 'p' ? [`Roblox: \`${plain(p.robloxUsername)}\`${p.robloxUserId ? ` (\`${String(p.robloxUserId)}\`)` : ''}`] : [p.linkedName ? `Im System: **${plain(p.linkedName)}**` : 'Im System: nicht verknüpft']),
    ...(typeof p.durationSec === 'number' ? [`Dauer: \`${fmtDuration(p.durationSec)}\``] : []),
    ...(joined ? [`Server beigetreten: <t:${joined}:R>`] : []),
    ...(submitted ? [`Eingereicht: <t:${submitted}:R>`] : []),
    ...(p.guildName ? [`Server: \`${plain(p.guildName)}\``] : []),
  ].join('\n');
  const section = (q: { question?: unknown; answer?: unknown }, i: number, max?: number) => {
    const a = plain(q.answer) || '—';
    return `**${i + 1}. ${clip(plain(q.question), 200)}**\n${max !== undefined && a.length > max ? `${a.slice(0, max)}… *(gekürzt)*` : a}`;
  };
  let sections = qa.map((q, i) => section(q, i));
  // wie bei Appy: „john45346s Bewerbung ‚Flugstaffel‘ eingereicht“
  const who = p.discordName ? `${plain(p.discordName)}s ` : '';
  const title = clip(kind === 'p' ? `📋 ${who}Bewerbung bei EN Polizei eingereicht · ${p.number}` : `📋 ${who}Bewerbung „${plain(p.unitName)}“ eingereicht · ${p.number}`, 256);
  // Platz für Titel (bis zu 10 Embeds) und Bewerber-Infos abziehen
  const room = BUDGET - stats.length - (title.length + 20) * 3;
  const size = (xs: string[]) => xs.reduce((n, x) => n + x.length + 2, 0);
  if (size(sections) > room) {
    const questions = qa.reduce((n, q, i) => n + section({ question: q.question, answer: '' }, i).length + 15, 0);
    const per = Math.max(40, Math.floor((room - questions) / Math.max(1, qa.length)));
    sections = qa.map((q, i) => section(q, i, per));
  }
  // passt es immer noch nicht (sehr viele Fragen), den Rest nur als Hinweis – vollständig im Dashboard
  if (size(sections) > room) {
    const kept: string[] = [];
    for (const x of sections) { if (size(kept) + x.length + 2 > room - 120) break; kept.push(x); }
    kept.push(`*… und ${sections.length - kept.length} weitere Antworten – vollständig im Dashboard.*`);
    sections = kept;
  }
  const embeds: EmbedData[] = [];
  let cur = '';
  for (const piece of [...sections, stats]) {
    if (cur && cur.length + piece.length + 2 > 4000) { embeds.push({ title: embeds.length ? `${title} (Fortsetzung)` : title, color: COLORS.warning, description: cur }); cur = ''; }
    cur = cur ? `${cur}\n\n${piece}` : clip(piece, 4000);
  }
  embeds.push({ title: embeds.length ? `${title} (Fortsetzung)` : title, color: COLORS.warning, description: cur });
  return embeds.slice(0, 10);
}

/** Alle Embeds einer Channel-Benachrichtigung (Bewerbungen ggf. mehrere). */
const berlinDate = (v: unknown) => { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const leaveDays = (p: Record<string, unknown>) => { const d = Math.max(1, Math.round((new Date(String(p.endsAt)).getTime() - new Date(String(p.startsAt)).getTime()) / 86_400_000)); return `${d} ${d === 1 ? 'Tag' : 'Tage'}`; };
const LEAVE_EVENTS: Record<string, { text: string; color: number }> = {
  approved: { text: '✅ Abmeldung angenommen', color: COLORS.success }, denied: { text: '❌ Abmeldung abgelehnt', color: COLORS.danger },
  started: { text: '🏝️ Abmeldung beginnt', color: COLORS.info }, ended: { text: '👋 Abmeldung beendet', color: COLORS.neutral },
  ended_early: { text: '↩️ Abmeldung vorzeitig beendet', color: COLORS.neutral }, cancelled: { text: '↩️ Abmeldung zurückgezogen', color: COLORS.neutral },
};
/** Direktnachricht nach der Entscheidung über eine Abmeldung. */
export function leaveDecisionText(p: Record<string, unknown>): string {
  const when = `${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)}`;
  return p.status === 'APPROVED'
    ? `✅ Deine Abmeldung **${String(p.number)}** (${when}) wurde **angenommen**.${p.decisionReason ? `\n\n**Hinweis:** ${clip(plain(p.decisionReason), 1000)}` : ''}`
    : `❌ Deine Abmeldung **${String(p.number)}** (${when}) wurde **abgelehnt**.${p.decisionReason ? `\n\n**Grund:** ${clip(plain(p.decisionReason), 1000)}` : ''}`;
}

export function renderOutboxEmbeds(type: string, p: Record<string, unknown>): EmbedData[] | null {
  if (type === 'qualification.submitted') return applicationEmbeds(p, 'q');
  if (type === 'application.submitted') return applicationEmbeds(p, 'p');
  // entschiedene Bewerbung für den Channel „angenommen“/„abgelehnt“ (wie bei Appy)
  if (type === 'qualification.archived' || type === 'application.archived') {
    const accepted = p.status === 'ACCEPTED';
    const embeds = applicationEmbeds(p, type === 'application.archived' ? 'p' : 'q').map((e) => ({ ...e, color: accepted ? COLORS.success : COLORS.danger }));
    const last = embeds[embeds.length - 1]!;
    last.fields = [{ name: 'Entscheidung', value: clip(`${accepted ? '✅ Angenommen' : '❌ Abgelehnt'}${p.decidedByName ? ` von ${plain(p.decidedByName)}` : ''}${p.reason ? `\n**Grund:** ${plain(p.reason)}` : ''}`, 1024) }];
    return embeds;
  }
  const e = renderOutbox(type, p);
  return e ? [e] : null;
}

/** Buttons unter Channel-Benachrichtigungen: Annehmen/Ablehnen (auch mit Grund), Verlauf, Ticket, Dashboard. */
export function outboxButtons(type: string, p: Record<string, unknown>): ButtonSpec[] | undefined {
  if (type === 'leave.requested' && typeof p.id === 'string') return [
    { id: `leave:decide:${p.id}:APPROVED`, label: 'Annehmen', style: 'success' }, { id: `leave:decide:${p.id}:DENIED`, label: 'Ablehnen', style: 'danger' },
    { id: `leave:reason:${p.id}:DENIED`, label: 'Ablehnen mit Grund', style: 'danger' },
    ...(typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary' as const, url: p.dashboardUrl }] : []),
  ];
  // Fahndung / Einsatz: Link ins Dashboard
  if (/^wanted\./.test(type) && typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl)) return [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }];
  const kind = type === 'qualification.submitted' ? 'q' : type === 'application.submitted' ? 'p' : null;
  if (!kind || typeof p.id !== 'string') return undefined;
  const id = p.id, discordId = typeof p.discordId === 'string' && /^\d{15,25}$/.test(p.discordId) ? p.discordId : null;
  return [
    { id: `quali:decide:${kind}:${id}:ACCEPTED`, label: 'Annehmen', style: 'success' },
    { id: `quali:decide:${kind}:${id}:REJECTED`, label: 'Ablehnen', style: 'danger' },
    { id: `quali:reason:${kind}:${id}:ACCEPTED`, label: 'Annehmen mit Grund', style: 'success' },
    { id: `quali:reason:${kind}:${id}:REJECTED`, label: 'Ablehnen mit Grund', style: 'danger' },
    ...(discordId ? [{ id: `quali:history:${discordId}`, label: 'Verlauf', style: 'primary' as const }, { id: `quali:ticket:${kind}:${id}`, label: 'Ticket mit Bewerber öffnen', emoji: '🎫', style: 'secondary' as const }] : []),
    ...(typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary' as const, url: p.dashboardUrl }] : []),
  ];
}

const reasonText = (p: { reason?: unknown }) => (p.reason ? `\n\n**Begründung:** ${clip(plain(p.reason), 1000)}` : '');

/** Direktnachricht nach der Entscheidung über eine Qualifikations-Bewerbung. */
export function qualificationDecisionText(p: { status?: unknown; number?: unknown; unitName?: unknown; reason?: unknown; message?: unknown }): string {
  if (typeof p.message === 'string' && p.message.trim()) return clip(p.message, 2000); // Text aus der Einrichtung (Accepted/Denied Message)
  return p.status === 'ACCEPTED'
    ? `🎉 Deine Bewerbung für **${plain(p.unitName)}** (${p.number}) wurde **angenommen** – willkommen! Ein Teammitglied meldet sich bei dir.${reasonText(p)}`
    : `Deine Bewerbung für **${plain(p.unitName)}** (${p.number}) wurde diesmal leider **nicht angenommen**. Du kannst dich später gerne erneut bewerben.${reasonText(p)}`;
}

/** Texte der Entscheidungs-Direktnachricht an Bewerber (ohne internen Grund). */
export function applicationDecisionText(p: { status?: unknown; number?: unknown; reason?: unknown; message?: unknown }): string {
  if (typeof p.message === 'string' && p.message.trim()) return clip(p.message, 2000);
  return p.status === 'ACCEPTED'
    ? `🎉 Deine Bewerbung **${p.number}** bei EN Polizei wurde **angenommen**! Ein Teammitglied meldet sich bei dir für die nächsten Schritte.${reasonText(p)}`
    : `Deine Bewerbung **${p.number}** bei EN Polizei wurde diesmal leider **nicht angenommen**. Du kannst dich gerne später erneut bewerben.${reasonText(p)}`;
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
/** Dienststatus auf Deutsch (Meldungen im Dienst-Channel, Dienst-Panel). */
export const DUTY_DE: Record<string, { label: string; emoji: string; color: number }> = {
  ON_DUTY: { label: 'im Dienst', emoji: '🟢', color: 0x22c55e }, BREAK: { label: 'in Pause', emoji: '🟡', color: 0xf59e0b },
  TRAINING: { label: 'im Training', emoji: '🔵', color: 0x3b82f6 }, ADMINISTRATIVE: { label: 'in der Verwaltung', emoji: '🔵', color: 0x06b6d4 },
  OFF_DUTY: { label: 'außer Dienst', emoji: '⚪', color: 0x64748b },
};
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
