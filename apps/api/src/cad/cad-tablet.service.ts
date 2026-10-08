import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { CadConfigService } from './cad-config.service';
import type { CadActor } from './cad.service';
import type { ErlcSnapshot } from './erlc.service';

type Availability = 'available' | 'busy' | 'unavailable';

/**
 * „Tablet“ der Leitstelle – wie das Polizei-Tablet in ER:LC: Meldungen (offene Notrufe), Aktivitätsbrett
 * (Polizisten im Spiel bzw. im Dienst mit Rufname, Rang, Dienstzeit, Verfügbarkeit), Gesucht und Auto-BOLOs.
 */
@Injectable()
export class CadTabletService {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly cfg: CadConfigService) {}

  async get(actor: CadActor) {
    const cfg = await this.cfg.get();
    const firstStatus = cfg.unitStatuses[0]?.key;
    const availability = (status: string | null | undefined): Availability => (!status ? 'available' : status === firstStatus || status === 'PATROL' ? 'available' : ['UNAVAILABLE', 'OFF_DUTY'].includes(status) ? 'unavailable' : 'busy');
    const [calls, servers, members, units, sessions, canWanted] = await Promise.all([
      this.prisma.erlcEmergencyCall.findMany({ where: { status: { in: ['OPEN', 'CLAIMED'] } }, orderBy: { startedAt: 'desc' }, take: 50 }),
      this.prisma.erlcServer.findMany({ where: { active: true }, select: { snapshot: true } }),
      this.prisma.cadMember.findMany(),
      this.prisma.unit.findMany({ select: { id: true, callsign: true, status: true } }),
      this.prisma.dutySession.findMany({ where: { endedAt: null }, include: { user: { select: { id: true, displayName: true } } } }),
      this.perms.has(actor.userId!, 'wanted.view'),
    ]);
    const unitById = new Map(units.map((u) => [u.id, u]));
    const personnel = await this.prisma.personnel.findMany({ where: { userId: { in: [...members.map((m) => m.userId), ...sessions.map((s) => s.userId)].filter((x): x is string => !!x) } }, select: { userId: true, rank: true, callsign: true } });
    const rankOf = (userId: string | null | undefined) => personnel.find((p) => p.userId === userId);
    const sessionOf = (userId: string | null | undefined) => (userId ? sessions.find((s) => s.userId === userId) : undefined);

    // Aktivitätsbrett: Polizisten im Spiel (ER:LC) – ergänzt um alle, die im Dashboard im Dienst sind
    const board: { key: string; name: string; callsign: string | null; rank: string | null; since: string | null; unitId: string | null; status: string | null; statusLabel: string | null; statusColor: string | null; availability: Availability; inGame: boolean }[] = [];
    const seenUsers = new Set<string>();
    const entry = (name: string, m: (typeof members)[number] | undefined, userId: string | null, callsign: string | null, inGame: boolean) => {
      const unit = m?.unitId ? unitById.get(m.unitId) : undefined;
      const s = sessionOf(userId);
      const st = unit?.status ?? null;
      const opt = st ? cfg.unitStatuses.find((o) => o.key === st) : undefined;
      if (userId) seenUsers.add(userId);
      board.push({ key: `${inGame ? 'g' : 'd'}:${name.toLowerCase()}`, name, callsign: callsign ?? m?.callsign ?? rankOf(userId)?.callsign ?? s?.callsign ?? unit?.callsign ?? null, rank: m?.rank ?? rankOf(userId)?.rank ?? null,
        since: s?.startedAt.toISOString() ?? null, unitId: unit?.id ?? null, status: st, statusLabel: opt ? `${opt.emoji ? `${opt.emoji} ` : ''}${opt.label}` : null, statusColor: opt?.color ?? null, availability: availability(st), inGame });
    };
    for (const srv of servers) {
      for (const p of (srv.snapshot as ErlcSnapshot | null)?.players ?? []) {
        if (p.team?.toLowerCase() !== 'police') continue;
        const m = members.find((x) => x.erlcName?.toLowerCase() === p.name.toLowerCase() || x.robloxName?.toLowerCase() === p.name.toLowerCase());
        entry(p.name, m, m?.userId ?? null, p.callsign, true);
      }
    }
    for (const s of sessions) {
      if (seenUsers.has(s.userId)) continue;
      const m = members.find((x) => x.userId === s.userId);
      entry(s.user.displayName, m, s.userId, s.callsign, false);
    }
    board.sort((a, b) => (a.callsign ?? a.name).localeCompare(b.callsign ?? b.name, 'de', { numeric: true }));

    // Eigene Einheit (für „Werde verfügbar / nicht verfügbar“)
    const mine = members.find((x) => x.userId === actor.userId || (!!actor.discordId && x.discordId === actor.discordId));
    const myUnit = mine?.unitId ? unitById.get(mine.unitId) ?? null : null;

    // Gesucht (Personen) und Auto-BOLOs (Fahrzeuge) aus den Fahndungen – nur mit Fahndungs-Recht
    let wanted: { id: string; name: string; reason: string; priority: string; since: string }[] = [];
    let bolos: { id: string; plate: string; model: string | null; color: string | null; reason: string; priority: string; since: string }[] = [];
    if (canWanted) {
      const recs = await this.prisma.wantedRecord.findMany({ where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, take: 100 });
      const [persons, vehicles] = await Promise.all([
        this.prisma.person.findMany({ where: { id: { in: recs.map((r) => r.personId).filter((x): x is string => !!x) } }, select: { id: true, robloxUsername: true } }),
        this.prisma.vehicle.findMany({ where: { id: { in: recs.map((r) => r.vehicleId).filter((x): x is string => !!x) } }, select: { id: true, plate: true, model: true, color: true } }),
      ]);
      wanted = recs.filter((r) => r.personId).map((r) => ({ id: r.id, name: persons.find((p) => p.id === r.personId)?.robloxUsername ?? 'unbekannt', reason: r.reason, priority: r.priority, since: r.createdAt.toISOString() }));
      bolos = recs.filter((r) => r.vehicleId).map((r) => { const v = vehicles.find((x) => x.id === r.vehicleId); return { id: r.id, plate: v?.plate ?? '—', model: v?.model ?? null, color: v?.color ?? null, reason: r.reason, priority: r.priority, since: r.createdAt.toISOString() }; });
    }
    // Im Spiel gesucht (Fahndungssterne aus ER:LC)
    const inGameWanted = servers.flatMap((s) => ((s.snapshot as ErlcSnapshot | null)?.players ?? []).filter((p) => p.wantedStars > 0 && p.team?.toLowerCase() !== 'sheriff').map((p) => ({ name: p.name, stars: p.wantedStars, location: p.location ? [p.location.street, p.location.postal && `PLZ ${p.location.postal}`].filter(Boolean).join(' · ') || null : null })));

    return {
      calls: calls.map((c) => ({ id: c.id, callNumber: c.callNumber, description: c.description, location: c.positionDescriptor, status: c.status, startedAt: c.startedAt.toISOString() })),
      board, available: board.filter((b) => b.availability === 'available').length,
      me: myUnit ? { unitId: myUnit.id, callsign: myUnit.callsign, status: myUnit.status, availability: availability(myUnit.status) } : null,
      statuses: { available: firstStatus ?? null, unavailable: cfg.unitStatuses.find((s) => s.key === 'UNAVAILABLE')?.key ?? null },
      wanted, bolos, inGameWanted, wantedAllowed: canWanted,
    };
  }
}
