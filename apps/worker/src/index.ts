import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { restDiscordPort, type DiscordPort } from '@nexus/automation';
import {
  JOBS,
  absenceEndReminders,
  applicationReminders,
  computeSnapshots,
  deliver,
  dueReports,
  expireStaleApplications,
  runJob,
  syncAllGuilds,
  forwardAuditLogs,
  trainingReminders,
} from '@nexus/jobs';
import { startHeartbeat } from '@nexus/health';
import { startPublisher } from '@nexus/realtime';
import { watchOverlongShifts } from '@nexus/shifts';
import { expireDueRestrictions } from '@nexus/restrictions';
import { expireDueNotices } from '@nexus/wanted';
import { deleteDueChannels, refreshAllPanels, restTicketDiscord } from '@nexus/tickets';

/**
 * NEXUS Worker: betreibt die Hintergrund-Jobs (Phase 31) über BullMQ – Benachrichtigungen, Bewerbungs-Timeouts,
 * Erinnerungen, Tages-/Wochenberichte, Statistik-Snapshots, Discord-Synchronisierung, Schichtwächter. Jeder Lauf wird
 * in `job_runs` protokolliert (Dashboard „Automatisierung“); ein fehlgeschlagener Job beeinflusst die anderen nicht.
 */
const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const prefix = process.env['QUEUE_PREFIX'] ?? 'nexus';
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
startPublisher(redisUrl); // Aktionen des Workers live ans Dashboard (best effort)
const stopHeartbeat = startHeartbeat(redisUrl, 'worker', () => ({ discord: !!process.env['DISCORD_TOKEN'] }), prefix);

const token = process.env['DISCORD_TOKEN'];
const port = (): DiscordPort => {
  if (!token) throw new Error('DISCORD_TOKEN fehlt');
  return restDiscordPort(token);
};

/** Was jeder Job tut. */
const HANDLERS: Record<string, () => Promise<unknown>> = {
  notifications: () => deliver(port()),
  'application-timeouts': () => expireStaleApplications(),
  reminders: async () => ({ applications: await applicationReminders(), training: await trainingReminders(), absences: await absenceEndReminders() }),
  reports: () => dueReports(port()),
  'stat-snapshots': () => computeSnapshots(),
  'discord-sync': async () => {
    if (!token) throw new Error('DISCORD_TOKEN fehlt');
    return syncAllGuilds(token);
  },
  'ticket-cleanup': async () => {
    if (!token) throw new Error('DISCORD_TOKEN fehlt');
    const discord = restTicketDiscord(token);
    return { ...(await deleteDueChannels(discord)), panelsUpdated: await refreshAllPanels(discord) };
  },
  'restriction-expiry': () => expireDueRestrictions(),
  'wanted-expiry': () => expireDueNotices(),
  'log-forward': () => forwardAuditLogs(),
  'shift-watch': () => watchOverlongShifts(port(), new Date(), process.env['DASHBOARD_URL']),
};

const queue = new Queue('system', { connection, prefix });
const worker = new Worker(
  'system',
  async (job) => {
    const handler = HANDLERS[job.name];
    if (!handler) {
      log.debug({ jobId: job.id, name: job.name }, 'job verarbeitet');
      return { at: new Date().toISOString() };
    }
    const r = await runJob(job.name, handler);
    if (!r.ok) log.error({ job: job.name, error: r.error }, 'Job fehlgeschlagen');
    else log.debug({ job: job.name, result: r.result }, 'Job ok');
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  },
  { connection, prefix, concurrency: 2 },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'job fehlgeschlagen'));
// Prozessweite Fehler protokollieren; ein verlorener Promise darf den Worker nicht stillschweigend beenden
process.on('unhandledRejection', (reason) => log.error({ err: String(reason) }, 'Unhandled Rejection.'));
process.on('uncaughtException', (error) => {
  log.fatal({ err: String(error) }, 'Uncaught Exception – Worker wird beendet.');
  process.exit(1);
});

await queue.upsertJobScheduler('heartbeat', { every: 60_000 }, { name: 'heartbeat' });
for (const j of JOBS) await queue.upsertJobScheduler(j.name, { every: j.everyMs }, { name: j.name });
log.info({ jobs: JOBS.map((j) => j.name), discord: !!token }, 'Worker gestartet');
if (!token) log.warn('DISCORD_TOKEN fehlt – Jobs mit Discord-Zugriff schlagen fehl und werden protokolliert (Benachrichtigungen bleiben in der Warteschlange).');

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Worker fährt herunter');
  stopHeartbeat();
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
