import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { setServerLinkResolvers } from '../common/guild-context';
import { AppError } from '../common/errors';

const KEY = 'servers.links';
const sf = z.string().regex(/^\d{15,25}$/, 'Discord-Server-ID (15–25 Ziffern)');
export const linksSchema = z.object({
  /** Verbundene Server: teilen Akten und/oder Einstellungen. Der erste Server ist der Haupt-Server (dessen Einstellungen gelten). */
  groups: z.array(z.object({
    id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60),
    guildIds: z.array(sf).min(2, 'Eine Gruppe braucht mindestens zwei Server.').max(20),
    shareRecords: z.boolean().default(true), shareSettings: z.boolean().default(false),
  })).max(20).default([]),
  /** Server ohne Gruppe mit eigenen Akten (sonst: gemeinsamer Bestand aller Server). */
  ownRecords: z.array(sf).max(50).default([]),
}).superRefine((c, ctx) => {
  const seen = new Set<string>();
  c.groups.forEach((g, i) => g.guildIds.forEach((id) => { if (seen.has(id)) ctx.addIssue({ code: 'custom', path: ['groups', i, 'guildIds'], message: 'Ein Server kann nur in einer Gruppe sein.' }); seen.add(id); }));
  if (c.ownRecords.some((id) => seen.has(id))) ctx.addIssue({ code: 'custom', path: ['ownRecords'], message: 'Server in einer Gruppe richten sich nach der Gruppe.' });
});
export type ServerLinks = z.infer<typeof linksSchema>;

/** Eigener Akten-Bereich eines einzelnen Servers als feste UUID (aus der Server-ID abgeleitet). */
export function ownSpace(guildId: string) {
  const h = createHash('sha256').update(`records:${guildId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Server-Verbund: Discord-Server können zusammen sein (Gruppe teilt Akten und/oder Einstellungen), müssen aber nicht
 * (eigene Akten bzw. gemeinsamer Bestand). Die Zuordnung liegt im Speicher, damit jede Anfrage sie ohne Datenbank-Zugriff kennt.
 */
@Injectable()
export class ServerLinksService implements OnModuleInit {
  private links: ServerLinks = { groups: [], ownRecords: [] };
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async onModuleInit() {
    setServerLinkResolvers((g) => this.settingsGuild(g), (g) => this.space(g));
    await this.reload();
  }
  async reload() {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const p = linksSchema.safeParse(v ?? {});
    this.links = p.success ? p.data : { groups: [], ownRecords: [] };
  }

  private groupOf(guildId: string) { return this.links.groups.find((x) => x.guildIds.includes(guildId)); }
  settingsGuild(guildId: string) { const g = this.groupOf(guildId); return g?.shareSettings ? g.guildIds[0]! : guildId; }
  space(guildId: string): string | null {
    const g = this.groupOf(guildId);
    if (g) return g.shareRecords ? g.id! : ownSpace(guildId);
    return this.links.ownRecords.includes(guildId) ? ownSpace(guildId) : null;
  }

  get() { return this.links; }
  async save(actor: Actor, input: ServerLinks) {
    // Gruppen behalten ihre ID (= Akten-Bereich), neue bekommen eine
    const value = linksSchema.parse({ ...input, groups: input.groups.map((g) => ({ ...g, id: g.id ?? randomUUID() })) });
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
      await this.audit.record(actor, { action: 'servers.links', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: json as Record<string, unknown> }, tx);
    });
    this.links = value;
    return this.overview();
  }

  /** Für die Seite: Einstellungen + Zahl der Akten je Bereich (damit man sieht, was wohin gehört). */
  async overview() {
    const [persons, vehicles] = await Promise.all([
      this.prisma.person.groupBy({ by: ['serverId'], _count: { _all: true } }),
      this.prisma.vehicle.groupBy({ by: ['serverId'], _count: { _all: true } }),
    ]);
    const count = (rows: { serverId: string | null; _count: { _all: number } }[], s: string | null) => rows.find((r) => r.serverId === s)?._count._all ?? 0;
    const spaces = new Map<string | null, { persons: number; vehicles: number }>();
    for (const s of [null, ...this.links.groups.map((g) => g.id!), ...this.links.ownRecords.map(ownSpace)]) spaces.set(s, { persons: count(persons, s), vehicles: count(vehicles, s) });
    return { ...this.links, counts: { shared: spaces.get(null), groups: Object.fromEntries(this.links.groups.map((g) => [g.id!, spaces.get(g.id!)])), own: Object.fromEntries(this.links.ownRecords.map((id) => [id, spaces.get(ownSpace(id))])) } };
  }

  /** Bestehende gemeinsame Akten in einen Bereich verschieben (z. B. nach dem Trennen eines Servers). */
  async moveShared(actor: Actor, guildId: string) {
    const target = this.space(guildId);
    if (target === null) throw new AppError('VALIDATION_FAILED', 'Dieser Server nutzt den gemeinsamen Bestand – nichts zu verschieben.');
    const [p, v] = await this.prisma.$transaction([
      this.prisma.person.updateMany({ where: { serverId: null }, data: { serverId: target } }),
      this.prisma.vehicle.updateMany({ where: { serverId: null }, data: { serverId: target } }),
    ]).catch((e) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Im Ziel gibt es schon Akten mit derselben Roblox-ID bzw. demselben Kennzeichen.'); throw e; });
    await this.audit.record(actor, { action: 'servers.links.move', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: { guildId, persons: p.count, vehicles: v.count } });
    return { persons: p.count, vehicles: v.count };
  }
}
