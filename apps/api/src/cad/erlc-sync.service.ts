import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { ErlcSnapshot } from './erlc.service';

const SYSTEM: Actor = { userId: null };
const NOTE = 'Automatisch aus ER:LC übernommen.';
const lc = (s: string) => s.trim().toLowerCase();

/**
 * Personen und Fahrzeuge aus der ER:LC-API ins System übernehmen (bei jedem erfolgreichen Abruf):
 * Spieler → Personenakte (Roblox-Name + ID), gespawnte Fahrzeuge mit Kennzeichen → Fahrzeugregister (Halter über den Roblox-Namen).
 * Es wird nur geschrieben, was neu ist oder sich geändert hat; von Hand gepflegte Angaben (Notizen, Status) bleiben unberührt.
 */
@Injectable()
export class ErlcSyncService {
  private readonly log = new Logger('ErlcSync');
  /** Letzter Stand je Server – unveränderte Abrufe kosten keine Datenbank-Abfrage. */
  private readonly last = new Map<string, string>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly rt: RealtimeService) {}

  async sync(serverId: string, snap: ErlcSnapshot) {
    const players = (snap.players ?? []).filter((p) => p.name && p.id && /^\d{1,20}$/.test(p.id));
    const vehicles = (snap.vehicles ?? []).filter((v) => v.plate && v.plate.trim().length >= 2);
    const sig = JSON.stringify([players.map((p) => `${p.id}:${p.name}`).sort(), vehicles.map((v) => `${v.plate}|${v.name}|${v.owner}|${v.colorName}`).sort()]);
    if (this.last.get(serverId) === sig) return { persons: 0, vehicles: 0 };
    let persons = 0, cars = 0;
    try {
      // ---- Personen ----
      const ids = players.map((p) => p.id!);
      const known = await this.prisma.person.findMany({ where: { OR: [{ robloxUserId: { in: ids } }, { robloxUsername: { in: [...players.map((p) => p.name), ...vehicles.map((v) => v.owner)], mode: 'insensitive' } }] }, select: { id: true, robloxUserId: true, robloxUsername: true } });
      const byId = new Map(known.filter((k) => k.robloxUserId).map((k) => [k.robloxUserId!, k]));
      const byName = new Map(known.map((k) => [lc(k.robloxUsername), k]));
      for (const p of players) {
        const hit = byId.get(p.id!) ?? (() => { const n = byName.get(lc(p.name)); return n && !n.robloxUserId ? n : undefined; })();
        if (hit) {
          // ID nachtragen bzw. neuen Roblox-Namen übernehmen (Namensänderung)
          if (hit.robloxUserId !== p.id || hit.robloxUsername !== p.name) {
            await this.prisma.person.update({ where: { id: hit.id }, data: { robloxUserId: p.id, robloxUsername: p.name, version: { increment: 1 } } }).catch(() => undefined);
            byName.set(lc(p.name), { ...hit, robloxUserId: p.id!, robloxUsername: p.name });
          }
          continue;
        }
        const created = await this.prisma.$transaction(async (tx) => {
          const c = await tx.person.create({ data: { robloxUsername: p.name, robloxUserId: p.id, notes: NOTE } });
          await this.timeline.add(tx, { entityType: 'Person', entityId: c.id, action: 'person.created', summary: 'Personenakte aus ER:LC angelegt', actorId: null });
          await this.audit.record(SYSTEM, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: c.id, after: { robloxUsername: c.robloxUsername, robloxUserId: c.robloxUserId, source: 'ERLC' } }, tx);
          return c;
        }).catch((e) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; throw e; }); // gleichzeitig angelegt
        if (created) { byName.set(lc(p.name), created); persons++; }
      }
      // ---- Fahrzeuge ----
      const plates = vehicles.map((v) => v.plate!.trim());
      const existing = await this.prisma.vehicle.findMany({ where: { plate: { in: plates, mode: 'insensitive' } }, select: { id: true, plate: true, model: true, color: true, ownerId: true, erlcReference: true } });
      const byPlate = new Map(existing.map((v) => [lc(v.plate), v]));
      for (const v of vehicles) {
        const plate = v.plate!.trim().slice(0, 16);
        const ownerId = byName.get(lc(v.owner))?.id ?? null;
        const data = { model: v.name.slice(0, 64) || null, color: v.colorName?.slice(0, 32) ?? null, erlcReference: v.owner.slice(0, 64) || null, ...(ownerId ? { ownerId } : {}) };
        const old = byPlate.get(lc(plate));
        if (old) {
          if (old.model !== data.model || old.color !== data.color || old.erlcReference !== data.erlcReference || (ownerId && old.ownerId !== ownerId)) {
            await this.prisma.vehicle.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } });
            cars++;
          }
          continue;
        }
        await this.prisma.$transaction(async (tx) => {
          const c = await tx.vehicle.create({ data: { plate, ...data, notes: NOTE } });
          await this.audit.record(SYSTEM, { action: 'vehicle.create', module: 'vehicles', entityType: 'Vehicle', entityId: c.id, after: { plate, model: c.model, owner: v.owner, source: 'ERLC' } }, tx);
        }).then(() => { cars++; }, (e) => { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; });
      }
      this.last.set(serverId, sig);
      if (persons || cars) this.rt.publish('cad', 'erlc.records', { serverId, persons, vehicles: cars });
    } catch (e) {
      this.log.warn(`sync ${serverId} failed: ${e instanceof Error ? e.message : e}`);
    }
    return { persons, vehicles: cars };
  }

  /** Wer/was gerade auf den ER:LC-Servern ist (letzter Abruf), mit Verweis auf die Akte. `guildId`: nur Server dieses Discord-Servers. */
  async live(kind: 'persons' | 'vehicles', guildId?: string | null) {
    const servers = await this.prisma.erlcServer.findMany({ where: { active: true, ...(guildId ? { OR: [{ guildId }, { guildId: null }] } : {}) }, select: { id: true, name: true, status: true, lastSyncAt: true, snapshot: true } });
    const meta = servers.map((s) => ({ id: s.id, name: s.name, status: s.status, lastSyncAt: s.lastSyncAt }));
    if (kind === 'persons') {
      const rows = servers.flatMap((s) => ((s.snapshot as ErlcSnapshot | null)?.players ?? []).map((p) => ({ serverName: s.name, name: p.name, robloxUserId: p.id, team: p.team, callsign: p.callsign, wantedStars: p.wantedStars })));
      const ids = rows.map((r) => r.robloxUserId).filter((x): x is string => !!x);
      const people = await this.prisma.person.findMany({ where: { OR: [{ robloxUserId: { in: ids } }, { robloxUsername: { in: rows.map((r) => r.name), mode: 'insensitive' } }] }, select: { id: true, robloxUserId: true, robloxUsername: true } });
      return { servers: meta, items: rows.map((r) => ({ ...r, personId: people.find((x) => (r.robloxUserId && x.robloxUserId === r.robloxUserId) || lc(x.robloxUsername) === lc(r.name))?.id ?? null })) };
    }
    const rows = servers.flatMap((s) => ((s.snapshot as ErlcSnapshot | null)?.vehicles ?? []).map((v) => ({ serverName: s.name, name: v.name, owner: v.owner, plate: v.plate, colorName: v.colorName, colorHex: v.colorHex })));
    const plates = rows.map((r) => r.plate).filter((x): x is string => !!x);
    const [cars, owners] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { plate: { in: plates, mode: 'insensitive' } }, select: { id: true, plate: true } }),
      this.prisma.person.findMany({ where: { robloxUsername: { in: rows.map((r) => r.owner), mode: 'insensitive' } }, select: { id: true, robloxUsername: true } }),
    ]);
    return { servers: meta, items: rows.map((r) => ({ ...r, vehicleId: r.plate ? cars.find((c) => lc(c.plate) === lc(r.plate!))?.id ?? null : null, ownerPersonId: owners.find((o) => lc(o.robloxUsername) === lc(r.owner))?.id ?? null })) };
  }
}
