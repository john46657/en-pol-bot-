import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_FLEET_CONFIG, DRIVER_HINT, DRIVER_STATES, fleetConfigSchema, POSITION_HINT, type FleetConfig, type FleetInternalInput, type FleetModelInput } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MediaService } from '../media/media.service';
import { AppError } from '../common/errors';
import type { ErlcPlayer, ErlcSnapshot } from '../cad/erlc.service';

const KEY = 'fleet.config';
const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** Was ER:LC zu einem Fahrzeug liefert (nach normalizeSnapshot). */
type ApiVehicle = NonNullable<ErlcSnapshot['vehicles']>[number];
type Row = Prisma.ErlcLiveVehicleGetPayload<object>;
const API_FIELDS = ['name', 'owner', 'ownerRobloxId', 'ownerTeam', 'plate', 'texture', 'colorHex', 'colorName', 'policeReason', 'uncertain'] as const;
const FIELD_LABEL: Record<string, string> = { ownerRobloxId: 'Roblox-ID des Besitzers', ownerTeam: 'Team des Besitzers', plate: 'Kennzeichen', texture: 'Lackierung', colorHex: 'Farbe', colorName: 'Farbname', policeReason: 'Erkennung', uncertain: 'Zuordnung' };

/**
 * Polizeifahrzeuge: Abgleich der von ER:LC gemeldeten (gespawnten) Fahrzeuge, getrennt vom gepflegten Modellkatalog.
 * - Polizei = Besitzer im Team Police; ist der Besitzer gerade nicht im Spiel, zählt nur ein aktives Katalog-Modell. Sheriff/andere Teams nie.
 * - Wiedererkennung ohne Fahrzeug-ID: Besitzer + Modell + Kennzeichen. Hat ein Besitzer mehrere gleiche, wird nach Reihenfolge nummeriert und als unsicher markiert.
 * - Fahrer und Fahrzeugposition liefert die API nicht – sie werden nie behauptet (siehe DRIVER_STATES/POSITION_HINT).
 * - Der Abgleich schreibt nur API-Felder; interne Felder (Einheit, Status, Notizen, Tags, Kennung) ändert nur das Dashboard.
 */
@Injectable()
export class FleetService {
  private readonly log = new Logger('Fleet');
  private readonly lastSync = new Map<string, number>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly rt: RealtimeService, private readonly media: MediaService) {}

  // ───────── Konfiguration ─────────
  async config(): Promise<FleetConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const r = fleetConfigSchema.safeParse({ ...DEFAULT_FLEET_CONFIG, ...((v as object | null) ?? {}) });
    return r.success ? r.data : DEFAULT_FLEET_CONFIG;
  }
  async saveConfig(actor: Actor, patch: Partial<FleetConfig>) {
    const before = await this.config();
    const value = fleetConfigSchema.parse({ ...before, ...patch });
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'fleet.config', module: 'fleet', entityType: 'SystemSetting', entityId: KEY, before: before as unknown as Record<string, unknown>, after: patch as Record<string, unknown> }, tx);
    });
    return value;
  }

  // ───────── Abgleich mit ER:LC ─────────
  /** Schlüssel ohne Fahrzeug-ID: Besitzer|Modell|Kennzeichen, bei mehreren gleichen #1, #2 … (unsicher). */
  static keys(vehicles: ApiVehicle[]) {
    const base = vehicles.map((v) => `${lc(v.owner)}|${lc(v.name)}|${lc(v.plate)}`);
    const total = new Map<string, number>();
    base.forEach((b) => total.set(b, (total.get(b) ?? 0) + 1));
    const seen = new Map<string, number>();
    return base.map((b) => { const n = (seen.get(b) ?? 0) + 1; seen.set(b, n); const many = total.get(b)! > 1; return { key: many ? `${b}#${n}` : b, uncertain: many }; });
  }

  /** Nach jedem erfolgreichen ER:LC-Abruf (Fahrzeugdaten aktiv). `force` ignoriert den Mindestabstand (Tests, „Jetzt abgleichen“). */
  async sync(erlcServerId: string, snap: ErlcSnapshot, force = false) {
    if (!snap.vehicles) return null; // Datenart „Fahrzeuge“ ist für diesen Server aus → nichts als verschwunden markieren
    const cfg = await this.config();
    const now = Date.now();
    if (!force && now - (this.lastSync.get(erlcServerId) ?? 0) < cfg.syncSeconds * 1000) return null;
    this.lastSync.set(erlcServerId, now);
    const players = new Map((snap.players ?? []).map((p) => [lc(p.name), p]));
    const catalog = new Set((await this.prisma.policeVehicleModel.findMany({ where: { active: true }, select: { erlcName: true } })).map((m) => lc(m.erlcName)));
    const keys = FleetService.keys(snap.vehicles);
    const seen: { key: string; data: Pick<Row, (typeof API_FIELDS)[number]> }[] = [];
    snap.vehicles.forEach((v, i) => {
      if (!v.owner || !v.name) return;
      const p = players.get(lc(v.owner));
      const team = p?.team ?? null;
      // Team bekannt → nur Police zählt; Besitzer nicht im Spiel → nur Katalog-Modelle
      const reason = team ? (lc(team) === 'police' ? 'team' : null) : (catalog.has(lc(v.name)) ? 'catalog' : null);
      if (!reason) return;
      seen.push({ key: keys[i]!.key, data: { name: v.name, owner: v.owner, ownerRobloxId: p?.id ?? null, ownerTeam: team, plate: v.plate, texture: v.texture, colorHex: v.colorHex, colorName: v.colorName, policeReason: reason, uncertain: keys[i]!.uncertain } });
    });
    const existing = await this.prisma.erlcLiveVehicle.findMany({ where: { erlcServerId } });
    const byKey = new Map(existing.map((e) => [e.key, e]));
    const at = new Date(now);
    let changes = 0;
    const touched: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const s of seen) {
        const old = byKey.get(s.key);
        if (!old) {
          const c = await tx.erlcLiveVehicle.create({ data: { erlcServerId, key: s.key, ...s.data, firstSeenAt: at, lastSeenAt: at, apiChangedAt: at } });
          await tx.erlcVehicleEvent.create({ data: { vehicleId: c.id, kind: 'SPAWNED', text: `Gespawnt von ${s.data.owner}${s.data.uncertain ? ' (mehrere gleiche Fahrzeuge – Zuordnung unsicher)' : ''}` } });
          changes++;
          continue;
        }
        // Werte, die die API in diesem Abruf nicht kennt (z. B. Besitzer offline → kein Team), überschreiben bekannte nicht
        const next = { ...s.data, ownerRobloxId: s.data.ownerRobloxId ?? old.ownerRobloxId, ownerTeam: s.data.ownerTeam ?? old.ownerTeam };
        const diff = API_FIELDS.filter((f) => (old as Record<string, unknown>)[f] !== (next as Record<string, unknown>)[f]);
        if (diff.length || !old.active) {
          await tx.erlcLiveVehicle.update({ where: { id: old.id }, data: { ...next, active: true, lastSeenAt: at, ...(diff.length ? { apiChangedAt: at } : {}) } });
          const text = !old.active ? `Wieder gemeldet (Besitzer ${next.owner})` : `Geändert: ${diff.map((f) => `${FIELD_LABEL[f] ?? f} ${String((old as Record<string, unknown>)[f] ?? '—')} → ${String((next as Record<string, unknown>)[f] ?? '—')}`).join(', ')}`;
          await tx.erlcVehicleEvent.create({ data: { vehicleId: old.id, kind: old.active ? 'CHANGED' : 'SPAWNED', text: text.slice(0, 1000) } });
          changes++;
        } else touched.push(old.id);
      }
      if (touched.length) await tx.erlcLiveVehicle.updateMany({ where: { id: { in: touched } }, data: { lastSeenAt: at } });
      const gone = existing.filter((e) => e.active && !seen.some((s) => s.key === e.key));
      if (gone.length) {
        await tx.erlcLiveVehicle.updateMany({ where: { id: { in: gone.map((g) => g.id) } }, data: { active: false } });
        await tx.erlcVehicleEvent.createMany({ data: gone.map((g) => ({ vehicleId: g.id, kind: 'DESPAWNED', text: 'Nicht mehr von ER:LC gemeldet' })) });
        changes += gone.length;
      }
      // Alte, nicht mehr gemeldete Fahrzeuge ohne interne Daten aufräumen
      await tx.erlcLiveVehicle.deleteMany({ where: { erlcServerId, active: false, lastSeenAt: { lt: new Date(now - cfg.keepInactiveDays * 86_400_000) }, unitId: null, notes: null, internalCode: null, tags: { isEmpty: true } } });
    });
    if (changes) this.rt.publish('cad', 'fleet.changed', { serverId: erlcServerId });
    return { changes, active: seen.length };
  }

  // ───────── Lesen ─────────
  /** Live-Infos zum Besitzer aus dem letzten Abruf + Discord-Verknüpfung + Einheit + Katalog. */
  private async enrich(rows: (Row & { server: { id: string; name: string; status: string; lastSyncAt: Date | null; pollSeconds: number; snapshot: Prisma.JsonValue } })[]) {
    const [units, catalog, members, users] = await Promise.all([
      this.prisma.unit.findMany({ where: { id: { in: rows.map((r) => r.unitId).filter((x): x is string => !!x) } }, select: { id: true, callsign: true, name: true } }),
      this.prisma.policeVehicleModel.findMany(),
      this.prisma.cadMember.findMany({ where: { OR: [{ erlcName: { in: rows.map((r) => r.owner), mode: 'insensitive' } }, { robloxName: { in: rows.map((r) => r.owner), mode: 'insensitive' } }, { robloxId: { in: rows.map((r) => r.ownerRobloxId).filter((x): x is string => !!x) } }] } }),
      this.prisma.user.findMany({ where: { robloxUserId: { in: rows.map((r) => r.ownerRobloxId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true, robloxUserId: true } }),
    ]);
    const links = await this.prisma.discordLink.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
    const unitMap = new Map(units.map((u) => [u.id, u])), cat = new Map(catalog.map((m) => [lc(m.erlcName), m]));
    const playersOf = new Map<string, Map<string, ErlcPlayer>>();
    const now = Date.now();
    return rows.map((r) => {
      if (!playersOf.has(r.erlcServerId)) playersOf.set(r.erlcServerId, new Map((((r.server.snapshot as ErlcSnapshot | null)?.players) ?? []).map((p) => [lc(p.name), p])));
      const p = r.active ? playersOf.get(r.erlcServerId)!.get(lc(r.owner)) : undefined;
      const member = members.find((m) => (r.ownerRobloxId && m.robloxId === r.ownerRobloxId) || lc(m.erlcName) === lc(r.owner) || lc(m.robloxName) === lc(r.owner));
      const user = r.ownerRobloxId ? users.find((u) => u.robloxUserId === r.ownerRobloxId) : undefined;
      const discordId = member?.discordId ?? (user ? links.find((l) => l.userId === user.id)?.discordId ?? null : null);
      const model = cat.get(lc(r.name)) ?? null;
      const stale = r.server.status !== 'CONNECTED' || !r.server.lastSyncAt || now - r.server.lastSyncAt.getTime() > Math.max(60_000, r.server.pollSeconds * 3000);
      return {
        id: r.id, erlcServerId: r.erlcServerId, serverName: r.server.name, key: r.key, active: r.active, uncertain: r.uncertain, stale,
        api: { name: r.name, owner: r.owner, ownerRobloxId: r.ownerRobloxId, ownerTeam: r.ownerTeam, plate: r.plate, texture: r.texture, colorHex: r.colorHex, colorName: r.colorName, policeReason: r.policeReason, firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt, apiChangedAt: r.apiChangedAt },
        // die ER:LC-API meldet keinen Fahrer
        driver: { state: 'unavailable' as const, label: DRIVER_STATES.unavailable, hint: DRIVER_HINT },
        ownerOnline: !!p,
        ownerPosition: p?.location ? { x: p.location.x, z: p.location.z, street: p.location.street, postal: p.location.postal, hint: POSITION_HINT } : null,
        discord: discordId || member?.discordName ? { discordId, name: member?.discordName ?? user?.displayName ?? null } : null,
        model: model ? { id: model.id, name: model.name, category: model.category, imageUrl: model.imageId ? `/api/v1/media/${model.imageId}` : null, internalCode: model.internalCode, department: model.department } : null,
        internal: { unitId: r.unitId, unit: r.unitId ? unitMap.get(r.unitId) ?? null : null, status: r.internalStatus, internalCode: r.internalCode, notes: r.notes, tags: r.tags, version: r.version, updatedAt: r.updatedAt },
      };
    });
  }

  private readonly serverSel = { select: { id: true, name: true, status: true, lastSyncAt: true, pollSeconds: true, snapshot: true } } as const;

  async list(f: { active?: 'active' | 'inactive' | 'all'; serverId?: string }) {
    const rows = await this.prisma.erlcLiveVehicle.findMany({
      where: { ...(f.active === 'inactive' ? { active: false } : f.active === 'all' ? {} : { active: true }), ...(f.serverId ? { erlcServerId: f.serverId } : {}) },
      include: { server: this.serverSel }, orderBy: [{ active: 'desc' }, { name: 'asc' }, { owner: 'asc' }], take: 500,
    });
    const servers = await this.prisma.erlcServer.findMany({ where: { active: true }, select: { id: true, name: true, status: true, lastSyncAt: true, lastError: true, features: true } });
    return { items: await this.enrich(rows), servers: servers.map((s) => ({ ...s, vehiclesEnabled: s.features.includes('vehicles') })) };
  }

  async get(actor: Actor, id: string) {
    const r = await this.prisma.erlcLiveVehicle.findUnique({ where: { id }, include: { server: this.serverSel, events: { orderBy: { createdAt: 'desc' }, take: 200 } } });
    if (!r) throw new AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
    const [v] = await this.enrich([r]);
    const incIds = [...new Set(r.events.map((e) => e.incidentId).filter((x): x is string => !!x))];
    const [incidents, actors] = await Promise.all([
      incIds.length && (await this.perms.has(actor.userId!, 'cad.view')) ? this.prisma.incident.findMany({ where: { id: { in: incIds } }, select: { id: true, number: true, title: true, status: true } }) : [],
      this.prisma.user.findMany({ where: { id: { in: r.events.map((e) => e.actorId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
    ]);
    const names = new Map(actors.map((a) => [a.id, a.displayName]));
    // Rohdaten genau so, wie sie im letzten Abruf standen (ohne Bearbeitung)
    const raw = r.active ? ((r.server.snapshot as ErlcSnapshot | null)?.vehicles ?? []).filter((x) => lc(x.owner) === lc(r.owner) && lc(x.name) === lc(r.name) && lc(x.plate) === lc(r.plate)) : [];
    return { ...v!, raw, incidents, events: r.events.map((e) => ({ ...e, actorName: e.actorId ? names.get(e.actorId) ?? null : null })) };
  }

  /** Für die Karte: nur aktive Fahrzeuge, deren Besitzer gerade im Spiel eine Position hat – als Besitzerposition gekennzeichnet. */
  async forMap() {
    const rows = await this.prisma.erlcLiveVehicle.findMany({ where: { active: true }, include: { server: this.serverSel } });
    const [items, cfg] = await Promise.all([this.enrich(rows), this.config()]);
    return items.filter((v) => v.ownerPosition).map((v) => ({
      id: v.id, serverId: v.erlcServerId, name: v.api.name, owner: v.api.owner, plate: v.api.plate, colorHex: v.api.colorHex, colorName: v.api.colorName,
      x: v.ownerPosition!.x, z: v.ownerPosition!.z, positionHint: POSITION_HINT, category: v.model?.category ?? null,
      icon: cfg.categories.find((c) => c.key === v.model?.category)?.icon ?? null, unit: v.internal.unit?.callsign ?? null, uncertain: v.uncertain,
    }));
  }

  // ───────── Interne Daten ─────────
  /** `version` optional: mit → Konfliktprüfung; ohne (automatisches Speichern einzelner Felder) → letzte Änderung gilt, alles im Verlauf/Audit. */
  async updateInternal(actor: Actor, id: string, version: number | undefined, d: FleetInternalInput) {
    const cfg = await this.config();
    const before = await this.prisma.erlcLiveVehicle.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
    if (d.unitId !== undefined && d.unitId !== before.unitId) await this.perms.assert(actor.userId!, 'fleet.assign');
    const { unitId: _u, ...rest } = d; void _u;
    if (Object.keys(rest).some((k) => (rest as Record<string, unknown>)[k] !== undefined)) await this.perms.assert(actor.userId!, 'fleet.edit');
    if (d.internalStatus && !cfg.internalStatuses.some((s) => s.key === d.internalStatus)) throw new AppError('VALIDATION_FAILED', `Unbekannter Status „${d.internalStatus}“.`);
    if (d.unitId && !(await this.prisma.unit.findUnique({ where: { id: d.unitId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    const data: Prisma.ErlcLiveVehicleUpdateManyMutationInput & { unitId?: string | null } = {};
    if (d.unitId !== undefined) data.unitId = d.unitId;
    if (d.internalStatus !== undefined) data.internalStatus = d.internalStatus;
    if (d.internalCode !== undefined) data.internalCode = d.internalCode || null;
    if (d.notes !== undefined) data.notes = d.notes || null;
    if (d.tags !== undefined) data.tags = [...new Set(d.tags)];
    // Zuweisung an eine Einheit setzt „Nicht zugewiesen“ automatisch auf den nächsten Status (und umgekehrt), wenn nicht ausdrücklich gesetzt
    const first = cfg.internalStatuses[0]!.key, second = cfg.internalStatuses[1]?.key;
    if (d.unitId && !d.internalStatus && before.internalStatus === first && second) data.internalStatus = second;
    if (d.unitId === null && !d.internalStatus && before.unitId) data.internalStatus = first;
    const fields = Object.keys(data);
    if (!fields.length) return this.get(actor, id);
    const unitName = async (u: string | null | undefined) => (u ? (await this.prisma.unit.findUnique({ where: { id: u }, select: { callsign: true } }))?.callsign ?? '—' : 'keine');
    const label = (k: string) => cfg.internalStatuses.find((s) => s.key === k)?.label ?? k;
    const parts = [
      ...(data.unitId !== undefined ? [`Einheit: ${await unitName(before.unitId)} → ${await unitName(data.unitId)}`] : []),
      ...(data.internalStatus !== undefined ? [`Status: ${label(before.internalStatus)} → ${label(data.internalStatus as string)}`] : []),
      ...(data.internalCode !== undefined ? [`Kennung: ${before.internalCode ?? '—'} → ${(data.internalCode as string | null) ?? '—'}`] : []),
      ...(data.notes !== undefined ? ['Notizen geändert'] : []), ...(data.tags !== undefined ? [`Tags: ${(data.tags as string[]).join(', ') || '—'}`] : []),
    ];
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.erlcLiveVehicle.updateMany({ where: { id, ...(version !== undefined ? { version } : {}) }, data: { ...data, version: { increment: 1 } } });
      if (!r.count) throw new AppError('CONFLICT', 'Das Fahrzeug wurde inzwischen von jemand anderem geändert. Bitte neu laden.');
      await tx.erlcVehicleEvent.create({ data: { vehicleId: id, kind: 'INTERNAL', text: parts.join(' · ').slice(0, 1000), actorId: actor.userId } });
      await this.audit.record(actor, { action: 'fleet.vehicle.update', module: 'fleet', entityType: 'ErlcLiveVehicle', entityId: id, before: Object.fromEntries(fields.map((k) => [k, (before as Record<string, unknown>)[k]])), after: data as Record<string, unknown> }, tx);
    });
    this.rt.publish('cad', 'fleet.changed', { id });
    return this.get(actor, id);
  }

  /** Fahrzeug bei einem Einsatz dokumentieren (intern): steht in der Einsatzchronik und im Fahrzeugverlauf. */
  async documentIncident(actor: Actor, id: string, incidentId: string, note?: string | null) {
    const [v, inc] = await Promise.all([this.prisma.erlcLiveVehicle.findUnique({ where: { id } }), this.prisma.incident.findUnique({ where: { id: incidentId } })]);
    if (!v) throw new AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
    if (!inc) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    const what = `${v.name}${v.plate ? ` (${v.plate})` : ''}${v.internalCode ? ` [${v.internalCode}]` : ''}, Besitzer ${v.owner}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.cadIncidentLog.create({ data: { incidentId, kind: 'NOTE', text: `🚓 Fahrzeug dokumentiert: ${what}${note ? ` – ${note}` : ''}`.slice(0, 2000), authorId: actor.userId, unitId: v.unitId } });
      await tx.erlcVehicleEvent.create({ data: { vehicleId: id, kind: 'INCIDENT', incidentId, text: `Bei Einsatz ${inc.number} dokumentiert${note ? ` – ${note}` : ''}`.slice(0, 1000), actorId: actor.userId } });
      await this.audit.record(actor, { action: 'fleet.vehicle.incident', module: 'fleet', entityType: 'ErlcLiveVehicle', entityId: id, after: { incidentId, number: inc.number, note: note ?? null } }, tx);
    });
    this.rt.publish('cad', 'cad.changed', { kind: 'incident', id: incidentId });
    return { ok: true, number: inc.number };
  }

  /** Fahrzeuge einer Einheit (MDT „Meine Einheit“) – interne Zuordnung, kein bestätigter Live-Status. */
  async forUnits(unitIds: string[]) {
    if (!unitIds.length) return [];
    const rows = await this.prisma.erlcLiveVehicle.findMany({ where: { unitId: { in: unitIds } }, include: { server: this.serverSel }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return this.enrich(rows);
  }

  // ───────── Modellkatalog ─────────
  async catalog() {
    const rows = await this.prisma.policeVehicleModel.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    const live = await this.prisma.erlcLiveVehicle.groupBy({ by: ['name'], where: { active: true }, _count: { _all: true } });
    const n = new Map(live.map((l) => [lc(l.name), l._count._all]));
    return rows.map((m) => ({ ...m, imageUrl: m.imageId ? `/api/v1/media/${m.imageId}` : null, liveCount: n.get(lc(m.erlcName)) ?? 0 }));
  }
  /** Modellnamen, die ER:LC bisher gemeldet hat und die noch nicht im Katalog stehen (Vorschläge zum Übernehmen). */
  async suggestions() {
    const [seen, have] = await Promise.all([
      this.prisma.erlcLiveVehicle.groupBy({ by: ['name'], _count: { _all: true }, orderBy: { name: 'asc' } }),
      this.prisma.policeVehicleModel.findMany({ select: { erlcName: true } }),
    ]);
    const known = new Set(have.map((h) => lc(h.erlcName)));
    return seen.filter((s) => !known.has(lc(s.name))).map((s) => ({ erlcName: s.name, seen: s._count._all }));
  }

  private async checkModel(d: Partial<FleetModelInput>) {
    if (d.category && !(await this.config()).categories.some((c) => c.key === d.category)) throw new AppError('VALIDATION_FAILED', `Unbekannte Kategorie „${d.category}“.`);
  }
  async createModel(actor: Actor, d: FleetModelInput) {
    await this.checkModel(d);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const m = await tx.policeVehicleModel.create({ data: { ...d, tags: d.tags ?? [] } });
        await this.audit.record(actor, { action: 'fleet.model.create', module: 'fleet', entityType: 'PoliceVehicleModel', entityId: m.id, after: m }, tx);
        return m;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', `Das ER:LC-Modell „${d.erlcName}“ steht schon im Katalog.`);
      throw e;
    }
  }
  async updateModel(actor: Actor, id: string, d: Partial<FleetModelInput>) {
    await this.checkModel(d);
    const before = await this.prisma.policeVehicleModel.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Modell nicht gefunden.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const m = await tx.policeVehicleModel.update({ where: { id }, data: d });
        await this.audit.record(actor, { action: 'fleet.model.update', module: 'fleet', entityType: 'PoliceVehicleModel', entityId: id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (before as Record<string, unknown>)[k]])), after: d as Record<string, unknown> }, tx);
        return m;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', `Das ER:LC-Modell „${d.erlcName}“ steht schon im Katalog.`);
      throw e;
    }
  }
  async deleteModel(actor: Actor, id: string) {
    const before = await this.prisma.policeVehicleModel.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Modell nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.policeVehicleModel.delete({ where: { id } });
      await this.audit.record(actor, { action: 'fleet.model.delete', module: 'fleet', entityType: 'PoliceVehicleModel', entityId: id, before }, tx);
    });
  }
  async setModelImage(actor: Actor, id: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number } | undefined) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.mimetype)) throw new AppError('VALIDATION_FAILED', 'Bitte ein Bild (PNG, JPG oder WebP) hochladen.');
    if (!(await this.prisma.policeVehicleModel.findUnique({ where: { id }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Modell nicht gefunden.');
    const m = await this.media.upload(actor, file, { linkedType: 'FleetModel', linkedId: id }, 5 * 1024 * 1024);
    await this.updateModel(actor, id, {});
    await this.prisma.policeVehicleModel.update({ where: { id }, data: { imageId: m.id } });
    return { imageUrl: `/api/v1/media/${m.id}` };
  }
}
