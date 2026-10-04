import { Redis } from 'ioredis';

/**
 * Gesundheitsstatus (Phase 35). Jeder Prozess (Bot, Worker) schreibt regelmäßig einen **Herzschlag** nach Redis
 * (`nexus:health:<dienst>`, läuft nach {@link HEARTBEAT_TTL_S} Sekunden ab). Die Statusprüfung liest sie zusammen mit
 * Datenbank und Redis selbst und liefert pro Komponente 🟢 / 🟡 / 🔴. Die Ausgabe enthält nie Geheimnisse oder Fehlertexte
 * der Infrastruktur (nur kurze, feste Aussagen).
 */
export type Service = 'bot' | 'worker';
export type State = 'up' | 'degraded' | 'down';
export type ComponentName = 'api' | 'database' | 'redis' | 'discord' | 'bot' | 'workers';

export interface Component {
  state: State;
  detail: string;
}
export interface HealthReport {
  status: State;
  checkedAt: string;
  components: Record<ComponentName, Component>;
}
export interface Heartbeat {
  at: string;
  /** dienstspezifisch, z. B. `{ ready: true, ping: 42, guilds: 3 }` für den Bot. */
  info?: Record<string, string | number | boolean | null>;
}

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TTL_S = 120;
/** Ein Herzschlag gilt als „verspätet“ (🟡), wenn er älter als diese Zeit ist, aber noch nicht abgelaufen. */
export const HEARTBEAT_LATE_MS = 75_000;
const key = (prefix: string, s: Service): string => `${prefix}:health:${s}`;

/** Minimalschnittstelle, damit Tests ohne Redis auskommen. */
export interface KeyValue {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, mode: 'EX', ttl: number): Promise<unknown>;
  ping(): Promise<unknown>;
}

export async function writeHeartbeat(kv: KeyValue, service: Service, info?: Heartbeat['info'], prefix = 'nexus', now = new Date()): Promise<void> {
  const beat: Heartbeat = { at: now.toISOString(), ...(info ? { info } : {}) };
  await kv.set(key(prefix, service), JSON.stringify(beat), 'EX', HEARTBEAT_TTL_S);
}

/** Startet den regelmäßigen Herzschlag (best effort – Fehler stören den Dienst nie). Gibt eine Stop-Funktion zurück. */
export function startHeartbeat(redisUrl: string, service: Service, getInfo: () => Heartbeat['info'], prefix = process.env['QUEUE_PREFIX'] ?? 'nexus'): () => void {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on('error', () => undefined);
  const beat = (): void => void writeHeartbeat(redis, service, getInfo(), prefix).catch(() => undefined);
  // Ohne Offline-Warteschlange schlägt ein Schreibzugriff vor der Verbindung fehl → erst bei „ready“ der erste Herzschlag
  redis.on('ready', beat);
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    redis.disconnect();
  };
}

export interface CheckDeps {
  /** Datenbank erreichbar? (z. B. `SELECT 1`) */
  database: () => Promise<unknown>;
  redis: KeyValue | null;
  prefix?: string;
  now?: Date;
  /** Höchstdauer je Prüfung (ms). */
  timeoutMs?: number;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref())]);

async function readBeat(kv: KeyValue, prefix: string, s: Service, ms: number): Promise<Heartbeat | null> {
  const raw = await withTimeout(kv.get(key(prefix, s)), ms);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Heartbeat;
    return typeof b.at === 'string' ? b : null;
  } catch {
    return null;
  }
}

/** Gesamtstatus: Datenbank „down“ ⇒ down; sonst jede Nicht-„up“-Komponente ⇒ degraded. */
export function overall(c: Record<ComponentName, Component>): State {
  if (c.database.state === 'down' || c.api.state === 'down') return 'down';
  return Object.values(c).every((x) => x.state === 'up') ? 'up' : 'degraded';
}

export async function checkHealth(deps: CheckDeps): Promise<HealthReport> {
  const now = deps.now ?? new Date();
  const prefix = deps.prefix ?? process.env['QUEUE_PREFIX'] ?? 'nexus';
  const ms = deps.timeoutMs ?? 2000;
  const components = {
    api: { state: 'up', detail: 'läuft' },
    database: { state: 'down', detail: 'nicht erreichbar' },
    redis: { state: 'down', detail: 'nicht erreichbar' },
    discord: { state: 'down', detail: 'keine Verbindung gemeldet' },
    bot: { state: 'down', detail: 'kein Lebenszeichen' },
    workers: { state: 'down', detail: 'kein Lebenszeichen' },
  } as Record<ComponentName, Component>;

  try {
    await withTimeout(deps.database(), ms);
    components.database = { state: 'up', detail: 'erreichbar' };
  } catch {
    /* bleibt down */
  }

  if (deps.redis) {
    try {
      await withTimeout(deps.redis.ping(), ms);
      components.redis = { state: 'up', detail: 'erreichbar' };
      const [bot, worker] = await Promise.all([readBeat(deps.redis, prefix, 'bot', ms), readBeat(deps.redis, prefix, 'worker', ms)]);
      const judge = (b: Heartbeat | null, what: string): Component => {
        if (!b) return { state: 'down', detail: 'kein Lebenszeichen' };
        const age = now.getTime() - new Date(b.at).getTime();
        return age > HEARTBEAT_LATE_MS ? { state: 'degraded', detail: `${what} meldet sich verspätet (${Math.round(age / 1000)} s)` } : { state: 'up', detail: 'aktiv' };
      };
      components.bot = judge(bot, 'Bot');
      components.workers = judge(worker, 'Worker');
      // Discord = Gateway-Verbindung des Bots (kein eigener Aufruf an Discord pro Statusabfrage)
      if (bot && components.bot.state !== 'down') {
        const ready = bot.info?.['ready'] === true;
        const ping = typeof bot.info?.['ping'] === 'number' ? (bot.info['ping'] as number) : null;
        components.discord = !ready ? { state: 'down', detail: 'Bot nicht mit Discord verbunden' } : ping !== null && ping > 1500 ? { state: 'degraded', detail: `langsam (${ping} ms)` } : { state: 'up', detail: ping !== null ? `verbunden (${ping} ms)` : 'verbunden' };
      }
    } catch {
      components.redis = { state: 'down', detail: 'nicht erreichbar' };
    }
  } else {
    components.redis = { state: 'down', detail: 'nicht konfiguriert' };
  }

  return { status: overall(components), checkedAt: now.toISOString(), components };
}

const ICON: Record<State, string> = { up: '🟢', degraded: '🟡', down: '🔴' };
const LABEL: Record<ComponentName, string> = { api: 'API', database: 'Datenbank', redis: 'Redis', discord: 'Discord', bot: 'Bot', workers: 'Workers' };

/** Textdarstellung, z. B. für `/health` im Bot. */
export function renderHealth(r: HealthReport): string {
  const rows = (Object.keys(LABEL) as ComponentName[]).map((n) => `${ICON[r.components[n].state]} ${LABEL[n].padEnd(10)} ${r.components[n].detail}`);
  const head = r.status === 'up' ? '🟢 **Alles in Ordnung**' : r.status === 'degraded' ? '🟡 **Eingeschränkt**' : '🔴 **Störung**';
  return `${head}\n\`\`\`\n${rows.join('\n')}\n\`\`\``;
}
