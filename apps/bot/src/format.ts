/** Discord-unabhängige Nachrichtenmodelle + Formatierung (einfach testbar). */
/** `author`: kleine Zeile über dem Titel (z. B. Server-Name mit Icon oder @Benutzer mit Profilbild, wie bei Trident). */
export interface EmbedData { title: string; description?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: string; thumbnail?: string; author?: { name: string; iconUrl?: string }; /** großes Bild (https:// oder attachment://datei) */ image?: string }
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
    case 'workflow.message': {
      // Studio-Workflow: Titel/Text kommen aus der Vorlage im Dashboard (Werte schon eingesetzt)
      const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? parseInt(p.color.slice(1), 16) : COLORS.info;
      return { title: clip(plain(p.title), 256), ...(p.text ? { description: clip(plain(p.text), 4000) } : {}), color, footer: clip(`Workflow: ${String(p.workflow ?? '')}`, 200) };
    }
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
      // wie im alten Bot: „Status 1: Geringe Kriminalität.“ + Text der Stufe (Ping der eingestellten Rolle macht die Outbox)
      return { title: clip(`${String(p.name ?? p.level)}${p.title ? `: ${String(p.title)}` : ''}`, 256), color: hexColor(p.color, COLORS.warning),
        description: clip(`${String(p.text ?? '')}${p.reason ? `\n\n**Hinweis:** ${plain(p.reason)}` : ''}`, 4000) || undefined,
        footer: clip(`${p.previous ? `Vorher: ${String(p.previous)} · ` : ''}Gesetzt von ${String(p.setBy ?? 'System')}`, 200) };
    }
    case 'duty.changed': {
      const st = String(p.status), prev = String(p.previous ?? 'OFF_DUTY');
      const who = `${p.callsign ? `${plain(p.callsign)} · ` : ''}${plain(p.name)}`;
      const mins = typeof p.previousMinutes === 'number' && prev !== 'OFF_DUTY' ? ` – ${fmtDuration(p.previousMinutes * 60)}` : '';
      return { title: clip(`${DUTY_DE[st]?.emoji ?? '•'} ${who} ist jetzt ${DUTY_DE[st]?.label ?? label(st)}`, 256), color: DUTY_DE[st]?.color ?? COLORS.neutral,
        description: clip([p.discordId ? `<@${String(p.discordId)}>` : null, p.shiftType ? `Schicht: **${plain(p.shiftType)}**` : null, `Vorher: ${DUTY_DE[prev]?.label ?? label(prev)}${mins}`, p.setBy ? `Gesetzt von: ${plain(p.setBy)}` : null].filter(Boolean).join('\n'), 1000) };
    }
    case 'leave.requested':
      // wie Trident: oben @Benutzer mit Profilbild (setzt der Bot), Grund + Dauer, unten die ID
      return { title: 'Abmeldeantrag', color: COLORS.warning,
        description: clip(`${p.discordId ? `<@${String(p.discordId)}>` : plain(p.name)} möchte sich abmelden.`, 4000),
        fields: [{ name: 'Grund', value: clip(plain(p.reason), 1024) }, { name: 'Dauer', value: leaveSpan(p) }, { name: 'Zeitraum', value: `<t:${unixOf(p.startsAt)}:f> – <t:${unixOf(p.endsAt)}:f>` }],
        footer: `ID: ${String(p.number)}` };
    case 'leave.log': {
      const ev = LEAVE_EVENTS[String(p.event)] ?? { text: String(p.event), color: COLORS.neutral };
      return { title: clip(`${ev.text}: ${plain(p.name)} (${String(p.number)})`, 256), color: ev.color,
        description: clip([p.discordId ? `<@${String(p.discordId)}>` : null, `**Zeitraum:** ${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)} (${leaveSpan(p)})`, `**Grund:** ${plain(p.reason)}`, p.decidedByName ? `**Entschieden von:** ${plain(p.decidedByName)}` : null, p.decisionReason ? `**Begründung:** ${plain(p.decisionReason)}` : null].filter(Boolean).join('\n'), 4000) };
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
const LEAVE_EVENTS: Record<string, { text: string; color: number }> = {
  approved: { text: '✅ Abmeldung angenommen', color: COLORS.success }, denied: { text: '❌ Abmeldung abgelehnt', color: COLORS.danger },
  started: { text: '🏝️ Abmeldung beginnt', color: COLORS.info }, ended: { text: '👋 Abmeldung beendet', color: COLORS.neutral },
  ended_early: { text: '↩️ Abmeldung vorzeitig beendet', color: COLORS.neutral }, cancelled: { text: '↩️ Abmeldung zurückgezogen', color: COLORS.neutral },
};
const unixOf = (v: unknown) => Math.floor(new Date(String(v)).getTime() / 1000);
/** Dauer menschenlesbar: „6 Stunden“, „1 Tag“, „2 Wochen“, „1 Woche, 2 Tage“. */
export function humanDuration(ms: number): string {
  const H = 3_600_000, D = 24 * H, W = 7 * D;
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const parts: string[] = [];
  let rest = Math.max(H, Math.round(ms / H) * H);
  if (rest >= W && rest % D === 0) { parts.push(n(Math.floor(rest / W), 'Woche', 'Wochen')); rest %= W; }
  if (rest >= D) { parts.push(n(Math.floor(rest / D), 'Tag', 'Tage')); rest %= D; }
  if (rest >= H) parts.push(n(Math.round(rest / H), 'Stunde', 'Stunden'));
  return parts.join(', ');
}
const leaveSpan = (p: Record<string, unknown>) => humanDuration(new Date(String(p.endsAt)).getTime() - new Date(String(p.startsAt)).getTime());
/** Kopfzeile der DMs: Server, auf dem die Abmeldung beantragt wurde (Name + Icon). */
const guildAuthor = (p: Record<string, unknown>) => (p.guildName ? { name: clip(String(p.guildName), 200), ...(typeof p.guildIcon === 'string' && /^https:\/\//.test(p.guildIcon) ? { iconUrl: p.guildIcon } : {}) } : undefined);

/** Direktnachricht nach der Entscheidung über eine Abmeldung (Textfassung, z. B. für Logs/Tests). */
export function leaveDecisionText(p: Record<string, unknown>): string {
  const when = `${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)}`;
  return p.status === 'APPROVED'
    ? `✅ Deine Abmeldung **${String(p.number)}** (${when}) wurde **angenommen**.${p.decisionReason ? `\n\n**Hinweis:** ${clip(plain(p.decisionReason), 1000)}` : ''}`
    : `❌ Deine Abmeldung **${String(p.number)}** (${when}) wurde **abgelehnt**.${p.decisionReason ? `\n\n**Grund:** ${clip(plain(p.decisionReason), 1000)}` : ''}`;
}

/** DMs zu Abmeldungen als Embed (wie Trident): ausstehend (gelb), angenommen (grün), abgelehnt (rot). */
export function leaveDirectEmbed(type: string, p: Record<string, unknown>): EmbedData {
  const author = guildAuthor(p);
  const server = plain(p.guildName ?? 'dem Server');
  const end = unixOf(p.endsAt);
  const base = { ...(author ? { author } : {}), footer: `ID: ${String(p.number)}` };
  if (type === 'leave.pending') return { ...base, title: 'Abmeldung ausstehend', color: COLORS.warning,
    description: `Deine Abmeldung wurde der Leitung zur Freigabe vorgelegt.\nWenn sie angenommen wird, endet sie ungefähr <t:${end}:F> (<t:${end}:R>).\nUm deine Abmeldung zu verwalten, nutze \`/leave manage\` auf **${server}**.` };
  if (p.status === 'APPROVED') return { ...base, title: 'Abmeldung angenommen', color: COLORS.success,
    description: `Deine Abmeldung endet ungefähr <t:${end}:F> (<t:${end}:R>).\nUm deine Abmeldung zu verwalten, nutze \`/leave manage\` auf **${server}**.`,
    ...(p.decisionReason ? { fields: [{ name: 'Hinweis', value: clip(plain(p.decisionReason), 1024) }] } : {}) };
  return { ...base, title: 'Abmeldung abgelehnt', color: COLORS.danger,
    description: `Falls du denkst, dass das ein Fehler war, wende dich an die Leitung von **${server}**.`,
    ...(p.decisionReason ? { fields: [{ name: 'Grund', value: clip(plain(p.decisionReason), 1024) }] } : {}) };
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
  if (type === 'academy.course') return [academyCourseEmbed(p)];
  const e = renderOutbox(type, p);
  return e ? [e] : null;
}

/** Ankündigung eines Akademie-Kurses (Rollen-Ping kommt über `pingRoleIds`). */
export function academyCourseEmbed(p: Record<string, unknown>): EmbedData {
  const when = typeof p.when === 'string' && !Number.isNaN(Date.parse(p.when)) ? Math.floor(Date.parse(p.when) / 1000) : null;
  const fields = [
    ...(when ? [{ name: '🕒 Termin', value: `<t:${when}:F> (<t:${when}:R>)`, inline: true }] : []),
    ...(p.location ? [{ name: '📍 Ort', value: clip(plain(p.location), 1024), inline: true }] : []),
    { name: '🎯 Bestehensgrenze', value: `${Number(p.passScore) || 0} Punkte`, inline: true },
    ...(p.instructorName ? [{ name: '👮 Ausbilder', value: clip(plain(p.instructorName), 1024), inline: true }] : []),
  ];
  return { title: clip(`🎓 Akademie: ${String(p.title ?? 'Kurs')}`, 256), color: COLORS.info, ...(p.description ? { description: clip(String(p.description), 4000) } : {}), fields, footer: 'Akademie · EN Polizei' };
}

/** Buttons unter Channel-Benachrichtigungen: Annehmen/Ablehnen (auch mit Grund), Verlauf, Ticket, Dashboard. */
export function outboxButtons(type: string, p: Record<string, unknown>): ButtonSpec[] | undefined {
  if (type === 'leave.requested' && typeof p.id === 'string') return [
    { id: `leave:decide:${p.id}:APPROVED`, label: 'Annehmen', style: 'success', emoji: '✔️' }, { id: `leave:reason:${p.id}:DENIED`, label: 'Ablehnen', style: 'danger', emoji: '✖️' },
    ...(typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary' as const, url: p.dashboardUrl }] : []),
  ];
  if (type === 'academy.course' && typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl)) return [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }];
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
/** Gefahrenstatus aus der API: aktuelle Stufe (`def`), alle Stufen (Buttons) und Panel-Texte – alles im Dashboard einstellbar. */
export interface DangerLevelView { key: string; name: string; title: string; emoji: string; color: string; buttonStyle: ButtonSpec['style'] }
export interface DangerState { level: string; reason?: string | null; setByName?: string | null; at?: string | null; def?: DangerLevelView & { text?: string }; levels?: DangerLevelView[]; panel?: { title: string; text: string; buttonEmoji: string } }
const hexColor = (v: unknown, fallback: number) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : fallback);
/** Panel wie im alten Bot: Titel, Erklärung, darunter der aktuelle Stand mit Zeitpunkt. */
export function dangerEmbed(s: DangerState): EmbedData {
  const d = s.def;
  const current = d ? `**Aktuell:** ${d.emoji} ${plain(d.name)}${d.title ? ` – ${plain(d.title)}` : ''}${s.reason ? `\n${clip(plain(s.reason), 300)}` : ''}` : '';
  const when = s.at ? `\n<t:${Math.floor(new Date(s.at).getTime() / 1000)}:f>` : '';
  return { title: clip(s.panel?.title ?? 'Gefahrenstatus', 256), color: hexColor(d?.color, COLORS.danger), description: clip(`${s.panel?.text ?? ''}${current ? `\n\n${current}` : ''}${when}`, 4000),
    ...(s.setByName ? { footer: `Gesetzt von ${clip(s.setByName, 100)}` } : {}) };
}
export function dangerButtons(s: DangerState): ButtonSpec[] {
  return (s.levels ?? []).slice(0, 10).map((l) => ({ id: `danger:set:${l.key}`, label: clip(l.name, 80), emoji: s.panel?.buttonEmoji || l.emoji || undefined, style: l.buttonStyle ?? 'danger' }));
}

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

/** DM: „Bist du noch im Dienst?“ mit Buttons – oder Hinweis, dass die Schicht automatisch beendet wurde. */
export function dutyReminderDm(p: Record<string, unknown>): { embed: EmbedData; buttons?: ButtonSpec[] } {
  const idle = Number(p.idleMinutes ?? 0), auto = Number(p.autoOffMinutes ?? 0);
  if (p.kind === 'ended') return { embed: { title: '⚪ Schicht automatisch beendet', color: COLORS.neutral, description: `Du warst seit **${idle} Minuten** nicht aktiv und hast auf die Erinnerung nicht reagiert – deshalb bist du jetzt **außer Dienst**.${p.shiftMinutes ? `\nDeine Schicht lief ${Number(p.shiftMinutes)} Minuten.` : ''}\n\nNeu starten: Dienst-Panel, \`/dienst an\` oder im Dashboard.` } };
  return {
    embed: { title: '⏰ Bist du noch im Dienst?', color: COLORS.warning, description: `Du bist **im Dienst**, hast aber seit **${idle} Minuten** nichts gemacht (Dashboard/MDT, Discord).${auto ? `\nOhne Reaktion endet deine Schicht in **${auto} Minuten** automatisch.` : ''}` },
    buttons: [{ id: 'duty:still', label: 'Bin noch im Dienst', style: 'success', emoji: '✅' }, { id: 'duty:OFF_DUTY', label: 'Außer Dienst', style: 'danger', emoji: '⚪' }],
  };
}
