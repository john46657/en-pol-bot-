import { Redis } from 'ioredis';
import { config } from '../config.js';
import { log } from '../logger.js';

/**
 * Redis-Clients: eine Verbindung für Locks/Cache, eine für BullMQ-Queues
 * (BullMQ braucht blockierende Clients – niemals teilen, §61).
 */
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
  log.info({ url: config.redis.url }, 'Redis verbunden.');
}

/**
 * Submission Lock (§19: Message Race Conditions).
 *
 * Verhindert parallele Verarbeitung derselben Submission: doppelte Antworten,
 * doppelte Accept/Deny-Aktionen, Antworten in falscher Reihenfolge.
 *
 * Der Lock wird automatisch freigegeben (EX) – auch wenn der Prozess stirbt.
 */
export class SubmissionLock {
  private constructor(
    private readonly client: Redis,
    private readonly key: string,
    private readonly token: string,
  ) {}

  static async acquire(
    client: Redis,
    submissionId: string,
    ttlSeconds = 30,
  ): Promise<SubmissionLock | null> {
    const key = lockKey(submissionId);
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const result = await client.set(key, token, 'PX', ttlSeconds * 1000, 'NX');
    if (result !== 'OK') return null;
    return new SubmissionLock(client, key, token);
  }

  /** Verlängert den Lock, solange die Verarbeitung läuft. */
  async extend(ttlSeconds = 30): Promise<void> {
    await this.client.pexpire(this.key, ttlSeconds * 1000);
  }

  async release(): Promise<void> {
    // Nur freigeben, wenn wir den Token noch halten (fremde Locks nicht klauen).
    const current = await this.client.get(this.key);
    if (current === this.token) {
      await this.client.del(this.key);
    }
  }
}

export function lockKey(submissionId: string): string {
  return `${config.redis.queuePrefix}:lock:submission:${submissionId}`;
}

/**
 * Führt `fn` exklusiv für eine Submission aus. Wirft, wenn der Lock nicht
 * genommen werden konnte (z. B. doppelte Aktion, §95).
 */
export async function withSubmissionLock<T>(
  submissionId: string,
  fn: (lock: SubmissionLock) => Promise<T>,
): Promise<T> {
  const lock = await SubmissionLock.acquire(redis, submissionId);
  if (!lock) {
    throw new DuplicateActionError(submissionId);
  }
  try {
    return await fn(lock);
  } finally {
    await lock.release();
  }
}

export class DuplicateActionError extends Error {
  constructor(submissionId: string) {
    super(`Aktion für ${submissionId} wird bereits ausgeführt (Lock belegt).`);
    this.name = 'DuplicateActionError';
  }
}
