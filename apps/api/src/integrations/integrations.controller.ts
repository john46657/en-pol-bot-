import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ERLC_STATUS_LABEL, type ErlcStatus } from '@enrp/shared';
import { CurrentActor, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { MonitorService, monitorConfigSchema, type MonitorConfig } from './monitor.service';
import { AppError } from '../common/errors';
import { ErlcService } from '../cad/erlc.service';

const eventsQ = z.object({ status: z.enum(['OPEN', 'RESOLVED']).optional(), source: z.enum(['ERLC', 'ERLC_STEP', 'BACKUP', 'OUTBOX']).optional(), take: z.coerce.number().int().min(1).max(500).optional() });

/**
 * Administration → Systemstatus: ER:LC-API (Status, letzte erfolgreiche Synchronisierung, Rate-Limit, Fehlerserie), Verarbeitungsschritte,
 * Discord-Bot/-Ausgang, Backups und das Störungsprotokoll. Zugangsdaten werden nie ausgeliefert.
 */
/** Backup-Center-Eintrag in der Form, die die Systemstatus-Seite anzeigt (SUCCESS | FAILED | RUNNING). */
const backupRun = (r: { createdAt: Date; status: string; fileName: string } | null) => r && { startedAt: r.createdAt, status: r.status === 'OK' ? 'SUCCESS' : r.status === 'CREATING' ? 'RUNNING' : 'FAILED', fileName: r.fileName };

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly monitor: MonitorService, private readonly prisma: PrismaService, private readonly live: DiscordLiveService, private readonly moduleRef: ModuleRef) {}

  @Get('overview') @RequirePermission('integrations.view')
  async overview() {
    const now = Date.now();
    const [servers, open, outboxPending, outboxFailed, lastBackup, lastBackupOk, lastVerify] = await Promise.all([
      this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, active: true, status: true, pollSeconds: true, lastSyncAt: true, lastError: true, lastErrorAt: true, latencyMs: true, rateLimit: true, failingSince: true, failureCount: true, features: true, webhookEnabled: true } }),
      this.prisma.integrationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { lt: 5 } } }),
      this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { gte: 5 }, createdAt: { gte: new Date(now - 24 * 3_600_000) } } }),
      // Backup-Center: Einträge der Daten-Backups (Erstellen + Prüfung)
      this.prisma.backupRecord.findFirst({ orderBy: { createdAt: 'desc' } }),
      this.prisma.backupRecord.findFirst({ where: { status: 'OK' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.backupRecord.findFirst({ where: { verifiedAt: { not: null } }, orderBy: { verifiedAt: 'desc' } }),
    ]);
    const oldestPending = outboxPending ? await this.prisma.discordOutbox.findFirst({ where: { sentAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }) : null;
    const members = this.live.getMembers();
    return {
      checkedAt: new Date(now).toISOString(),
      erlc: servers.map((s) => {
        const st = (s.active ? s.status : 'DISABLED') as ErlcStatus;
        // veraltet: letzter erfolgreicher Abruf älter als drei Abruf-Intervalle (mind. 2 Minuten)
        const staleAfter = Math.max(120_000, s.pollSeconds * 3000);
        return { ...s, status: st, statusLabel: ERLC_STATUS_LABEL[st] ?? st, stale: s.active && (!s.lastSyncAt || now - s.lastSyncAt.getTime() > staleAfter), staleAfterSeconds: Math.round(staleAfter / 1000) };
      }),
      bot: { lastReportAt: members.updatedAt, online: !!members.updatedAt && now - members.updatedAt.getTime() < 3 * 60_000, outboxPending, outboxOldestPendingAt: oldestPending?.createdAt ?? null, outboxFailed24h: outboxFailed },
      backups: { last: backupRun(lastBackup), lastSuccess: backupRun(lastBackupOk), lastVerify: lastVerify ? { startedAt: lastVerify.verifiedAt, status: lastVerify.status === 'OK' ? 'SUCCESS' : 'FAILED', fileName: lastVerify.fileName } : null },
      openIncidents: open,
      config: await this.monitor.config(),
    };
  }

  @Get('events') @RequirePermission('integrations.view') events(@Query(zodBody(eventsQ)) q: z.infer<typeof eventsQ>) { return this.monitor.events(q); }
  @Post('events/:id/acknowledge') @HttpCode(200) @RequirePermission('integrations.manage') acknowledge(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { return this.monitor.acknowledge(a, id); }
  @Put('config') @RequirePermission('integrations.manage') saveConfig(@CurrentActor() a: Actor, @Body(zodBody(monitorConfigSchema)) b: MonitorConfig) { return this.monitor.saveConfig(a, b); }

  /** Kontrollierte Wiederverbindung: Backoff zurücksetzen und sofort einmal abrufen (Rate-Limits gelten weiter). */
  @Post('erlc/:id/retry') @HttpCode(200) @RequirePermission('integrations.manage')
  async retry(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const erlc = this.moduleRef.get(ErlcService, { strict: false });
    if (!erlc) throw new AppError('CAPABILITY_UNAVAILABLE', 'ER:LC-Anbindung nicht verfügbar.');
    const r = await erlc.reconnect(a, id, 'reconnect');
    return { ok: r.ok, status: r.status, message: r.message ?? null };
  }
}
