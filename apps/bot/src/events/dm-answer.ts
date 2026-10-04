import type { Client, Message } from 'discord.js';
import { prisma } from '@nexus/database';
import { DMPhase, SubmissionStatus } from '@nexus/types';
import { recordClarificationReply } from '@nexus/automation';
import { presentCurrent, processAnswer } from '../applications/dm-flow.js';
import { reviewPort } from '../applications/review-handlers.js';

/**
 * Eingehende DM-Nachrichten → Antwort-Verarbeitung (§18).
 *
 * Antworten niemals verlieren: ungültige Antworten werden mit Fehlermeldung quittiert, die Frage bleibt offen –
 * aber nichts Ungültiges wird gespeichert. Parallele Nachrichten werden über den Lock serialisiert (§19).
 * Nachrichten ohne laufende Bewerbung werden ignoriert (kein Spam auf beliebige DMs).
 */
export async function handleDMMessage(client: Client, message: Message): Promise<void> {
  if (!message.channel.isDMBased() || message.author.bot) return;
  if (!client.user || message.author.id === client.user.id) return;

  const state = await prisma.applicationDMState.findFirst({
    where: {
      userId: message.author.id,
      submission: {
        status: {
          in: [SubmissionStatus.STARTED, SubmissionStatus.IN_PROGRESS, SubmissionStatus.PAUSED],
        },
      },
    },
    orderBy: { lastInteractionAt: 'desc' },
    include: { submission: true },
  });
  if (!state?.submission) {
    // Keine laufende Bewerbung: vielleicht die Antwort auf eine Rückfrage des Teams
    if (message.content.trim()) {
      const r = await recordClarificationReply(reviewPort(), {
        userId: message.author.id,
        text: message.content,
      }).catch(() => ({ handled: false }));
      if (r.handled) {
        await message
          .reply('✅ Deine Antwort wurde an das Team weitergeleitet.')
          .catch(() => undefined);
      }
    }
    return;
  }
  const say = (content: string) => message.reply(content).catch(() => undefined);

  if (state.submission.status === SubmissionStatus.PAUSED) {
    await say('⏸️ Deine Bewerbung ist pausiert. Klicke auf **Fortsetzen**, um weiterzumachen.');
    return;
  }
  if (state.phase === DMPhase.INTRO && !state.currentQuestionId) {
    await say('▶️ Bitte klicke zuerst auf **Bewerbung starten**.');
    return;
  }
  if (!state.currentQuestionId) {
    await say(
      '📋 Du bist am Ende der Bewerbung. Nutze die Schaltflächen unter der Zusammenfassung zum Ändern oder Absenden.',
    );
    return;
  }

  const result = await processAnswer({
    client,
    submissionId: state.submissionId,
    userId: message.author.id,
    rawAnswer: message.content,
  });
  switch (result.kind) {
    case 'invalid':
      await say(`⚠️ ${result.errors.join('\n⚠️ ')}`);
      return;
    case 'locked':
    case 'not_found':
      await say('⚠️ Bitte warte einen Moment, deine Antwort wird verarbeitet.');
      return;
    case 'no_question':
      await say('ℹ️ Gerade ist keine Antwort nötig.');
      return;
    case 'finished':
      await say('ℹ️ Diese Bewerbung ist bereits beendet.');
      return;
    case 'stored':
      await presentCurrent(message.channel as never, state.submissionId);
  }
}
