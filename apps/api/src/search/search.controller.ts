import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { can } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { CurrentUser } from '../authz/decorators';
import type { AuthUser } from '../common/request-context';
import { zodBody } from '../common/zod.pipe';
import { SupportTicketsService } from '../support-tickets/tickets.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { currentGuild, recordWhere } from '../common/guild-context';

const q = z.object({ q: z.string().trim().min(2).max(64) });
interface Hit { type: string; id: string; label: string; sub?: string }
const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });

/**
 * Globale Suche. Jede Entitätsart wird nur durchsucht, wenn der Benutzer die View-Permission besitzt –
 * ohne Berechtigung wird nicht einmal die Anfrage an die Tabelle gestellt (keine Existenz-Leaks).
 */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly tickets: SupportTicketsService, private readonly live: DiscordLiveService) {}

  @Get()
  async search(@CurrentUser() u: AuthUser, @Query(zodBody(q)) { q: term }: z.infer<typeof q>) {
    const pctx = await this.perms.contextFor(u.id);
    const allowed = (p: string) => can(pctx, p);
    const upper = term.toUpperCase();
    const take = 8;
    const jobs: Promise<Hit[]>[] = [];
    if (allowed('persons.view')) jobs.push(this.prisma.person.findMany({ where: { ...recordWhere(), status: 'ACTIVE', OR: [{ robloxUsername: ci(term) }, { robloxUserId: term }, { aliases: { has: term } }] }, take }).then((r) => r.map((x) => ({ type: 'person', id: x.id, label: x.robloxUsername, sub: x.robloxUserId ?? undefined }))));
    if (allowed('vehicles.view')) jobs.push(this.prisma.vehicle.findMany({ where: { ...recordWhere(), plate: { contains: upper.replace(/\s+/g, '') } }, take }).then((r) => r.map((x) => ({ type: 'vehicle', id: x.id, label: x.plate, sub: x.model ?? undefined }))));
    if (allowed('incidents.view')) jobs.push(this.prisma.incident.findMany({ where: { OR: [{ number: { contains: upper } }, { title: ci(term) }] }, take }).then((r) => r.map((x) => ({ type: 'incident', id: x.id, label: x.number, sub: x.title }))));
    if (allowed('reports.view')) {
      const all = allowed('reports.review') || allowed('reports.approve');
      jobs.push(this.prisma.report.findMany({ where: { AND: [{ OR: [{ number: { contains: upper } }, { title: ci(term) }] }, all ? {} : { OR: [{ authorId: u.id }, { status: { in: ['APPROVED', 'ARCHIVED'] } }] }] }, take }).then((r) => r.map((x) => ({ type: 'report', id: x.id, label: x.number, sub: x.title }))));
    }
    if (allowed('tickets.view')) jobs.push(this.prisma.ticket.findMany({ where: { number: { contains: upper } }, take }).then((r) => r.map((x) => ({ type: 'ticket', id: x.id, label: x.number, sub: x.reason }))));
    if (allowed('complaints.view')) jobs.push(this.prisma.complaint.findMany({ where: { number: { contains: upper } }, take }).then((r) => r.map((x) => ({ type: 'complaint', id: x.id, label: x.number, sub: x.category }))));
    if (allowed('investigations.view')) jobs.push(this.prisma.investigation.findMany({ where: { OR: [{ caseNumber: { contains: upper } }, { title: ci(term) }] }, take }).then((r) => r.map((x) => ({ type: 'investigation', id: x.id, label: x.caseNumber, sub: x.title }))));
    if (allowed('wanted.view')) jobs.push(this.prisma.wantedRecord.findMany({ where: { status: 'ACTIVE', reason: ci(term) }, take }).then((r) => r.map((x) => ({ type: 'wanted', id: x.id, label: x.reason }))));
    // Beweismittel sind im Dashboard ausgeblendet – nicht mehr in der Suche anbieten
    // (evidence.view-Suche entfernt)
    if (allowed('personnel.view')) jobs.push(this.prisma.personnel.findMany({ where: { OR: [{ callsign: ci(term) }, { user: { displayName: ci(term) } }] }, include: { user: true }, take }).then((r) => r.map((x) => ({ type: 'personnel', id: x.id, label: x.user.displayName, sub: x.callsign ?? undefined }))));
    // Teamliste: Name, Dienstnummer, Team, Dienstgrad, Büro (+ Discord-Teammitglieder ohne Personalakte)
    if (allowed('team.view')) {
      jobs.push(this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] }, OR: [{ callsign: ci(term) }, { serviceNumber: ci(term) }, { team: ci(term) }, { rank: ci(term) }, { office: ci(term) }, { user: { displayName: ci(term) } }, { user: { username: ci(term) } }] }, include: { user: true }, take })
        .then((r) => r.map((x) => ({ type: 'member', id: x.userId, label: x.user.displayName, sub: [x.rank, x.team, x.office, x.serviceNumber && `Nr. ${x.serviceNumber}`].filter(Boolean).join(' · ') || undefined }))));
      const t = term.toLowerCase();
      jobs.push(Promise.resolve(this.live.getMembers().members.filter((m) => m.displayName.toLowerCase().includes(t) || m.username.toLowerCase().includes(t) || m.id === term).slice(0, take).map((m) => ({ type: 'member', id: m.id, label: m.displayName, sub: `@${m.username}` }))));
    }
    if (allowed('ticket.view')) jobs.push(this.tickets.list(u.id, { q: term, page: 1, pageSize: take }).then((r) => r.items.map((x) => ({ type: 'support-ticket', id: x.id, label: `${x.number} ${x.name}`, sub: x.creatorName }))));
    if (allowed('applications.view')) jobs.push(this.prisma.application.findMany({ where: { OR: [{ number: { contains: upper } }, { robloxUsername: ci(term) }, { discordName: ci(term) }] }, take, orderBy: { createdAt: 'desc' } }).then((r) => r.map((x) => ({ type: 'application', id: x.id, label: x.number, sub: x.robloxUsername }))));
    if (allowed('radio.view')) {
      const g = currentGuild();
      jobs.push(this.prisma.radioCode.findMany({ where: { AND: [{ OR: [{ guildId: null }, ...(g ? [{ guildId: g }] : [])] }, { OR: [{ code: ci(term) }, { meaning: ci(term) }] }] }, take }).then((r) => r.map((x) => ({ type: 'radio-code', id: x.code, label: x.code, sub: x.meaning }))));
    }
    const all = (await Promise.all(jobs)).flat();
    // dieselbe Person nicht doppelt (Personalakte + Discord)
    const seen = new Set<string>();
    return { results: all.filter((h) => { const k = h.type === 'member' ? `m:${h.label.toLowerCase()}` : `${h.type}:${h.id}`; if (seen.has(k)) return false; seen.add(k); return true; }) };
  }
}
