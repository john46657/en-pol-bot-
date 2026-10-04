import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type GuildMember, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { TicketError, claim, closeTicket, openTicket, release } from '@nexus/tickets';
import { memberCan } from '../discord/permissions.js';
import { registerButton, registerModal, registerSelect } from '../core/interaction-registry.js';
import { actorOf, ticketDiscord } from './ticket-core.js';

/**
 * Ticket-Interaktionen: Kategorie wählen (Panel-Select) → Modal (Betreff/Beschreibung) → Ticket-Kanal;
 * im Kanal: Übernehmen · Freigeben · Schließen (mit Grund per Modal). Rechte und Zustand werden jedes Mal frisch geprüft.
 */
const ID = /^[a-z0-9]{10,40}$/i;
const fail = (i: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction, e: unknown) => {
  const msg = e instanceof TicketError ? `❌ ${e.message}` : '❌ Das hat nicht geklappt. Bitte versuche es später erneut.';
  return i.replied || i.deferred ? i.editReply({ content: msg }) : i.reply({ content: msg, flags: MessageFlags.Ephemeral });
};
const input = (id: string, label: string, style: TextInputStyle, required: boolean, max: number) =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max));

export async function openFromModal(i: ModalSubmitInteraction, categoryId: string): Promise<void> {
  const member = i.member as GuildMember | null;
  if (!i.guild || !member) return;
  if (!(await memberCan(member, 'tickets.create'))) return void (await i.reply({ content: '❌ Du darfst keine Tickets eröffnen.', flags: MessageFlags.Ephemeral }));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const t = await openTicket({ guildId: i.guild.id, userId: member.id, username: member.displayName, categoryId, subject: i.fields.getTextInputValue('subject'), description: i.fields.getTextInputValue('description') || undefined }, ticketDiscord());
    await i.editReply({ content: `✅ Dein Ticket wurde eröffnet: <#${t.channelId}>` });
  } catch (e) {
    await fail(i, e);
  }
}

registerSelect('ticket:pick', async (i) => {
  const categoryId = i.values[0] ?? '';
  if (!ID.test(categoryId)) return void (await i.reply({ content: '⚠️ Ungültige Auswahl.', flags: MessageFlags.Ephemeral }));
  const modal = new ModalBuilder().setCustomId(`nexus:ticket:new:${categoryId}`).setTitle('Neues Ticket').addComponents(input('subject', 'Betreff', TextInputStyle.Short, true, 100), input('description', 'Worum geht es?', TextInputStyle.Paragraph, false, 1500));
  await i.showModal(modal);
});

registerModal('ticket:new', async (i, { args }) => {
  const categoryId = args[0] ?? '';
  if (!ID.test(categoryId)) return void (await i.reply({ content: '⚠️ Ungültige Kategorie.', flags: MessageFlags.Ephemeral }));
  await openFromModal(i, categoryId);
});

for (const [action, run] of [
  ['ticket:claim', claim],
  ['ticket:release', release],
] as const) {
  registerButton(action, async (i, { args }) => {
    const member = i.member as GuildMember | null;
    const id = args[0] ?? '';
    if (!i.guild || !member || !ID.test(id)) return void (await i.reply({ content: '⚠️ Das geht hier nicht.', flags: MessageFlags.Ephemeral }));
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await run(i.guild.id, id, await actorOf(member), ticketDiscord());
      await i.editReply({ content: action === 'ticket:claim' ? '✅ Du bearbeitest dieses Ticket jetzt.' : '✅ Ticket freigegeben.' });
    } catch (e) {
      await fail(i, e);
    }
  });
}

registerButton('ticket:close', async (i, { args }) => {
  const id = args[0] ?? '';
  if (!ID.test(id)) return void (await i.reply({ content: '⚠️ Ungültiges Ticket.', flags: MessageFlags.Ephemeral }));
  await i.showModal(new ModalBuilder().setCustomId(`nexus:ticket:closem:${id}`).setTitle('Ticket schließen').addComponents(input('reason', 'Grund (optional)', TextInputStyle.Short, false, 300)));
});

registerModal('ticket:closem', async (i, { args }) => {
  const member = i.member as GuildMember | null;
  const id = args[0] ?? '';
  if (!i.guild || !member || !ID.test(id)) return void (await i.reply({ content: '⚠️ Das geht hier nicht.', flags: MessageFlags.Ephemeral }));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const r = await closeTicket(i.guild.id, id, i.fields.getTextInputValue('reason') || undefined, await actorOf(member), ticketDiscord());
    await i.editReply({ content: `✅ Ticket geschlossen (${r.transcriptMessages} Nachrichten gesichert).${r.contentAvailable ? '' : '\n⚠️ Nachrichteninhalte waren nicht lesbar – Message-Content-Intent aktivieren.'}` });
  } catch (e) {
    await fail(i, e);
  }
});

