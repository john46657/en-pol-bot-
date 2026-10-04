import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type GuildMember, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { prisma } from '@nexus/database';
import { TicketError, claim, closeTicket, formatNumber, getSettings, getTicket, loads, openTicket, parseFormFields, pingStaff, release, PRIORITY_LABEL, type PRIORITIES } from '@nexus/tickets';
import { viewSubmission } from '@nexus/automation';
import { log } from '../logger.js';
import { memberCan, requireMemberPermission } from '../discord/permissions.js';
import { reviewPort } from '../applications/review-handlers.js';
import { registerButton, registerModal, registerSelect } from '../core/interaction-registry.js';
import { actorOf, ticketDiscord } from './ticket-core.js';

/**
 * Ticket-Interaktionen (Panel → Ticket → Bearbeitung → Schließen). Rechte und Zustand werden bei jedem Klick frisch aus
 * Datenbank und Discord geprüft, nie aus der Custom-ID abgeleitet. Fehler werden dem Nutzer verständlich gemeldet und
 * serverseitig protokolliert; interne Details gehen nie an Discord.
 */
const ID = /^[a-z0-9]{10,40}$/i;
type Any = ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;
const E = MessageFlags.Ephemeral;
const GENERIC = '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut oder wende dich an den Support.';

/** Antwortet (oder ergänzt) mit einer verständlichen Fehlermeldung; abgelaufene Interactions werden still behandelt. */
export async function fail(i: Any, e: unknown): Promise<void> {
  const known = e instanceof TicketError || (e instanceof Error && e.name === 'TicketError');
  if (!known) log.error({ err: e instanceof Error ? (e.stack ?? e.message) : String(e), customId: i.customId, guild: i.guildId }, 'Ticket-Interaktion fehlgeschlagen.');
  const msg = known ? `❌ ${(e as Error).message}` : GENERIC;
  try {
    if (i.replied || i.deferred) await i.editReply({ content: msg, embeds: [], components: [] });
    else await i.reply({ content: msg, flags: E });
  } catch (inner) {
    log.warn({ err: String(inner) }, 'Fehlermeldung konnte nicht zugestellt werden (Interaction abgelaufen?).');
  }
}

const input = (id: string, label: string, style: TextInputStyle, required: boolean, max: number, placeholder?: string) =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setMaxLength(max).setPlaceholder((placeholder ?? '').slice(0, 100)));

const dashboardUrl = (): string | undefined => process.env['DASHBOARD_URL']?.split(',')[0];
const nameOf = (i: Any, id: string): string | undefined => i.guild?.members.cache.get(id)?.displayName;
const namesFor = (i: Any, ...ids: (string | null | undefined)[]) => Object.fromEntries(ids.flatMap((id) => (id && nameOf(i, id) ? [[id, nameOf(i, id)!]] : [])));

async function create(i: StringSelectMenuInteraction | ModalSubmitInteraction, categoryId: string, answers?: { label: string; value: string }[]): Promise<void> {
  const member = i.member as GuildMember | null;
  if (!i.guild || !member) return;
  if (!(await memberCan(member, 'tickets.create'))) return void (await i.reply({ content: '❌ Du darfst keine Tickets eröffnen.', flags: E }));
  if (!i.deferred && !i.replied) await i.deferReply({ flags: E });
  try {
    const t = await openTicket({ guildId: i.guild.id, userId: member.id, username: member.displayName, categoryId, roleIds: [...member.roles.cache.keys()], ...(answers?.length ? { formAnswers: answers, subject: answers[0]!.value.slice(0, 100).padEnd(3, ' ').trim() || undefined } : {}) }, ticketDiscord());
    await i.editReply({ content: `✅ Dein Ticket wurde eröffnet: <#${t.channelId}>` });
  } catch (e) {
    await fail(i, e);
  }
}

/** Für `/ticket neu` und das Formular: eröffnet das Ticket direkt aus einem Modal mit Betreff/Beschreibung. */
export async function openFromModal(i: ModalSubmitInteraction, categoryId: string): Promise<void> {
  const member = i.member as GuildMember | null;
  if (!i.guild || !member) return;
  if (!(await memberCan(member, 'tickets.create'))) return void (await i.reply({ content: '❌ Du darfst keine Tickets eröffnen.', flags: E }));
  await i.deferReply({ flags: E });
  try {
    const t = await openTicket({ guildId: i.guild.id, userId: member.id, username: member.displayName, categoryId, roleIds: [...member.roles.cache.keys()], subject: i.fields.getTextInputValue('subject'), description: i.fields.getTextInputValue('description') || undefined }, ticketDiscord());
    await i.editReply({ content: `✅ Dein Ticket wurde eröffnet: <#${t.channelId}>` });
  } catch (e) {
    await fail(i, e);
  }
}

// --- Panel: Kategorie wählen → (Formular) → Ticket ---------------------------------------------------------------------

registerSelect('ticket:pick', async (i) => {
  const categoryId = i.values[0] ?? '';
  if (!ID.test(categoryId) || !i.guild) return void (await i.reply({ content: '⚠️ Ungültige Auswahl.', flags: E }));
  try {
    const cat = await prisma.ticketCategory.findFirst({ where: { id: categoryId, guildId: i.guild.id, active: true } });
    if (!cat) throw new TicketError('not-found', 'Diese Kategorie gibt es nicht mehr.');
    const fields = parseFormFields(cat.formFields);
    if (fields.length === 0) return await create(i, categoryId);
    // Vorab prüfen (Limit/Kapazität), damit niemand ein Formular ausfüllt, das danach abgelehnt wird
    const member = i.member as GuildMember;
    const open = await prisma.ticket.count({ where: { guildId: i.guild.id, userId: member.id, categoryId, status: { not: 'CLOSED' } } });
    if (open >= cat.maxOpenPerUser) throw new TicketError('conflict', 'Du hast bereits ein offenes Ticket.');
    const full = (await loads(i.guild.id)).find((l) => l.id === categoryId)?.level === 'full';
    if (full) throw new TicketError('conflict', `„${cat.name}“ ist aktuell voll. Bitte versuche es später erneut.`);
    await i.showModal(new ModalBuilder().setCustomId(`nexus:ticket:new:${categoryId}`).setTitle(cat.name.slice(0, 45)).addComponents(...fields.map((f) => input(f.id, f.label, f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short, f.required, f.style === 'paragraph' ? 1000 : 300, f.placeholder))));
  } catch (e) {
    await fail(i, e);
  }
});

registerModal('ticket:new', async (i, { args }) => {
  const categoryId = args[0] ?? '';
  if (!ID.test(categoryId) || !i.guild) return void (await i.reply({ content: '⚠️ Ungültige Kategorie.', flags: E }));
  const cat = await prisma.ticketCategory.findFirst({ where: { id: categoryId, guildId: i.guild.id } });
  const fields = parseFormFields(cat?.formFields);
  if (fields.length === 0) return await openFromModal(i, categoryId); // Rückfall: klassisches Betreff/Beschreibung-Formular
  await create(i, categoryId, fields.map((f) => ({ label: f.label, value: i.fields.getTextInputValue(f.id).trim() })).filter((a) => a.value));
});

// --- Im Ticket: Claim, Benachrichtigung, Informationen, Bewerbung ---------------------------------------------------------

async function ticketButton(i: ButtonInteraction, args: string[], run: (id: string, member: GuildMember) => Promise<void>): Promise<void> {
  const member = i.member as GuildMember | null;
  const id = args[0] ?? '';
  if (!i.guild || !member || !ID.test(id)) return void (await i.reply({ content: '⚠️ Das geht hier nicht.', flags: E }));
  try {
    await run(id, member);
  } catch (e) {
    await fail(i, e);
  }
}

/** Claim / Übernehmen: übernimmt; wer das Ticket schon bearbeitet, gibt es damit wieder frei. */
registerButton('ticket:claim', (i, { args }) =>
  ticketButton(i, args, async (id, member) => {
    await i.deferReply({ flags: E });
    const actor = await actorOf(member);
    const t = await getTicket(i.guild!.id, id);
    if (t.claimedBy === member.id) {
      await release(i.guild!.id, id, actor, ticketDiscord());
      await i.editReply({ content: '✅ Ticket freigegeben.' });
    } else {
      await claim(i.guild!.id, id, actor, ticketDiscord());
      await i.editReply({ content: '✅ Du bearbeitest dieses Ticket jetzt.' });
    }
  }),
);
registerButton('ticket:release', (i, { args }) =>
  ticketButton(i, args, async (id, member) => {
    await i.deferReply({ flags: E });
    await release(i.guild!.id, id, await actorOf(member), ticketDiscord());
    await i.editReply({ content: '✅ Ticket freigegeben.' });
  }),
);

registerButton('ticket:ping', (i, { args }) =>
  ticketButton(i, args, async (id, member) => {
    await i.deferReply({ flags: E });
    await pingStaff(i.guild!.id, id, await actorOf(member), ticketDiscord());
    await i.editReply({ content: '🔔 Das Team wurde benachrichtigt.' });
  }),
);

const ST = { OPEN: '🟢 Offen', IN_PROGRESS: '🔵 In Bearbeitung', WAITING: '🟡 Wartet auf Rückmeldung', CLOSED: '🔒 Geschlossen' } as const;
registerButton('ticket:info', (i, { args }) =>
  ticketButton(i, args, async (id, member) => {
    const t = await getTicket(i.guild!.id, id);
    const actor = await actorOf(member);
    if (t.userId !== member.id && !t.participantIds.includes(member.id) && !actor.handle && !actor.manage) throw new TicketError('forbidden', 'Nur Beteiligte sehen die Ticket-Informationen.');
    await i.reply({
      flags: E,
      allowedMentions: { parse: [] },
      embeds: [{ title: `📋 Ticket ${formatNumber(t.number)}`, color: t.category.color ?? 0x5865f2, fields: [
        { name: 'Ticket-ID', value: `\`${t.id}\``, inline: false },
        { name: 'Kategorie', value: `${t.category.emoji ?? ''} ${t.category.name}`.trim(), inline: true },
        { name: 'Status', value: ST[t.status], inline: true },
        { name: 'Priorität', value: PRIORITY_LABEL[t.priority as (typeof PRIORITIES)[number]] ?? t.priority, inline: true },
        { name: 'Ersteller', value: `<@${t.userId}>`, inline: true },
        { name: 'Bearbeiter', value: t.claimedBy ? `<@${t.claimedBy}>` : '–', inline: true },
        { name: 'Erstellt', value: `<t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`, inline: true },
        ...(t.participantIds.length ? [{ name: 'Weitere Beteiligte', value: t.participantIds.map((p) => `<@${p}>`).join(' '), inline: false }] : []),
      ] }],
    });
  }),
);

/** „View Applicants Application“: zeigt die vollständige Bewerbung (nur mit Bewerbungs-Rechten, privat). */
registerButton('ticket:app', (i, { args }) =>
  ticketButton(i, args, async (id) => {
    if (!(await requireMemberPermission(i, ['applications.submissions.view']))) return;
    const t = await getTicket(i.guild!.id, id);
    if (!t.submissionId) throw new TicketError('not-found', 'Zu diesem Ticket gibt es keine Bewerbung.');
    await i.deferReply({ flags: E });
    const r = await viewSubmission(reviewPort(), { submissionId: t.submissionId, guildId: i.guild!.id, reviewerId: i.user.id });
    if (!r.ok) return void (await i.editReply(`⚠️ ${r.message}`));
    await i.editReply({ content: `**${r.title}**`.slice(0, 1900), allowedMentions: { parse: [] } });
    for (const block of r.blocks) await i.followUp({ content: block.slice(0, 1900), flags: E, allowedMentions: { parse: [] } });
  }),
);

// --- Schließen: Bestätigung → Schließen / Schließen mit Grund ------------------------------------------------------

async function doClose(i: Any, id: string, member: GuildMember, reason: string | undefined): Promise<void> {
  const t = await getTicket(i.guild!.id, id);
  const r = await closeTicket(i.guild!.id, id, reason, await actorOf(member), ticketDiscord(), { dashboardUrl: dashboardUrl(), names: namesFor(i, t.userId, member.id, t.claimedBy) });
  const note = r.contentAvailable ? '' : '\n⚠️ Nachrichteninhalte waren nicht lesbar – Message-Content-Intent aktivieren.';
  const when = r.deleteAt ? `Der Kanal wird <t:${Math.floor(r.deleteAt.getTime() / 1000)}:R> gelöscht.` : '';
  // Der Kanal kann schon weg sein (sofortiges Löschen) → Antwort darf scheitern
  await i.editReply({ content: `✅ Ticket geschlossen (${r.transcriptMessages} Nachrichten gesichert). ${when}${note}`.trim(), embeds: [], components: [] }).catch(() => undefined);
}

registerButton('ticket:close', (i, { args }) =>
  ticketButton(i, args, async (id) => {
    const t = await getTicket(i.guild!.id, id);
    if (t.status === 'CLOSED') throw new TicketError('conflict', 'Dieses Ticket ist bereits geschlossen.');
    // Der Schließungsgrund ist Pflicht: das Formular fragt ihn ab und dient zugleich als Bestätigung
    await i.showModal(new ModalBuilder().setCustomId(`nexus:ticket:closem:${id}`).setTitle('Ticket schließen').addComponents(input('reason', 'Grund (z. B. Problem gelöst)', TextInputStyle.Paragraph, true, 300)));
  }),
);

registerButton('ticket:closex', async (i) => {
  await i.update({ embeds: [{ title: 'Abgebrochen', description: 'Das Ticket bleibt geöffnet.', color: 0x57f287 }], components: [] }).catch((e) => log.warn({ err: String(e) }, 'Abbrechen-Antwort fehlgeschlagen.'));
});

registerButton('ticket:closer', async (i, { args }) => {
  const id = args[0] ?? '';
  if (!ID.test(id)) return void (await i.reply({ content: '⚠️ Ungültiges Ticket.', flags: E }));
  await i.showModal(new ModalBuilder().setCustomId(`nexus:ticket:closem:${id}`).setTitle('Ticket schließen').addComponents(input('reason', 'Grund für das Schließen', TextInputStyle.Paragraph, true, 300)));
});

registerModal('ticket:closem', async (i, { args }) => {
  const member = i.member as GuildMember | null;
  const id = args[0] ?? '';
  if (!i.guild || !member || !ID.test(id)) return void (await i.reply({ content: '⚠️ Das geht hier nicht.', flags: E }));
  try {
    await i.deferReply({ flags: E });
    await doClose(i, id, member, i.fields.getTextInputValue('reason').trim() || undefined);
  } catch (e) {
    await fail(i, e);
  }
});
