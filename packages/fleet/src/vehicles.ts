import { assertGuildId, prisma, type Prisma } from '@nexus/database';
import { FleetError, normalizePlate, text } from './errors.js';

/**
 * Fuhrpark: Kennzeichen, Typ, Einheit, Fahrer, Status, Schäden. Ein Fahrzeug gehört höchstens einer bestehenden Einheit
 * (Zuordnung einer aufgelösten Einheit wird beim Lesen bereinigt). Der Fahrer ist über seine Discord-ID mit der
 * Personalakte verknüpft. Jede Änderung steht im Verlauf.
 */
type Json = Prisma.InputJsonValue;
export const STATUSES = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;
export type VehicleStatusKey = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<VehicleStatusKey, string> = { AVAILABLE: 'Verfügbar', IN_USE: 'Im Dienst', MAINTENANCE: 'Werkstatt', OUT_OF_SERVICE: 'Außer Dienst' };
export const SEVERITIES = ['MINOR', 'MAJOR', 'TOTAL'] as const;
export const SEVERITY_LABEL = { MINOR: 'Leicht', MAJOR: 'Schwer', TOTAL: 'Totalschaden' } as const;

async function event(guildId: string, vehicleId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.vehicleEvent.create({ data: { guildId, vehicleId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
}

export async function addVehicle(i: { guildId: string; plate: string; type: string; notes?: string | undefined; actorId: string }) {
  const guildId = assertGuildId(i.guildId);
  const plate = text(i.plate, 15, 'Das Kennzeichen');
  if (!plate || normalizePlate(plate).length < 2) throw new FleetError('invalid', 'Das Kennzeichen fehlt.');
  const type = text(i.type, 60, 'Der Fahrzeugtyp');
  if (!type) throw new FleetError('invalid', 'Der Fahrzeugtyp fehlt.');
  try {
    const v = await prisma.vehicle.create({ data: { guildId, plate: plate.toUpperCase(), plateKey: normalizePlate(plate), type, notes: text(i.notes, 500, 'Die Notiz'), activeKey: 'active' } });
    await event(guildId, v.id, 'created', i.actorId, { plate: v.plate, type });
    return v;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new FleetError('conflict', `Ein Fahrzeug mit dem Kennzeichen ${plate.toUpperCase()} ist bereits im Bestand.`);
    throw e;
  }
}

/** Entfernt Einheiten-Zuordnungen, deren Einheit nicht mehr besteht (Fahrzeug wird wieder verfügbar). */
async function cleanStale(guildId: string) {
  const assigned = await prisma.vehicle.findMany({ where: { guildId, unitId: { not: null }, activeKey: 'active' }, select: { id: true, unitId: true, status: true } });
  if (!assigned.length) return;
  const alive = new Set((await prisma.unit.findMany({ where: { guildId, activeKey: 'active', id: { in: assigned.map((a) => a.unitId!) } }, select: { id: true } })).map((u) => u.id));
  for (const v of assigned.filter((a) => !alive.has(a.unitId!))) {
    await prisma.vehicle.update({ where: { id: v.id }, data: { unitId: null, driverId: null, ...(v.status === 'IN_USE' ? { status: 'AVAILABLE' } : {}) } });
    await event(guildId, v.id, 'unit.released', null, { unitId: v.unitId, reason: 'unit-disbanded' });
  }
}

const withDamage = { damages: { where: { repairedAt: null }, orderBy: { createdAt: 'desc' as const } } } satisfies Prisma.VehicleInclude;

export async function getVehicle(guildId: string, id: string) {
  const v = await prisma.vehicle.findFirst({ where: { id, guildId: assertGuildId(guildId) }, include: withDamage });
  if (!v) throw new FleetError('not-found', 'Fahrzeug nicht gefunden.');
  return v;
}
export async function getVehicleByPlate(guildId: string, plate: string) {
  const v = await prisma.vehicle.findFirst({ where: { guildId: assertGuildId(guildId), plateKey: normalizePlate(plate), activeKey: 'active' }, include: withDamage });
  if (!v) throw new FleetError('not-found', `Kein Fahrzeug mit dem Kennzeichen ${plate.toUpperCase()} im Bestand.`);
  return v;
}

export async function listVehicles(f: { guildId: string; status?: string | undefined; unitId?: string | undefined; query?: string | undefined; includeRetired?: boolean | undefined }) {
  const guildId = assertGuildId(f.guildId);
  await cleanStale(guildId);
  const q = f.query?.trim();
  return prisma.vehicle.findMany({
    where: {
      guildId,
      ...(f.includeRetired ? {} : { activeKey: 'active' }),
      ...((STATUSES as readonly string[]).includes(f.status ?? '') ? { status: f.status as VehicleStatusKey } : {}),
      ...(f.unitId ? { unitId: f.unitId } : {}),
      ...(q ? { OR: [{ plateKey: { contains: normalizePlate(q) } }, { type: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { plate: 'asc' },
    include: withDamage,
  });
}

export async function setStatus(guildId: string, id: string, status: string, actorId: string) {
  const gid = assertGuildId(guildId);
  if (!(STATUSES as readonly string[]).includes(status)) throw new FleetError('invalid', 'Unbekannter Fahrzeugstatus.');
  const v = await getVehicle(gid, id);
  if (v.retiredAt) throw new FleetError('conflict', 'Das Fahrzeug ist ausgemustert.');
  if (v.status === status) return v;
  const next = status as VehicleStatusKey;
  // Werkstatt/außer Dienst: Einheit und Fahrer werden gelöst
  const data: Prisma.VehicleUpdateInput = { status: next, ...(next === 'MAINTENANCE' || next === 'OUT_OF_SERVICE' ? { unitId: null, driverId: null } : {}) };
  const updated = await prisma.vehicle.update({ where: { id }, data, include: withDamage });
  await event(gid, id, 'status', actorId, { from: v.status, to: next });
  return updated;
}

/** Fahrzeug einer bestehenden, besetzten Einheit zuweisen; optional mit Fahrer (muss Mitglied der Einheit sein). */
export async function assignToUnit(guildId: string, id: string, unitId: string, driverId: string | undefined, actorId: string) {
  const gid = assertGuildId(guildId);
  const v = await getVehicle(gid, id);
  if (v.retiredAt) throw new FleetError('conflict', 'Das Fahrzeug ist ausgemustert.');
  if (v.status === 'MAINTENANCE' || v.status === 'OUT_OF_SERVICE') throw new FleetError('conflict', `Das Fahrzeug ist nicht einsatzbereit (${STATUS_LABEL[v.status]}).`);
  const unit = await prisma.unit.findFirst({ where: { id: unitId, guildId: gid, activeKey: 'active' }, include: { members: { where: { openKey: 'open' } } } });
  if (!unit) throw new FleetError('not-found', 'Diese Einheit gibt es nicht (mehr).');
  if (driverId && !unit.members.some((m) => m.userId === driverId)) throw new FleetError('invalid', 'Der Fahrer muss Mitglied der Einheit sein.');
  const other = await prisma.vehicle.findFirst({ where: { guildId: gid, unitId, activeKey: 'active', id: { not: id } } });
  if (other) throw new FleetError('conflict', `Die Einheit fährt bereits ${other.plate} – zuerst freigeben.`);
  const updated = await prisma.vehicle.update({ where: { id }, data: { unitId, driverId: driverId ?? null, status: 'IN_USE' }, include: withDamage });
  await prisma.unit.update({ where: { id: unitId }, data: { vehicle: `${v.plate} (${v.type})` } });
  await event(gid, id, 'assigned', actorId, { unitId, callsign: unit.callsign, driverId: driverId ?? null });
  return updated;
}

export async function setDriver(guildId: string, id: string, driverId: string | null, actorId: string) {
  const gid = assertGuildId(guildId);
  const v = await getVehicle(gid, id);
  if (!v.unitId) throw new FleetError('conflict', 'Das Fahrzeug ist keiner Einheit zugewiesen.');
  if (driverId && !(await prisma.unitMember.count({ where: { unitId: v.unitId, userId: driverId, openKey: 'open' } }))) throw new FleetError('invalid', 'Der Fahrer muss Mitglied der Einheit sein.');
  const updated = await prisma.vehicle.update({ where: { id }, data: { driverId }, include: withDamage });
  await event(gid, id, 'driver', actorId, { from: v.driverId, to: driverId });
  return updated;
}

export async function release(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const v = await getVehicle(gid, id);
  if (!v.unitId) throw new FleetError('conflict', 'Das Fahrzeug ist keiner Einheit zugewiesen.');
  await prisma.unit.updateMany({ where: { id: v.unitId, vehicle: { startsWith: v.plate } }, data: { vehicle: null } });
  const updated = await prisma.vehicle.update({ where: { id }, data: { unitId: null, driverId: null, status: 'AVAILABLE' }, include: withDamage });
  await event(gid, id, 'released', actorId, { unitId: v.unitId });
  return updated;
}

/** Schaden melden. Totalschaden setzt das Fahrzeug außer Dienst, schwere Schäden in die Werkstatt. */
export async function reportDamage(i: { guildId: string; vehicleId: string; description: string; severity?: string | undefined; actorId: string }) {
  const gid = assertGuildId(i.guildId);
  const v = await getVehicle(gid, i.vehicleId);
  const description = text(i.description, 300, 'Die Beschreibung');
  if (!description || description.length < 3) throw new FleetError('invalid', 'Bitte den Schaden kurz beschreiben.');
  if (i.severity && !(SEVERITIES as readonly string[]).includes(i.severity)) throw new FleetError('invalid', 'Unbekannte Schadensstufe.');
  const severity = (i.severity ?? 'MINOR') as (typeof SEVERITIES)[number];
  const d = await prisma.vehicleDamage.create({ data: { guildId: gid, vehicleId: v.id, description, severity, reportedBy: i.actorId } });
  await event(gid, v.id, 'damage', i.actorId, { severity, description });
  if (severity === 'TOTAL') await setStatus(gid, v.id, 'OUT_OF_SERVICE', i.actorId);
  else if (severity === 'MAJOR' && v.status !== 'MAINTENANCE') await setStatus(gid, v.id, 'MAINTENANCE', i.actorId);
  return d;
}

/** Schaden als repariert markieren; sind alle Schäden behoben und das Fahrzeug in der Werkstatt, wird es wieder verfügbar. */
export async function repairDamage(guildId: string, damageId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const d = await prisma.vehicleDamage.findFirst({ where: { id: damageId, guildId: gid } });
  if (!d) throw new FleetError('not-found', 'Schaden nicht gefunden.');
  const r = await prisma.vehicleDamage.updateMany({ where: { id: damageId, repairedAt: null }, data: { repairedAt: new Date(), repairedBy: actorId } });
  if (r.count === 0) throw new FleetError('conflict', 'Dieser Schaden ist bereits als repariert markiert.');
  await event(gid, d.vehicleId, 'repaired', actorId, { damageId });
  const v = await getVehicle(gid, d.vehicleId);
  if (v.damages.length === 0 && v.status === 'MAINTENANCE') await setStatus(gid, v.id, 'AVAILABLE', actorId);
  return getVehicle(gid, d.vehicleId);
}

export async function retireVehicle(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const v = await getVehicle(gid, id);
  if (v.retiredAt) throw new FleetError('conflict', 'Das Fahrzeug ist bereits ausgemustert.');
  await prisma.vehicle.update({ where: { id }, data: { activeKey: null, retiredAt: new Date(), status: 'OUT_OF_SERVICE', unitId: null, driverId: null } });
  await event(gid, id, 'retired', actorId);
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'vehicle.retired', resourceType: 'Vehicle', resourceId: id, before: { plate: v.plate } as Json, permission: 'fleet.manage', result: 'success' } });
}

export const vehicleHistory = (guildId: string, id: string) => prisma.vehicleEvent.findMany({ where: { guildId: assertGuildId(guildId), vehicleId: id }, orderBy: { at: 'asc' } });

/** Fahrzeuge, die dieses Mitglied aktuell fährt (Verknüpfung zur Personalakte). */
export const vehiclesOfDriver = (guildId: string, userId: string) => prisma.vehicle.findMany({ where: { guildId: assertGuildId(guildId), driverId: userId, activeKey: 'active' } });
