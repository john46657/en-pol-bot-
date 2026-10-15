import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { currentGuild, runInGuild } from '../common/guild-context';
import { CadConfigService } from './cad-config.service';
import type { AppRequest } from '../common/request-context';

/**
 * CAD-Querverbindung als ausdrücklich eingerichtete Ausnahme der Server-Trennung: Ein Discord-Befehl von einem anderen
 * Server (z. B. SEK/K9) arbeitet NUR DANN im Bereich der Leitstelle, wenn
 *  - dieser Server die Leitstelle als Heimat-Server eingestellt hat (CAD → Einstellungen) UND
 *  - die Leitstelle eine aktive Verbindung zu diesem Server eingerichtet hat (CadServerLink).
 * Welche Aktionen erlaubt sind, prüft danach weiterhin `CadService.assertCrossServer` (Aktion + Rolle).
 * Ohne Verbindung bleibt jeder Server in seiner eigenen Leitstelle. Dashboard-Anfragen werden nie umgeleitet.
 */
@Injectable()
export class CadLinkInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService, private readonly cfg: CadConfigService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AppRequest & { originGuildId?: string | null }>();
    const g = currentGuild();
    const fromDiscord = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ') && typeof req.headers['x-discord-user'] === 'string';
    req.originGuildId = g;
    if (!g || !fromDiscord) return next.handle();
    return from(this.target(g)).pipe(switchMap((home) => (home ? new Observable((sub) => runInGuild(home, () => next.handle().subscribe(sub))) : next.handle())));
  }

  /** Leitstelle, in deren Bereich dieser Befehl laufen darf (oder null = eigener Server). */
  private async target(g: string): Promise<string | null> {
    const home = (await this.cfg.get()).homeGuildId ?? null; // Einstellung DIESES Servers
    if (!home || home === g) return null;
    const link = await this.prisma.cadServerLink.findFirst({ where: { active: true, sourceGuildId: home, targetGuildId: g }, select: { id: true } });
    return link ? home : null;
  }
}
