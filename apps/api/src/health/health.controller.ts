import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../authz/decorators';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public() @Get('health')
  health() { return { status: 'ok' }; }

  @Public() @Get('readiness')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Database unavailable.' });
    }
    return { status: 'ready', checks: { database: 'ok' } };
  }
}
