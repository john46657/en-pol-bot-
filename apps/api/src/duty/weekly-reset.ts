import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { WEEK_TIMEZONE, nextWeekStart, weekKey, weekLabel, weekStartOf, weekTotals, type MessageSpec } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { AppError } from '../common/errors';
import { onePersonnel } from '../common/personnel-ref';

const CONFIG_KEY = 'duty.weeklyReset';
const STATE_KEY = 'duty.weeklyReset.state';
/** Postgres-Advisory-Lock: nur eine Instanz führt einen Reset gleichzeitig aus. */
const LOCK_ID = 7_310_442_001;
/** So viele verpasste Wochen werden höchstens nachgeholt (ältere bleiben ohne Archiv, die Dienstzeiten selbst bleiben erhalten). */
const MAX_CATCH_UP_WEEKS = 104;

export const weeklyResetConfigSchema = z.object({
  /** Wochen-Reset aktiv (Archiv + Rangliste + Zähler auf null) */
  enabled: z.boolean().default(true),
  /** Discord-Kanal der Rangliste; leer = Dienst-Kanal aus den Einstellungen */
  channelId: z.string().regex(/^\d{15,25}$/).nullish().transform((v) => v ?? null),
  /** so viele Plätze in der Discord-Rangliste */
  topN: z.number().int().min(1).max(25).default(10),
  /** Beamte in der Rangliste mit Discord-Erwähnung (ohne Ping) */
  mention: z.boolean().default(true),
});
export type WeeklyResetConfig = z.infer<typeof weeklyResetConfigSchema>;
interface ResetState { currentWeekStart: string; lastResetAt: string | null; lastArchiveId: string | null }

export interface RankingEntry { place: number; userId: string; name: string; rank: string | null; callsign: string | null; discordId: string | null; minutes: number; breakMinutes: number; byStatus: Record<string, number>; sessions: number }
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Bereich des Wochen-Resets (`DutyWeekArchive.scope`). Es gibt nur noch `global`; Archive anderer Bereiche aus der früheren
 * Multi-Server-Zeit (`space:…`) bleiben unverändert erhalten und erscheinen weiter in der Archivliste.
 */
interface Scope { key: 'global'; cfg: WeeklyResetConfig; channelId: string | null }
const stateKey = (_scope: string) => STATE_KEY;

/**
 * Automatischer Wochen-Reset: jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch) wird die abgelaufene Woche
 * archiviert, die Rangliste in Discord veröffentlicht und erst danach der Wochenzähler auf die neue Woche gesetzt.
 * Gelöscht wird dabei nichts – der Zähler ist nur der Beginn der laufenden Woche; alle Schichten bleiben in `DutySession`.
 * Doppelte Resets verhindern Advisory-Lock + eindeutiges (Bereich, Woche) + Archiv/Discord/Zähler in EINER Transaktion.
 */
@Injectable()
export class WeeklyResetService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly rt: RealtimeService) {}

  async config(): Promise<WeeklyResetConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } }))?.value;
    const r = weeklyResetConfigSchema.safeParse(v ?? {});
    return r.success ? r.data : weeklyResetConfigSchema.parse({});
  }

  async saveConfig(actor: Actor, input: WeeklyResetConfig) {
    const before = await this.config();
    const value = input as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'duty.weekly_reset.config', module: 'team', entityType: 'SystemSetting', entityId: CONFIG_KEY, before: before as unknown as Record<string, unknown>, after: value as Record<string, unknown> }, tx);
    });
    return this.config();
  }

  private async state(scope: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<ResetState | null> {
    const v = (await db.systemSetting.findUnique({ where: { key: stateKey(scope) } }))?.value as Partial<ResetState> | undefined;
    return v && typeof v.currentWeekStart === 'string' && !Number.isNaN(Date.parse(v.currentWeekStart)) ? { currentWeekStart: v.currentWeekStart, lastResetAt: v.lastResetAt ?? null, lastArchiveId: v.lastArchiveId ?? null } : null;
  }
  private async setState(tx: Prisma.TransactionClient, scope: string, s: ResetState) {
    const value = s as unknown as Prisma.InputJsonValue;
    await tx.systemSetting.upsert({ where: { key: stateKey(scope) }, create: { key: stateKey(scope), value }, update: { value } });
  }

  /** Der Wochen-Reset (wenn an), mit Discord-Ausgabe in den eingestellten Kanal bzw. den Dienst-Kanal. */
  async scopes(): Promise<Scope[]> {
    const g = await this.config();
    if (!g.enabled) return [];
    const channelId = g.channelId ?? (await this.discord.channels()).duty?.split(',')[0]?.trim() ?? null;
    return [{ key: 'global', cfg: g, channelId }];
  }

  /**
   * Prüft (jede halbe Minute und beim Start), ob ein Montag 00:00 überschritten ist, und holt jeden fälligen Reset genau einmal nach.
   * Ältere verpasste Wochen werden still archiviert; nur die zuletzt abgeschlossene Woche wird in Discord veröffentlicht.
   * `archived` enthält je Woche den Schlüssel (z. B. „2026-10-05“).
   */
  async tick(now = new Date()) {
    const out = { archived: [] as string[], posted: 0 };
    for (const scope of await this.scopes()) {
      const r = await this.runScope(scope, now);
      out.archived.push(...r.archived);
      out.posted += r.posted;
    }
    if (out.archived.length) this.rt.publish('team', 'duty.week.reset', { weeks: out.archived });
    return out;
  }

  private async runScope(scope: Scope, now: Date) {
    const out = { archived: [] as string[], posted: 0 };
    const target = weekStartOf(now);
    for (let i = 0; i < MAX_CATCH_UP_WEEKS + 1; i++) {
      const r = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID}::bigint # hashtext(${scope.key})::bigint)`;
        const st = await this.state(scope.key, tx);
        // Erster Start: Zähler beginnt mit der laufenden Woche (frühere Wochen werden nicht rückwirkend veröffentlicht)
        if (!st) { await this.setState(tx, scope.key, { currentWeekStart: target.toISOString(), lastResetAt: null, lastArchiveId: null }); return null; }
        let start = new Date(st.currentWeekStart);
        if (start >= target) return null;
        // zu lange aus: auf die letzten MAX_CATCH_UP_WEEKS Wochen springen
        const oldest = (() => { let p = target; for (let k = 0; k < MAX_CATCH_UP_WEEKS; k++) p = weekStartOf(new Date(p.getTime() - 1)); return p; })();
        if (start < oldest) start = oldest;
        start = weekStartOf(start); // falls der gespeicherte Wert kein Wochenbeginn ist
        const end = nextWeekStart(start);
        const latest = end.getTime() >= target.getTime();
        const existing = await tx.dutyWeekArchive.findUnique({ where: { scope_weekStart: { scope: scope.key, weekStart: start } }, select: { id: true } });
        let archive = existing ? { id: existing.id, posted: 0 } : null;
        if (!archive) archive = await this.archiveWeek(tx, scope, start, end, now, latest);
        // erst NACH Archiv und Rangliste: Wochenzähler auf die neue Woche
        await this.setState(tx, scope.key, { currentWeekStart: end.toISOString(), lastResetAt: now.toISOString(), lastArchiveId: archive.id });
        return { key: weekKey(start), posted: archive.posted, created: !existing };
      }, { timeout: 60_000, maxWait: 30_000 });
      if (!r) break;
      if (r.created) out.archived.push(r.key);
      out.posted += r.posted;
    }
    return out;
  }

  /** Archiv der Woche [start, end) anlegen; bei der zuletzt abgeschlossenen Woche die Rangliste in die Discord-Warteschlange stellen. */
  private async archiveWeek(tx: Prisma.TransactionClient, scope: Scope, start: Date, end: Date, now: Date, latest: boolean) {
    const rows = await tx.dutySession.findMany({
      where: { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] },
      select: { id: true, userId: true, serverId: true, status: true, shiftType: true, callsign: true, unitId: true, startedAt: true, endedAt: true },
      orderBy: { startedAt: 'asc' },
    });
    const ranking = await this.rank(tx, weekTotals(rows, start, end, now));
    const clip = (d: Date) => new Date(Math.min(Math.max(d.getTime(), start.getTime()), end.getTime())).toISOString();
    const sessions = rows.map((s) => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, countedFrom: clip(s.startedAt), countedTo: clip(s.endedAt ?? now) }));
    const label = weekLabel(start);
    const totalMinutes = ranking.reduce((n, r) => n + r.minutes, 0);
    const channelId = latest ? scope.channelId : null;
    const created = await tx.dutyWeekArchive.create({
      data: {
        scope: scope.key, weekStart: start, weekEnd: end, weekKey: weekKey(start), label, timezone: WEEK_TIMEZONE, totalMinutes, activeUsers: ranking.length, shiftCount: rows.length,
        ranking: ranking as unknown as Prisma.InputJsonValue, sessions: sessions as unknown as Prisma.InputJsonValue,
        discordChannelId: channelId, catchUp: now.getTime() - end.getTime() > 5 * 60_000,
      },
    });
    // gleicher Schlüssel je Woche: selbst ein erneut eingereihter Auftrag bearbeitet nur die schon gesendete Nachricht
    if (channelId) await this.discord.postMessage(`week-rank-${created.weekKey}`, channelId, this.message(scope.cfg, label, start, end, ranking, totalMinutes), { tx });
    await this.audit.record({ userId: null }, { action: 'duty.weekly_reset', module: 'team', entityType: 'DutyWeekArchive', entityId: created.id, after: { scope: scope.key, week: created.weekKey, label, activeUsers: ranking.length, totalMinutes, discordChannelId: created.discordChannelId, catchUp: created.catchUp } }, tx);
    return { id: created.id, posted: channelId ? 1 : 0 };
  }

  private async rank(db: Prisma.TransactionClient | PrismaService, totals: ReturnType<typeof weekTotals>): Promise<RankingEntry[]> {
    const ids = totals.map((t) => t.userId);
    const [users, links] = await Promise.all([
      db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, personnel: { ...onePersonnel(), select: { rank: true, callsign: true } } } }),
      db.discordLink.findMany({ where: { userId: { in: ids } }, select: { userId: true, discordId: true } }),
    ]);
    const u = new Map(users.map((x) => [x.id, x])), l = new Map(links.map((x) => [x.userId, x.discordId]));
    return totals.map((t, i) => ({ place: i + 1, ...t, name: u.get(t.userId)?.displayName ?? 'Unbekannt', rank: u.get(t.userId)?.personnel[0]?.rank ?? null, callsign: u.get(t.userId)?.personnel[0]?.callsign ?? null, discordId: l.get(t.userId) ?? null }));
  }

  private message(cfg: WeeklyResetConfig, label: string, start: Date, end: Date, ranking: RankingEntry[], total: number): MessageSpec {
    const f = (d: Date) => d.toLocaleString('de-DE', { timeZone: WEEK_TIMEZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const top = ranking.filter((r) => r.minutes > 0).slice(0, cfg.topN);
    const lines = top.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} ${cfg.mention && r.discordId ? `<@${r.discordId}>` : `**${r.name}**`}${r.callsign ? ` (${r.callsign})` : ''} – ${hm(r.minutes)} · ${r.sessions} ${r.sessions === 1 ? 'Sitzung' : 'Sitzungen'}`);
    return {
      embeds: [{
        title: `🏆 Wochenrangliste · ${label}`,
        description: (lines.length ? lines.join('\n') : '_Diese Woche war niemand im Dienst._').slice(0, 4000),
        color: 0xf59e0b,
        fields: [{ name: 'Gesamt', value: `${hm(total)} · ${ranking.filter((r) => r.minutes > 0).length} Beamte`, inline: true }, { name: 'Zeitraum', value: `${f(start)} – ${f(end)}`, inline: true }],
        footer: 'Wochen-Reset · neue Woche ab Montag 00:00 (Europe/Berlin)',
        timestamp: end.toISOString(),
      }],
      mentionUsers: [],
    };
  }

  /** Laufende Woche fürs Dashboard: Zähler seit dem letzten Reset und der nächste Reset-Zeitpunkt (je Bereich). */
  async current(now = new Date()) {
    const sc = { key: 'global', enabled: (await this.config()).enabled };
    const [st, last] = await Promise.all([this.state(sc.key), this.prisma.dutyWeekArchive.findFirst({ where: { scope: sc.key }, orderBy: { weekStart: 'desc' }, select: { id: true, label: true, weekKey: true, createdAt: true, discordChannelId: true, catchUp: true } })]);
    const start = st ? new Date(st.currentWeekStart) : weekStartOf(now);
    const next = nextWeekStart(start);
    const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { lt: now }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] }, select: { userId: true, status: true, startedAt: true, endedAt: true } });
    const users = await this.rank(this.prisma, weekTotals(sessions, start, now, now));
    return {
      scope: sc.key, enabled: sc.enabled, timezone: WEEK_TIMEZONE, weekStart: start, weekKey: weekKey(start), label: weekLabel(start),
      nextResetAt: sc.enabled ? next : null, overdue: sc.enabled && next <= now, lastResetAt: st?.lastResetAt ?? null, lastArchive: last,
      totalMinutes: users.reduce((n, r) => n + r.minutes, 0), users: users.map(({ discordId: _, ...r }) => r),
    };
  }

  /** Alle Archive (auch die früheren je Server – nichts geht verloren). */
  async archives() {
    return this.prisma.dutyWeekArchive.findMany({ orderBy: { weekStart: 'desc' }, take: 520, select: { id: true, scope: true, weekStart: true, weekEnd: true, weekKey: true, label: true, timezone: true, totalMinutes: true, activeUsers: true, shiftCount: true, ranking: true, discordChannelId: true, catchUp: true, createdAt: true } });
  }
  async archive(id: string) {
    const a = await this.prisma.dutyWeekArchive.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Wochenarchiv nicht gefunden.');
    return a;
  }
}

@ApiTags('team')
@Controller('team/week')
export class WeeklyResetController {
  constructor(private readonly s: WeeklyResetService) {}
  /** Laufende Woche (Zähler, Rangliste, nächster Reset). */
  @Get() @RequirePermission('team.view')
  current() { return this.s.current(); }
  /** Einstellungen des Wochen-Resets. */
  @Get('config') @RequirePermission('team.view')
  async config() { return { scope: 'global' as const, ...(await this.s.config()) }; }
  @Put('config') @RequirePermission('settings.manage')
  async save(@CurrentActor() a: Actor, @Body(zodBody(weeklyResetConfigSchema)) b: WeeklyResetConfig) { return { scope: 'global' as const, ...(await this.s.saveConfig(a, b)) }; }
  /** Abgeschlossene Wochen (Rangliste je Woche); nie gelöscht. */
  @Get('archives') @RequirePermission('team.view')
  archives() { return this.s.archives(); }
  /** Vollständiges Archiv inkl. aller Dienst-Sitzungen der Woche (Schichtleitung). */
  @Get('archives/:id') @RequirePermission('team.manage')
  archive(@Param('id', ParseUUIDPipe) id: string) { return this.s.archive(id); }
}
