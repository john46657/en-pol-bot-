import { fmtDay } from '@nexus/absences';
import { prisma } from '@nexus/database';
import { enqueue } from './notifications.js';

/** Erinnerungen: Ausbildungstermine (24 h vorher, Teilnehmer und Ausbilder) und Ende einer Abmeldung (am Vortag). Einmalig je Termin/Person. */
export async function trainingReminders(now = new Date()): Promise<{ queued: number }> {
  const soon = await prisma.training.findMany({ where: { status: 'PLANNED', scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600_000) } }, include: { course: true, participants: { where: { status: 'ENROLLED' } } } });
  let queued = 0;
  for (const t of soon) {
    const when = `<t:${Math.floor(t.scheduledAt.getTime() / 1000)}:f>`;
    const text = (role: string) => `🎓 Erinnerung (${role}): **${t.course.name}** (T-${String(t.number).padStart(4, '0')}) beginnt ${when}${t.location ? ` – ${t.location}` : ''}.`;
    for (const p of t.participants) if (await enqueue({ guildId: t.guildId, target: { kind: 'USER', id: p.userId }, kind: 'training.reminder', dedupeKey: `training-reminder:${t.id}:${p.userId}`, payload: { content: text('Teilnehmer') } })) queued++;
    for (const u of t.trainerIds) if (await enqueue({ guildId: t.guildId, target: { kind: 'USER', id: u }, kind: 'training.reminder', dedupeKey: `training-reminder:${t.id}:${u}`, payload: { content: text('Ausbilder') } })) queued++;
  }
  return { queued };
}

export async function absenceEndReminders(now = new Date()): Promise<{ queued: number }> {
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00.000Z`);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const ending = await prisma.absence.findMany({ where: { status: 'APPROVED', endDate: { gte: today, lte: tomorrow }, startDate: { lte: today } } });
  let queued = 0;
  for (const a of ending) {
    const lastDay = a.endDate.getTime() === today.getTime();
    if (await enqueue({ guildId: a.guildId, target: { kind: 'USER', id: a.userId }, kind: 'absence.ending', dedupeKey: `absence-ending:${a.id}`, payload: { content: `🏖️ Deine Abmeldung endet ${lastDay ? 'heute' : 'morgen'} (${fmtDay(a.endDate)}). Danach kannst du wieder in den Dienst gehen.` } })) queued++;
  }
  return { queued };
}
