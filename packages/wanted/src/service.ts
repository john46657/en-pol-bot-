import { assertGuildId, prisma, type Prisma } from '@nexus/database';

/**
 * Fahndungen: Personen und Fahrzeuge getrennt behandelt (eigene Pflichtfelder, eigene Suche), mit fortlaufender
 * Nummer (F-0001), Historie (jede Änderung mit Vorher/Nachher) und Aufheben mit Grund. Dieselbe Person bzw. dasselbe
 * Kennzeichen kann nur einmal gleichzeitig aktiv gesucht werden.
 */
type Json = Prisma.InputJsonValue;
export type Kind = 'PERSON' | 'VEHICLE';
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const PRIORITY_LABEL = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' } as const;
export const KIND_LABEL = { PERSON: 'Personenfahndung', VEHICLE: 'Fahrzeugfahndung' } as const;
export const formatNumber = (n: number) => `F-${String(n).padStart(4, '0')}`;

export class WantedError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'WantedError';
  }
}

/** Kennzeichen vergleichen: Groß, ohne Leerzeichen/Bindestriche. */
export const normalizePlate = (p: string) => p.toUpperCase().replace(/[\s\-.]/g, '');
export const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

const txt = (v: string | undefined | null, max: number, label: string) => {
  const t = v?.trim();
  if (t && t.length > max) throw new WantedError('invalid', `${label} ist zu lang (max. ${max} Zeichen).`);
  return t || null;
};

export interface NoticeInput {
  guildId: string;
  kind: string;
  actorId: string;
  reason: string;
  priority?: string | undefined;
  lastSeen?: string | undefined;
  notes?: string | undefined;
  // Person
  subjectName?: string | undefined;
  subjectUserId?: string | undefined;
  appearance?: string | undefined;
  // Fahrzeug
  plate?: string | undefined;
  vehicleModel?: string | undefined;
  vehicleColor?: string | undefined;
  ownerName?: string | undefined;
}

async function event(guildId: string, noticeId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.wantedEvent.create({ data: { guildId, noticeId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
}

function fields(i: Omit<NoticeInput, 'guildId' | 'actorId' | 'kind'>, kind: Kind) {
  const reason = txt(i.reason, 500, 'Der Fahndungsgrund');
  if (!reason || reason.length < 3) throw new WantedError('invalid', 'Bitte einen Fahndungsgrund angeben.');
  if (i.priority && !(PRIORITIES as readonly string[]).includes(i.priority)) throw new WantedError('invalid', 'Unbekannte Priorität.');
  if (i.subjectUserId && !/^\d{5,25}$/.test(i.subjectUserId)) throw new WantedError('invalid', 'Ungültige Discord-ID.');
  const common = { reason, priority: i.priority ?? 'NORMAL', lastSeen: txt(i.lastSeen, 150, 'Der letzte Standort'), notes: txt(i.notes, 1000, 'Die Notiz') };
  if (kind === 'PERSON') {
    const name = txt(i.subjectName, 80, 'Der Name');
    if (!name) throw new WantedError('invalid', 'Für eine Personenfahndung ist der Name nötig.');
    if (i.plate || i.vehicleModel) throw new WantedError('invalid', 'Fahrzeugangaben gehören zu einer Fahrzeugfahndung.');
    return { ...common, subjectKey: normalizeName(name), subjectName: name, subjectUserId: i.subjectUserId ?? null, appearance: txt(i.appearance, 500, 'Die Beschreibung') };
  }
  const plate = txt(i.plate, 15, 'Das Kennzeichen');
  if (!plate || normalizePlate(plate).length < 2) throw new WantedError('invalid', 'Für eine Fahrzeugfahndung ist das Kennzeichen nötig.');
  if (i.subjectName || i.appearance) throw new WantedError('invalid', 'Personenangaben gehören zu einer Personenfahndung.');
  return { ...common, subjectKey: normalizePlate(plate), plate: plate.toUpperCase(), vehicleModel: txt(i.vehicleModel, 60, 'Das Modell'), vehicleColor: txt(i.vehicleColor, 30, 'Die Farbe'), ownerName: txt(i.ownerName, 80, 'Der Halter') };
}

const kindOf = (k: string): Kind => {
  if (k !== 'PERSON' && k !== 'VEHICLE') throw new WantedError('invalid', 'Unbekannte Fahndungsart.');
  return k;
};

export async function createNotice(i: NoticeInput) {
  const guildId = assertGuildId(i.guildId);
  const kind = kindOf(i.kind);
  const data = fields(i, kind);
  try {
    const n = await prisma.$transaction(async (tx) => {
      const c = await tx.wantedCounter.upsert({ where: { guildId }, create: { guildId, last: 1 }, update: { last: { increment: 1 } } });
      return tx.wantedNotice.create({ data: { guildId, number: c.last, kind, activeKey: 'active', createdBy: i.actorId, ...data } });
    });
    await event(guildId, n.id, 'created', i.actorId, { number: n.number, kind });
    return n;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) {
      const dup = await prisma.wantedNotice.findFirst({ where: { guildId, kind, subjectKey: data.subjectKey, activeKey: 'active' } });
      throw new WantedError('conflict', `Dazu läuft bereits die Fahndung ${dup ? formatNumber(dup.number) : ''} – bitte diese bearbeiten.`);
    }
    throw e;
  }
}

export async function getNotice(guildId: string, id: string) {
  const n = await prisma.wantedNotice.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!n) throw new WantedError('not-found', 'Fahndung nicht gefunden.');
  return n;
}
export async function getByNumber(guildId: string, number: number) {
  const n = await prisma.wantedNotice.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } } });
  if (!n) throw new WantedError('not-found', `Fahndung ${formatNumber(number)} nicht gefunden.`);
  return n;
}

type Patchable = Omit<NoticeInput, 'guildId' | 'actorId' | 'kind'>;
export type NoticePatch = { [K in keyof Patchable]?: Patchable[K] | undefined };
const TRACKED = ['reason', 'priority', 'lastSeen', 'notes', 'subjectName', 'subjectUserId', 'appearance', 'plate', 'vehicleModel', 'vehicleColor', 'ownerName'] as const;

/** Ändert eine aktive Fahndung; Vorher/Nachher der geänderten Felder landet in der Historie. */
export async function updateNotice(guildId: string, id: string, patch: NoticePatch, actorId: string) {
  const gid = assertGuildId(guildId);
  const n = await getNotice(gid, id);
  if (n.status !== 'ACTIVE') throw new WantedError('conflict', 'Eine aufgehobene Fahndung lässt sich nicht bearbeiten – ggf. neu anlegen.');
  const merged = { reason: n.reason, priority: n.priority, lastSeen: n.lastSeen ?? undefined, notes: n.notes ?? undefined, subjectName: n.subjectName ?? undefined, subjectUserId: n.subjectUserId ?? undefined, appearance: n.appearance ?? undefined, plate: n.plate ?? undefined, vehicleModel: n.vehicleModel ?? undefined, vehicleColor: n.vehicleColor ?? undefined, ownerName: n.ownerName ?? undefined, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Patchable;
  const data = fields(merged, n.kind);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of TRACKED) {
    const was = (n as Record<string, unknown>)[k] ?? null;
    const now = (data as Record<string, unknown>)[k] ?? null;
    if (was !== now) {
      before[k] = was;
      after[k] = now;
    }
  }
  if (Object.keys(after).length === 0) throw new WantedError('invalid', 'Es wurde nichts geändert.');
  try {
    const updated = await prisma.wantedNotice.update({ where: { id }, data });
    await event(gid, id, 'updated', actorId, { before, after });
    return updated;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new WantedError('conflict', 'Dazu läuft bereits eine andere aktive Fahndung.');
    throw e;
  }
}

/** Fahndung aufheben (Grund Pflicht, z. B. „Festgenommen“, „Fahrzeug sichergestellt“). */
export async function revokeNotice(guildId: string, id: string, reason: string | undefined, actorId: string, permission = 'wanted.revoke') {
  const gid = assertGuildId(guildId);
  const n = await getNotice(gid, id);
  const why = reason?.trim();
  if (!why || why.length < 3) throw new WantedError('invalid', 'Bitte einen Grund für das Aufheben angeben.');
  if (why.length > 300) throw new WantedError('invalid', 'Der Grund ist zu lang (max. 300 Zeichen).');
  const r = await prisma.wantedNotice.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'REVOKED', activeKey: null, revokedBy: actorId, revokeReason: why, revokedAt: new Date() } });
  if (r.count === 0) throw new WantedError('conflict', 'Diese Fahndung ist bereits aufgehoben.');
  await event(gid, id, 'revoked', actorId, { reason: why });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'wanted.revoked', resourceType: 'WantedNotice', resourceId: id, before: { number: n.number, status: 'ACTIVE' } as Json, after: { status: 'REVOKED' } as Json, reason: why, permission, result: 'success' } });
  return getNotice(gid, id);
}

export interface SearchFilter {
  guildId: string;
  kind?: string | undefined;
  status?: string | undefined;
  /** Freitext: Name, Kennzeichen, Modell, Halter, Grund, Nummer (F-0007 oder 7). */
  query?: string | undefined;
  priority?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export async function searchNotices(f: SearchFilter) {
  const guildId = assertGuildId(f.guildId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const q = f.query?.trim();
  const num = q && /^(?:F-?)?(\d{1,6})$/i.exec(q);
  const or: Prisma.WantedNoticeWhereInput[] = q
    ? [
        ...(num ? [{ number: Number(num[1]) }] : []),
        { subjectKey: { contains: normalizeName(q) } },
        { subjectKey: { contains: normalizePlate(q) } },
        { subjectName: { contains: q, mode: 'insensitive' } },
        { plate: { contains: q, mode: 'insensitive' } },
        { vehicleModel: { contains: q, mode: 'insensitive' } },
        { ownerName: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
      ]
    : [];
  const rows = await prisma.wantedNotice.findMany({
    where: {
      guildId,
      ...(f.kind === 'PERSON' || f.kind === 'VEHICLE' ? { kind: f.kind } : {}),
      ...(f.status === 'ACTIVE' || f.status === 'REVOKED' ? { status: f.status } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(or.length ? { OR: or } : {}),
    },
    orderBy: [{ number: 'desc' }],
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Schnellprüfung: wird diese Person/dieses Kennzeichen aktuell gesucht? */
export async function checkSubject(guildId: string, kind: Kind, value: string) {
  return prisma.wantedNotice.findFirst({ where: { guildId: assertGuildId(guildId), kind, status: 'ACTIVE', subjectKey: kind === 'PERSON' ? normalizeName(value) : normalizePlate(value) } });
}

export const history = (guildId: string, id: string) => prisma.wantedEvent.findMany({ where: { guildId: assertGuildId(guildId), noticeId: id }, orderBy: { at: 'asc' } });
