import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor';
import { DutyController } from './duty.controller';
import { DutyService } from './duty.service';
import { BotShiftsController, ShiftsController, ShiftsService } from './shifts';
import { WeeklyResetController, WeeklyResetService } from './weekly-reset';

@Module({ controllers: [DutyController, ShiftsController, BotShiftsController, WeeklyResetController], providers: [DutyService, ShiftsService, WeeklyResetService, { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }], exports: [DutyService, ShiftsService, WeeklyResetService] })
export class DutyModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private weekTimer?: NodeJS.Timeout;
  constructor(private readonly s: DutyService, private readonly week: WeeklyResetService) {}
  /** Inaktivitäts-Erinnerung jede Minute prüfen; Wochen-Reset beim Start (verpasste nachholen) und alle 30 s – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Duty');
    this.timer = setInterval(() => void this.s.remindTick().then((r) => { if (r.reminded || r.ended) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
    const week = () => void this.week.tick().then((r) => { if (r.archived.length) log.log(`Wochen-Reset: ${JSON.stringify(r)}`); }).catch((e: Error) => log.error(`Wochen-Reset: ${e.message}`));
    setTimeout(week, 5_000).unref();
    this.weekTimer = setInterval(week, 30_000);
    this.weekTimer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); if (this.weekTimer) clearInterval(this.weekTimer); }
}
