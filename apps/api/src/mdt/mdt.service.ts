import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ageOf, DEFAULT_MDT_CONFIG, mdtConfigSchema, type MdtConfig, type PersonDetails } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { TimelineService } from '../timeline/timeline.service';
import { MediaService } from '../media/media.service';
import { LocksService } from '../locks/locks.service';
import { AppError } from '../common/errors';
import { recordSpace, recordWhere } from '../common/guild-context';
import { pageResult, skipTake, type PageQuery } from '../common/pagination';

const KEY = 'mdt.config';
const PHOTO_MAX = 8 * 1024 * 1024;
const ACTIVE_WANTED = ['ACTIVE'];
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const normSerial = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

/** Welche verknüpften Akten das Profil zeigt – und mit welchem Recht. */
const LINKED = [
  { type: 'Incident', perm: 'incidents.view', tab: 'incidents' },
  { type: 'Report', perm: 'reports.view', tab: 'reports' },
  { type: 'Investigation', perm: 'investigations.view', tab: 'investigations' },
  { type: 'Complaint', perm: 'complaints.view', tab: 'complaints' },
  { type: 'Evidence', perm: 'evidence.view', tab: 'evidence' },
] as const;

type PersonRow = Prisma.PersonGetPayload<object>;

/**
 * Polizei-MDT: Bürger-, Fahrzeug- und Waffenakten in der Ansicht eines Streifen-Terminals.
 * Nutzt dieselben Akten wie das Dashboard (Personen, Fahrzeuge, Fahndungen, Einsätze, Berichte …) – nichts wird doppelt gespeichert.
 * Alles zeigt nur gespeicherte Daten; was fehlt, bleibt leer („nicht erfasst“).
 */
@Injectable()
export class MdtService {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService,
    private readonly timeline: TimelineService, private readonly media: MediaService, private readonly locks: LocksService,
  ) {}

  // ───────── Einstellungen ─────────
  async config(): Promise<MdtConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const r = mdtConfigSchema.safeParse({ ...DEFAULT_MDT_CONFIG, ...((v as object | null) ?? {}) });
    return r.success ? r.data : DEFAULT_MDT_CONFIG;
  }
  async saveConfig(actor: Actor, patch: Partial<MdtConfig>) {
    const before = await this.config();
    const value = mdtConfigSchema.parse({ ...before, ...patch });
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'mdt.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, before: before as unknown as Record<string, unknown>, after: patch as Record<string, unknown> }, tx);
    });
    return value;
  }

  // ───────── Bürger ─────────
  private citizen(p: PersonRow, activeWarrants: number) {
    return {
      id: p.id, robloxUsername: p.robloxUsername, robloxUserId: p.robloxUserId, fullName: p.fullName, status: p.status, aliases: p.aliases,
      dateOfBirth: dateOnly(p.dateOfBirth), age: ageOf(dateOnly(p.dateOfBirth)), gender: p.gender, phone: p.phone, job: p.job, nationality: p.nationality, address: p.address,
      appearance: (p.appearance ?? null) as PersonDetails['appearance'], licenses: p.licenses, flags: p.flags, photoUrl: p.photoId ? `/api/v1/media/${p.photoId}` : null,
      activeWarrants, version: p.version, updatedAt: p.updatedAt,
    };
  }

  private async warrantCounts(personIds: string[]) {
    if (!personIds.length) return new Map<string, number>();
    const rows = await this.prisma.wantedRecord.groupBy({ by: ['personId'], where: { personId: { in: personIds }, status: { in: ACTIVE_WANTED } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.personId!, r._count._all]));
  }

  async citizens(p: PageQuery & { flag?: string }) {
    const q = p.q?.trim();
    const where: Prisma.PersonWhereInput = {
      ...recordWhere(), status: 'ACTIVE',
      ...(p.flag ? { flags: { has: p.flag } } : {}),
      ...(q ? { OR: [
        { robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }, { robloxUserId: q },
        { phone: { contains: q } }, { aliases: { has: q } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.person.findMany({ where, orderBy: [{ fullName: { sort: 'asc', nulls: 'last' } }, { robloxUsername: 'asc' }], ...skipTake(p) }),
      this.prisma.person.count({ where }),
    ]);
    const counts = await this.warrantCounts(items.map((i) => i.id));
    return pageResult(items.map((i) => this.citizen(i, counts.get(i.id) ?? 0)), total, p);
  }

  async profile(actor: Actor, id: string) {
    const p = await this.prisma.person.findFirst({ where: { id, ...recordWhere() } });
    if (!p) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
    const can = async (perm: string) => this.perms.has(actor.userId!, perm);
    const [canVehicles, canWeapons, canWanted] = await Promise.all([can('vehicles.view'), can('weapons.view'), can('wanted.view')]);
    const [vehicles, weapons, warrants, links, timeline] = await Promise.all([
      canVehicles ? this.prisma.vehicle.findMany({ where: { ownerId: id }, orderBy: { plate: 'asc' } }) : null,
      canWeapons ? this.prisma.weapon.findMany({ where: { ownerId: id }, orderBy: { serial: 'asc' } }) : null,
      canWanted ? this.prisma.wantedRecord.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) : null,
      this.prisma.recordLink.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 300 }),
      this.timeline.list('Person', id),
    ]);
    // verknüpfte Akten auflösen – nur Bereiche, die der Benutzer sehen darf
    const linked: Record<string, { id: string; ref: string; title: string; status: string; role: string; createdAt: Date }[] | null> = {};
    for (const l of LINKED) {
      if (!(await can(l.perm))) { linked[l.tab] = null; continue; }
      const ids = [...new Set(links.filter((x) => x.entityType === l.type).map((x) => x.entityId))];
      const role = (eid: string) => links.find((x) => x.entityType === l.type && x.entityId === eid)?.role ?? 'SUBJECT';
      const rows = !ids.length ? [] : l.type === 'Incident'
        ? (await this.prisma.incident.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.title, status: r.status, createdAt: r.createdAt }))
        : l.type === 'Report'
          ? (await this.prisma.report.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.title, status: r.status, createdAt: r.createdAt }))
          : l.type === 'Investigation'
            ? (await this.prisma.investigation.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.caseNumber, title: r.title, status: r.status, createdAt: r.createdAt }))
            : l.type === 'Complaint'
              ? (await this.prisma.complaint.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.category, status: r.status, createdAt: r.createdAt }))
              : (await this.prisma.evidence.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.description, status: r.custodyState, createdAt: r.createdAt }));
      linked[l.tab] = rows.map((r) => ({ ...r, role: role(r.id) })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    const active = warrants?.filter((w) => ACTIVE_WANTED.includes(w.status)).length ?? 0;
    return {
      person: { ...this.citizen(p, active), notes: p.notes, custom: p.custom, createdAt: p.createdAt },
      counts: {
        activeWarrants: warrants ? active : null, vehicles: vehicles?.length ?? null, weapons: weapons?.length ?? null,
        incidents: linked.incidents?.length ?? null, reports: linked.reports?.length ?? null, investigations: linked.investigations?.length ?? null, evidence: linked.evidence?.length ?? null,
      },
      vehicles, weapons, warrants, ...linked, timeline,
    };
  }

  async updateCitizen(actor: Actor, id: string, version: number, d: PersonDetails & { notes?: string | null }) {
    await this.locks.assertFree('person', id, actor.userId);
    const before = await this.prisma.person.findFirst({ where: { id, ...recordWhere() } });
    if (!before) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
    const cfg = await this.config();
    const bad = (list: string[] | undefined, allowed: { key: string }[]) => list?.find((k) => !allowed.some((a) => a.key === k));
    const badLicense = bad(d.licenses, cfg.licenses), badFlag = bad(d.flags, cfg.flags);
    if (badLicense) throw new AppError('VALIDATION_FAILED', `Unbekannte Lizenz „${badLicense}“.`);
    if (badFlag) throw new AppError('VALIDATION_FAILED', `Unbekanntes Merkmal „${badFlag}“.`);
    const { dateOfBirth, appearance, licenses, flags, ...rest } = d;
    const data: Prisma.PersonUpdateManyMutationInput = {
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v])),
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null } : {}),
      ...(appearance !== undefined ? { appearance: appearance ? (appearance as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
      ...(licenses ? { licenses: [...new Set(licenses)] } : {}), ...(flags ? { flags: [...new Set(flags)] } : {}),
    };
    if (dateOfBirth && (Number.isNaN(Date.parse(dateOfBirth)) || new Date(dateOfBirth) > new Date())) throw new AppError('VALIDATION_FAILED', 'Ungültiges Geburtsdatum.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.person.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
      if (!r.count) throw new AppError('CONFLICT', 'Die Akte wurde inzwischen von jemand anderem geändert. Bitte neu laden.');
      const after = await tx.person.findUniqueOrThrow({ where: { id } });
      const fields = Object.keys(data);
      await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.updated', summary: `Personalien geändert (${fields.join(', ')})`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.update', module: 'persons', entityType: 'Person', entityId: id, before: Object.fromEntries(fields.map((k) => [k, (before as Record<string, unknown>)[k]])), after: Object.fromEntries(fields.map((k) => [k, (after as Record<string, unknown>)[k]])) }, tx);
      return this.citizen(after, 0);
    });
  }

  /** Foto hochladen oder mit der Kamera aufnehmen (Bild bis 8 MB); ersetzt das bisherige Foto. */
  async setPhoto(actor: Actor, id: string, file: { originalname: string; mimetype: string; buffer: Buffer; size: number } | undefined) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.mimetype)) throw new AppError('VALIDATION_FAILED', 'Bitte ein Bild (PNG, JPG oder WebP) hochladen.');
    const p = await this.prisma.person.findFirst({ where: { id, ...recordWhere() } });
    if (!p) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
    const m = await this.media.upload(actor, file, { linkedType: 'Person', linkedId: id }, PHOTO_MAX);
    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({ where: { id }, data: { photoId: m.id, version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.photo', summary: 'Foto geändert', actorId: actor.userId });
      await this.audit.record(actor, { action: 'person.photo', module: 'persons', entityType: 'Person', entityId: id, before: { photoId: p.photoId }, after: { photoId: m.id } }, tx);
    });
    return { photoUrl: `/api/v1/media/${m.id}` };
  }

  // ───────── Fahrzeuge ─────────
  async vehicles(p: PageQuery) {
    const q = p.q?.trim();
    const plate = q?.toUpperCase().replace(/\s+/g, '');
    const where: Prisma.VehicleWhereInput = {
      ...recordWhere(), status: { not: 'ARCHIVED' },
      ...(q ? { OR: [{ plate: { contains: plate } }, { model: { contains: q, mode: 'insensitive' } }, { owner: { OR: [{ robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true, fullName: true } } }, orderBy: { plate: 'asc' }, ...skipTake(p) }),
      this.prisma.vehicle.count({ where }),
    ]);
    const bolos = items.length ? await this.prisma.wantedRecord.groupBy({ by: ['vehicleId'], where: { vehicleId: { in: items.map((v) => v.id) }, status: { in: ACTIVE_WANTED } }, _count: { _all: true } }) : [];
    const n = new Map(bolos.map((b) => [b.vehicleId!, b._count._all]));
    return pageResult(items.map((v) => ({ ...v, activeBolos: n.get(v.id) ?? 0 })), total, p);
  }

  async vehicle(actor: Actor, id: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, ...recordWhere() }, include: { owner: { select: { id: true, robloxUsername: true, fullName: true, flags: true, photoId: true } } } });
    if (!v) throw new AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
    const [wanted, links, timeline] = await Promise.all([
      (await this.perms.has(actor.userId!, 'wanted.view')) ? this.prisma.wantedRecord.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 50 }) : null,
      this.prisma.recordLink.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.timeline.list('Vehicle', id),
    ]);
    const incIds = links.filter((l) => l.entityType === 'Incident').map((l) => l.entityId);
    const incidents = incIds.length && (await this.perms.has(actor.userId!, 'incidents.view')) ? await this.prisma.incident.findMany({ where: { id: { in: incIds } }, select: { id: true, number: true, title: true, status: true, createdAt: true } }) : [];
    return { vehicle: { ...v, owner: v.owner ? { ...v.owner, photoUrl: v.owner.photoId ? `/api/v1/media/${v.owner.photoId}` : null } : null }, wanted, incidents, timeline };
  }

  // ───────── Waffen ─────────
  async weapons(p: PageQuery & { ownerId?: string; status?: string }) {
    const q = p.q?.trim();
    const where: Prisma.WeaponWhereInput = {
      ...recordWhere(), ...(p.ownerId ? { ownerId: p.ownerId } : {}), ...(p.status ? { status: p.status } : {}),
      ...(q ? { OR: [{ serial: { contains: normSerial(q) } }, { model: { contains: q, mode: 'insensitive' } }, { owner: { OR: [{ robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.weapon.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true, fullName: true } } }, orderBy: { serial: 'asc' }, ...skipTake(p) }),
      this.prisma.weapon.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  private async checkWeapon(d: { type?: string; ownerId?: string | null }) {
    const cfg = await this.config();
    if (d.type && !cfg.weaponTypes.some((t) => t.key === d.type)) throw new AppError('VALIDATION_FAILED', `Unbekannte Waffenart „${d.type}“.`);
    if (d.ownerId && !(await this.prisma.person.findFirst({ where: { id: d.ownerId, ...recordWhere() }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Besitzer nicht gefunden.');
  }

  async createWeapon(actor: Actor, d: { serial: string; type: string; model?: string | null; ownerId?: string | null; status?: string; notes?: string | null }) {
    await this.checkWeapon(d);
    const serial = normSerial(d.serial);
    const serverId = recordSpace() ?? null;
    if (await this.prisma.weapon.findFirst({ where: { serial, serverId } })) throw new AppError('CONFLICT', `Die Seriennummer ${serial} ist schon registriert.`);
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.weapon.create({ data: { ...d, serial, serverId } });
      if (w.ownerId) await this.timeline.add(tx, { entityType: 'Person', entityId: w.ownerId, action: 'weapon.linked', summary: `Waffe ${serial} registriert`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'weapon.create', module: 'weapons', entityType: 'Weapon', entityId: w.id, after: w }, tx);
      return w;
    });
  }

  async updateWeapon(actor: Actor, id: string, version: number, d: { type?: string; model?: string | null; ownerId?: string | null; status?: string; notes?: string | null }) {
    await this.checkWeapon(d);
    const before = await this.prisma.weapon.findFirst({ where: { id, ...recordWhere() } });
    if (!before) throw new AppError('NOT_FOUND', 'Waffe nicht gefunden.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.weapon.updateMany({ where: { id, version }, data: { ...d, version: { increment: 1 } } });
      if (!r.count) throw new AppError('CONFLICT', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden.');
      const after = await tx.weapon.findUniqueOrThrow({ where: { id } });
      if (d.ownerId !== undefined && d.ownerId !== before.ownerId && d.ownerId) await this.timeline.add(tx, { entityType: 'Person', entityId: d.ownerId, action: 'weapon.linked', summary: `Waffe ${after.serial} zugeordnet`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'weapon.update', module: 'weapons', entityType: 'Weapon', entityId: id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (before as Record<string, unknown>)[k]])), after: d }, tx);
      return after;
    });
  }

  // ───────── Haftbefehle / Fahndungen ─────────
  async warrants(status: 'ACTIVE' | 'ALL') {
    const rows = await this.prisma.wantedRecord.findMany({ where: status === 'ACTIVE' ? { status: { in: ACTIVE_WANTED } } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const [persons, vehicles] = await Promise.all([
      this.prisma.person.findMany({ where: { id: { in: rows.map((r) => r.personId).filter((x): x is string => !!x) }, ...recordWhere() }, select: { id: true, robloxUsername: true, fullName: true, photoId: true, flags: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: rows.map((r) => r.vehicleId).filter((x): x is string => !!x) }, ...recordWhere() }, select: { id: true, plate: true, model: true, color: true } }),
    ]);
    const pm = new Map(persons.map((p) => [p.id, { ...p, photoUrl: p.photoId ? `/api/v1/media/${p.photoId}` : null }])), vm = new Map(vehicles.map((v) => [v.id, v]));
    // nur Fahndungen zu Akten im gewählten Server-Bereich
    return rows.filter((r) => (r.personId ? pm.has(r.personId) : r.vehicleId ? vm.has(r.vehicleId) : true))
      .map((r) => ({ ...r, person: r.personId ? pm.get(r.personId) ?? null : null, vehicle: r.vehicleId ? vm.get(r.vehicleId) ?? null : null }));
  }
}
