import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ShiftPlanController } from './shiftplan.controller';
import { ShiftPlanService } from './shiftplan.service';

@Module({ controllers: [ShiftPlanController], providers: [ShiftPlanService], exports: [ShiftPlanService] })
export class ShiftPlanModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: ShiftPlanService) {}
  /** Jede Minute: vergangene Schichten abschließen, Erinnerungen vor Schichtbeginn – nicht in Tests. Zeiten liegen in der DB → übersteht Neustarts. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('ShiftPlan');
    this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.completed || r.reminded) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
