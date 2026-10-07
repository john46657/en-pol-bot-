import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, timingSafeEqual, verify as edVerify, type KeyObject } from 'node:crypto';
import { Prisma, type ErlcServer } from '@prisma/client';
import { z } from 'zod';
import { ERLC_DEFAULT_BLOCKED, ERLC_DEFAULT_CRITICAL, ERLC_FEATURES, ERLC_POLL_OPTIONS, ERLC_STATUS_LABEL, parsePlayer, type ErlcFeature, type ErlcStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';
import { ErlcClient, type ErlcResult } from './erlc-client';
import { decryptSecret, encryptSecret } from './erlc-crypto';
import { CadNotifyService } from './cad-notify.service';

/** Öffentlicher Ed25519-Schlüssel von PRC für Event-Webhooks (https://apidocs.erlc.gg/event-webhooks). */
const PRC_WEBHOOK_KEY = 'MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA=';
const MAX_BACKOFF_MS = 5 * 60_000;
const LOG_CAP = 100;
const MASK = '••••••••••••';

const sf = z.string().regex(/^\d{15,25}$/);
const serverKey = z.string().trim().min(8, 'Server-Key zu kurz').max(256).regex(/^\S+$/, 'Server-Key darf keine Leerzeichen enthalten');
const settingsSchema = z.object({
  criticalCommands: z.array(z.string().trim().regex(/^:\w{1,32}$/)).max(60).default(ERLC_DEFAULT_CRITICAL),
  blockedCommands: z.array(z.string().trim().regex(/^:\w{1,32}$/)).max(60).default(ERLC_DEFAULT_BLOCKED),
});
export const erlcServerInput = z.object({
  name: z.string().trim().min(2).max(80),
  serverRef: z.string().trim().max(80).nullish(),
  description: z.string().trim().max(1000).nullish(),
  logoUrl: z.string().trim().max(500).regex(/^(https:\/\/|\/api\/v1\/media\/)/).nullish(),
  guildId: sf.nullish(),
  active: z.boolean().default(true),
  key: serverKey.optional(),
  pollSeconds: z.number().int().refine((v) => (ERLC_POLL_OPTIONS as readonly number[]).includes(v), `Update-Intervall: ${ERLC_POLL_OPTIONS.join(', ')} Sekunden`).default(15),
  features: z.array(z.enum(ERLC_FEATURES)).max(ERLC_FEATURES.length).default(['players', 'staff', 'queue', 'vehicles', 'emergencyCalls', 'modCalls']),
  webhookEnabled: z.boolean().default(false),
  settings: settingsSchema.partial().optional(),
});
export type ErlcServerInput = z.infer<typeof erlcServerInput>;

/** Feature → Abfrage-Parameter von GET /v2/server. */
const INCLUDE: Partial<Record<ErlcFeature, string>> = {
  players: 'Players', staff: 'Staff', queue: 'Queue', vehicles: 'Vehicles', emergencyCalls: 'EmergencyCalls', modCalls: 'ModCalls', joinLogs: 'JoinLogs', killLogs: 'KillLogs', commandLogs: 'CommandLogs',
};

export interface ErlcPlayer { name: string; id: string | null; team: string | null; callsign: string | null; permission: string | null; wantedStars: number; location: { x: number; z: number; postal: string | null; street: string | null; building: string | null } | null }
export interface ErlcSnapshot {
  fetchedAt: string;
  server: { name: string; currentPlayers: number; maxPlayers: number; joinKey: string | null; accVerifiedReq: string | null; teamBalance: boolean | null };
  players?: ErlcPlayer[];
  staff?: { admins: { id: string; name: string }[]; mods: { id: string; name: string }[]; helpers: { id: string; name: string }[] };
  queue?: string[];
  vehicles?: { name: string; owner: string; plate: string | null; texture: string | null; colorHex: string | null; colorName: string | null }[];
  emergencyCalls?: { callNumber: number; team: string | null; caller: string | null; players: string[]; x: number | null; z: number | null; startedAt: number; description: string | null; positionDescriptor: string | null }[];
  modCalls?: { caller: string; callerId: string | null; moderator: string | null; timestamp: number }[];
  joinLogs?: { join: boolean; player: string; playerId: string | null; timestamp: number }[];
  killLogs?: { killed: string; killer: string; timestamp: number }[];
  commandLogs?: { player: string; command: string; timestamp: number }[];
  webhookEvents?: { at: string; summary: string }[];
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const staffList = (v: unknown) => Object.entries((v && typeof v === 'object' ? v : {}) as Record<string, unknown>).map(([id, name]) => ({ id, name: String(name) }));
const newest = <T extends { timestamp: number }>(xs: T[]) => xs.sort((a, b) => b.timestamp - a.timestamp).slice(0, LOG_CAP);

/** Antwort von GET /v2/server → einheitliches, geheimnisfreies Format für Dashboard/CAD. */
export function normalizeSnapshot(raw: Record<string, unknown>, features: string[]): ErlcSnapshot {
  const on = (f: ErlcFeature) => features.includes(f);
  const s: ErlcSnapshot = {
    fetchedAt: new Date().toISOString(),
    server: { name: String(raw.Name ?? ''), currentPlayers: num(raw.CurrentPlayers) ?? 0, maxPlayers: num(raw.MaxPlayers) ?? 0, joinKey: str(raw.JoinKey), accVerifiedReq: str(raw.AccVerifiedReq), teamBalance: typeof raw.TeamBalance === 'boolean' ? raw.TeamBalance : null },
  };
  if (on('players')) s.players = arr(raw.Players).map((p) => {
    const who = parsePlayer(p.Player);
    const loc = p.Location as Record<string, unknown> | undefined;
    const x = num(loc?.LocationX), z = num(loc?.LocationZ);
    return { name: who.name, id: who.id, team: str(p.Team), callsign: str(p.Callsign), permission: str(p.Permission), wantedStars: num(p.WantedStars) ?? 0,
      location: x !== null && z !== null ? { x, z, postal: str(loc?.PostalCode), street: str(loc?.StreetName), building: str(loc?.BuildingNumber) } : null };
  });
  if (on('staff')) { const st = (raw.Staff ?? {}) as Record<string, unknown>; s.staff = { admins: staffList(st.Admins), mods: staffList(st.Mods), helpers: staffList(st.Helpers) }; }
  if (on('queue')) s.queue = arr(raw.Queue as unknown).map(String);
  if (on('vehicles')) s.vehicles = arr(raw.Vehicles).map((v) => ({ name: String(v.Name ?? ''), owner: String(v.Owner ?? ''), plate: str(v.Plate), texture: str(v.Texture), colorHex: str(v.ColorHex), colorName: str(v.ColorName) }));
  if (on('emergencyCalls')) s.emergencyCalls = arr(raw.EmergencyCalls).map((c) => {
    const pos = Array.isArray(c.Position) ? c.Position : [];
    return { callNumber: num(c.CallNumber) ?? 0, team: str(c.Team), caller: str(c.Caller), players: arr(c.Players as unknown).map(String), x: num(pos[0]), z: num(pos[1]), startedAt: num(c.StartedAt) ?? 0, description: str(c.Description), positionDescriptor: str(c.PositionDescriptor) };
  });
  if (on('modCalls')) s.modCalls = newest(arr(raw.ModCalls).map((m) => { const c = parsePlayer(m.Caller); return { caller: c.name, callerId: c.id, moderator: m.Moderator ? parsePlayer(m.Moderator).name : null, timestamp: num(m.Timestamp) ?? 0 }; }));
  if (on('joinLogs')) s.joinLogs = newest(arr(raw.JoinLogs).map((j) => { const p = parsePlayer(j.Player); return { join: j.Join === true, player: p.name, playerId: p.id, timestamp: num(j.Timestamp) ?? 0 }; }));
  if (on('killLogs')) s.killLogs = newest(arr(raw.KillLogs).map((k) => ({ killed: parsePlayer(k.Killed).name, killer: parsePlayer(k.Killer).name, timestamp: num(k.Timestamp) ?? 0 })));
  if (on('commandLogs')) s.commandLogs = newest(arr(raw.CommandLogs).map((c) => ({ player: parsePlayer(c.Player).name, command: String(c.Command ?? ''), timestamp: num(c.Timestamp) ?? 0 })));
  return s;
}

/** Fehler der ER:LC-API → Verbindungsstatus. */
export function statusFor(r: Extract<ErlcResult<unknown>, { ok: false }>): { status: ErlcStatus; pause: boolean; message: string } {
  if (r.network) return { status: 'OFFLINE', pause: false, message: r.message };
  if (r.status === 429) return { status: 'LIMITED', pause: false, message: 'Rate-Limit erreicht – Abrufe pausieren automatisch.' };
  if (r.code === 3002 || r.status === 422) return { status: 'OFFLINE', pause: false, message: 'Der ER:LC-Server ist gerade offline (keine Spieler).' };
  if ([2000, 2001, 2002, 2004].includes(r.code ?? -1) || r.status === 401 || r.status === 403) return { status: 'ERROR', pause: true, message: `Server-Key ungültig, abgelaufen oder gesperrt (Code ${r.code ?? r.status}). Bitte neuen Key eintragen.` };
  if (r.code === 9999) return { status: 'ERROR', pause: false, message: 'Das Modul auf dem ER:LC-Server ist veraltet (Code 9999) – Server neu starten (alle Spieler kicken).' };
  return { status: 'LIMITED', pause: false, message: `ER:LC-API-Fehler ${r.status}${r.code ? ` (Code ${r.code})` : ''}: ${r.message}` };
}

interface Runtime { nextDue: number; failures: number; inFlight: boolean; paused: boolean }

@Injectable()
export class ErlcService {
  private readonly log = new Logger('ERLC');
  readonly client: ErlcClient;
  private readonly rt = new Map<string, Runtime>();
  private webhookKey: KeyObject;
  private readonly seen = new Map<string, number>();

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly realtime: RealtimeService, private readonly notify: CadNotifyService) {
    this.client = new ErlcClient();
    this.webhookKey = createPublicKey({ key: Buffer.from(process.env.ERLC_WEBHOOK_PUBLIC_KEY || PRC_WEBHOOK_KEY, 'base64'), format: 'der', type: 'spki' });
  }
  /** Nur für Tests: andere Gegenstelle/Signaturschlüssel. */
  useClient(c: ErlcClient) { (this as { client: ErlcClient }).client = c; }
  useWebhookKey(spkiBase64: string) { this.webhookKey = createPublicKey({ key: Buffer.from(spkiBase64, 'base64'), format: 'der', type: 'spki' }); }

  private runtime(id: string): Runtime {
    let r = this.rt.get(id);
    if (!r) { r = { nextDue: 0, failures: 0, inFlight: false, paused: false }; this.rt.set(id, r); }
    return r;
  }

  /** Geheimnisfreie Darstellung – der Key wird nie ausgeliefert, nur maskiert. */
  view(s: ErlcServer, withSecrets = false) {
    const settings = settingsSchema.parse(s.settings ?? {});
    return {
      id: s.id, name: s.name, serverRef: s.serverRef, description: s.description, logoUrl: s.logoUrl, guildId: s.guildId, active: s.active,
      pollSeconds: s.pollSeconds, features: s.features, webhookEnabled: s.webhookEnabled, settings,
      status: s.active ? s.status : 'DISABLED', statusLabel: ERLC_STATUS_LABEL[(s.active ? s.status : 'DISABLED') as ErlcStatus] ?? s.status,
      lastSyncAt: s.lastSyncAt, lastError: s.lastError, lastErrorAt: s.lastErrorAt, latencyMs: s.latencyMs,
      rateLimit: this.client.rate(s.id), hasKey: true, keyMasked: MASK, webhookPath: withSecrets ? `/api/v1/erlc/webhook/${s.id}/${s.webhookToken}` : null,
      paused: this.rt.get(s.id)?.paused ?? false, createdAt: s.createdAt, updatedAt: s.updatedAt,
    };
  }

  async list(withSecrets = false) { return (await this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' } })).map((s) => this.view(s, withSecrets)); }
  private async load(id: string) {
    const s = await this.prisma.erlcServer.findUnique({ where: { id } });
    if (!s) throw new AppError('NOT_FOUND', 'ER:LC-Server nicht gefunden.');
    return s;
  }

  async create(actor: Actor, d: ErlcServerInput) {
    if (!d.key) throw new AppError('VALIDATION_FAILED', 'Server-Key fehlt.');
    const s = await this.prisma.$transaction(async (tx) => {
      const row = await tx.erlcServer.create({ data: { name: d.name, serverRef: d.serverRef ?? null, description: d.description ?? null, logoUrl: d.logoUrl ?? null, guildId: d.guildId ?? null, active: d.active, keyCipher: encryptSecret(d.key!), pollSeconds: d.pollSeconds, features: d.features, webhookEnabled: d.webhookEnabled, settings: settingsSchema.parse(d.settings ?? {}) } });
      await this.audit.record(actor, { action: 'erlc.server.create', module: 'erlc', entityType: 'ErlcServer', entityId: row.id, after: { name: row.name, guildId: row.guildId, features: row.features, pollSeconds: row.pollSeconds } }, tx);
      return row;
    });
    this.runtime(s.id).nextDue = 0;
    return this.view(s, true);
  }

  async update(actor: Actor, id: string, d: Partial<ErlcServerInput>) {
    const before = await this.load(id);
    const data: Prisma.ErlcServerUpdateInput = {
      ...(d.name !== undefined ? { name: d.name } : {}), ...(d.serverRef !== undefined ? { serverRef: d.serverRef } : {}), ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl } : {}), ...(d.guildId !== undefined ? { guildId: d.guildId } : {}), ...(d.active !== undefined ? { active: d.active } : {}),
      ...(d.pollSeconds !== undefined ? { pollSeconds: d.pollSeconds } : {}), ...(d.features !== undefined ? { features: d.features } : {}), ...(d.webhookEnabled !== undefined ? { webhookEnabled: d.webhookEnabled } : {}),
      ...(d.settings ? { settings: settingsSchema.parse({ ...settingsSchema.parse(before.settings ?? {}), ...d.settings }) } : {}),
      ...(d.key ? { keyCipher: encryptSecret(d.key), status: 'UNKNOWN', lastError: null } : {}),
    };
    const s = await this.prisma.$transaction(async (tx) => {
      const row = await tx.erlcServer.update({ where: { id }, data });
      const changed = Object.keys(d).filter((k) => k !== 'key');
      await this.audit.record(actor, { action: d.key ? 'erlc.server.key_changed' : 'erlc.server.update', module: 'erlc', entityType: 'ErlcServer', entityId: id,
        before: Object.fromEntries(changed.map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), after: { ...Object.fromEntries(changed.map((k) => [k, (d as Record<string, unknown>)[k]])), ...(d.key ? { key: '[geändert]' } : {}) } }, tx);
      return row;
    });
    const r = this.runtime(id);
    if (d.key || d.active) { r.paused = false; r.failures = 0; r.nextDue = 0; }
    if (d.key) this.client.forget(id);
    return this.view(s, true);
  }

  async remove(actor: Actor, id: string) {
    const s = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.erlcServer.delete({ where: { id } });
      await this.audit.record(actor, { action: 'erlc.server.delete', module: 'erlc', entityType: 'ErlcServer', entityId: id, before: { name: s.name, guildId: s.guildId } }, tx);
    });
    this.rt.delete(id); this.client.forget(id);
  }

  /** Verbindung testen bzw. neu herstellen: Backoff/Pause zurücksetzen und sofort abrufen. */
  async reconnect(actor: Actor, id: string, action: 'test' | 'reconnect') {
    await this.load(id);
    const r = this.runtime(id);
    r.paused = false; r.failures = 0;
    const res = await this.poll(id, true);
    await this.audit.record(actor, { action: `erlc.server.${action}`, module: 'erlc', entityType: 'ErlcServer', entityId: id, after: { ok: res.ok, status: res.status } });
    return { ...res, server: this.view(await this.load(id), true) };
  }

  /** Planer (jede Sekunde aus dem Modul): fällige Server abrufen. Kein Server blockiert die anderen. */
  async tick() {
    const servers = await this.prisma.erlcServer.findMany({ where: { active: true }, select: { id: true } });
    const now = Date.now();
    await Promise.all(servers.map(async ({ id }) => {
      const r = this.runtime(id);
      if (r.inFlight || r.paused || now < r.nextDue) return;
      await this.poll(id).catch((e: Error) => this.log.warn(`poll ${id} failed: ${e.message}`));
    }));
  }

  /** Ein Abruf von GET /v2/server mit allen freigegebenen Datenarten. */
  async poll(id: string, manual = false): Promise<{ ok: boolean; status: ErlcStatus; message?: string; latencyMs?: number }> {
    const r = this.runtime(id);
    if (r.inFlight) return { ok: false, status: 'LIMITED', message: 'Abruf läuft bereits.' };
    r.inFlight = true;
    try {
      const s = await this.load(id);
      const key = decryptSecret(s.keyCipher);
      if (!key) {
        r.paused = true;
        await this.prisma.erlcServer.update({ where: { id }, data: { status: 'ERROR', lastError: 'Gespeicherter Server-Key kann nicht entschlüsselt werden (Geheimnis geändert?). Bitte Key neu eintragen.', lastErrorAt: new Date() } });
        return { ok: false, status: 'ERROR', message: 'Server-Key kann nicht entschlüsselt werden.' };
      }
      const include = ERLC_FEATURES.map((f) => (s.features.includes(f) ? INCLUDE[f] : undefined)).filter((x): x is string => !!x);
      const res = await this.client.fetchServer(id, key, include);
      if (!res.ok) {
        const st = statusFor(res);
        r.failures++;
        r.paused = st.pause;
        // Backoff: Retry-After einhalten, sonst wachsend bis max. 5 Minuten – keine Endlosschleife im Sekundentakt
        const backoff = Math.min(MAX_BACKOFF_MS, s.pollSeconds * 1000 * 2 ** Math.min(r.failures, 6));
        r.nextDue = Date.now() + Math.max(res.retryAfterMs ?? 0, st.status === 'OFFLINE' && !res.network ? s.pollSeconds * 2000 : backoff);
        await this.prisma.erlcServer.update({ where: { id }, data: { status: st.status, lastError: st.message, lastErrorAt: new Date(), latencyMs: res.latencyMs || null, rateLimit: this.client.rate(id) as unknown as Prisma.InputJsonValue } });
        if (s.status !== st.status) this.realtime.publish('cad', 'erlc.status', { serverId: id, status: st.status });
        if (manual || s.status !== st.status) this.log.warn(`server ${s.name}: ${st.message}`);
        return { ok: false, status: st.status, message: st.message, latencyMs: res.latencyMs };
      }
      r.failures = 0;
      r.nextDue = Date.now() + s.pollSeconds * 1000;
      const prev = (s.snapshot ?? null) as ErlcSnapshot | null;
      const snap = normalizeSnapshot(res.data, s.features);
      if (prev?.webhookEvents) snap.webhookEvents = prev.webhookEvents;
      await this.prisma.erlcServer.update({ where: { id }, data: { status: 'CONNECTED', lastSyncAt: new Date(), latencyMs: res.latencyMs, snapshot: snap as unknown as Prisma.InputJsonValue, rateLimit: this.client.rate(id) as unknown as Prisma.InputJsonValue } });
      if (snap.emergencyCalls) await this.syncCalls(s, snap.emergencyCalls, 'API');
      this.realtime.publish('cad', 'erlc.snapshot', { serverId: id });
      return { ok: true, status: 'CONNECTED', latencyMs: res.latencyMs };
    } finally { r.inFlight = false; }
  }

  /** Notrufe übernehmen (idempotent je Server + Notrufnummer + Startzeit). Neue Notrufe → CAD + Discord. */
  async syncCalls(s: Pick<ErlcServer, 'id' | 'name' | 'guildId'>, calls: NonNullable<ErlcSnapshot['emergencyCalls']>, source: 'API' | 'WEBHOOK') {
    let created = 0;
    for (const c of calls) {
      if (!c.callNumber || !c.startedAt) continue;
      const startedAt = new Date(c.startedAt * 1000);
      // gleiche Notrufnummer kurz zuvor/danach (Webhook ohne exakte Startzeit, danach der normale Abruf) = derselbe Notruf
      const exists = await this.prisma.erlcEmergencyCall.findFirst({ where: { serverId: s.id, callNumber: c.callNumber, startedAt: { gte: new Date(startedAt.getTime() - 30 * 60_000), lte: new Date(startedAt.getTime() + 30 * 60_000) } } });
      if (exists) continue;
      try {
        const row = await this.prisma.erlcEmergencyCall.create({ data: { serverId: s.id, callNumber: c.callNumber, team: c.team, callerRobloxId: c.caller, description: c.description, positionDescriptor: c.positionDescriptor, mapX: c.x, mapZ: c.z, startedAt, source } });
        created++;
        await this.notify.emit('call.received', { id: row.id, callNumber: row.callNumber, team: row.team, description: row.description, location: row.positionDescriptor, server: s.name, startedAt: row.startedAt.toISOString(), mapUrl: webUrl(`/cad/map?call=${row.id}`), dashboardUrl: webUrl(`/cad/calls?id=${row.id}`) }, s.guildId);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; // gleichzeitig angelegt
      }
    }
    if (created) this.realtime.publish('cad', 'call.created', { serverId: s.id, count: created });
    return created;
  }

  /** Live-Daten (letzter Stand bleibt bei API-Ausfall sichtbar). */
  async live(id: string) {
    const s = await this.load(id);
    return { server: this.view(s), snapshot: (s.snapshot ?? null) as ErlcSnapshot | null, stale: s.status !== 'CONNECTED' };
  }

  // ---- Command Center ----
  async runCommand(actor: Actor & { discordId?: string | null }, id: string, raw: string, confirm: boolean) {
    const s = await this.load(id);
    if (!s.features.includes('commands')) throw new AppError('PERMISSION_DENIED', 'Das Command Center ist für diesen Server nicht freigegeben.');
    const command = raw.trim();
    if (!/^:\w/.test(command) || command.length > 500 || /[\r\n]/.test(command)) throw new AppError('VALIDATION_FAILED', 'Befehle beginnen mit „:“ (z. B. „:h Hallo“), einzeilig, max. 500 Zeichen.');
    const name = command.split(/\s+/)[0]!.toLowerCase();
    const settings = settingsSchema.parse(s.settings ?? {});
    if (settings.blockedCommands.map((c) => c.toLowerCase()).includes(name)) throw new AppError('PERMISSION_DENIED', `„${name}“ ist für das Dashboard gesperrt.`);
    const critical = settings.criticalCommands.map((c) => c.toLowerCase()).includes(name);
    if (critical) {
      if (!(await this.perms.has(actor.userId!, 'cad.erlc_command_critical'))) throw new AppError('PERMISSION_DENIED', `„${name}“ ist ein kritischer Befehl – dafür fehlt dir das Recht.`);
      if (!confirm) throw new AppError('CONFLICT', 'Kritischer Befehl: bitte bestätigen.', { needsConfirm: true });
    }
    const key = decryptSecret(s.keyCipher);
    if (!key) throw new AppError('CAPABILITY_UNAVAILABLE', 'Server-Key kann nicht entschlüsselt werden – bitte neu eintragen.');
    const res = await this.client.runCommand(id, key, command);
    const ok = res.ok;
    const result = ok ? String(res.data.message ?? 'Success').slice(0, 300) : null;
    const error = ok ? null : (res.status === 429 ? `Rate-Limit: bitte in ${Math.ceil((res.retryAfterMs ?? 5000) / 1000)} s erneut versuchen.` : statusFor(res).message);
    const log = await this.prisma.$transaction(async (tx) => {
      const row = await tx.erlcCommandLog.create({ data: { serverId: id, userId: actor.userId, discordId: actor.discordId ?? null, command, critical, ok, result, error } });
      await this.audit.record(actor, { action: 'erlc.command', module: 'erlc', entityType: 'ErlcServer', entityId: id, after: { command, critical, ok, result, error } }, tx);
      return row;
    });
    if (!ok) throw new AppError(res.status === 429 ? 'RATE_LIMITED' : 'CAPABILITY_UNAVAILABLE', error ?? 'Befehl fehlgeschlagen.', { logId: log.id });
    return { ok, result, critical, logId: log.id };
  }

  async commandLog(id: string, take = 100) {
    const rows = await this.prisma.erlcCommandLog.findMany({ where: { serverId: id }, orderBy: { createdAt: 'desc' }, take });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const n = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ ...r, userName: r.userId ? n.get(r.userId) ?? null : null }));
  }

  // ---- Event-Webhooks (Ed25519) ----
  verifySignature(raw: Buffer, timestamp: string | undefined, sigHex: string | undefined) {
    if (!timestamp || !sigHex || !/^\d{9,13}$/.test(timestamp) || !/^[0-9a-fA-F]{128}$/.test(sigHex)) return false;
    // Wiederholte alte Zustellungen abweisen (5 Minuten Toleranz)
    const ts = Number(timestamp) > 1e12 ? Number(timestamp) / 1000 : Number(timestamp);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
    try { return edVerify(null, Buffer.concat([Buffer.from(timestamp, 'utf8'), raw]), this.webhookKey, Buffer.from(sigHex, 'hex')); } catch { return false; }
  }

  /** Webhook-Ereignis: Notrufe sofort ins CAD, sonst als Ereignis vermerken; danach zeitnah normal abrufen. */
  async webhook(id: string, token: string, raw: Buffer | undefined, timestamp?: string, signature?: string) {
    if (!raw || !this.verifySignature(raw, timestamp, signature)) throw new AppError('UNAUTHENTICATED', 'Ungültige Signatur.');
    const s = await this.prisma.erlcServer.findUnique({ where: { id } });
    // PRC signiert für alle Server mit demselben Schlüssel – der geheime Teil der Adresse bindet die Zustellung an unseren Server
    const a = Buffer.from(token), b = Buffer.from(s?.webhookToken ?? '');
    if (!s || a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError('NOT_FOUND', 'Unbekannter Server.');
    // dieselbe signierte Zustellung nicht zweimal verarbeiten (Wiederholung innerhalb des Zeitfensters)
    const now = Date.now();
    for (const [k, t] of this.seen) if (t < now) this.seen.delete(k);
    if (this.seen.has(signature!)) return { ok: true, duplicate: true };
    this.seen.set(signature!, now + 10 * 60_000);
    // Validierungsanfrage von PRC beim Speichern der URL beantworten, auch wenn der Webhook (noch) nicht aktiv ist
    let body: unknown; try { body = JSON.parse(raw.toString('utf8')); } catch { body = null; }
    if (!s.active || !s.webhookEnabled) return { ok: true, ignored: true };
    const events = Array.isArray(body) ? body : [body];
    let calls = 0;
    const notes: { at: string; summary: string }[] = [];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      const data = (o.data && typeof o.data === 'object' ? o.data : o) as Record<string, unknown>;
      if ('CallNumber' in data || /emergency/i.test(String(o.event ?? o.type ?? ''))) {
        const norm = normalizeSnapshot({ EmergencyCalls: [data] }, ['emergencyCalls']).emergencyCalls ?? [];
        calls += await this.syncCalls(s, norm.map((c) => ({ ...c, startedAt: c.startedAt || Math.floor(Date.now() / 1000) })), 'WEBHOOK');
      } else {
        notes.push({ at: new Date().toISOString(), summary: JSON.stringify(data).slice(0, 300) });
      }
    }
    if (notes.length) {
      const snap = (s.snapshot ?? { fetchedAt: new Date(0).toISOString(), server: { name: s.name, currentPlayers: 0, maxPlayers: 0, joinKey: null, accVerifiedReq: null, teamBalance: null } }) as unknown as ErlcSnapshot;
      snap.webhookEvents = [...notes, ...(snap.webhookEvents ?? [])].slice(0, 50);
      await this.prisma.erlcServer.update({ where: { id }, data: { snapshot: snap as unknown as Prisma.InputJsonValue } });
      this.realtime.publish('cad', 'erlc.snapshot', { serverId: id });
    }
    const r = this.runtime(id);
    r.nextDue = Math.min(r.nextDue, Date.now() + 2000);
    return { ok: true, calls, events: notes.length };
  }
}
