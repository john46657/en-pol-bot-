import { areaOf } from '@nexus/audit';
import { auditRepository, type AuditEvent } from '@nexus/database';
import type { Permission } from '@nexus/types';
import { Redis } from 'ioredis';

/**
 * Live-System (Phase 30): Jede Aktion, die im Audit-Log landet, wird zusätzlich als **schlankes Ereignis** über
 * Redis Pub/Sub verteilt (Server · Bereich · Aktion · Datensatz-ID – **keine Inhalte**). Die API leitet es an
 * verbundene Dashboards weiter; diese laden dann gezielt nur die betroffenen Daten per REST nach (dort greifen
 * die Berechtigungen). Prozessübergreifend: Bot, Worker und API veröffentlichen, die API verteilt.
 */
export const CHANNEL = 'nexus:live';

export interface LiveEvent {
  guildId: string;
  /** Bereich aus dem Audit (`shifts`, `operations`, `tickets` …). */
  area: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  /** ISO-Zeitpunkt */
  at: string;
}

/** Welche Rechte (mindestens eines) für Ereignisse eines Bereichs nötig sind. Unbekannte Bereiche werden nie weitergegeben. */
export const AREA_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  applications: ['applications.submissions.view'],
  roles: ['roles.view'],
  personnel: ['personnel.view'],
  promotions: ['promotions.view'],
  training: ['training.view', 'own.training.view'],
  shifts: ['shifts.view', 'duty.view', 'own.shift.view'],
  operations: ['operations.view'],
  wanted: ['wanted.view'],
  penalties: ['penalties.view', 'fleet.view'],
  danger: ['danger.view'],
  tickets: ['tickets.view'],
  absences: ['absence.view', 'own.absence.create'],
  sek: ['sek.view'],
  radio: ['radio.view'],
  reports: ['report.view'],
};

export const eventOf = (e: AuditEvent): LiveEvent => ({ guildId: e.guildId, area: areaOf(e.action), action: e.action, resourceType: e.resourceType, resourceId: e.resourceId, at: e.createdAt.toISOString() });

/** Registriert den Veröffentlicher: jeder Audit-Eintrag dieses Prozesses wird verteilt. Best Effort – Fehler stören nie. */
export function startPublisher(redisUrl: string): () => Promise<void> {
  const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on('error', () => undefined);
  const off = auditRepository.onLog((e) => {
    const ev = eventOf(e);
    if (ev.area === 'other') return;
    return redis.publish(CHANNEL, JSON.stringify(ev)).then(() => undefined, () => undefined);
  });
  return async () => {
    off();
    redis.disconnect();
  };
}

/** Abonniert alle Live-Ereignisse (für die API). Ungültige Nachrichten werden ignoriert. */
export async function subscribe(redisUrl: string, handler: (e: LiveEvent) => void): Promise<() => Promise<void>> {
  const sub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  sub.on('error', () => undefined);
  await sub.subscribe(CHANNEL);
  sub.on('message', (_c, raw) => {
    try {
      const e = JSON.parse(raw) as LiveEvent;
      if (typeof e.guildId === 'string' && typeof e.area === 'string' && typeof e.action === 'string') handler(e);
    } catch {
      /* ignorieren */
    }
  });
  return async () => {
    sub.disconnect();
  };
}

/** Bereiche, die ein Mitglied sehen darf – anhand einer Rechteprüfung „mindestens eines davon“. */
export async function allowedAreas(canAny: (keys: readonly Permission[]) => Promise<boolean>): Promise<Set<string>> {
  const out = new Set<string>();
  for (const [area, keys] of Object.entries(AREA_PERMISSIONS)) if (await canAny(keys)) out.add(area);
  return out;
}

// --- Verteiler (pro API-Prozess) -------------------------------------------------------------------------------------

export interface LiveClient {
  guildId: string;
  userId: string;
  areas: Set<string>;
  send(event: LiveEvent): void;
  close(code: number, reason: string): void;
}

/** Hält die verbundenen Dashboards je Server und verteilt Ereignisse nur an berechtigte. */
export class LiveHub {
  private readonly byGuild = new Map<string, Set<LiveClient>>();
  private total = 0;
  constructor(
    private readonly maxPerUser = 8,
    /** Obergrenze aller Verbindungen dieser API-Instanz (Speicher/Dateideskriptoren schützen). */
    private readonly maxTotal = 5000,
  ) {}

  add(c: LiveClient): boolean {
    if (this.total >= this.maxTotal) return false;
    const set = this.byGuild.get(c.guildId) ?? new Set<LiveClient>();
    if ([...set].filter((x) => x.userId === c.userId).length >= this.maxPerUser) return false;
    set.add(c);
    this.total++;
    this.byGuild.set(c.guildId, set);
    return true;
  }

  remove(c: LiveClient): void {
    const set = this.byGuild.get(c.guildId);
    if (set?.delete(c)) this.total--;
    if (set?.size === 0) this.byGuild.delete(c.guildId);
  }

  dispatch(e: LiveEvent): number {
    let n = 0;
    for (const c of this.byGuild.get(e.guildId) ?? []) {
      if (!c.areas.has(e.area)) continue; // keine Berechtigung → nichts weitergeben
      try {
        c.send(e);
        n++;
      } catch {
        this.remove(c);
      }
    }
    return n;
  }

  get size(): number {
    return this.total;
  }
}
