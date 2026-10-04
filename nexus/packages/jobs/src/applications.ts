import { durationToSeconds } from '@nexus/core';
import { auditRepository, guildRepository, prisma } from '@nexus/database';
import type { Duration } from '@nexus/types';
import { enqueue } from './notifications.js';

/**
 * Bewerbungen: (1) **Timeouts** – offene, nicht eingereichte Bewerbungen (gestartet/in Arbeit/pausiert) laufen ab, wenn die
 * in der Bewerbung festgelegte Zeitgrenze (`requirements.timeLimit`, ab Start) überschritten ist; der Bewerber wird
 * informiert, der Vorgang protokolliert. (2) **Erinnerungen** – Bewerber nach 24 h ohne Aktivität (einmalig, vor Ablauf),
 * Team bei eingereichten Bewerbungen, die länger als 48 h auf Bearbeitung warten (einmalig je Bewerbung).
 */
const OPEN = ['STARTED', 'IN_PROGRESS', 'PAUSED'] as const;
export const APPLICANT_REMINDER_AFTER_MS = 24 * 3600_000;
export const STAFF_REMINDER_AFTER_MS = 48 * 3600_000;

const limitOf = (config: unknown): number => durationToSeconds(((config as { requirements?: { enabled?: boolean; timeLimit?: Duration } } | null)?.requirements)?.timeLimit);

export async function expireStaleApplications(now = new Date()): Promise<{ expired: number }> {
  const open = await prisma.applicationSubmission.findMany({ where: { status: { in: [...OPEN] }, isTest: false }, include: { application: { select: { name: true, config: true } } } });
  let expired = 0;
  for (const s of open) {
    const seconds = limitOf(s.application.config);
    if (seconds <= 0 || s.startedAt.getTime() + seconds * 1000 > now.getTime()) continue;
    const r = await prisma.applicationSubmission.updateMany({ where: { id: s.id, status: { in: [...OPEN] } }, data: { status: 'EXPIRED' } });
    if (r.count === 0) continue;
    await prisma.applicationDMState.deleteMany({ where: { submissionId: s.id } });
    await auditRepository.log({ guildId: s.guildId, actorId: null, action: 'submission.expired', resource: ['ApplicationSubmission', s.id], before: { status: s.status } as never, after: { status: 'EXPIRED', application: s.application.name } as never, automation: 'application-timeout', reason: 'Zeitlimit der Bewerbung abgelaufen' });
    await enqueue({ guildId: s.guildId, target: { kind: 'USER', id: s.userId }, kind: 'application.expired', dedupeKey: `application-expired:${s.id}`, payload: { content: `⌛ Deine Bewerbung „${s.application.name}“ ist abgelaufen, weil sie nicht rechtzeitig abgeschlossen wurde. Du kannst sie jederzeit neu starten.` } });
    expired++;
  }
  return { expired };
}

export async function applicationReminders(now = new Date()): Promise<{ applicants: number; staff: number }> {
  let applicants = 0;
  let staff = 0;
  const open = await prisma.applicationSubmission.findMany({ where: { status: { in: [...OPEN] }, isTest: false }, include: { application: { select: { name: true, config: true } }, dmState: true } });
  for (const s of open) {
    const last = s.dmState?.lastInteractionAt ?? s.startedAt;
    if (now.getTime() - last.getTime() < APPLICANT_REMINDER_AFTER_MS) continue;
    const limit = limitOf(s.application.config);
    const left = limit > 0 ? s.startedAt.getTime() + limit * 1000 - now.getTime() : null;
    if (left !== null && left <= 0) continue; // läuft ab – kein Erinnern mehr
    const note = left !== null ? ` (noch ca. ${Math.max(1, Math.round(left / 3600_000))} Std. Zeit)` : '';
    if (await enqueue({ guildId: s.guildId, target: { kind: 'USER', id: s.userId }, kind: 'application.reminder', dedupeKey: `application-reminder:${s.id}`, payload: { content: `📝 Du hast deine Bewerbung „${s.application.name}“ noch nicht abgeschlossen${note}. Mach einfach hier in den Direktnachrichten weiter.` } })) applicants++;
  }
  const waiting = await prisma.applicationSubmission.findMany({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, isTest: false, submittedAt: { lte: new Date(now.getTime() - STAFF_REMINDER_AFTER_MS) } }, include: { application: { select: { name: true } } } });
  const channels = new Map<string, string | undefined>();
  for (const s of waiting) {
    if (!channels.has(s.guildId)) channels.set(s.guildId, (await guildRepository.getSelections(s.guildId))['application-review-channel']);
    const ch = channels.get(s.guildId);
    if (!ch) continue;
    const days = Math.floor((now.getTime() - (s.submittedAt?.getTime() ?? now.getTime())) / 86_400_000);
    if (await enqueue({ guildId: s.guildId, target: { kind: 'CHANNEL', id: ch }, kind: 'application.review-reminder', dedupeKey: `review-reminder:${s.id}`, payload: { content: `⏰ Die Bewerbung **${s.submissionNumber ?? s.id}** (${s.application.name}) von <@${s.userId}> wartet seit ${Math.max(2, days)} Tagen auf Bearbeitung.`, allowed_mentions: { parse: [] } } as never })) staff++;
  }
  return { applicants, staff };
}
