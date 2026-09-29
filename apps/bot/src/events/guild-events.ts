import type { GuildMember } from 'discord.js';
import { UserLeaveAction } from '@nexus/types';
import { prisma } from '@nexus/database';
import { SubmissionStatus } from '@nexus/types';
import { log } from '../logger.js';

/**
 * Server-Verlassen eines Bewerbers (§54).
 *
 * Die konfigurierte Aktion entscheidet, was mit offenen/abgeschlossenen
 * Bewerbungen passiert. Default: Nothing.
 */
export async function handleMemberRemove(member: GuildMember): Promise<void> {
  const submissions = await prisma.applicationSubmission.findMany({
    where: {
      guildId: member.guild.id,
      userId: member.id,
      status: {
        in: [
          SubmissionStatus.STARTED,
          SubmissionStatus.IN_PROGRESS,
          SubmissionStatus.PAUSED,
          SubmissionStatus.SUBMITTED,
          SubmissionStatus.UNDER_REVIEW,
        ],
      },
    },
    include: { application: true },
  });

  for (const submission of submissions) {
    const action = readLeaveAction(submission.application?.config);
    await applyLeaveAction(member.guild.id, submission.id, action);
  }

  if (submissions.length > 0) {
    log.info(
      { guildId: member.guild.id, userId: member.id, count: submissions.length },
      'Bewerber hat den Server verlassen.',
    );
  }
}

function readLeaveAction(configJson: unknown): UserLeaveAction {
  if (configJson && typeof configJson === 'object') {
    const advanced = (configJson as { advanced?: { userLeaveAction?: UserLeaveAction } }).advanced;
    if (advanced?.userLeaveAction) return advanced.userLeaveAction;
  }
  return UserLeaveAction.NOTHING;
}

async function applyLeaveAction(
  guildId: string,
  submissionId: string,
  action: UserLeaveAction,
): Promise<void> {
  switch (action) {
    case UserLeaveAction.CANCEL:
      await prisma.applicationSubmission.updateMany({
        where: { id: submissionId },
        data: { status: SubmissionStatus.CANCELLED },
      });
      break;
    case UserLeaveAction.ARCHIVE:
      await prisma.applicationSubmission.updateMany({
        where: { id: submissionId },
        data: { status: SubmissionStatus.ARCHIVED },
      });
      break;
    case UserLeaveAction.DELETE:
      await prisma.applicationAnswer.deleteMany({ where: { submissionId } });
      await prisma.applicationDMState.deleteMany({ where: { submissionId } });
      await prisma.applicationSubmission.deleteMany({ where: { id: submissionId } });
      break;
    case UserLeaveAction.MARK_AS_LEFT:
    case UserLeaveAction.DENY:
    case UserLeaveAction.NOTHING:
    default:
      // NOTHINg/MARK_AS_LEFT: nur Metadaten, Status bleibt.
      break;
  }

  await prisma.applicationAuditEvent
    .create({
      data: {
        guildId,
        submissionId,
        actorType: 'SYSTEM',
        action: 'member.left',
        after: { action },
      },
    })
    .catch(() => undefined);
}
