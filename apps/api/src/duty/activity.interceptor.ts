import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AppRequest } from '../common/request-context';
import { DutyService } from './duty.service';

/**
 * Jede Aktion (alles außer reinem Lesen) zählt als Aktivität für die Inaktivitäts-Erinnerung – im Dashboard/MDT wie per Discord-Befehl.
 * Reines Lesen nicht, weil das Dashboard sich alle paar Sekunden selbst aktualisiert; dafür meldet es echte Klicks/Eingaben separat.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly duty: DutyService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() === 'http') {
      const req = ctx.switchToHttp().getRequest<AppRequest>();
      if (req.user?.id && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') void this.duty.touch(req.user.id);
    }
    return next.handle();
  }
}
