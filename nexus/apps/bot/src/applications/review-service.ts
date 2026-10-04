import { EmbedBuilder } from 'discord.js';
import { prisma } from '@nexus/database';
import { createAuditEvent } from '@nexus/database';

/**
 * Notizen und Verlauf (§34/§35). Die Entscheidung über Bewerbungen (Annehmen/Ablehnen, Pipeline, Rollen,
 * Benachrichtigungen) liegt gemeinsam für Bot und Dashboard in `@nexus/automation` (`application-review`).
 */

// --- Notizen (§35) ----------------------------------------------------------

export async function addNote(input: {
  guildId: string;
  submissionId: string;
  authorId: string;
  content: string;
  mentions?: string[];
}): Promise<{ ok: boolean; message: string }> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: input.submissionId, guildId: input.guildId },
  });
  if (!submission) return { ok: false, message: 'Bewerbung nicht gefunden.' };

  await prisma.applicationNote.create({
    data: {
      submissionId: submission.id,
      authorId: input.authorId,
      content: input.content,
      mentions: input.mentions ?? [],
    },
  });
  await createAuditEvent({
    guildId: input.guildId,
    submissionId: submission.id,
    actorType: 'USER',
    actorId: input.authorId,
    action: 'note.created',
    after: { content: input.content.slice(0, 200) },
  });
  return { ok: true, message: 'Notiz gespeichert.' };
}

// --- History (§34) -----------------------------------------------------------

export async function buildHistoryEmbed(
  guildId: string,
  submissionId: string,
): Promise<EmbedBuilder> {
  const submission = await prisma.applicationSubmission.findFirst({
    where: { id: submissionId, guildId },
  });
  const events = await prisma.applicationAuditEvent.findMany({
    where: { submissionId },
    orderBy: { createdAt: 'asc' },
  });

  const embed = new EmbedBuilder()
    .setTitle(`📜 History – ${submission?.submissionNumber ?? submissionId}`)
    .setColor(0x5865f2);

  const lines = events.map((e) => {
    const time = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:t> `;
    const actor = e.actorId ? ` von <@${e.actorId}>` : '';
    return `${time}**${e.action}**${actor}`;
  });
  embed.setDescription(lines.slice(0, 20).join('\n') || 'Keine Ereignisse.');
  return embed;
}
