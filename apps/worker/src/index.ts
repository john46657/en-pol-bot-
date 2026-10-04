import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { restDiscordPort } from '@nexus/automation';
import { watchOverlongShifts } from '@nexus/shifts';

/**
 * NEXUS Worker (Phase 0): verbindet sich mit Redis und betreibt die System-Queue.
 * Fachliche Jobs (Timeouts, Berichte, Sync …) kommen in Phase 31 dazu.
 */
const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const prefix = process.env['QUEUE_PREFIX'] ?? 'nexus';
const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const queue = new Queue('system', { connection, prefix });
const worker = new Worker(
  'system',
  async (job) => {
    if (job.name === 'shift-watch') {
      const token = process.env['DISCORD_TOKEN'];
      if (!token) {
        log.warn('shift-watch übersprungen: DISCORD_TOKEN fehlt');
        return { skipped: true };
      }
      const r = await watchOverlongShifts(restDiscordPort(token), new Date(), process.env['DASHBOARD_URL']);
      if (r.flagged.length) log.info({ flagged: r.flagged.length }, 'ungewöhnlich lange Schichten gemeldet');
      return { checked: r.checked, flagged: r.flagged.length };
    }
    log.debug({ jobId: job.id, name: job.name }, 'job verarbeitet');
    return { at: new Date().toISOString() };
  },
  { connection, prefix },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'job fehlgeschlagen'));

await queue.upsertJobScheduler('heartbeat', { every: 60_000 }, { name: 'heartbeat' });
await queue.upsertJobScheduler('shift-watch', { every: 5 * 60_000 }, { name: 'shift-watch' });
log.info('Worker gestartet');

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Worker fährt herunter');
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
