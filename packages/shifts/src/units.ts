import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import { ShiftError } from './errors.js';

/**
 * Dienst & Streifen: Einheiten (Streifen) bestehen aus Mitgliedern mit **laufender Schicht**. Wer die Schicht beendet,
 * verlässt die Einheit automatisch; eine leere Einheit löst sich auf. Verfügbarkeit wird aus den Schichten abgeleitet
 * (nur Mitglieder im Status ACTIVE zählen zur Besetzung) – nichts davon wird doppelt gepflegt.
 */
type Json = Prisma.InputJsonValue;
export const MAX_UNIT_MEMBERS = 8;
export const UNIT_STATUS_LABEL = { AVAILABLE: 'Verfügbar', BUSY: 'Im Einsatz', BREAK: 'Pause', UNAVAILABLE: 'Nicht verfügbar' } as const;
export type UnitStatusKey = keyof typeof UNIT_STATUS_LABEL;
const STATUSES = Object.keys(UNIT_STATUS_LABEL) as UnitStatusKey[];

async function log(unitId: string, guildId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.unitEvent.create({ data: { unitId, guildId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
  // Manuelles Auflösen hat einen eigenen Audit-Eintrag mit Berechtigung
  if (!(type === 'disbanded' && (data as { reason?: string } | undefined)?.reason === 'manual')) await auditRepository.mirrorEvent({ guildId, area: 'unit', resourceType: 'Unit', resourceId: unitId, type, actorId, data });
}

const unitInclude = { members: { where: { openKey: 'open' }, orderBy: { joinedAt: 'asc' } } } as const;

export const callsignOk = (v: string) => /^[\p{L}\p{N}][\p{L}\p{N} .\-/]{0,29}$/u.test(v);

async function openShiftOf(guildId: string, userId: string, mustBeActive = false) {
  const s = await prisma.shift.findFirst({ where: { guildId, userId, status: { in: ['ACTIVE', 'PAUSED'] } }, include: { type: true } });
  if (!s) throw new ShiftError('conflict', 'Du bist nicht im Dienst – starte zuerst eine Schicht mit `/schicht start`.');
  if (mustBeActive && s.status === 'PAUSED') throw new ShiftError('conflict', 'Du bist in der Pause – setze die Schicht zuerst fort.');
  return s;
}

export async function getUnitOf(guildId: string, userId: string) {
  const m = await prisma.unitMember.findFirst({ where: { guildId: assertGuildId(guildId), userId, openKey: 'open' }, include: { unit: { include: unitInclude } } });
  return m?.unit ?? null;
}

async function loadUnit(guildId: string, id: string) {
  const u = await prisma.unit.findFirst({ where: { id, guildId, activeKey: 'active' }, include: unitInclude });
  if (!u) throw new ShiftError('not-found', 'Diese Einheit gibt es nicht (mehr).');
  return u;
}

export interface CreateUnitInput {
  guildId: string;
  userId: string;
  callsign: string;
  kind?: string | undefined;
  vehicle?: string | undefined;
  location?: string | undefined;
}

/** Streife bilden: der Ersteller (im Dienst) wird Streifenführer. */
export async function createUnit(input: CreateUnitInput) {
  const guildId = assertGuildId(input.guildId);
  const callsign = input.callsign.trim();
  if (!callsignOk(callsign)) throw new ShiftError('invalid', 'Der Rufname darf 1–30 Zeichen haben (Buchstaben, Zahlen, Leerzeichen, . - /).');
  if (await getUnitOf(guildId, input.userId)) throw new ShiftError('conflict', 'Du bist bereits in einer Einheit – verlasse sie zuerst.');
  const shift = await openShiftOf(guildId, input.userId, true);
  try {
    const unit = await prisma.unit.create({
      data: {
        guildId, callsign, kind: input.kind?.trim() || shift.type.name, activeKey: 'active', createdBy: input.userId,
        vehicle: input.vehicle?.trim() || null, location: input.location?.trim() || null,
        members: { create: { guildId, userId: input.userId, shiftId: shift.id, role: 'LEADER', openKey: 'open' } },
      },
      include: unitInclude,
    });
    await log(unit.id, guildId, 'created', input.userId, { callsign });
    return unit;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new ShiftError('conflict', `Der Rufname „${callsign}“ ist gerade vergeben.`);
    throw e;
  }
}

async function addMember(guildId: string, unitId: string, userId: string, actorId: string, forced: boolean) {
  const unit = await loadUnit(guildId, unitId);
  if (unit.members.length >= MAX_UNIT_MEMBERS) throw new ShiftError('conflict', `Die Einheit ist voll (max. ${MAX_UNIT_MEMBERS}).`);
  if (await getUnitOf(guildId, userId)) throw new ShiftError('conflict', forced ? 'Dieses Mitglied ist bereits in einer Einheit.' : 'Du bist bereits in einer Einheit – verlasse sie zuerst.');
  const shift = await openShiftOf(guildId, userId, !forced);
  try {
    await prisma.unitMember.create({ data: { guildId, unitId, userId, shiftId: shift.id, openKey: 'open' } });
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new ShiftError('conflict', 'Bereits in einer Einheit.');
    throw e;
  }
  await log(unitId, guildId, 'joined', actorId, { userId, forced });
  return loadUnit(guildId, unitId);
}

export const joinUnit = (guildId: string, userId: string, unitId: string) => addMember(assertGuildId(guildId), unitId, userId, userId, false);
/** Führung weist ein Mitglied (mit laufender Schicht) einer Einheit zu. */
export const assignToUnit = (guildId: string, userId: string, unitId: string, actorId: string) => addMember(assertGuildId(guildId), unitId, userId, actorId, true);

async function disband(unitId: string, guildId: string, actorId: string | null, reason: string) {
  await prisma.unit.updateMany({ where: { id: unitId, activeKey: 'active' }, data: { activeKey: null, disbandedAt: new Date(), status: 'UNAVAILABLE' } });
  await log(unitId, guildId, 'disbanded', actorId, { reason });
}

/** Mitglied verlässt (oder wird aus) einer Einheit entfernt; leere Einheit löst sich auf, Führung rückt nach. Gibt die Einheit zurück oder null. */
export async function leaveUnit(guildId: string, userId: string, actorId: string = userId, reason = 'left') {
  const gid = assertGuildId(guildId);
  const m = await prisma.unitMember.findFirst({ where: { guildId: gid, userId, openKey: 'open' } });
  if (!m) return null;
  await prisma.unitMember.update({ where: { id: m.id }, data: { openKey: null, leftAt: new Date() } });
  await log(m.unitId, gid, 'left', actorId, { userId, reason });
  const rest = await prisma.unitMember.findMany({ where: { unitId: m.unitId, openKey: 'open' }, orderBy: { joinedAt: 'asc' } });
  if (rest.length === 0) {
    await disband(m.unitId, gid, actorId, 'empty');
    return null;
  }
  if (m.role === 'LEADER' && !rest.some((r) => r.role === 'LEADER')) {
    await prisma.unitMember.update({ where: { id: rest[0]!.id }, data: { role: 'LEADER' } });
    await log(m.unitId, gid, 'leader', null, { userId: rest[0]!.userId, reason: 'succession' });
  }
  return prisma.unit.findUnique({ where: { id: m.unitId }, include: unitInclude });
}

export interface UnitPatch {
  status?: string | undefined;
  vehicle?: string | undefined;
  location?: string | undefined;
  note?: string | undefined;
}

/** Status/Fahrzeug/Standort/Notiz ändern: Mitglieder der Einheit oder Führung (`manage`). */
export async function updateUnit(guildId: string, unitId: string, patch: UnitPatch, actorId: string, manage = false) {
  const gid = assertGuildId(guildId);
  const unit = await loadUnit(gid, unitId);
  if (!manage && !unit.members.some((m) => m.userId === actorId)) throw new ShiftError('forbidden', 'Nur Mitglieder der Einheit oder die Führung können sie ändern.');
  const data: Prisma.UnitUpdateInput = {};
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as UnitStatusKey)) throw new ShiftError('invalid', 'Unbekannter Status.');
    if (patch.status !== unit.status) {
      data.status = patch.status as UnitStatusKey;
      data.statusSince = new Date();
    }
  }
  for (const k of ['vehicle', 'location', 'note'] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v.length > 100) throw new ShiftError('invalid', 'Der Text ist zu lang (max. 100 Zeichen).');
    data[k] = v.trim() || null;
  }
  if (Object.keys(data).length === 0) return unit;
  const updated = await prisma.unit.update({ where: { id: unitId }, data, include: unitInclude });
  await log(unitId, gid, 'updated', actorId, { before: { status: unit.status, vehicle: unit.vehicle, location: unit.location, note: unit.note }, patch });
  return updated;
}

export async function disbandUnit(guildId: string, unitId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const unit = await loadUnit(gid, unitId);
  const now = new Date();
  await prisma.unitMember.updateMany({ where: { unitId, openKey: 'open' }, data: { openKey: null, leftAt: now } });
  await disband(unitId, gid, actorId, 'manual');
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'unit.disbanded', resourceType: 'Unit', resourceId: unitId, before: { callsign: unit.callsign } as Json, permission: 'duty.unit.manage', result: 'success' } });
}

// --- Übersicht -----------------------------------------------------------------------------------

export interface UnitView {
  id: string;
  callsign: string;
  kind: string;
  /** Gespeicherter Status. */
  status: UnitStatusKey;
  /** Tatsächliche Verfügbarkeit: berücksichtigt Besetzung (nur Mitglieder im Dienst, nicht in Pause). */
  availability: UnitStatusKey;
  statusSince: Date;
  vehicle: string | null;
  location: string | null;
  note: string | null;
  staffing: { active: number; paused: number; total: number };
  members: { userId: string; role: 'LEADER' | 'MEMBER'; onBreak: boolean }[];
}

export interface DutyOverview {
  units: UnitView[];
  /** Im Dienst, aber in keiner Einheit. */
  unassigned: { userId: string; type: string; since: Date; paused: boolean }[];
  counts: { onDuty: number; onBreak: number; units: number; available: number; busy: number; unavailable: number };
}

export async function dutyOverview(guildId: string): Promise<DutyOverview> {
  const gid = assertGuildId(guildId);
  const [units, shifts] = await Promise.all([
    prisma.unit.findMany({ where: { guildId: gid, activeKey: 'active' }, include: unitInclude, orderBy: { callsign: 'asc' } }),
    prisma.shift.findMany({ where: { guildId: gid, status: { in: ['ACTIVE', 'PAUSED'] } }, include: { type: true }, orderBy: { startedAt: 'asc' } }),
  ]);
  const paused = new Set(shifts.filter((s) => s.status === 'PAUSED').map((s) => s.id));
  const inUnit = new Set(units.flatMap((u) => u.members.map((m) => m.userId)));
  const views: UnitView[] = units.map((u) => {
    const members = u.members.map((m) => ({ userId: m.userId, role: m.role, onBreak: paused.has(m.shiftId) }));
    const active = members.filter((m) => !m.onBreak).length;
    const availability: UnitStatusKey = active === 0 ? 'UNAVAILABLE' : u.status;
    return { id: u.id, callsign: u.callsign, kind: u.kind, status: u.status, availability, statusSince: u.statusSince, vehicle: u.vehicle, location: u.location, note: u.note, staffing: { active, paused: members.length - active, total: members.length }, members };
  });
  return {
    units: views,
    unassigned: shifts.filter((s) => !inUnit.has(s.userId)).map((s) => ({ userId: s.userId, type: s.type.name, since: s.startedAt, paused: s.status === 'PAUSED' })),
    counts: {
      onDuty: shifts.length - paused.size,
      onBreak: paused.size,
      units: views.length,
      available: views.filter((v) => v.availability === 'AVAILABLE').length,
      busy: views.filter((v) => v.availability === 'BUSY').length,
      unavailable: views.filter((v) => v.availability === 'UNAVAILABLE' || v.availability === 'BREAK').length,
    },
  };
}

/** Dienststatus einer Person (abgeleitet aus Schicht und Einheit). */
export async function dutyStatusOf(guildId: string, userId: string) {
  const gid = assertGuildId(guildId);
  const shift = await prisma.shift.findFirst({ where: { guildId: gid, userId, status: { in: ['ACTIVE', 'PAUSED'] } }, include: { type: true } });
  if (!shift) return { state: 'OFF_DUTY' as const, shift: null, unit: null };
  const unit = await getUnitOf(gid, userId);
  return { state: shift.status === 'PAUSED' ? ('ON_BREAK' as const) : unit ? ('IN_UNIT' as const) : ('ON_DUTY' as const), shift, unit };
}

export async function unitHistory(guildId: string, unitId: string) {
  return prisma.unitEvent.findMany({ where: { guildId: assertGuildId(guildId), unitId }, orderBy: { at: 'asc' } });
}
