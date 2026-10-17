import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
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
  /** Server ohne Gruppe, die den gemeinsamen Bestand nutzen (Opt-in). Alle anderen Server ohne Gruppe sind getrennt (eigene Akten). */
  sharedRecords: z.array(sf).max(50).default([]),
}).superRefine((c, ctx) => {
  const seen = new Set<string>();
  c.groups.forEach((g, i) => g.guildIds.forEach((id) => { if (seen.has(id)) ctx.addIssue({ code: 'custom', path: ['groups', i, 'guildIds'], message: 'Ein Server kann nur in einer Gruppe sein.' }); seen.add(id); }));
  if (c.sharedRecords.some((id) => seen.has(id))) ctx.addIssue({ code: 'custom', path: ['sharedRecords'], message: 'Server in einer Gruppe richten sich nach der Gruppe.' });
});
export type ServerLinks = z.infer<typeof linksSchema>;

/** Tabellen, die seit der vollständigen Trennung je Server gelten, mit ihren Eindeutigkeiten je Server. */
const LEGACY_TABLES: [string, string[]][] = [
  ['Incident', []], ['Unit', ['callsign']], ['CadMapObject', []], ['CadMember', ['userId', 'discordId']], ['Ticket', []], ['LegalCode', ['code']],
  ['Personnel', ['userId', 'callsign', 'serviceNumber']], ['HrRank', ['name']], ['HrRequest', []], ['HrTraining', []], ['HrExam', []],
  ['ServiceNumberRange', []], ['ServiceNumber', ['display']], ['HireQueue', []], ['AcademyCourse', []], ['SekMember', ['userId']], ['SekReport', []],
  ['RadioWhitelist', ['userId']], ['Workflow', []], ['Conversation', []],
];

/** Eigener Akten-Bereich eines einzelnen Servers als feste UUID (aus der Server-ID abgeleitet). */
export function ownSpace(guildId: string) {
  const h = createHash('sha256').update(`records:${guildId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Server-Verbund: Discord-Server sind standardmäßig getrennt (eigene Akten). Zusammen gehören sie nur, wenn das eingestellt
 * ist: als Gruppe (teilt Akten und/oder Einstellungen) oder per Opt-in in den gemeinsamen Bestand. Die Zuordnung liegt im Speicher, damit jede Anfrage sie ohne Datenbank-Zugriff kennt.
 */
@Injectable()
export class ServerLinksService implements OnModuleInit {
  private readonly log = new Logger('ServerLinks');
  private links: ServerLinks = { groups: [], sharedRecords: [] };
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async onModuleInit() {
    setServerLinkResolvers((g) => this.settingsGuild(g), (g) => this.space(g), () => this.knownSpaces());
    await this.reload();
    if (process.env.NODE_ENV !== 'test') await this.assignLegacyRecords().catch((e) => this.log.warn(`Zuordnung alter Einträge fehlgeschlagen: ${e instanceof Error ? e.message : e}`));
  }

  /**
   * Einmalig nach der Trennung je Server: Berichte, Fahndungen, Ermittlungen, Beschwerden, Beweismittel und Dienstzeiten
   * ohne Server gehören dem Heimat-Server der Leitstelle (bzw. dem einzigen bekannten Discord-Server). Läuft bei jedem
   * Start, bis es einen solchen Server gibt; danach nichts mehr zu tun.
   */
  async assignLegacyRecords() {
    // Daten aus dem Ein-Server-Betrieb ordnet zuerst die Rück-Umstellung zu (MultiServerRestoreService) – sonst landeten sie
    // ggf. beim früheren Heimat-Server der Leitstelle statt bei dem Server, für den sie zusammengeführt wurden
    const [single, restored] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'migration.singleServer' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'migration.multiServerRestore' } }),
    ]);
    if (single && !restored) return null;
    const [cad, known] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'cad.config' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
    ]);
    const guilds = (Array.isArray(known?.value) ? (known.value as { id?: unknown }[]) : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id));
    // Heimat-Server: Leitstelle → eingestellter Haupt-Server → einziger bekannter bzw. registrierter Server
    const channels = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
    const configured = [channels?.guildId, process.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).find((g) => /^\d{15,25}$/.test(g)) ?? null;
    const registered = await this.prisma.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true }, take: 2 });
    const home = ((cad?.value as { homeGuildId?: string | null } | null)?.homeGuildId ?? null) || configured || (guilds.length === 1 ? guilds[0]! : null) || (registered.length === 1 ? registered[0]!.guildId : null);
    if (!home) return null;
    const space = this.space(home);
    if (space === null) return null; // Heimat-Server nutzt den gemeinsamen Bestand – dort sind die Einträge schon
    const where = { serverId: null }, data = { serverId: space };
    const r = await this.prisma.$transaction([
      this.prisma.report.updateMany({ where, data }), this.prisma.complaint.updateMany({ where, data }), this.prisma.investigation.updateMany({ where, data }),
      this.prisma.wantedRecord.updateMany({ where, data }), this.prisma.evidence.updateMany({ where, data }), this.prisma.dutySession.updateMany({ where, data }),
    ]);
    let moved = r.reduce((n, x) => n + x.count, 0);
    // Seit der vollständigen Trennung ebenfalls je Server: bisher gemeinsame Einträge gehören dem Heimat-Server.
    // Bei Eindeutigkeiten je Server (z. B. eine Personalakte je Benutzer) bleibt ein Eintrag stehen, wenn es im Ziel schon einen gibt.
    for (const [table, uniques] of LEGACY_TABLES) {
      const guard = uniques.map((u) => `AND NOT EXISTS (SELECT 1 FROM "${table}" o WHERE o."serverId" = $1::uuid AND o."${u}" IS NOT NULL AND o."${u}" = t."${u}")`).join(' ');
      moved += await this.prisma.$executeRawUnsafe(`UPDATE "${table}" t SET "serverId" = $1::uuid WHERE t."serverId" IS NULL ${guard}`, space);
    }
    // CAD/ER:LC-Daten über die Discord-Server-ID: ohne Server → Heimat-Server
    for (const table of ['ErlcServer', 'CadRadioMessage', 'CadHandover', 'CadIncidentStat']) moved += await this.prisma.$executeRawUnsafe(`UPDATE "${table}" SET "guildId" = $1 WHERE "guildId" IS NULL`, home);
    if (moved) this.log.log(`${moved} bestehende Einträge dem Server ${home} zugeordnet`);
    return moved;
  }
  async reload() {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const p = linksSchema.safeParse(v ?? {});
    this.links = p.success ? p.data : { groups: [], sharedRecords: [] };
  }

  /** Akten-Bereiche der registrierten (nicht archivierten) Server und der Server-Gruppen – alles andere sind Reste früherer Umstellungen. */
  async knownSpaces(): Promise<ReadonlySet<string>> {
    const servers = await this.prisma.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true } });
    const spaces = new Set<string>(this.links.groups.map((g) => g.id!).filter(Boolean));
    for (const s of servers) { const sp = this.space(s.guildId); if (sp) spaces.add(sp); }
    return spaces;
  }

  private groupOf(guildId: string) { return this.links.groups.find((x) => x.guildIds.includes(guildId)); }
  settingsGuild(guildId: string) { const g = this.groupOf(guildId); return g?.shareSettings ? g.guildIds[0]! : guildId; }
  space(guildId: string): string | null {
    const g = this.groupOf(guildId);
    if (g) return g.shareRecords ? g.id! : ownSpace(guildId);
    return this.links.sharedRecords.includes(guildId) ? null : ownSpace(guildId);
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
    const [persons, vehicles, known] = await Promise.all([
      this.prisma.person.groupBy({ by: ['serverId'], _count: { _all: true } }),
      this.prisma.vehicle.groupBy({ by: ['serverId'], _count: { _all: true } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
    ]);
    // Getrennte Server ohne Gruppe: alle vom Bot gemeldeten, die weder in einer Gruppe noch im gemeinsamen Bestand sind
    const grouped = new Set([...this.links.groups.flatMap((g) => g.guildIds), ...this.links.sharedRecords]);
    const own = (Array.isArray(known?.value) ? (known.value as { id?: unknown }[]) : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id) && !grouped.has(id));
    const count = (rows: { serverId: string | null; _count: { _all: number } }[], s: string | null) => rows.find((r) => r.serverId === s)?._count._all ?? 0;
    const spaces = new Map<string | null, { persons: number; vehicles: number }>();
    for (const s of [null, ...this.links.groups.map((g) => g.id!), ...own.map(ownSpace)]) spaces.set(s, { persons: count(persons, s), vehicles: count(vehicles, s) });
    return { ...this.links, counts: { shared: spaces.get(null), groups: Object.fromEntries(this.links.groups.map((g) => [g.id!, spaces.get(g.id!)])), own: Object.fromEntries(own.map((id) => [id, spaces.get(ownSpace(id))])) } };
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
