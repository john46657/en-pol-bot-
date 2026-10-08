import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { BotService, Public } from '../authz/decorators';
import { webUrl } from '../common/web-url';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public() @Get('health')
  health() { return { status: 'ok' }; }

  /** Adresse des Web-Dashboards für den Discord-Befehl /dashboard. */
  @BotService() @Get('bot/dashboard-url')
  dashboardUrl() { return { url: webUrl('/') }; }

  @Public() @Get('readiness')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Die Datenbank ist nicht erreichbar.' });
    }
    return { status: 'ready', checks: { database: 'ok' } };
  }
}
