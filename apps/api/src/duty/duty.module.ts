import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor';
import { DutyController } from './duty.controller';
import { DutyService } from './duty.service';
import { BotShiftsController, ShiftsController, ShiftsService } from './shifts';

@Module({ controllers: [DutyController, ShiftsController, BotShiftsController], providers: [DutyService, ShiftsService, { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }], exports: [DutyService, ShiftsService] })
export class DutyModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: DutyService) {}
  /** Inaktivitäts-Erinnerung jede Minute prüfen – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Duty');
    this.timer = setInterval(() => void this.s.remindTick().then((r) => { if (r.reminded || r.ended) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
