import { Injectable } from '@nestjs/common';
import { AIR_MODES, AIR_STATUS, ERLC_BUILDING_CAMERAS, type AirMode, type AirStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';
import { CadNotifyService } from './cad-notify.service';
import type { CadActor } from './cad.service';

/** Welcher Statuswechsel erlaubt ist (Anforderer darf nur abbrechen). */
const NEXT: Record<AirStatus, AirStatus[]> = { OPEN: ['ACCEPTED', 'DONE', 'CANCELLED'], ACCEPTED: ['DONE', 'CANCELLED'], DONE: [], CANCELLED: [] };

/**
 * Luftunterstützung (Hubschrauber) und Gebäudekameras. ER:LC hat für beides keine API: der Hubschrauber wird im Spiel
 * gerufen, Kameras schaut man im Spiel an – die Leitstelle koordiniert hier Anforderung, Rückmeldung und Kamerapunkte.
 */
@Injectable()
export class CadAirService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly rt: RealtimeService, private readonly notify: CadNotifyService) {}

  private async name(actor: CadActor) {
    if (!actor.userId) return null;
    const [u, m] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }),
      this.prisma.cadMember.findFirst({ where: { OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] }, select: { callsign: true } }),
    ]);
    return [m?.callsign, u?.displayName].filter(Boolean).join(' · ') || null;
  }
  private changed(id: string) { this.rt.publish('cad', 'cad.changed', { kind: 'air', id }); }

  /** Offene und die letzten erledigten Anforderungen (mit Einsatznummer). */
  async list() {
    const rows = await this.prisma.cadAirRequest.findMany({ where: { OR: [{ status: { in: ['OPEN', 'ACCEPTED'] } }, { updatedAt: { gt: new Date(Date.now() - 24 * 3_600_000) } }] }, orderBy: { createdAt: 'desc' }, take: 50 });
    const inc = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x): x is string => !!x) } }, select: { id: true, number: true, title: true } });
    return rows.map((r) => ({ ...r, incident: inc.find((i) => i.id === r.incidentId) ?? null }));
  }

  async request(actor: CadActor, d: { mode: AirMode; target?: string | null; note?: string | null; incidentId?: string | null; incidentNumber?: string | null }) {
    if (d.mode === 'SEARCH' && !d.target?.trim()) throw new AppError('VALIDATION_FAILED', 'Bitte angeben, welcher Spieler gesucht werden soll.');
    let incident: { id: string; number: string; guildId: string | null } | null = null;
    if (d.incidentId) incident = await this.prisma.incident.findUnique({ where: { id: d.incidentId }, select: { id: true, number: true, guildId: true } });
    else if (d.incidentNumber?.trim()) incident = await this.prisma.incident.findFirst({ where: { number: { equals: d.incidentNumber.trim(), mode: 'insensitive' } }, select: { id: true, number: true, guildId: true } });
    if ((d.incidentId || d.incidentNumber?.trim()) && !incident) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    const by = await this.name(actor);
    const what = d.mode === 'SEARCH' ? `🚁 Luftunterstützung angefordert – Spieler suchen: ${d.target!.trim()}` : '🚁 Luftunterstützung angefordert – Patrouille';
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.cadAirRequest.create({ data: { mode: d.mode, target: d.mode === 'SEARCH' ? d.target!.trim() : d.target?.trim() || null, note: d.note?.trim() || null, incidentId: incident?.id ?? null, requestedBy: by, authorId: actor.userId, discordId: actor.discordId ?? null, guildId: actor.guildId ?? null } });
      if (incident) await tx.cadIncidentLog.create({ data: { incidentId: incident.id, kind: 'NOTE', text: `${what}${d.note?.trim() ? ` (${d.note.trim()})` : ''}`.slice(0, 2000), authorId: actor.userId, guildId: actor.guildId ?? null } });
      await this.audit.record(actor, { action: 'cad.air.request', module: 'cad', entityType: 'CadAirRequest', entityId: r.id, after: { mode: r.mode, target: r.target, incidentId: r.incidentId } }, tx);
      return r;
    });
    this.changed(row.id);
    await this.notify.emit('air.requested', { id: row.id, number: row.number, mode: row.mode, modeLabel: AIR_MODES[d.mode], target: row.target, note: row.note, by, incidentNumber: incident?.number ?? null, dashboardUrl: webUrl('/cad/air') }, incident?.guildId ?? actor.guildId ?? null);
    return { ...row, incident };
  }

  /** Rückmeldung: Leitstelle (cad.assign_unit) übernimmt/erledigt; der Anforderer darf seine eigene abbrechen. */
  async setStatus(actor: CadActor, id: string, status: AirStatus) {
    const r = await this.prisma.cadAirRequest.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Anforderung nicht gefunden.');
    if (!NEXT[r.status as AirStatus]?.includes(status)) throw new AppError('CONFLICT', `Von „${AIR_STATUS[r.status as AirStatus] ?? r.status}“ geht es nicht zu „${AIR_STATUS[status]}“.`);
    const own = !!actor.userId && r.authorId === actor.userId;
    if (!(await this.perms.has(actor.userId!, 'cad.assign_unit')) && !(own && status === 'CANCELLED')) throw new AppError('PERMISSION_DENIED', 'Nur die Leitstelle kann Anforderungen übernehmen oder erledigen.');
    const by = await this.name(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const u = await tx.cadAirRequest.update({ where: { id }, data: { status, handledBy: status === 'CANCELLED' && own ? r.handledBy : by } });
      if (r.incidentId) await tx.cadIncidentLog.create({ data: { incidentId: r.incidentId, kind: 'NOTE', text: `🚁 Luftunterstützung #${r.number}: ${AIR_STATUS[status]}${by ? ` (${by})` : ''}`, authorId: actor.userId, guildId: actor.guildId ?? null } });
      await this.audit.record(actor, { action: 'cad.air.status', module: 'cad', entityType: 'CadAirRequest', entityId: id, before: { status: r.status }, after: { status } }, tx);
      return u;
    });
    this.changed(id);
    return row;
  }

  /** Gebäudekameras aus ER:LC als Kartenpunkte (Ebene „cameras“) anlegen – nur fehlende, ohne Position. */
  async addDefaultCameras(actor: CadActor) {
    const have = new Set((await this.prisma.cadMapObject.findMany({ where: { layer: 'cameras' }, select: { name: true } })).map((c) => c.name.toLowerCase()));
    const missing = ERLC_BUILDING_CAMERAS.filter((c) => !have.has(c.name.toLowerCase()));
    if (missing.length) await this.prisma.cadMapObject.createMany({ data: missing.map((c) => ({ kind: 'POI', name: c.name, category: c.area, layer: 'cameras', icon: '📹', color: '#64748b', createdById: actor.userId })) });
    await this.audit.record(actor, { action: 'cad.cameras.defaults', module: 'cad', after: { added: missing.length } });
    this.rt.publish('cad', 'cad.changed', { kind: 'map', id: null });
    return { added: missing.length };
  }
}
