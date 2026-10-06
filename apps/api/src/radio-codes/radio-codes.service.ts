import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';

export interface RadioCodeInput { code?: string; meaning?: string; category?: string | null; description?: string | null; guildId?: string | null }

/** Gängige Funkcodes als Startpunkt („Standard-Codes einfügen“) – alles änderbar. */
export const DEFAULT_RADIO_CODES: { code: string; meaning: string; category: string }[] = [
  { code: '10-1', meaning: 'Schlechter Empfang', category: 'Funk' }, { code: '10-2', meaning: 'Guter Empfang', category: 'Funk' },
  { code: '10-3', meaning: 'Funkstille', category: 'Funk' }, { code: '10-4', meaning: 'Verstanden', category: 'Funk' },
  { code: '10-6', meaning: 'Beschäftigt', category: 'Status' }, { code: '10-7', meaning: 'Außer Dienst', category: 'Status' },
  { code: '10-8', meaning: 'Im Dienst / einsatzbereit', category: 'Status' }, { code: '10-9', meaning: 'Bitte wiederholen', category: 'Funk' },
  { code: '10-20', meaning: 'Standort', category: 'Einsatz' }, { code: '10-23', meaning: 'Am Einsatzort eingetroffen', category: 'Einsatz' },
  { code: '10-32', meaning: 'Verstärkung benötigt', category: 'Einsatz' }, { code: '10-38', meaning: 'Verkehrskontrolle', category: 'Einsatz' },
  { code: '10-50', meaning: 'Verkehrsunfall', category: 'Einsatz' }, { code: '10-80', meaning: 'Verfolgungsfahrt', category: 'Einsatz' },
  { code: '10-99', meaning: 'Beamter in Not', category: 'Notfall' }, { code: 'Code 3', meaning: 'Einsatzfahrt mit Sonderrechten', category: 'Einsatz' },
];

/**
 * Funk-Codes je Server (Server getrennt) oder für alle Server. Im Server-Kontext sieht man die Codes dieses Servers
 * und die gemeinsamen; ein Server-Code überdeckt einen gemeinsamen mit gleichem Code.
 */
@Injectable()
export class RadioCodesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q?: string, guildId: string | null = currentGuild()) {
    const t = q?.trim();
    const rows = await this.prisma.radioCode.findMany({
      where: { AND: [{ OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, t ? { OR: [{ code: { contains: t, mode: 'insensitive' } }, { meaning: { contains: t, mode: 'insensitive' } }, { category: { contains: t, mode: 'insensitive' } }] } : {}] },
      orderBy: [{ position: 'asc' }, { code: 'asc' }], take: 500,
    });
    const own = new Set(rows.filter((r) => r.guildId).map((r) => r.code.toLowerCase()));
    return rows.filter((r) => r.guildId || !own.has(r.code.toLowerCase()));
  }

  private async load(id: string) {
    const r = await this.prisma.radioCode.findUnique({ where: { id } });
    const g = currentGuild();
    if (!r || (g && r.guildId && r.guildId !== g)) throw new AppError('NOT_FOUND', 'Radio code not found.');
    return r;
  }

  private uniq(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
    throw e;
  }

  /** (gemeinsame Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
  private async assertFree(guildId: string | null, code: string, exceptId?: string) {
    const dup = await this.prisma.radioCode.findFirst({ where: { guildId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (dup) throw new AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
  }

  async create(actor: Actor, d: Required<Pick<RadioCodeInput, 'code' | 'meaning'>> & RadioCodeInput) {
    const guildId = d.guildId === undefined ? currentGuild() : d.guildId;
    await this.assertFree(guildId, d.code);
    const position = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
    const r = await this.prisma.radioCode.create({ data: { code: d.code, meaning: d.meaning, category: d.category ?? null, description: d.description ?? null, guildId, position } }).catch((e) => this.uniq(e));
    await this.audit.record(actor, { action: 'radiocode.create', module: 'radio', entityType: 'RadioCode', entityId: r.id, after: r });
    return r;
  }

  async update(actor: Actor, id: string, d: RadioCodeInput) {
    const before = await this.load(id);
    const data = { code: d.code, meaning: d.meaning, category: d.category, description: d.description }; // Server-Zugehörigkeit bleibt
    if (data.code) await this.assertFree(before.guildId, data.code, id);
    const r = await this.prisma.radioCode.update({ where: { id }, data }).catch((e) => this.uniq(e));
    await this.audit.record(actor, { action: 'radiocode.update', module: 'radio', entityType: 'RadioCode', entityId: id, before, after: r });
    return r;
  }

  async remove(actor: Actor, id: string) {
    const before = await this.load(id);
    await this.prisma.radioCode.delete({ where: { id } });
    await this.audit.record(actor, { action: 'radiocode.delete', module: 'radio', entityType: 'RadioCode', entityId: id, before });
  }

  async reorder(actor: Actor, ids: string[]) {
    for (const id of ids) await this.load(id);
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.radioCode.update({ where: { id }, data: { position: i + 1 } })));
    await this.audit.record(actor, { action: 'radiocode.reorder', module: 'radio', after: { count: ids.length } });
    return this.list();
  }

  /** Standard-Codes für den gewählten Server (bzw. alle Server) einfügen – vorhandene Codes bleiben unverändert. */
  async insertDefaults(actor: Actor) {
    const guildId = currentGuild();
    const existing = new Set((await this.prisma.radioCode.findMany({ where: { guildId }, select: { code: true } })).map((r) => r.code.toLowerCase()));
    const add = DEFAULT_RADIO_CODES.filter((c) => !existing.has(c.code.toLowerCase()));
    const base = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
    if (add.length) await this.prisma.radioCode.createMany({ data: add.map((c, i) => ({ ...c, guildId, position: base + i })) });
    await this.audit.record(actor, { action: 'radiocode.defaults', module: 'radio', after: { added: add.length, guildId } });
    return { added: add.length };
  }
}
