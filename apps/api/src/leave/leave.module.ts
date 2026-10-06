import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({ controllers: [LeaveController], providers: [LeaveService], exports: [LeaveService] })
export class LeaveModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: LeaveService) {}
  /** Beginn/Ende der Abmeldungen jede Minute prüfen (Rolle vergeben/entfernen) – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Leave');
    this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.started || r.ended) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
