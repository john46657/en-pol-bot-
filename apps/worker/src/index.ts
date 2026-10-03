import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';

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
    log.debug({ jobId: job.id, name: job.name }, 'job verarbeitet');
    return { at: new Date().toISOString() };
  },
  { connection, prefix },
);

worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'job fehlgeschlagen'));

await queue.upsertJobScheduler('heartbeat', { every: 60_000 }, { name: 'heartbeat' });
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
