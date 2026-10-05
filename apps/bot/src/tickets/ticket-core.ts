import { MessageFlags, type GuildMember } from 'discord.js';
import { restTicketDiscord, type Actor, type TicketDiscord } from '@nexus/tickets';
import { config } from '../config.js';
import { memberCan } from '../discord/permissions.js';

/** Gemeinsame Bausteine für `/ticket` und die Ticket-Buttons (Rechte werden serverseitig geprüft, nie aus der Custom-ID abgeleitet). */
let override: TicketDiscord | null = null;
/** Nur für Tests: ersetzt die Discord-REST-Anbindung. */
export const setTicketDiscordForTests = (d: TicketDiscord | null) => void (override = d);
export const ticketDiscord = (): TicketDiscord => override ?? restTicketDiscord(config.discord.token);

export async function actorOf(member: GuildMember): Promise<Actor> {
  return { userId: member.id, roleIds: [...member.roles.cache.keys()], manage: await memberCan(member, 'tickets.manage'), handle: await memberCan(member, 'tickets.handle'), rights: { claim: await memberCan(member, 'tickets.claim'), priority: await memberCan(member, 'tickets.priority.edit'), members: await memberCan(member, 'tickets.members.manage'), close: await memberCan(member, 'tickets.close'), reopen: await memberCan(member, 'tickets.reopen'), delete: await memberCan(member, 'tickets.delete'), transcriptDelete: await memberCan(member, 'tickets.transcript.delete') } };
}

export const ephemeral = MessageFlags.Ephemeral;
