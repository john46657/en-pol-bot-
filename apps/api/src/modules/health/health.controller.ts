import { Controller, Get, HttpStatus, OnApplicationShutdown, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@nexus/database';
import { checkHealth, type HealthReport } from '@nexus/health';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { Public } from '../../common/decorators/public.decorator.js';

const CACHE_MS = 5_000;

/**
 * Gesundheitsstatus für Überwachung, Docker/Reverse-Proxy und die Statusanzeige im Dashboard. Öffentlich, aber nur
 * mit festen, kurzen Aussagen (nie Fehlertexte, Versionen oder Adressen). Antwort 200 = alles/teilweise in Ordnung,
 * 503 = Datenbank nicht erreichbar. Das Ergebnis wird 5 s zwischengespeichert, damit Abfragen nicht die Infrastruktur belasten.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController implements OnApplicationShutdown {
  private redis: Redis | null = null;
  private cached: { at: number; report: Promise<HealthReport> } | null = null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL') ?? process.env['REDIS_URL'];
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
      this.redis.on('error', () => undefined);
    }
  }

  @Get()
  @Public()
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    if (!this.cached || Date.now() - this.cached.at > CACHE_MS) {
      this.cached = { at: Date.now(), report: checkHealth({ database: () => prisma.$queryRaw`SELECT 1`, redis: this.redis }) };
    }
    const report = await this.cached.report;
    res.status(report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return report;
  }

  /** Reines „Prozess lebt“ ohne Abhängigkeiten (für Container-Neustart-Entscheidungen). */
  @Get('live')
  @Public()
  live(): { ok: true } {
    return { ok: true };
  }

  onApplicationShutdown(): void {
    this.redis?.disconnect();
  }
}
