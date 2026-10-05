import type { Guild } from 'discord.js';
import { prisma } from '@nexus/database';
import { getSettings, listCategories, openTicket } from '@nexus/tickets';
import { ticketDiscord } from '../tickets/ticket-core.js';

export type ApplicationTicketResult = { ok: true; channelId: string | null; existing: boolean } | { ok: false; message: string };

/**
 * Bewerbungsticket zu einer Bewerbung eröffnen (Knopf „Ticket öffnen“ oder automatisch nach dem Absenden). Kategorie:
 * die der Bewerbungsart (`review.ticketCategoryId`), sonst die Server-Einstellung, sonst die erste aktive. Gibt es schon
 * ein offenes Ticket zu dieser Bewerbung, wird keines doppelt angelegt.
 */
export async function openApplicationTicket(guild: Guild, submissionId: string, openedBy: string): Promise<ApplicationTicketResult> {
  const s = await prisma.applicationSubmission.findFirst({ where: { id: submissionId, guildId: guild.id }, include: { application: true } });
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  const existing = await prisma.ticket.findFirst({ where: { guildId: guild.id, submissionId, status: { not: 'CLOSED' } } });
  if (existing) return { ok: true, channelId: existing.channelId, existing: true };
  const applicant = await guild.members.fetch(s.userId).catch(() => null);
  if (!applicant) return { ok: false, message: 'Der Bewerber ist nicht (mehr) auf dem Server.' };
  const categories = await listCategories(guild.id, true);
  const own = (s.application.config as { review?: { ticketCategoryId?: string } } | null)?.review?.ticketCategoryId;
  const configured = (await getSettings(guild.id)).applicationCategoryId;
  const cat = categories.find((c) => c.id === own) ?? categories.find((c) => c.id === configured) ?? categories[0];
  if (!cat) return { ok: false, message: 'Es gibt keine aktive Ticket-Kategorie. Lege im Dashboard eine an.' };
  const t = await openTicket(
    { guildId: guild.id, userId: s.userId, username: applicant.displayName, categoryId: cat.id, subject: `Bewerbung – ${s.application.name}`.slice(0, 100), roleIds: [...applicant.roles.cache.keys()], submission: { id: s.id, name: s.application.name }, openedBy },
    ticketDiscord(),
  );
  return { ok: true, channelId: t.channelId, existing: false };
}
